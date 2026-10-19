#!/usr/local/bin/python3
"""engine/face_track.py — qa/face.json → work/face.js: head centre per frame for the morph `take` window.
Smoothed like Center Stage (gaussian σ 0.45 s), in the pixel space of work/fr (plate.json w×h).
Run from the reel folder after matte.py --faces-only. The take aims at [cx, cy]; the third number is face height."""
import json, sys
import numpy as np
from scipy.ndimage import gaussian_filter1d
sigma = float(sys.argv[sys.argv.index('--sigma') + 1]) if '--sigma' in sys.argv else 0.45
d = json.load(open('qa/face.json')); F = d['frames']; fps = d.get('fps', 30)
last = None; rows = []
for f in F:   # a frame with no face keeps the last known head (Vision drops a frame on a hand over the face)
    b = f.get('face') or last
    if b: last = b
    rows.append([b[0] + b[2] / 2, b[1] + b[3] / 2, b[3]] if b else [np.nan] * 3)
c = np.array(rows, float)
if np.isnan(c).all(): sys.exit('face_track: no face in qa/face.json')
first = c[~np.isnan(c[:, 0])][0]; c[np.isnan(c[:, 0])] = first
s = np.stack([gaussian_filter1d(c[:, i], sigma * fps, mode='nearest') for i in range(3)], 1)
open('work/face.js', 'w').write('window.FACE_T=' + json.dumps([[round(a, 1), round(b, 1), round(h, 1)] for a, b, h in s]) + ';\n')
print(f'   {len(s)} frames → work/face.js (cx {s[:, 0].min():.0f}…{s[:, 0].max():.0f}, cy {s[:, 1].min():.0f}…{s[:, 1].max():.0f})')
