#!/usr/local/bin/python3
"""trim_matte.py — fade a matte's alpha out below the waist with a vertical ramp; RGB untouched.

  python3 ~/.claude/engine/trim_matte.py work/mt work/mt_trim Y0 Y1     # alpha 1 above Y0, 0 below Y1, pow-1.6 ramp between

Use when Vision counts a burnt-in element (a comment card, a caption plate) as part of the person, so in
matte / cut-out mode it rides along with the body: the figure sinks into the world's ground and the element
disappears with the lower third. Reads f_*.png from the source dir."""
import sys, numpy as np
from PIL import Image
from pathlib import Path

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
Y0, Y1 = int(sys.argv[3]), int(sys.argv[4])          # 1 above Y0, 0 below Y1
dst.mkdir(parents=True, exist_ok=True)
files = sorted(src.glob('f_*.png'))
h = None
for i, f in enumerate(files):
    im = Image.open(f).convert('RGBA')
    a = np.asarray(im).copy()
    if h is None:
        h = a.shape[0]
        ramp = np.ones(h, dtype=np.float32)
        ramp[Y1:] = 0.0
        ramp[Y0:Y1] = np.linspace(1.0, 0.0, Y1 - Y0) ** 1.6
        ramp = ramp[:, None]
    a[..., 3] = (a[..., 3].astype(np.float32) * ramp).astype(np.uint8)
    Image.fromarray(a).save(dst / f.name)
    if i % 200 == 0: print(f'{i}/{len(files)}', flush=True)
print('done', len(files))
