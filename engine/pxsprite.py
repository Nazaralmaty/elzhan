#!/usr/local/bin/python3
"""engine/pxsprite.py IN.png [IN2.png …] --out DIR [--n 40] [--colors 16] [--scale 12]
A FLUX «pixel art» picture → a true pixel-grid sprite: the border-connected white ground becomes transparent (white
highlights inside the object stay), the object is fitted into an N×N grid by box averaging, quantised to a small
palette, alpha thresholded, then blown up ×scale without smoothing. FLUX draws fake pixels off the grid; this makes
them real. Prompt that works (visual essay, 12.10.2026): STYLE="16-bit pixel art game item sprite, single object
centered, thick black pixel outline, flat cel shading with two highlight tones, limited palette, plain pure white
background, no shadow on the ground, no text, no letters, no logo", engine/flux.sh "<object>" x.png 512x512 512x512."""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

a = sys.argv[1:]
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
OUT, N, NC, SC = opt('--out', '.'), int(opt('--n', 40)), int(opt('--colors', 16)), int(opt('--scale', 12))
files = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or not a[i - 1].startswith('--'))]
os.makedirs(OUT, exist_ok=True)
for f in files:
    im = np.asarray(Image.open(f).convert('RGB')).astype(int)
    lab, _ = ndimage.label(im.min(axis=2) > 225)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    ys, xs = np.nonzero(~bg); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    s = max(y1 - y0, x1 - x0) + 20
    pad = np.zeros((s, s, 4), np.uint8); oy, ox = (s - (y1 - y0)) // 2, (s - (x1 - x0)) // 2
    pad[oy:oy + y1 - y0, ox:ox + x1 - x0] = np.dstack([im, (~bg) * 255]).astype(np.uint8)[y0:y1, x0:x1]
    small = Image.fromarray(pad).resize((N, N), Image.BOX)
    rgb = small.convert('RGB').quantize(colors=NC, method=Image.Quantize.MEDIANCUT).convert('RGB')
    out = np.dstack([np.asarray(rgb), np.where(np.asarray(small)[..., 3] > 110, 255, 0)]).astype(np.uint8)
    Image.fromarray(out).resize((N * SC, N * SC), Image.NEAREST).save(os.path.join(OUT, os.path.basename(f)))
    print('→', os.path.join(OUT, os.path.basename(f)))
