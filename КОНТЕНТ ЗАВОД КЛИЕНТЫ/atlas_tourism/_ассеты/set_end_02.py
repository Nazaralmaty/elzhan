#!/usr/bin/env python3
"""Перенести конец ПОСЛЕДНЕГО куска обрезки выпуска №2 в другую точку исходника — продлить или укоротить.
Запуск из папки ролика:  ~/ai-local/.venv-f5/bin/python ../_ассеты/set_end_02.py SRC_END [--fade 0.03]

Зачем: гейт записи роняет в ноль смычку внутри слова («ұмыт|па», reel_026), и рез П1 встаёт в неё — в ролик уходит
половина слова; или рез заезжает в атаку следующего слова («болады | Х…», reel_023). Конец ставится в провал огибающей
по замеру, а не по разметке Scribe.

Правит work/cut/edl.txt (конец последнего куска), work/cut.mp4 (звук: голова дорожки до начала последнего куска +
исходник заново, сверка корреляцией; видео — клон последнего кадра на хвост, prep_take_02 берёт кадры по edl),
work/cut/cut16.wav и конец последнего слова в work/cut/cut16.words.kk.json. Копии — `*_before_end.*`.
Дальше: prep_take_02.py --tail 5.5 → matte --faces-only → words_scribe.py --tail 5.0 и `cta` +0.5 → fillers.py → спек."""
import json, shutil, subprocess, sys
import numpy as np, soundfile as sf

END = float(sys.argv[1]); FADE = float(sys.argv[sys.argv.index('--fade') + 1]) if '--fade' in sys.argv else 0.03
SR = 48000
rows = [l.rstrip('\n').split('\t') for l in open('work/cut/edl.txt') if l.strip()]
tot = sum(float(e) - float(s) for _, s, e in rows)
ls, le = float(rows[-1][1]), float(rows[-1][2])
c0 = tot - (le - ls)                                     # начало последнего куска во времени обрезки
for p in ['work/cut/edl.txt', 'work/cut.mp4', 'work/cut/cut16.wav', 'work/cut/cut16.words.kk.json']:
    b, e = p.rsplit('.', 1); shutil.copy(p, f'{b}_before_end.{e}')

dec = lambda p: np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-vn', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                                             capture_output=True, check=True).stdout, np.float32)
a = dec('work/cut_before_end.mp4')[:int(round(tot * SR))]
n = int(FADE * SR)
if END < le:
    # укоротить: исходник не нужен — рез в самый глубокий кадр 5 мс огибающей самой дорожки в ±25 мс от расчёта
    # (дорожка может отставать от исходника: reel_023 — на 433 сэмпла, след AAC первой сборки)
    at = int(round((tot - (le - END)) * SR)); w = int(0.005 * SR); r = int(0.025 * SR)
    cand = range(at - r, at + r, w)
    cut = min(cand, key=lambda i: float(np.sqrt((a[i:i + w] ** 2).mean())))
    out = a[:cut].copy(); out[-n:] *= np.linspace(1, 0, n)
    print(f'укорочено на {(len(a) - cut) / SR:.3f} с, рез в провале {20 * np.log10(np.sqrt((a[cut:cut + w] ** 2).mean()) + 1e-9):.1f} дБ')
else:
    # продлить: исходник встык к КОНЦУ дорожки, с поправкой на её сдвиг относительно исходника (корреляция)
    s = dec('work/cut/src_1.wav')
    seg = a[int((c0 + 0.2) * SR):int((c0 + 0.7) * SR)]; ref = s[int((ls + 0.2) * SR) - 2400:int((ls + 0.7) * SR) + 2400]
    lag = int(np.argmax(np.correlate(ref, seg, 'valid'))) - 2400
    print(f'сдвиг дорожки относительно исходника {lag} сэмплов')
    tail = s[int(round(le * SR)) + lag:int(round(END * SR)) + lag].copy(); tail[-n:] *= np.linspace(1, 0, n)
    out = np.concatenate([a, tail])
sf.write('work/_end.wav', out, SR, subtype='PCM_24')
dur = len(out) / SR
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'work/cut_before_end.mp4', '-i', 'work/_end.wav', '-map', '0:v', '-map', '1:a',
                '-vf', 'tpad=stop_mode=clone:stop_duration=1', '-t', f'{dur:.4f}', '-c:v', 'libx264', '-crf', '18', '-c:a', 'alac',
                '-f', 'mov', 'work/cut.mp4'], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'work/cut.mp4', '-vn', '-ar', '16000', '-ac', '1', 'work/cut/cut16.wav'], check=True)
rows[-1][2] = f'{END:.3f}'
open('work/cut/edl.txt', 'w').write(''.join('\t'.join(r) + '\n' for r in rows))
d = json.load(open('work/cut/cut16.words.kk.json'))
W = [w for w in d['words'] if w.get('type') == 'word']
new_end = c0 + (END - ls) - 0.02
d['words'] = [w for w in d['words'] if w['start'] < new_end]
last = [w for w in d['words'] if w.get('type') == 'word'][-1]; last['end'] = round(min(max(last['end'], new_end), new_end), 3)
d['audio_duration_secs'] = round(dur, 3)
json.dump(d, open('work/cut/cut16.words.kk.json', 'w'), ensure_ascii=False)
print(f'work/cut.mp4 {dur:.3f} с, последнее слово «{last["text"]}» до {last["end"]}')
