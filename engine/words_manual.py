#!/usr/local/bin/python3
"""engine/words_manual.py — пословная дорожка assets/vo/words.js там, где whisper не читается.

    engine/words_manual.py work/segments.txt [--src work/cut_speech.mp4] [--tail 3.6] [--no-cta]

Зачем: на казахском whisper даёт 25–50 % ошибок, роняет фразы целиком и подтягивает
соседние на секунды вперёд — ни одно его время брать нельзя. Текст сводится тремя
чтениями человеком, а времена берутся из звука: слова раскладываются по энергетическим
островам (−46 dB, промежутки короче 0.14 с слиты) пропорционально числу букв.

segments.txt — одна фраза в строке, времена во времени склейки, «#» — комментарий:

    0.10 1.55 На самом деле маркетингтің
    1.64 3.06 80% аналитикаға тұрады.

«(…)» вместо слова — место, где чтения разошлись: токен держит тайминг бита и на
экран не выходит (бит с ним ставится subs: false).

Запускать ПОСЛЕ engine/cam.sh: он пишет assets/vo/words.js своим проходом и затрёт этот.
"""
import argparse, json, subprocess, sys

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('segments')
ap.add_argument('--src', default='work/cut_speech.mp4', help='дорожка речи склейки')
ap.add_argument('--tail', type=float, default=3.6, help='хвост ролика после речи, с')
ap.add_argument('--db', type=float, default=-46.0, help='порог островов')
ap.add_argument('--no-cta', action='store_true', help='не дописывать токены cta в хвост')
ap.add_argument('--out', default='assets/vo/words.js')
a = ap.parse_args()

SEG = []
for n, ln in enumerate(open(a.segments, encoding='utf-8'), 1):
    ln = ln.split('#')[0].strip()
    if not ln:
        continue
    p = ln.split(None, 2)
    if len(p) < 3:
        sys.exit(f'{a.segments}:{n}: нужно «начало конец фраза», а тут: {ln}')
    SEG.append((float(p[0]), float(p[1]), p[2]))
if not SEG:
    sys.exit(f'{a.segments}: ни одной фразы')

raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.src, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                     capture_output=True).stdout
if not raw:
    sys.exit(f'не читается дорожка речи: {a.src}')
buf = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
W = 320
k = len(buf) // W
db = 20 * np.log10(np.maximum(np.sqrt((buf[:k * W].reshape(k, W) ** 2).mean(axis=1)), 1e-7))
isl = []
for i in np.where(db > a.db)[0]:
    if isl and i - isl[-1][1] <= 7:      # промежуток короче 0.14 с — тот же остров
        isl[-1][1] = i
    else:
        isl.append([i, i])
ISL = [(s * .02, (e + 1) * .02) for s, e in isl if (e - s + 1) * .02 >= .08]
DUR = k * .02

out = []
for t0, t1, txt in SEG:
    mine = [(max(x, t0), min(y, t1)) for x, y in ISL if y > t0 and x < t1] or [(t0, t1)]
    T = sum(y - x for x, y in mine)

    def at(r, mine=mine):
        """Точка внутри окна, отсчитанная по звуку: тишина между островами не тратится."""
        for p, q in mine:
            if r <= q - p:
                return p + r
            r -= q - p
        return mine[-1][1]

    ws = txt.split()
    wt = [len(w.strip('.,?!—')) + 1 for w in ws]
    tot = sum(wt)
    pos = 0.0
    for w, q in zip(ws, wt):
        out.append((w, round(at(pos), 3)))
        pos += T * q / tot

if not a.no_cta:
    out += [('cta', DUR + .50), ('cta2', DUR + 1.50), ('cta3', DUR + 2.50)]

bad = [i for i in range(len(out) - 1) if out[i][1] >= out[i + 1][1]]
if bad:
    for i in bad[:5]:
        print(f'  слова идут не по порядку: {out[i]} → {out[i + 1]}')
    sys.exit('окна фраз перекрываются — поправить времена в ' + a.segments)

res = []
for i, (w, t) in enumerate(out):
    nxt = out[i + 1][1] if i + 1 < len(out) else DUR + a.tail
    res.append({'w': w, 't0': round(t, 3), 't1': round(min(max(nxt, t + .14), t + .8), 3)})
open(a.out, 'w', encoding='utf-8').write('window.WORDS_ALL=' + json.dumps(res, ensure_ascii=False) + ';\n')
print(f'{len(res)} слов · речь {DUR:.2f} с · ролик {DUR + a.tail:.2f} с → {a.out}')
