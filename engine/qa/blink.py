#!/usr/bin/env python3
"""engine/qa/blink.py — finds one- or two-frame black holes in a master: a block that drops to near-black and comes back.
Chrome drops compositor tiles when a big CSS-3D scene overruns the GPU budget (T1_polet v7: black rectangles on the floor and
walls for one frame, different on every render); a frame captured mid-raster looks the same. A dive into dark hair or a planned
black dip also hits — read the listed seconds on a strip before calling it a defect.
  ~/ai-local/.venv-f5/bin/python engine/qa/blink.py out/reel.mp4      exit 1 if any hit"""
import subprocess, sys
import numpy as np
W, H = 27, 48
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', sys.argv[1], '-vf', f'scale={W}:{H}:flags=area,format=gray', '-f', 'rawvideo', '-'],
                     capture_output=True, check=True).stdout
v = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(float)
hits = []
for i in range(1, len(v) - 2):
    for k in (1, 2):
        dip = v[i:i + k].max(0); m = (np.minimum(v[i - 1], v[i + k]) - dip > 22) & (dip < 25)
        if m.sum() >= 12: hits.append(i / 30); break
print(f'blink: {len(hits)} frame(s)' + (': ' + ' '.join(f'{t:.2f}s' for t in hits) if hits else ' — clean'))
sys.exit(1 if hits else 0)
