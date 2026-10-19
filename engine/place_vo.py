#!/usr/local/bin/python3
"""engine/place_vo.py — put every voice line on the music: its stressed word on a hit. Run from the reel folder
after tts.sh trim + words.sh + hitmap.py. Rewrites assets/vo/vo.js (durations + gaps) and trims each vo_NN.wav to
its speech end + 0.06 s.

  python3 engine/place_vo.py [--place place.txt] [--dur 15.5]

place.txt (optional), one row per script line, in order:
  ритм K2      the word «ритм» on kick #2 (K0 = the first kick; S3 = snare #3; ret = the return after the break)
  @brk         the line starts 0.05 s into the track's break (voice alone over the silence)
  @next        right after the previous line, no hit (a turn line running into the break)
  -            auto
Auto: line 1 puts its FIRST word on K0 (the hook lands on frame 0); a one-word line puts it on the next free
kick (a list keeps its rhythm); a longer line puts its longest word on the next free kick, or the next snare
when the kick would leave > 1.5 s of nothing; the last line puts its last word on the last kick that leaves ≥ 0.35 s of tail.
A line that would overlap the next one is sped up to ×1.2 (atempo, word times scaled).
"""
import json, re, subprocess, sys, wave
from pathlib import Path
import numpy as np

a = sys.argv[1:]
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
HITS = json.loads(re.search(r'window\.HITS=(\{.*\});', Path('assets/vo/hits.js').read_text()).group(1))
DUR = float(opt('--dur', HITS.get('dur', 15.5)))
W = json.loads(re.search(r'window\.WORDS=(\[.*\]);', Path('assets/vo/words.js').read_text()).group(1))
LINES = [l.strip() for l in open('script.txt', encoding='utf-8') if l.strip()]
PL = [l.strip() for l in open(opt('--place', 'place.txt'), encoding='utf-8')] if Path(opt('--place', 'place.txt')).exists() else []
SR = 48000
key = lambda s: re.sub(r'[^\w]', '', s.lower().replace('ё', 'е'))

def load(f):
    w = wave.open(f); return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
def save(f, x):
    w = wave.open(f, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
def speech_end(x):
    win = int(0.01 * SR); e = np.array([np.sqrt(np.mean(x[k:k + win] ** 2)) for k in range(0, len(x) - win, win)])
    return (np.where(20 * np.log10(e + 1e-9) > -40)[0][-1] + 1) * 0.01

def hit(name):
    if name == 'ret': return HITS['ret']
    if name == 'brk': return HITS['brk'][0]
    return HITS[{'K': 'K', 'S': 'S', 'H': 'H'}[name[0]]][int(name[1:])]

# trim + measure
dur, ends = [], []
for i in range(len(LINES)):
    f = f'assets/vo/vo_{i+1:02d}.wav'; x = load(f); e = speech_end(x) + 0.06
    x = x[:int(e * SR)].copy(); k = int(0.03 * SR); x[-k:] *= np.linspace(1, 0, k); save(f, x)
    dur.append(len(x) / SR)

starts, cursor, used = [], 0.0, set()
K, S = HITS['K'], HITS['S']
for i, line in enumerate(LINES):
    rule = PL[i] if i < len(PL) else '-'
    ws = W[i]
    if rule == '@next':
        st = cursor + 0.03
    elif rule == '@brk' and HITS.get('brk'):
        st = max(cursor, HITS['brk'][0] + 0.05)
    elif rule not in ('-', ''):
        word, h = rule.split()
        wi = next(j for j, w in enumerate(ws) if key(w['w']).startswith(key(word)[:4]))
        st = hit(h) - ws[wi]['t']
    else:
        if i == 0: wi, pool = 0, K[:1]
        elif i == len(LINES) - 1: wi, pool = len(ws) - 1, [k for k in K if k <= DUR - 0.35][-1:]
        else: wi, pool = (0 if len(ws) == 1 else max(range(len(ws)), key=lambda j: len(ws[j]['w']))), None
        wt = ws[wi]['t']
        if pool is None:
            kk = [k for k in K if k - wt >= cursor and k not in used]
            ss = [s for s in S if s - wt >= cursor and s not in used]
            h = kk[0] if kk else (ss[0] if ss else cursor + wt)
            if len(ws) > 1 and ss and kk and kk[0] - wt - cursor > 1.5 and ss[0] < kk[0]: h = ss[0]   # a list of one-word lines keeps to the kicks
        else: h = pool[0]
        used.add(h); st = h - wt
    starts.append(round(max(0.0, st), 3)); cursor = starts[-1] + dur[i] + 0.06

# overlaps: speed the earlier line up to ×1.2, else report
for i in range(len(LINES) - 1):
    room = starts[i + 1] - starts[i] - 0.04
    if dur[i] > room:
        tempo = min(1.2, dur[i] / room)
        f = f'assets/vo/vo_{i+1:02d}.wav'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f, '-af', f'atempo={tempo:.3f}', '-ar', str(SR), '-ac', '1', f + '.t.wav'], check=True)
        Path(f + '.t.wav').replace(f); dur[i] /= tempo
        W[i] = [{**w, 't': round(w['t'] / tempo, 3)} for w in W[i]]
        print(f'   line {i+1}: ×{tempo:.2f} to fit before line {i+2}' + ('' if dur[i] <= room + 1e-3 else ' — STILL OVERLAPS, move it in place.txt'))
VO = [[round(dur[i], 3), round(starts[i + 1] - starts[i] - dur[i], 3) if i < len(LINES) - 1 else 0.0] for i in range(len(LINES))]
Path('assets/vo/vo.js').write_text('window.VO=' + json.dumps(VO) + ';\nwindow.LINES=' + json.dumps(LINES, ensure_ascii=False) + ';\n', encoding='utf-8')
Path('assets/vo/words.js').write_text('window.WORDS=' + json.dumps(W, ensure_ascii=False) + ';\n', encoding='utf-8')
allh = sorted(K + S)
for i, s0 in enumerate(starts):
    marks = []
    for w in W[i]:
        at = s0 + w['t']; near = min(allh, key=lambda h: abs(h - at)); d = at - near
        marks.append(f"{w['w']} {at:.2f}" + (f" [{'K' if near in K else 'S'}{(K if near in K else S).index(near)}]" if abs(d) <= 0.06 else ''))
    print(f'L{i+1} {s0:6.2f}  ' + ' · '.join(marks))
print('→ assets/vo/vo.js')
