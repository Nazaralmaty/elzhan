#!/usr/local/bin/python3
"""atlas_tourism — дубль ролика выпуска №2 вместо `cam.sh`. Запуск из папки ролика:

    ../_ассеты/prep_take_02.py --speaker N [--over WIDE:0:1.4:H ...] [--tail 5.0]

Почему не `cam.sh`: он режет 16:9 одним центральным кропом, а в выпуске №2 пять планов (разбор §2),
и говорящий сидит в каждом на своём месте. Здесь кроп выбирается НА КАЖДЫЙ КАДР по плану и по
говорящему. Выход тот же, что у `cam.sh --no-matte`: work/fr, assets/vo/voice.wav, work/voice16.wav,
work/plate.json|js, qa/face.json, work/take.mov.

Швы-вставки тишины (`src_1:1.80:…`, разбор §3) везли 3–12 кадров чужого видео. Здесь их видео
берётся из того же места исходника, где стоял вырезанный кусок (сразу после предыдущего куска):
в кадре тот же человек, и шов читается обычным резом, а не вспышкой чужого плана. Звук не трогается.

План кадра — ближайший эталон по средней разнице 96×54 (эталоны — кадры выпуска из разбора §2).
Говорящий на крупных планах известен из плана; на общем и на двоих — `--speaker` (замер губ,
`tblend=difference` по коробке рта), исключения — `--over PLAN:t0:t1:WHO` во времени обрезки.
"""
import argparse, json, os, subprocess, shutil
import numpy as np

A = os.path.dirname(os.path.abspath(__file__))
POD = os.path.join(A, '..', 'pod2_1080.mp4')
FPS = 30
REF = {'CU_N': 150, 'CU_A': 2300, 'CU_H': 291, 'TWO': 194, 'WIDE': 980}
# кроп в координатах 1920×1080, всегда 9:16. Головы сняты с эталонных кадров:
# CU Нұрболат x 940, CU Ақтөре x 920, CU ведущий x 760 (профиль, воздух справа по взгляду);
# двое: Н (480, 380), А (1420, 400); общий: ведущий (320, 200), Н (940, 190), А (1400, 200).
CROP = {
    ('CU_N', None): (636, 0, 608, 1080),
    ('CU_A', None): (600, 0, 608, 1080),
    ('CU_H', None): (540, 0, 608, 1080),
    ('TWO', 'N'): (210, 40, 540, 960),
    ('TWO', 'A'): (1150, 55, 540, 960),
    ('TWO', 'H'): (210, 40, 540, 960),     # ведущего на двоих нет — не случается
    ('WIDE', 'H'): (150, 0, 405, 720),
    ('WIDE', 'N'): (738, 0, 405, 720),
    ('WIDE', 'A'): (1198, 0, 405, 720),
}

ap = argparse.ArgumentParser()
ap.add_argument('--speaker', required=True, choices=['N', 'A', 'H'])
ap.add_argument('--over', action='append', default=[])
ap.add_argument('--tail', type=float, default=5.0)
a = ap.parse_args()

def run(*c):
    subprocess.run(c, check=True)

def gray(src, ss=None, n=None):
    c = ['ffmpeg', '-v', 'error']
    if ss is not None: c += ['-ss', f'{ss:.4f}']
    c += ['-i', src]
    if n: c += ['-frames:v', str(n)]
    c += ['-vf', 'scale=96:54,format=gray', '-f', 'rawvideo', '-']
    b = subprocess.run(c, capture_output=True, check=True).stdout
    return np.frombuffer(b, np.uint8).reshape(-1, 54, 96).astype(np.float32)

refs = {k: gray(POD, ss=t, n=1)[0] for k, t in REF.items()}
names = list(refs)
R = np.stack([refs[k] for k in names])
g = gray('work/cut/src_1.mp4')
def plan_of(fi):
    return names[int(np.argmin(np.abs(R - g[min(max(fi, 0), len(g) - 1)]).mean(axis=(1, 2))))]

# 1. куски обрезки → номера кадров исходника; вставкам тишины — видео вырезанного места.
# Два кандидата: продолжение предыдущего куска и подводка к следующему. В вырезанной паузе
# монтажёр подкаста часто уходил на другой план (ведущий, общий) — такой кандидат дал бы
# 0.1–0.4 с чужого лица посреди крупного. Берётся тот, чей план совпадает с соседом.
pieces = [l.split('\t') for l in open('work/cut/edl.txt') if l.strip()]
pieces = [(float(p[1]), float(p[2])) for p in pieces]
# вставка тишины — короткий кусок, чьё начало повторяется: один и тот же отрезок цифрового нуля
# дубля кладётся на все короткие швы (023/024 — 1.80, 026 — 119.06, 035 — 146.54)
from collections import Counter
rep = {s for s, n in Counter(round(s, 2) for s, e in pieces if e - s < 0.5).items() if n >= 2}
vid = []
for i, (s, e) in enumerate(pieces):
    d = e - s
    splice = round(s, 2) in rep and d < 0.5
    if not splice:
        vid.append(s); continue
    cands = []
    if i > 0:
        pe = pieces[i - 1][1]; cands.append((pe, plan_of(int(round(pe * FPS)) - 1)))
    if i + 1 < len(pieces):
        na = pieces[i + 1][0]; cands.append((max(0.0, na - d), plan_of(int(round(na * FPS)))))
    n = int(round(d * FPS))
    def score(c):
        st, want = c; f0 = int(round(st * FPS))
        return sum(plan_of(f) == want for f in range(f0, f0 + max(1, n)))
    vid.append(max(cands, key=score)[0])
