#!/usr/bin/env python3
"""frame.py — frame geometry: where the speaker, inserts and text sit.

  grid 1080 1920            all grid lines and anchors in pixels
  check layout.json         composition laws as a checklist, exit 1 on any fail
  overlay frame.png out.png the frame with the grid drawn (ffmpeg)
  demo

layout.json:
{ "frame": [1080, 1920],
  "elements": [
    {"id":"speaker","type":"subject","box":[240,520,600,1400],
     "face":[430,600,220,260],"head":[420,540,240,320],"look":"right"},
    {"id":"card","type":"insert","box":[120,1180,520,360]},
    {"id":"subs","type":"text","box":[140,1400,800,120]} ] }
box = [x, y, w, h] from the top-left. `head` (matte top incl. hair) is
preferred over `face` for the clearance law: hair is protected like the face.

Laws: eye line on the upper third / upper phi; headroom 2–9 % of height (or a
bold crop ≥ 8 % of the head); lead room ≥ 1.5×; insert width 30–62 % of the
frame; insert centre on a grid line; ≥ 15 px from the head (30+ preferred);
edges either flush or ≥ 24 px apart (1–12 px reads as sloppy); centre of mass
off centre ≥ 3 % unless "symmetry": true. Safe zone for TEXT is the client
mask x 71…1012, y 235…1590 and x ≤ 858 below y 1348; graphics without
letters may use x 40…1040 ("safe": "wide").
"""
import json, subprocess, sys

PHI = 0.618
SAFE_TEXT = (71, 235, 1012, 1590)
SAFE_WIDE = (40, 235, 1040, 1590)
ICON_COL_Y, ICON_COL_X = 1348, 858      # like/comment/share column


def grid(W, H):
    gx = lambda f: round(W * f); gy = lambda f: round(H * f)
    g = {'thirds_x': [gx(1 / 3), gx(2 / 3)], 'thirds_y': [gy(1 / 3), gy(2 / 3)],
         'phi_x': [gx(1 - PHI), gx(PHI)], 'phi_y': [gy(1 - PHI), gy(PHI)],
         'center': [gx(0.5), gy(0.5)], 'eyeline': [gy(1 - PHI), gy(1 / 3)],
         'headroom': [round(H * 0.02), round(H * 0.09)], 'insert_w': [round(W * 0.30), round(W * 0.62)]}
    g['anchors'] = [[x, y] for x in g['thirds_x'] + g['phi_x'] for y in g['thirds_y'] + g['phi_y']]
    return g


def _near(v, targets, tol):
    return any(abs(v - t) <= tol for t in targets)


def check(L):
    W, H = L['frame']; g = grid(W, H); els = L['elements']
    out = []; ok = lambda m: out.append((True, m)); bad = lambda m: out.append((False, m))
    subj = next((e for e in els if e['type'] == 'subject'), None)
    if subj:
        x, y, w, h = subj['box']; head = y; lo, hi = g['headroom']
        if head < 0:
            (ok if abs(head) > 0.08 * h else bad)(f'head top {-head}px past the edge — ' + ('a deliberate crop' if abs(head) > 0.08 * h else 'barely touching: crop bolder or give air'))
        elif lo <= head <= hi: ok(f'headroom {head}px within {lo}–{hi}')
        else: bad(f'headroom {head}px, norm {lo}–{hi}px: ' + ('pressed to the top' if head < lo else 'head sunk, empty above'))
        if 'face' in subj:
            fx, fy, fw, fh = subj['face']; eyes = round(fy + 0.42 * fh)
            (ok if _near(eyes, g['eyeline'], 0.035 * H) else bad)(f'eye line y={eyes} ' + ('on the upper third/phi' if _near(eyes, g['eyeline'], 0.035 * H) else f'off {g["eyeline"]} — shift the frame vertically'))
            look = subj.get('look')
            if look in ('left', 'right'):
                left, right = fx + fw / 2, W - (fx + fw / 2)
                lead, back = (right, left) if look == 'right' else (left, right)
                r = lead / max(back, 1)
                (ok if r >= 1.5 else bad)(f'lead room {"ok" if r >= 1.5 else "short"}: {round(lead)}px ahead, {round(back)}px behind (need ≥1.5×, have {r:.2f}×)')
    safe = L.get('safe')
    sx0, sy0, sx1, sy1 = (SAFE_WIDE if safe == 'wide' else safe if isinstance(safe, list) else SAFE_TEXT) if (W, H) == (1080, 1920) else (round(W * .06), round(H * .12), round(W * .94), round(H * .83))
    guard = (subj.get('head') or subj.get('face')) if subj else None
    for e in els:
        x, y, w, h = e['box']
        if e['type'] in ('insert', 'text'):
            inside = x >= sx0 and y >= sy0 and x + w <= sx1 and y + h <= sy1
            if inside and e['type'] == 'text' and (W, H) == (1080, 1920) and y + h > ICON_COL_Y and x + w > ICON_COL_X:
                inside = False; bad(f'{e["id"]}: right edge {x + w} inside the icon column (x ≤ {ICON_COL_X} below y {ICON_COL_Y})')
            elif inside: ok(f'{e["id"]}: inside the safe zone')
            else: bad(f'{e["id"]}: outside the safe zone ({sx0},{sy0})–({sx1},{sy1})')
        if e['type'] == 'insert':
            lo, hi = g['insert_w']
            (ok if lo <= w <= hi else bad)(f'{e["id"]}: width {w}px, norm {lo}–{hi}' + ('' if lo <= w <= hi else ' — too small to read' if w < lo else ' — nearly full-frame, the composition collapses'))
            cx, cy = x + w / 2, y + h / 2
            (ok if _near(cx, g['thirds_x'] + g['phi_x'], 0.04 * W) or _near(cy, g['thirds_y'] + g['phi_y'], 0.04 * H) else bad)(
                f'{e["id"]}: centre ({round(cx)},{round(cy)}) ' + ('on a grid line' if _near(cx, g['thirds_x'] + g['phi_x'], 0.04 * W) or _near(cy, g['thirds_y'] + g['phi_y'], 0.04 * H) else f'between lines — move to x∈{g["thirds_x"] + g["phi_x"]} or y∈{g["thirds_y"] + g["phi_y"]}'))
        if guard and e['type'] in ('insert', 'text') and e.get('layer', 'front') == 'front':
            fx, fy, fw, fh = guard
            gap = max(x - (fx + fw), fx - (x + w), y - (fy + fh), fy - (y + h))
            if not (x + w < fx or x > fx + fw or y + h < fy or y > fy + fh): bad(f'{e["id"]}: covers the head')
            elif gap < 15: bad(f'{e["id"]}: {gap}px from the head, the clearance law needs ≥15')
            else: ok(f'{e["id"]}: {gap}px from the head')
    edges = [(e['id'], v, 'x') for e in els for v in (e['box'][0], e['box'][0] + e['box'][2])]
    edges += [(e['id'], v, 'y') for e in els for v in (e['box'][1], e['box'][1] + e['box'][3])]
    for i, (a, va, ax) in enumerate(edges):
        for b, vb, bx in edges[i + 1:]:
            if a != b and ax == bx and 0 < abs(va - vb) <= 12:
                bad(f'{a} and {b}: edges {abs(va - vb)}px apart — align flush or separate by 24+')
    mass = sum(e['box'][2] * e['box'][3] for e in els) or 1
    cx = sum((e['box'][0] + e['box'][2] / 2) * e['box'][2] * e['box'][3] for e in els) / mass
    off = abs(cx - W / 2) / W
    (ok if off >= 0.03 or L.get('symmetry') else bad)(f'centre of mass {off * 100:.1f}% off centre' + ('' if off >= 0.03 or L.get('symmetry') else ' — dead centre without symmetry is a limp composition'))
    return out


