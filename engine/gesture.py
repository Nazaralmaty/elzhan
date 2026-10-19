#!/usr/bin/env python3.13
"""gesture.py — where the speaker points, from the take's frames (macOS Vision hand pose, offline).

  python3.13 engine/gesture.py work/fr [--fps 30] [--step 2] [--out qa/gestures.json]

Law (Elzhan, 15.10.2026, client eto on reel_001_uip: she pointed up in the card while the checklist landed on the left):
«куда показывает или на что акцентирует внимание спикер жестами — туда и был акцент визуального монтажа».
This file finds the spans; `qa/gesture.js` checks that the montage answers them.

Out: {"fps", "w", "h", "spans": [{t0, t1, kind: point|palm, dir: up|left|right|down, x, y}]}
  x, y — the fingertip (point) or palm centre (palm) in plate pixels, median over the span.
  kind point: index finger extended, middle/ring/little curled.  kind palm: all four fingers extended and the hand
  held out to a side of the face (> 0.2 w) or above the chin — an open palm offering something; its dir is the side the hand
  is on. Hands in the lap (below y 0.80 h) are ignored: that is not a gesture.
"""
import sys, os, json, math, argparse
import Vision
from Foundation import NSURL

ap = argparse.ArgumentParser()
ap.add_argument('frames'); ap.add_argument('--fps', type=float, default=30); ap.add_argument('--step', type=int, default=2)
ap.add_argument('--out', default='qa/gestures.json'); ap.add_argument('--faces', default='qa/face.json'); ap.add_argument('--min', type=float, default=.35, help='shortest span, s')
a = ap.parse_args()

files = sorted(f for f in os.listdir(a.frames) if f.endswith(('.jpg', '.png')))
req = Vision.VNDetectHumanHandPoseRequest.alloc().init(); req.setMaximumHandCount_(2)
J = {n: getattr(Vision, 'VNHumanHandPoseObservationJointName' + n) for n in
     ('Wrist', 'IndexMCP', 'IndexPIP', 'IndexTip', 'MiddleMCP', 'MiddleTip', 'RingMCP', 'RingTip', 'LittleMCP', 'LittleTip', 'ThumbTip')}
from PIL import Image
W, H = Image.open(os.path.join(a.frames, files[0])).size
LAP = H * .80
ap_face = a.faces if os.path.exists(a.faces) else None
FACE = {f['n'] - 1: f['face'] for f in json.load(open(ap_face))['frames'] if f.get('face')} if ap_face else {}
fys = sorted(v[1] + v[3] for v in FACE.values())
P_FACE_BOTTOM = fys[len(fys) // 2] if fys else H * .35


def pts(obs):
    out = {}
    for n, key in J.items():
        p, err = obs.recognizedPointForJointName_error_(key, None)
        if p is None or p.confidence() < .3: return None
        out[n] = (p.location().x * W, (1 - p.location().y) * H)      # Vision is bottom-left origin
    return out


def ext(P, tip, mcp):
    """finger extended: the tip is clearly farther from the wrist than its knuckle"""
    d = lambda u, v: math.dist(P[u], P[v])
    return d(tip, 'Wrist') > d(mcp, 'Wrist') * 1.45


def direction(dx, dy):
    if abs(dy) >= abs(dx) * .8: return 'up' if dy < 0 else 'down'
    return 'left' if dx < 0 else 'right'


def classify(P, fx):
    """fx — face centre x of this frame; a gesture is a hand raised above the lap (y < LAP) and held to a side or up"""
    hx = sum(P[k][0] for k in ('IndexMCP', 'MiddleMCP', 'RingMCP', 'LittleMCP')) / 4
    hy = sum(P[k][1] for k in ('IndexMCP', 'MiddleMCP', 'RingMCP', 'LittleMCP')) / 4
    if hy > LAP: return None                                            # hands in the lap: not a gesture
    idx = ext(P, 'IndexTip', 'IndexMCP')
    others = [ext(P, t, m) for t, m in (('MiddleTip', 'MiddleMCP'), ('RingTip', 'RingMCP'), ('LittleTip', 'LittleMCP'))]
    if idx and sum(others) == 0:
        dx, dy = P['IndexTip'][0] - P['IndexMCP'][0], P['IndexTip'][1] - P['IndexMCP'][1]
        if math.hypot(dx, dy) < 18: return None
        d = direction(dx, dy)
        if d == 'down': return None
        return ('point', d, P['IndexTip'])
    if idx and sum(others) >= 2:
        # an open palm offers what lies on ITS side of the body: the side is the hand's place, not the finger direction
        # (a palm turned up to the side has its fingers pointing anywhere)
        if hy < P_FACE_BOTTOM: return ('palm', 'up', (hx, hy))
        if abs(hx - fx) > W * .2: return ('palm', 'left' if hx < fx else 'right', (hx, hy))
    return None


raw = []                                       # per sampled frame: list of (kind, dir, x, y)
for i in range(0, len(files), a.step):
    h = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(os.path.join(a.frames, files[i])), {})
    ok, err = h.performRequests_error_([req], None)
    g = []
    for obs in (req.results() or []):
        P = pts(obs)
        f = FACE.get(i); fx = f[0] + f[2] / 2 if f else W / 2
        c = P and classify(P, fx)
        if c: g.append((c[0], c[1], c[2][0], c[2][1]))
    raw.append((i / a.fps, g))

# spans: the same kind+dir held over consecutive samples (one missed sample bridged)
spans, open_ = [], {}
dt = a.step / a.fps
for t, g in raw:
    keys = {(k, d): (x, y) for k, d, x, y in g}
    for key in list(open_):
        s = open_[key]
        if key in keys: s['last'] = t; s['xy'].append(keys[key])
        elif t - s["last"] > dt * 2.6: spans.append(open_.pop(key))
    for key, xy in keys.items():
        if key not in open_: open_[key] = {'k': key, 't0': t, 'last': t, 'xy': [xy]}
spans += open_.values()
out = []
for s in sorted(spans, key=lambda s: s['t0']):
    t1 = s['last'] + dt
    if t1 - s['t0'] < a.min: continue
    xs = sorted(p[0] for p in s['xy']); ys = sorted(p[1] for p in s['xy'])
    out.append({'t0': round(s['t0'], 2), 't1': round(t1, 2), 'kind': s['k'][0], 'dir': s['k'][1],
                'x': round(xs[len(xs) // 2]), 'y': round(ys[len(ys) // 2])})
os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
json.dump({'fps': a.fps, 'w': W, 'h': H, 'spans': out}, open(a.out, 'w'), ensure_ascii=False, indent=1)
for s in out: print(f"{s['t0']:6.2f}–{s['t1']:6.2f}  {s['kind']:5} {s['dir']:5}  at {s['x']},{s['y']}")
print(f'{len(out)} gesture spans → {a.out}', file=sys.stderr)