cum = np.concatenate([[0], np.cumsum([e - s for s, e in pieces])])
F = np.round(cum * FPS).astype(int)
src_idx = []
for i in range(len(pieces)):
    f0 = int(round(vid[i] * FPS))
    src_idx += list(range(f0, f0 + F[i + 1] - F[i]))
N = len(src_idx)

# 2. план каждого кадра — ближайший эталон
plan = [plan_of(fi) for fi in src_idx]
# одиночные кадры другого плана внутри куска — шум классификатора
for i in range(1, N - 1):
    if plan[i - 1] == plan[i + 1] != plan[i]: plan[i] = plan[i - 1]

over = []
for o in a.over:
    p, t0, t1, who = o.split(':'); over.append((p, float(t0), float(t1), who))
def who_at(p, t):
    for op, t0, t1, w in over:
        if op == p and t0 <= t < t1: return w
    return a.speaker
keys = []
for i, p in enumerate(plan):
    keys.append((p, None) if p.startswith('CU') else (p, who_at(p, i / FPS)))

# 3. кадры: подряд идущие кадры с одним кропом и подряд идущими номерами — один вызов ffmpeg
shutil.rmtree('work/fr', ignore_errors=True); os.makedirs('work/fr'); os.makedirs('work/mt', exist_ok=True)
os.makedirs('qa', exist_ok=True); os.makedirs('assets/vo', exist_ok=True)
runs, i = [], 0
while i < N:
    j = i + 1
    while j < N and keys[j] == keys[i] and src_idx[j] == src_idx[j - 1] + 1: j += 1
    runs.append((i, j)); i = j
for i, j in runs:
    x, y, w, h = CROP[keys[i]]
    run('ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', f'{src_idx[i] / FPS:.4f}', '-i', 'work/cut/src_1.mp4',
        '-frames:v', str(j - i), '-an', '-vf', f'crop={w}:{h}:{x}:{y},scale=1080:1920:flags=lanczos',
        '-q:v', '2', '-start_number', str(i + 1), 'work/fr/f_%04d.jpg')
T = int(round(a.tail * FPS))
run('ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0A0D10:s=1080x1920:r=30', '-frames:v', str(T),
    '-q:v', '2', '-start_number', str(N + 1), 'work/fr/f_%04d.jpg')
NT = N + T
dur = round(NT / FPS, 3)

# 4. звук: дорожка обрезки + тишина хвоста, ровно в длину кадров
run('ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', 'work/cut.mp4', '-vn', '-ar', '48000', '-ac', '1',
    '-af', f'apad=whole_dur={dur}', '-t', f'{dur}', 'assets/vo/voice.wav')
run('ffmpeg', '-v', 'error', '-y', '-i', 'assets/vo/voice.wav', '-ar', '16000', 'work/voice16.wav')
run('ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-i', 'work/fr/f_%04d.jpg', '-i', 'assets/vo/voice.wav',
    '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', 'work/take.mov')
pj = {'frames': NT, 'fps': FPS, 'dur': dur, 'src': 'work/take.mov', 'from': 0, 'matte': False}
json.dump(pj, open('work/plate.json', 'w'))
open('work/plate.js', 'w').write(f'window.PLATE={json.dumps(pj)};\n')

# 5. карта планов для спека: в секундах ролика
with open('work/plans_take.txt', 'w') as f:
    f.write('# план и говорящий по кадрам work/fr (секунды ролика); CU — крупный, TWO — двое, WIDE — общий\n')
    s = 0
    for i in range(1, N + 1):
        if i == N or keys[i] != keys[s]:
            k = keys[s]; f.write(f'{s / FPS:7.2f} {i / FPS:7.2f}  {k[0]}{"" if k[1] is None else "_" + k[1]}\n'); s = i
    f.write(f'{N / FPS:7.2f} {NT / FPS:7.2f}  TAIL\n')
print(open('work/plans_take.txt').read())
print(f'{NT} кадров, {dur} с (речь {N / FPS:.2f} + хвост {a.tail})')
