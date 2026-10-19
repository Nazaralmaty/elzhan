#!/usr/bin/env python3
"""islands.py — where a recording actually makes sound.

    islands.py MEDIA                         report islands and the gaps between them
    islands.py MEDIA --silence OUT.txt       write a cut.py-compatible silence map
    islands.py MEDIA --at 12.4 --window 3    print the dB envelope around one moment

Why: engine/cut.py maps silence at -30 dB, and on a podcast mic the tail of a word falls below
-30 dB before the sound stops — TP.cut then trims inside the word and the client hears an
"обрыв". Whisper is no help at a piece edge either: it pins the first token of a window to the
window's first sample. Both are fixed by reading the envelope.

    --db     threshold in dBFS (default -47 for the report, pass -46…-42 for a silence map;
             measure it, do not copy it: print --at around a known word ending)
    --gap    islands closer than this merge (default 0.14 s)
    --min    an island / a silence shorter than this is dropped (default 0.10 / 0.08 s)
"""
import argparse, subprocess, sys
import numpy as np

WIN = 320   # 20 ms at 16 kHz


def envelope(media):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', media, '-ac', '1', '-ar', '16000',
                          '-f', 's16le', '-'], capture_output=True).stdout
    if not raw: sys.exit(f'islands.py: no audio in {media}')
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    k = len(a) // WIN
    rms = np.sqrt((a[:k * WIN].reshape(k, WIN) ** 2).mean(axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-7))


def runs(mask, min_len):
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j + 1 < n and mask[j + 1]: j += 1
            s, e = i * 0.02, (j + 1) * 0.02
            if e - s >= min_len: out.append((round(s, 2), round(e, 2)))
            i = j + 1
        else: i += 1
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('media')
    p.add_argument('--db', type=float, default=None)
    p.add_argument('--gap', type=float, default=0.14)
    p.add_argument('--min', type=float, default=None)
    p.add_argument('--silence', metavar='OUT.txt')
    p.add_argument('--at', type=float)
    p.add_argument('--window', type=float, default=3.0)
    a = p.parse_args()
    db = envelope(a.media)

    if a.at is not None:
        i0, i1 = int(max(0, a.at - a.window / 2) / 0.02), int((a.at + a.window / 2) / 0.02)
        for i in range(i0, min(i1, len(db))):
            v = db[i]
            print(f'{i * 0.02:7.2f}  {v:6.1f} dB  ' + '#' * max(0, int((v + 60) / 2)))
        return

    if a.silence:
        th = a.db if a.db is not None else -46.0
        mn = a.min if a.min is not None else 0.08
        sil = runs(db <= th, mn)
        open(a.silence, 'w').write(''.join(f'{s:.3f} {e:.3f} {e - s:.3f}\n' for s, e in sil))
        print(f'{len(sil)} silences at {th} dB / {mn} s → {a.silence}')
        return

    th = a.db if a.db is not None else -47.0
    mn = a.min if a.min is not None else 0.10
    on = db > th
    idx = np.where(on)[0]
    merged = []
    for i in idx:
        if merged and i - merged[-1][1] <= int(a.gap / 0.02): merged[-1][1] = i
        else: merged.append([i, i])
    isl = [(round(s * 0.02, 2), round((e + 1) * 0.02, 2)) for s, e in merged
           if (e - s + 1) * 0.02 >= mn]
    print(f'{len(isl)} islands above {th} dB, gaps under {a.gap} s merged, total {len(db) * 0.02:.2f} s')
    prev, gaps = 0.0, []
    for s, e in isl:
        g = round(s - prev, 2)
        print(f'{s:7.2f} – {e:7.2f}   len {e - s:5.2f}   gap before {g:5.2f}')
        if prev: gaps.append(g)
        prev = e
    if gaps:
        print('\nlongest gaps: ' + ', '.join(f'{g:.2f}' for g in sorted(gaps, reverse=True)[:6]))
        print(f'over 0.60 s: {sum(1 for g in gaps if g > 0.60)} of {len(gaps)}')
    print(f'first sound at {isl[0][0]:.2f} s' if isl else 'no sound found')


if __name__ == '__main__':
    main()
