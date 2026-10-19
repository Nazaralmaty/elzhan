#!/usr/bin/env python3.13
"""blurfaces.py — smear every face in a JPG frame sequence except one person's (the doctor, the speaker).

  engine/blurfaces.py DIR [--keep X,Y[@N] | --keep-none] [--out DIR2] [--hold 10] [--grow 1.8] [--sheet out.jpg]

  DIR holds f_0001.jpg… (the `seq` frames of a b-roll insert). Faces come from Vision (VNDetectFaceRectanglesRequest,
  profiles included). --keep X,Y@N (0..1 of the frame, y from the top, at frame N — the middle by default) seeds the
  person who stays visible; tracking runs from N forward AND backward, because a camera that pans in the first second
  moves the person away from any first-frame seed: each frame the face nearest to that person's last position
  (≤ 0.18 of the frame) is kept, every other face is blurred.
  A detector misses a face for a frame or two on a turn or a hand over it, so the blur of frame N is the union of
  the boxes found in N-hold … N+hold — a face that stays sharp for one frame is a leak, a blur that lingers 0.3 s
  on empty wall is not. Writes in place unless --out. --sheet: 12 blurred frames tiled, for the eye.
"""
import sys, os, glob, json, argparse
import numpy as np, cv2, Vision
from Foundation import NSURL

ap = argparse.ArgumentParser()
ap.add_argument('dir'); ap.add_argument('--keep'); ap.add_argument('--keep-none', action='store_true')
ap.add_argument('--out'); ap.add_argument('--hold', type=int, default=10); ap.add_argument('--grow', type=float, default=1.8)
ap.add_argument('--sheet')
a = ap.parse_args()
files = sorted(glob.glob(os.path.join(a.dir, 'f_*.jpg')))
if not files: sys.exit(f'blurfaces: no f_*.jpg in {a.dir}')
out = a.out or a.dir; os.makedirs(out, exist_ok=True)

req = Vision.VNDetectFaceRectanglesRequest.alloc().init()
def faces(path):
    h = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(os.path.abspath(path)), {})
    h.performRequests_error_([req], None)
    r = []
    for o in req.results() or []:
        b = o.boundingBox()
        if b.size.width < 0.025: continue
        r.append((b.origin.x + b.size.width / 2, 1 - b.origin.y - b.size.height / 2, b.size.width, b.size.height))
    return r

det = [faces(f) for f in files]
others = [list(d) for d in det]; kept = [None] * len(files)
if a.keep and not a.keep_none:
    xy, _, n0 = a.keep.partition('@'); seed = tuple(map(float, xy.split(','))); n0 = int(n0) if n0 else len(files) // 2
    for rng in (range(n0, len(files)), range(n0 - 1, -1, -1)):
        pos = seed if rng.start == n0 else (kept[n0][:2] if kept[n0] else seed)
        for n in rng:
            fs = others[n]
            if not fs: continue
            d = [((x - pos[0]) ** 2 + (y - pos[1]) ** 2) ** .5 for x, y, _, _ in fs]
            i = int(np.argmin(d))
            if d[i] < 0.18: kept[n] = fs.pop(i); pos = kept[n][:2]
log = [{'keep': k, 'blur': o} for k, o in zip(kept, others)]
H = a.hold
def union(n): return [b for k in range(max(0, n - H), min(len(others), n + H + 1)) for b in others[k]]

def smear(img, boxes):
    hh, ww = img.shape[:2]
    for cx, cy, bw, bh in boxes:
        w = bw * ww * a.grow; h = bh * hh * a.grow * 1.15
        x0, y0 = int(max(0, cx * ww - w / 2)), int(max(0, cy * hh - h / 2 - .05 * h))
        x1, y1 = int(min(ww, cx * ww + w / 2)), int(min(hh, cy * hh + h / 2))
        if x1 - x0 < 4 or y1 - y0 < 4: continue
        roi = img[y0:y1, x0:x1]
        k = max(3, int(w / 9) | 1)
        small = cv2.resize(roi, (max(1, (x1 - x0) // 14), max(1, (y1 - y0) // 14)), interpolation=cv2.INTER_AREA)
        bl = cv2.GaussianBlur(cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_LINEAR), (k, k), 0)
        m = np.zeros((y1 - y0, x1 - x0), np.float32)
        cv2.ellipse(m, ((x1 - x0) // 2, (y1 - y0) // 2), ((x1 - x0) // 2 - 2, (y1 - y0) // 2 - 2), 0, 0, 360, 1, -1)
        m = cv2.GaussianBlur(m, (0, 0), max(2, w / 18))[..., None]
        img[y0:y1, x0:x1] = (bl * m + roi * (1 - m)).astype(np.uint8)
    return img

for n, f in enumerate(files):
    img = cv2.imread(f)
    cv2.imwrite(os.path.join(out, os.path.basename(f)), smear(img, union(n)), [cv2.IMWRITE_JPEG_QUALITY, 92])
json.dump(log, open(os.path.join(out, '_faces.json'), 'w'))
nb = sum(1 for o in others if o); nk = sum(1 for l in log if l['keep'])
print(f'blurfaces: {len(files)} frames, faces blurred in {nb}, kept face in {nk}, written to {out}')

if a.sheet:
    pick = [files[int(i)] for i in np.linspace(0, len(files) - 1, 12)]
    tiles = [cv2.resize(cv2.imread(os.path.join(out, os.path.basename(p))), (270, 480)) for p in pick]
    cv2.imwrite(a.sheet, np.vstack([np.hstack(tiles[:6]), np.hstack(tiles[6:])]))
