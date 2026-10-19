#!/usr/local/bin/python3
"""chiron.py — is the graphic layer alive, or a lower third where only the text changes?
   /usr/local/bin/python3 engine/qa/chiron.py renders/frames work/qa_rects.json
Reads the rendered frames at the sample times of qa/speaker.js, measures the mean
absolute difference between consecutive samples inside the graphics rectangles
(layer motion) and outside them within the footage (footage motion). Rule
(recut-reel §4.5, 2026-08-24): median layer motion below a third of the footage
motion = a chiron; fix with windows where the layer is absent, word-by-word text,
a card that turns all act long — not with more text. Measured at two grids
(the sample step and a 2× coarser one): a dense cut makes the coarse grid
count scene changes as footage motion and understate the ratio."""
import json, sys, os
import numpy as np
from PIL import Image

frames, rects = sys.argv[1], json.load(open(sys.argv[2]))
S = [s for s in rects['samples'] if not s['insert'] and s['rects']]
if len(S) < 4: print('chiron: not enough samples with graphics'); sys.exit(0)
fps = rects['fps']


def load(n):
    p = os.path.join(frames, f'f_{n:04d}.png')
    return np.asarray(Image.open(p).convert('L'), dtype=np.float32) if os.path.exists(p) else None


def ratio(step):
    lay, fot = [], []
    prev = None
    for s in S[::step]:
        n = max(0, round(s['t'] * fps)); im = load(n)
        if im is None: continue
        if prev is not None:
            d = np.abs(im - prev)
            m = np.zeros(im.shape, bool)
            for r in s['rects']:
                x, y, w, h = (int(round(v)) for v in (r['x'], r['y'], r['w'], r['h']))
                m[max(0, y):max(0, y + h), max(0, x):max(0, x + w)] = True
            if m.any() and (~m).any():
                lay.append(float(d[m].mean())); fot.append(float(d[~m].mean()))
        prev = im
    if not lay: return None
    return float(np.median(lay)), float(np.median(fot))


out = []
for step in (1, 2):
    r = ratio(step)
    if r: out.append((step, r[0], r[1], r[0] / max(r[1], 1e-6)))
if not out: print('chiron: no rendered frames at the sample times'); sys.exit(0)
for step, l, f, q in out:
    print(f'chiron @step×{step}: layer {l:.1f} vs footage {f:.1f} → {q:.2f} ' + ('ok' if q >= 0.33 else 'CHIRON (< 0.33): give the layer windows of absence, word-by-word text, a turning card'))
sys.exit(0 if all(q >= 0.33 for *_, q in out) else 1)
