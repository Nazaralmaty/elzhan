#!/usr/local/bin/python3
"""Вырезать отрезок [A, B) времени обрезки из уже собранного реза выпуска №2, не пересобирая cut.py.
Запуск из папки ролика:  ../_ассеты/drop_span_02.py A B

Зачем: после П1 находятся держаный «ммм» или пауза > 0.60 с, которые надо снять, а весь рез пересобирать
дорого. Правит work/cut/edl.txt (кускам — границы в исходнике), work/cut.mp4 (оба потока), work/cut/cut16.wav,
пословные разметки work/cut/cut16.words.kk.json и work/scribe_voice16.wav.kk.json (слова после B сдвигаются
на −(B−A), слово, задетое срезом, — отказ). Копии прежних файлов — с суффиксом _before_A.
Рез ставится только в тишину: края отрезка проверяются по огибающей (≤ −50 дБ), иначе отказ.

Дальше руками, по порядку (печатается в конце): prep_take_02.py → matte --faces-only → words_scribe.py →
voice_raw_breaths → fillers.py → сдвиг абсолютных времён спека ≥ A на −(B−A)."""
import json, os, shutil, subprocess, sys
import numpy as np

A, B = float(sys.argv[1]), float(sys.argv[2]); D = B - A
tag = f'_before_{A:.2f}'

def env(p):
    x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'],
                                     capture_output=True, check=True).stdout, np.int16).astype(np.float32) / 32768
    n = len(x) // 320; f = x[:n * 320].reshape(n, 320)
    return 20 * np.log10(np.sqrt((f ** 2).mean(1)) + 1e-9)
e = env('work/cut.mp4')
for t in (A, B):
    lv = e[max(0, int(t / .02) - 2):int(t / .02) + 3].max()
    if lv > -50: sys.exit(f'drop_span: край {t:.2f} не в тишине ({lv:.1f} дБ) — рез в звуке запрещён')

for p in ['work/cut/edl.txt', 'work/cut.mp4', 'work/cut/cut16.wav', 'work/cut/cut16.words.kk.json', 'work/scribe_voice16.wav.kk.json']:
    if os.path.exists(p):
        root, ext = os.path.splitext(p); shutil.copy(p, root + tag + ext)

# edl: куски во времени обрезки → оставить части вне [A, B)
rows = [l.rstrip('\n').split('\t') for l in open('work/cut/edl.txt') if l.strip()]
out, t = [], 0.0
for src, s, e0 in rows:
    s, e0 = float(s), float(e0); d = e0 - s; t0, t1 = t, t + d; t = t1
    if t1 <= A or t0 >= B: out.append((src, s, e0)); continue
    if t0 < A: out.append((src, s, s + (A - t0)))
    if t1 > B: out.append((src, s + (B - t0), e0))
open('work/cut/edl.txt', 'w').write(''.join(f'{src}\t{s:.3f}\t{e0:.3f}\n' for src, s, e0 in out))

# cut.mp4: оба потока, без [A, B)
fc = (f'[0:v]trim=0:{A},setpts=PTS-STARTPTS[v0];[0:v]trim={B},setpts=PTS-STARTPTS[v1];'
      f'[0:a]atrim=0:{A},asetpts=PTS-STARTPTS[a0];[0:a]atrim={B},asetpts=PTS-STARTPTS[a1];'
      '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'work/cut' + tag + '.mp4', '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
                '-c:v', 'libx264', '-crf', '18', '-c:a', 'pcm_s16le', '-f', 'mov', 'work/cut.mp4'], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'work/cut.mp4', '-vn', '-ar', '16000', '-ac', '1', 'work/cut/cut16.wav'], check=True)

for p in ['work/cut/cut16.words.kk.json', 'work/scribe_voice16.wav.kk.json']:
    if not os.path.exists(p): continue
    d = json.load(open(p)); ws = []
    for w in d['words']:
        if w['end'] <= A + 1e-6: ws.append(w)
        elif w['start'] >= B - 1e-6:
            w = dict(w); w['start'] = round(w['start'] - D, 3); w['end'] = round(w['end'] - D, 3); ws.append(w)
        elif w.get('type') == 'word': sys.exit(f'drop_span: срез задевает слово {w}')
    d['words'] = ws
    if 'audio_duration_secs' in d: d['audio_duration_secs'] = round(d['audio_duration_secs'] - D, 3)
    json.dump(d, open(p, 'w'), ensure_ascii=False)

dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'work/cut.mp4'],
                           capture_output=True, text=True).stdout)
print(f'снято {A:.2f}–{B:.2f} ({D:.2f} с), work/cut.mp4 {dur:.2f} с, кусков {len(out)}')
print('дальше: ../_ассеты/prep_take_02.py --speaker … → matte --faces-only → words_scribe.py --tail 5.0 → '
      f'cp assets/vo/voice.wav work/voice_raw_breaths.wav → fillers.py → абсолютные времена спека ≥ {A:.2f} сдвинуть на −{D:.2f}')
