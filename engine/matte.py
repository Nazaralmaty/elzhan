#!/usr/bin/env python3.13
"""matte.py — speaker matte + face/head track from a frame sequence, macOS Vision, offline.

  python3.13 engine/matte.py work/fr work/mt [--faces qa/face.json] [--fps 30]
        [--gate 140:215] [--window 2] [--feather 1.6] [--shrink 1.2] [--all-people] [--raw]

In:  work/fr/f_0001.jpg …  (one size, from cam.sh)
Out: work/mt/f_0001.png …  RGBA: the frame's own pixels + cleaned alpha
     qa/face.json           per frame: face (Vision), head (matte top, hair included), body bbox
     stderr                 jitter / junk report — the delivery condition is junk 0, jitter < 1.0

Cleaning (mnt-matte law, 2026-09-03), order fixed because each step relies on the previous:
  0 colour gate   drop mask pixels of a furniture hue (--gate H0:H1, S>.12, V>.06); off by default
  1 opening r=5   tears the thin bridge that ties a chunk of background to the body
  2 largest blob  the torn chunk is now its own component and goes
  3 closing r=7 + fill holes < 2500 px   (the gap between arm and torso is ~11 000 px and must stay)
  4 temporal median ±window frames        kills the 1–2-frame flicker along the contour
  5 shrink 1.2 px (distance transform)    Vision's edge sits on the outer pixel and drags background colour
  6 gaussian 1.6                          below: razor edge; above: halo
RGB is never touched: grading is applied later without recomputing the matte.
"""
import sys, os, time, argparse, json, collections
import numpy as np
from PIL import Image
from scipy import ndimage
import Quartz, Vision
from Foundation import NSURL

ap = argparse.ArgumentParser()
ap.add_argument('indir'); ap.add_argument('outdir')
ap.add_argument('--faces', default='qa/face.json')
ap.add_argument('--fps', type=float, default=30)
ap.add_argument('--gate', default=None, help='H0:H1 hue range (deg) to remove from the mask')
ap.add_argument('--window', type=int, default=2, help='temporal median half-window, frames')
ap.add_argument('--feather', type=float, default=1.6)
ap.add_argument('--shrink', type=float, default=1.2)
ap.add_argument('--hole', type=int, default=2500)
ap.add_argument('--all-people', action='store_true')
ap.add_argument('--raw', action='store_true', help='skip cleaning (Vision mask + feather only)')
ap.add_argument('--faces-only', action='store_true', help='no matte: only the face track (head = face box grown 45 %% upward)')
ap.add_argument('--spans', default=None, help='кадры, которым нужен настоящий матт: 120-260,900-1010 (1-based). '
                'Остальным считается только лицо. Матт нужен там, где есть mode:\'cut\' или behind:true — '
                'оба множества известны из спека, поэтому порядок двухпроходный: спек, потом матт.')
a = ap.parse_args()
os.makedirs(a.outdir, exist_ok=True); os.makedirs(os.path.dirname(a.faces) or '.', exist_ok=True)

files = sorted(f for f in os.listdir(a.indir) if f.lower().endswith(('.png', '.jpg', '.jpeg')))
if not files: raise SystemExit(f'no frames in {a.indir}')

CORE = None
if a.spans:
    CORE = set()
    for part in a.spans.split(','):
        lo, hi = (part.split('-') + [part])[:2]
        CORE.update(range(int(lo) - 1, int(hi)))          # 1-based → 0-based
    CORE &= set(range(len(files)))
    print(f'spans: матт на {len(CORE)} кадрах из {len(files)}, остальным только лицо', file=sys.stderr)
seg = Vision.VNGeneratePersonSegmentationRequest.alloc().initWithCompletionHandler_(None)
seg.setQualityLevel_(Vision.VNGeneratePersonSegmentationRequestQualityLevelAccurate)
seg.setOutputPixelFormat_(Quartz.kCVPixelFormatType_OneComponent8)
fac = Vision.VNDetectFaceRectanglesRequest.alloc().initWithCompletionHandler_(None)


def vision(path, W, H):
    handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(path), {})
    ok, err = handler.performRequests_error_([seg, fac], None)
    if not ok: raise RuntimeError(f'Vision: {err}')
    buf = seg.results()[0].pixelBuffer()
    Quartz.CVPixelBufferLockBaseAddress(buf, 1)
    try:
        w, h = Quartz.CVPixelBufferGetWidth(buf), Quartz.CVPixelBufferGetHeight(buf)
        stride = Quartz.CVPixelBufferGetBytesPerRow(buf)
        raw = bytes(Quartz.CVPixelBufferGetBaseAddress(buf).as_buffer(stride * h))
        m = np.frombuffer(raw, dtype=np.uint8).reshape(h, stride)[:, :w].copy()
    finally:
        Quartz.CVPixelBufferUnlockBaseAddress(buf, 1)
    face = None
    res = fac.results() or []
    if res:
        bb = max(res, key=lambda o: o.boundingBox().size.width * o.boundingBox().size.height).boundingBox()
        face = [int(bb.origin.x * W), int((1 - bb.origin.y - bb.size.height) * H), int(bb.size.width * W), int(bb.size.height * H)]
    return m, face


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]; return (x * x + y * y) <= r * r