def overlay(src, dst, W=None, H=None):
    if not W:
        p = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', src], capture_output=True, text=True)
        W, H = (int(v) for v in p.stdout.strip().split('x'))
    g = grid(W, H); boxes = []
    for x in g['thirds_x']: boxes.append(f'drawbox=x={x}:y=0:w=2:h={H}:color=white@0.55:t=fill')
    for y in g['thirds_y']: boxes.append(f'drawbox=x=0:y={y}:w={W}:h=2:color=white@0.55:t=fill')
    for x in g['phi_x']: boxes.append(f'drawbox=x={x}:y=0:w=2:h={H}:color=yellow@0.7:t=fill')
    for y in g['phi_y']: boxes.append(f'drawbox=x=0:y={y}:w={W}:h=2:color=yellow@0.7:t=fill')
    sx0, sy0, sx1, sy1 = SAFE_TEXT if (W, H) == (1080, 1920) else (round(W * .06), round(H * .12), round(W * .94), round(H * .83))
    boxes.append(f'drawbox=x={sx0}:y={sy0}:w={sx1 - sx0}:h={sy1 - sy0}:color=red@0.8:t=3')
    if (W, H) == (1080, 1920): boxes.append(f'drawbox=x={ICON_COL_X}:y={ICON_COL_Y}:w={sx1 - ICON_COL_X}:h={sy1 - ICON_COL_Y}:color=red@0.5:t=3')
    for ax, ay in g['anchors']: boxes.append(f'drawbox=x={ax - 8}:y={ay - 8}:w=16:h=16:color=cyan@0.9:t=fill')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-vf', ','.join(boxes), '-frames:v', '1', dst], check=True)
    print(dst)


def demo():
    W, H = 1080, 1920; g = grid(W, H)
    assert g['thirds_y'] == [640, 1280] and g['phi_y'] == [733, 1187]
    good = {'frame': [W, H], 'elements': [
        {'id': 'speaker', 'type': 'subject', 'box': [140, 100, 620, 1500], 'face': [300, 560, 240, 300], 'look': 'right'},
        {'id': 'card', 'type': 'insert', 'box': [600, 1100, 380, 300]}]}
    res = check(good); assert all(o for o, _ in res), [m for o, m in res if not o]
    bad = json.loads(json.dumps(good))
    bad['elements'][1]['box'] = [72, 1100, 940, 300]; bad['elements'][0]['face'] = [300, 1200, 240, 300]
    r2 = [m for o, m in check(bad) if not o]
    assert any('full-frame' in m for m in r2) and any('eye line' in m for m in r2), r2
    sub = {'frame': [W, H], 'elements': [{'id': 'subs', 'type': 'text', 'box': [140, 1380, 800, 120]}]}
    assert any('icon column' in m for o, m in check(sub) if not o)
    print('ok')


def main():
    a = sys.argv[1:]
    if not a or a[0] == 'demo': return demo()
    if a[0] == 'grid': return print(json.dumps(grid(int(a[1]), int(a[2])), indent=2))
    if a[0] == 'check':
        res = check(json.load(open(a[1])))
        for o, m in res: print(('  ok  ' if o else '  FAIL') + '  ' + m)
        sys.exit(0 if all(o for o, _ in res) else 1)
    if a[0] == 'overlay': return overlay(a[1], a[2])
    print(__doc__)


if __name__ == '__main__':
    main()