D5, D7 = disk(5), disk(7)
gate = None
if a.gate:
    h0, h1 = (float(v) for v in a.gate.split(':')); gate = (h0, h1)


def spatial(mask_u8, rgb):
    """steps 0–3 on one frame → binary mask"""
    b = mask_u8 > 96
    if gate is not None:
        hsv = np.asarray(Image.fromarray(rgb).convert('HSV'), dtype=np.float32)
        h = hsv[..., 0] * 360 / 255; s = hsv[..., 1] / 255; v = hsv[..., 2] / 255
        b &= ~((h >= gate[0]) & (h <= gate[1]) & (s > .12) & (v > .06))
    b = ndimage.binary_opening(b, D5)
    lab, n = ndimage.label(b)
    if n > 1 and not a.all_people:
        sizes = ndimage.sum(np.ones_like(lab, dtype=np.uint8), lab, range(1, n + 1))
        b = lab == (1 + int(np.argmax(sizes)))
    b = ndimage.binary_closing(b, D7)
    inv, k = ndimage.label(~b)
    if k > 1:
        sizes = ndimage.sum(np.ones_like(inv, dtype=np.uint8), inv, range(1, k + 1))
        small = np.isin(inv, [i + 1 for i, s in enumerate(sizes) if s < a.hole and s > 0])
        border = np.zeros_like(b); border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
        touching = set(np.unique(inv[border])) - {0}
        small &= ~np.isin(inv, list(touching))
        b |= small
    return b


def soften(b):
    """steps 5–6: shrink + feather → uint8 alpha"""
    if a.shrink > 0:
        d = ndimage.distance_transform_edt(b)
        alpha = np.clip(d - a.shrink, 0, 1) * 255
    else:
        alpha = b.astype(np.float32) * 255
    if a.feather > 0: alpha = ndimage.gaussian_filter(alpha, a.feather)
    return alpha.astype(np.uint8)


def head_box(alpha):
    ys, xs = np.where(alpha > 40)
    if not len(ys): return None, None
    top = int(ys.min()); band = alpha[top:top + 300]
    by, bx = np.where(band > 40)
    head = [int(bx.min()), top, int(bx.max() - bx.min()), int(min(300, alpha.shape[0] - top))]
    body = [int(xs.min()), top, int(xs.max() - xs.min()), int(ys.max() - top)]
    return head, body


t0 = time.time(); W = H = None
raw_stats = {'comp_max': 0, 'holes_max': 0, 'junk': 0}
frames_out = []; jit = []; prev_alpha = None; done = 0
faces = []; packed = []   # pass 1: binary masks packed to bits (≈260 KB per 1080×1920 frame)


def face_of(path, W, H):
    handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(path), {})
    handler.performRequests_error_([fac], None)
    res = fac.results() or []
    if not res: return None
    bb = max(res, key=lambda o: o.boundingBox().size.width * o.boundingBox().size.height).boundingBox()
    return [int(bb.origin.x * W), int((1 - bb.origin.y - bb.size.height) * H), int(bb.size.width * W), int(bb.size.height * H)]


def crude_head(face):
    """Коробка головы без матта: лицо, выращенное на 45 % вверх. Грубее настоящей —
    поэтому qa/overlap.js понижает HEAD COVERED до предупреждения, когда матта нет."""
    return [face[0] - int(face[2] * .15), face[1] - int(face[3] * .45),
            int(face[2] * 1.3), int(face[3] * 1.55)] if face else None


def emit(name, b):
    global prev_alpha, done
    rgb = np.asarray(Image.open(os.path.join(a.indir, name)).convert('RGB'))
    alpha = soften(b)
    im = Image.fromarray(rgb); im.putalpha(Image.fromarray(alpha, 'L'))
    im.save(os.path.join(a.outdir, os.path.splitext(name)[0] + '.png'), compress_level=1)
    if prev_alpha is not None: jit.append(float(np.abs(alpha.astype(np.int16) - prev_alpha).mean()))
    prev_alpha = alpha.astype(np.int16)
    head, body = head_box(alpha)
    frames_out.append({'n': done + 1, 'head': head, 'body': body})
    done += 1
    if done % 50 == 0: print(f'{done}/{len(files)}  {(time.time() - t0) / done:.3f} s/frame', file=sys.stderr)


if a.faces_only:
    seg = None
    for i, f in enumerate(files):
        src = os.path.join(a.indir, f)
        if W is None: W, H = Image.open(src).size
        handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(src), {})
        handler.performRequests_error_([fac], None)
        res = fac.results() or []; face = None
        if res:
            bb = max(res, key=lambda o: o.boundingBox().size.width * o.boundingBox().size.height).boundingBox()
            face = [int(bb.origin.x * W), int((1 - bb.origin.y - bb.size.height) * H), int(bb.size.width * W), int(bb.size.height * H)]
        faces.append(face)
        head = [face[0] - int(face[2] * .15), face[1] - int(face[3] * .45), int(face[2] * 1.3), int(face[3] * 1.55)] if face else None
        frames_out.append({'n': i + 1, 'head': head, 'body': None}); done += 1
    files = []
MARGIN = set()
if CORE is not None:
    for i in CORE: MARGIN.update(range(max(0, i - a.window), min(len(files), i + a.window + 1)))

for i, f in enumerate(files):
    src = os.path.join(a.indir, f)
    if CORE is not None and i not in MARGIN:      # вне диапазона: только лицо, сегментации нет
        if W is None: W, H = Image.open(src).size
        faces.append(face_of(src, W, H)); packed.append(None); continue
    img = Image.open(src).convert('RGB')
    if W is None: W, H = img.size
    m, face = vision(src, W, H); faces.append(face)
    m = np.asarray(Image.fromarray(m, 'L').resize(img.size, Image.BILINEAR))
    lab, n = ndimage.label(m > 96); inv, k = ndimage.label(m <= 96)
    raw_stats['comp_max'] = max(raw_stats['comp_max'], n); raw_stats['holes_max'] = max(raw_stats['holes_max'], max(0, k - 1))
    if n > 1 or k > 2: raw_stats['junk'] += 1
    b = (m > 96) if a.raw else spatial(m, np.asarray(img))
    packed.append(np.packbits(b))
    if (i + 1) % 50 == 0: print(f'pass 1  {i + 1}/{len(files)}  {(time.time() - t0) / (i + 1):.3f} s/frame', file=sys.stderr)

shape = (H, W); N = len(files); w = 0 if a.raw else a.window
if a.faces_only: files = []
for i, f in enumerate(files):
    if CORE is not None and i not in CORE:        # кадр без матта: в face.json он всё равно обязан быть
        frames_out.append({'n': i + 1, 'head': crude_head(faces[i]), 'body': None})
        continue
    lo, hi = max(0, i - w), min(N, i + w + 1)
    nb = [j for j in range(lo, hi) if packed[j] is not None]
    if len(nb) <= 1: b = np.unpackbits(packed[i])[:H * W].reshape(shape).astype(bool)
    else:
        acc = np.zeros(H * W, dtype=np.uint8)
        for j in nb: acc += np.unpackbits(packed[j])[:H * W]
        b = (acc > len(nb) // 2).reshape(shape)
    emit(f, b)
    frames_out[-1]['n'] = i + 1                   # порядок кадров, а не порядок записи

# faces: fill gaps from neighbours, attach to frames
last = None
for i, fr in enumerate(frames_out):
    if faces[i] is None:
        nxt = next((faces[j] for j in range(i + 1, len(faces)) if faces[j]), None)
        faces[i] = last or nxt
    fr['face'] = faces[i]; last = faces[i] or last
free = None
if frames_out and any(fr['head'] for fr in frames_out):
    hx0 = min(fr['head'][0] for fr in frames_out if fr['head']); hx1 = max(fr['head'][0] + fr['head'][2] for fr in frames_out if fr['head'])
    hy0 = min(fr['head'][1] for fr in frames_out if fr['head']); hy1 = max(fr['head'][1] + fr['head'][3] for fr in frames_out if fr['head'])
    free = {'left': hx0, 'right': W - hx1, 'above': hy0, 'below_head': H - hy1}
frames_out.sort(key=lambda fr: fr['n'])
json.dump({'fps': a.fps, 'w': W, 'h': H, 'frames': frames_out, 'keepout_head': free,
           'matte_spans': (a.spans if CORE else None)}, open(a.faces, 'w'))
jm = float(np.mean(jit)) if jit else 0.0; jx = float(np.max(jit)) if jit else 0.0
print(f'done: {done} frames in {time.time() - t0:.1f} s → {a.outdir if not a.faces_only else a.faces}', file=sys.stderr)
print(f'raw Vision: components max {raw_stats["comp_max"]}, holes max {raw_stats["holes_max"]}, junk frames {raw_stats["junk"]}/{done}', file=sys.stderr)
print(f'after clean: alpha jitter mean {jm:.2f} max {jx:.2f}  ({"ok" if jm < 1.0 else "HIGH — widen --window to 3, do not touch morphology"})', file=sys.stderr)
if free: print(f'head keep-out over the whole clip: x {hx0}…{hx1}, y {hy0}…{hy1}; free left {free["left"]} right {free["right"]} above {free["above"]}', file=sys.stderr)
print(f'faces: {sum(1 for f in faces if f)} of {len(faces)} frames detected → {a.faces}', file=sys.stderr)
