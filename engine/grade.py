#!/usr/bin/env python3
"""grade.py — colour of a reel in numbers: measure, compare, mood, and layer matching.

  python3 grade.py measure clip.mp4 [--json]        # split-toning, saturation, contrast, temperature, palette
  python3 grade.py measure matte.png                # a PNG with alpha is measured over alpha>200 only
  python3 grade.py compare mine.mp4 ref.mp4         # where we differ, as numbers
  python3 grade.py moods                            # nine moods and what each says
  python3 grade.py filter thriller -k 0.35          # -vf string for your own ffmpeg (k = strength)
  python3 grade.py apply luxury in.mp4 out.mp4 -k 0.35
  python3 grade.py accent clip.mp4 "#FF6600"        # will the accent survive this grade
  python3 grade.py match base.mp4 layer.png          # -vf that seats the layer into the base (color-match law)
  python3 grade.py match work/fr work/mt --json     # dirs: 6 frames sampled from each
  python3 grade.py demo

Laws baked into `match` (from the color-match skill, 2026-08-30):
  black point of the layer goes to the black point of the base (never to 0);
  highlights are shaved, not crushed; the layer's mean luma must NOT drop
  (Elzhan: "the speaker went dark" is the systemic error); saturation 0.92–1.12;
  warm/cool shift half of what looks needed, in the shadows first.
stdlib + ffmpeg only.
"""
import colorsys, json, math, subprocess, sys, argparse, os, tempfile, pathlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import palette as P

# s/m/h — shadow/mid/high shifts in R,G,B (ffmpeg colorbalance units), sat, con, gam, lift = black lift 0..0.1
MOODS = {
    'horror':    dict(s=(-.20, -.04, .28), m=(-.08, 0, .10), h=(.06, .01, -.04), sat=.62, con=1.22, gam=.86, lift=.00,
                      note='night fear: blue shadows, slightly warm highs, washed colour, honest black'),
    'thriller':  dict(s=(-.18, .00, .24), m=(-.04, 0, .04), h=(.16, .03, -.14), sat=1.05, con=1.12, gam=.95, lift=.01,
                      note='teal-orange: teal shadows, warm skin and highs; the workhorse of action and ads'),
    'nostalgia': dict(s=(.10, .03, -.10), m=(.12, .04, -.14), h=(.14, .06, -.16), sat=.92, con=.90, gam=1.06, lift=.06,
                      note='yellow film: everything warm, black lifted to grey — memory, childhood, home'),
    'romance':   dict(s=(.04, -.01, .03), m=(.05, .01, .00), h=(.07, .03, -.02), sat=1.02, con=.90, gam=1.08, lift=.06,
                      note='soft warmth with a pink cast, low contrast, air'),
    'comedy':    dict(s=(.02, .02, .02), m=(.02, .02, .00), h=(.03, .03, .00), sat=1.18, con=1.02, gam=1.05, lift=.02,
                      note='bright, clean, saturated: nothing hidden'),
    'drama':     dict(s=(-.06, -.02, .06), m=(-.02, 0, .02), h=(.02, .01, -.01), sat=.75, con=1.10, gam=.96, lift=.02,
                      note='desaturated truth: colour leaves, texture and face remain'),
    'luxury':    dict(s=(-.04, -.04, .02), m=(.05, .00, -.05), h=(.14, .07, -.10), sat=.88, con=1.15, gam=.90, lift=.00,
                      note='expensive: deep black, warm highs, no accidental colour'),
    'scifi':     dict(s=(-.14, .04, .18), m=(-.12, .04, .14), h=(-.08, .03, .10), sat=.95, con=1.08, gam=.94, lift=.01,
                      note='cold and technical: teal in all three zones, warmth only on the face'),
    'dream':     dict(s=(.10, -.04, .14), m=(.08, -.02, .10), h=(.10, .00, .10), sat=1.06, con=.86, gam=1.10, lift=.08,
                      note='dream and memory: pink-lilac haze, no black at all'),
    'neutral':   dict(s=(0, 0, 0), m=(0, 0, 0), h=(0, 0, 0), sat=1.0, con=1.0, gam=1.0, lift=0, note='no grade — baseline'),
}


def vf(mood, k=1.0):
    """-vf string. k = strength; ordinary footage takes 0.3–0.4, 1.0 only where the light was set for it."""
    m = MOODS[mood]
    (rs, gs, bs), (rm, gm, bm), (rh, gh, bh) = ([round(c * k, 3) + 0.0 or 0.0 for c in m[z]] for z in 'smh')
    mix = lambda v: round(1 + (v - 1) * k, 3)
    parts = [f'colorbalance=rs={rs}:gs={gs}:bs={bs}:rm={rm}:gm={gm}:bm={bm}:rh={rh}:gh={gh}:bh={bh}',
             f'eq=contrast={mix(m["con"])}:saturation={mix(m["sat"])}:gamma={mix(m["gam"])}']
    if m['lift'] * k:
        l = m['lift'] * k
        parts.append(f'curves=all=\'{l:.2f}/{l:.2f} 1/1\'')
    return ','.join(parts)


# ── sampling ────────────────────────────────────────────────────────────────
def _dur(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True).stdout or 1)


def _frames_of(path, n=6):
    """A directory of frames → n files evenly spaced; a file → [file]."""
    p = pathlib.Path(path)
    if p.is_dir():
        fs = sorted(x for x in p.iterdir() if x.suffix.lower() in ('.png', '.jpg', '.jpeg'))
        if not fs: raise SystemExit(f'no frames in {path}')
        return [str(fs[round((i + 0.5) * len(fs) / n) - 1 if len(fs) >= n else min(i, len(fs) - 1)]) for i in range(min(n, len(fs)))]
    return [path]


def sample(path, grid=10, side=64, alpha=None):
    """Pixels as (r,g,b) tuples: grid² frames across a video, or the image(s). alpha: None = auto (PNG with alpha → alpha>200 only)."""
    out = []
    for f in _frames_of(path):
        is_img = f.lower().endswith(('.png', '.jpg', '.jpeg'))
        use_alpha = (alpha if alpha is not None else f.lower().endswith('.png'))
        if is_img:
            vfil = f'scale={side * 2}:{side * 2}'
            args = ['-frames:v', '1']
        else:
            n = grid * grid; fps = max(n / max(_dur(f), .1), 0.1)
            vfil = f'fps={fps},scale={side}:{side},tile={grid}x{grid}'
            args = ['-frames:v', '1']
        fmt = 'rgba' if use_alpha else 'rgb24'
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', vfil, *args, '-f', 'rawvideo', '-pix_fmt', fmt, '-'],
                             capture_output=True).stdout
        if not raw: raise SystemExit(f'ffmpeg could not read {f}')
        if use_alpha:
            px = [tuple(raw[i:i + 3]) for i in range(0, len(raw) - 3, 4) if raw[i + 3] > 200]
            if len(px) < 50:   # opaque PNG or an empty matte: fall back to all pixels
                px = [tuple(raw[i:i + 3]) for i in range(0, len(raw) - 3, 4)]
        else:
            px = [tuple(raw[i:i + 3]) for i in range(0, len(raw) - 2, 3)]
        out += px
    return out


def _hue_mean(hsv):
    x = sum(s * math.cos(math.radians(h)) for h, s, _ in hsv)
    y = sum(s * math.sin(math.radians(h)) for h, s, _ in hsv)
    if abs(x) + abs(y) < 1e-9: return None
    return math.degrees(math.atan2(y, x)) % 360


def stats(px):
    """Luma percentiles, mean, saturation, temperature (R-B) overall and in the shadows."""
    lum = sorted(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px)
    n = len(lum); p = lambda q: lum[int(q * (n - 1))]
    sat = [colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[1] for r, g, b in px]
    sh = [(r, g, b) for r, g, b in px if 0.2126 * r + 0.7152 * g + 0.0722 * b < 85]
    return {'p1': p(.01), 'p5': p(.05), 'p50': p(.5), 'p95': p(.95), 'p99': p(.99), 'mean': sum(lum) / n,
            'sat': sum(sat) / n, 'temp': sum(r - b for r, _, b in px) / n,
            'temp_sh': (sum(r - b for r, _, b in sh) / len(sh)) if sh else 0.0, 'n': n}


def measure(path):
    px = sample(path)
    hsv = [(h * 360, s, v) for h, s, v in (colorsys.rgb_to_hsv(r / 255, g / 255, b / 255) for r, g, b in px)]
    st = stats(px)
    hue_px = [x for x in hsv if x[2] >= .06]          # near-black pixels carry no hue
    bands = {'shadows': [x for x in hue_px if x[2] < .33],
             'mids': [x for x in hue_px if .33 <= x[2] < .66],
             'highs': [x for x in hue_px if x[2] >= .66]}
    out = {'file': os.path.basename(path.rstrip('/')),
           'luma': {'p5': round(st['p5'], 1), 'median': round(st['p50'], 1), 'p95': round(st['p95'], 1),
                    'mean': round(st['mean'], 1), 'contrast': round(st['p95'] - st['p5'], 1)},
           'saturation': round(st['sat'], 3), 'temperature': round(st['temp'], 1),
           'black_share': round(1 - len(hue_px) / len(hsv), 3), 'bands': {}, 'palette': P.kmeans(px, 5)}
    for k, v in bands.items():
        out['bands'][k] = None if not v else {'share': round(len(v) / len(hue_px), 3),
                                             'hue': None if _hue_mean(v) is None else round(_hue_mean(v), 1),
                                             'sat': round(sum(s for _, s, _ in v) / len(v), 3)}
    out['verdict'] = verdict(out)
    return out


def _name(h):
    if h is None: return 'neutral'
    for lo, hi, n in [(0, 15, 'red'), (15, 45, 'orange'), (45, 70, 'yellow'), (70, 160, 'green'), (160, 200, 'teal'),
                      (200, 250, 'blue'), (250, 290, 'violet'), (290, 330, 'magenta'), (330, 361, 'red')]:
        if lo <= h < hi: return n
    return '?'


def verdict(m):
    sh, hi = m['bands'].get('shadows'), m['bands'].get('highs')
    sh_h = sh['hue'] if sh else None; hi_h = hi['hue'] if hi else None
    v = []
    if sh_h is not None and hi_h is not None:
        d = abs((sh_h - hi_h + 180) % 360 - 180)
        v.append(f'shadows {_name(sh_h)} ({sh_h:.0f}°), highs {_name(hi_h)} ({hi_h:.0f}°), split {d:.0f}°'
                 + (' — split-toned' if d > 60 else ' — single tone') + ' (a detector of flat colour, NOT a target)')
    v.append('low saturation, colour as mood' if m['saturation'] < .35 else
             'high saturation, colour shouts' if m['saturation'] > .55 else 'medium saturation')
    v.append('dark frame (low key)' if m['luma']['median'] < 70 else 'bright frame (high key)' if m['luma']['median'] > 165 else 'mid brightness')
    v.append(f'temperature {"warm" if m["temperature"] > 8 else "cool" if m["temperature"] < -8 else "neutral"} ({m["temperature"]:+.0f} R-B)')
    return v


def show(m):
    print(f'\n{m["file"]}')
    l = m['luma']
    print(f'  luma      p5 {l["p5"]}  median {l["median"]}  p95 {l["p95"]}  mean {l["mean"]}  range {l["contrast"]}')
    print(f'  sat       {m["saturation"]}     temperature R-B {m["temperature"]:+}     black {m["black_share"] * 100:.0f}%')
    for k, b in m['bands'].items():
        if b: print(f'  {k:9} {b["share"] * 100:4.0f}% of frame, hue {b["hue"]}° ({_name(b["hue"])}), S {b["sat"]}')
    print('  palette   ' + '  '.join(m['palette']))
    for v in m['verdict']: print(f'  → {v}')


def compare(a, b):
    ma, mb = measure(a), measure(b)
    show(ma); show(mb)
    print('\ndifferences (mine minus reference):')
    print(f'  luma median  {ma["luma"]["median"] - mb["luma"]["median"]:+.1f}')
    print(f'  range        {ma["luma"]["contrast"] - mb["luma"]["contrast"]:+.1f}')
    print(f'  saturation   {ma["saturation"] - mb["saturation"]:+.3f}')
    print(f'  temperature  {ma["temperature"] - mb["temperature"]:+.1f}')
    for k in ma['bands']:
        x, y = ma['bands'][k], mb['bands'][k]
        if x and y and x['hue'] is not None and y['hue'] is not None:
            d = (x['hue'] - y['hue'] + 180) % 360 - 180
            print(f'  {k:9} hue {d:+.0f}°, S {x["sat"] - y["sat"]:+.3f}')


def accent(path, hexc):
    m = measure(path)
    print(f'accent {hexc} on "{m["file"]}"')
    worst = min(m['palette'], key=lambda c: P.contrast(hexc, c))
    r = P.contrast(hexc, worst)
    print(f'  worst background in the palette: {worst}, contrast {r:.2f}:1 — {P.verdict(r)}')
    ah = P.hex2hsv(hexc)[0]
    for k, b in m['bands'].items():
        if b and b['hue'] is not None:
            d = abs((ah - b['hue'] + 180) % 360 - 180)
            print(f'  to the {k} hue ({_name(b["hue"])}) {d:.0f}° — {"merges with the background" if d < 25 else "reads" if d > 60 else "borderline"}')
    mid = (m['bands'].get('mids') or {}).get('hue') or 0
    print(f'  hint: complement of the mid hue — {P.hsv2hex(P.ryb2rgb(P.rgb2ryb(mid) + 180), 1, 1)}')


def apply(mood, src, dst, k=1.0):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-vf', vf(mood, k), '-c:a', 'copy', dst], check=True)
    print(dst)


# ── match: seat a layer into the base ───────────────────────────────────────
def match_filter(B, L):
    """B, L = stats() of base and layer. Returns (vf string, plan dict)."""
    cl = lambda x, a, b: max(a, min(b, x))
    # 1. black point: layer p1 → base p1, drop limited to 12 levels, lift unlimited (grey black is the common fault)
    b_in = L['p1'] / 255; b_out = cl(B['p1'], L['p1'] - 12, 255) / 255
    # 2. mids: never below identity (the layer's mean must not drop); lift a third of the way if the base is brighter
    m_in = 0.5; m_out = cl(0.5 + max(0.0, (B['p50'] - L['p50']) / 255) * 0.33, 0.5, 0.62)
    # 3. white point: shave blown highlights a third of the way toward the base white, never below 0.90
    w_in = L['p99'] / 255; w_out = w_in if L['p99'] <= B['p99'] + 8 else cl((B['p99'] + (L['p99'] - B['p99']) * 0.35) / 255, 0.90, 1.0)
    pts = sorted({0.0: 0.0, round(b_in, 3): round(b_out, 3), round(m_in, 3): round(m_out, 3), round(w_in, 3): round(w_out, 3), 1.0: 1.0}.items())
    # keep the curve monotone
    pts2, last = [], -1
    for x, y in pts:
        if x <= last: continue
        pts2.append((x, y)); last = x
    ys = [y for _, y in pts2]
    for i in range(1, len(ys)):
        if ys[i] < ys[i - 1]: ys[i] = ys[i - 1]
    curve = ' '.join(f'{x:.3f}/{y:.3f}' for (x, _), y in zip(pts2, ys))
    # 4. temperature: half of the apparent need, shadows first, mids a third of that
    d = (B['temp_sh'] - L['temp_sh']) / 255
    rs, bs = cl(d * 0.25, -0.05, 0.05), cl(-d * 0.25, -0.05, 0.05)
    rm, bm = cl(d * 0.08, -0.02, 0.02), cl(-d * 0.08, -0.02, 0.02)
    sat = cl(B['sat'] / max(L['sat'], 1e-3), 0.92, 1.12)
    f = (f"curves=all='{curve}',"
         f"colorbalance=rs={rs:.3f}:bs={bs:.3f}:rm={rm:.3f}:bm={bm:.3f},"
         f"eq=saturation={sat:.3f}")
    return f, {'black': [round(L['p1']), round(B['p1']), round(b_out * 255)], 'mid': [round(L['p50']), round(B['p50']), round(m_out * 255)],
               'white': [round(L['p99']), round(B['p99']), round(w_out * 255)], 'temp_shadows_rb': [round(L['temp_sh'], 1), round(B['temp_sh'], 1)],
               'saturation': round(sat, 3)}


def match(base, layer, as_json=False):
    B = stats(sample(base)); Lpx = sample(layer); L = stats(Lpx)
    f, plan = match_filter(B, L)
    # verify on the layer itself: apply, re-measure, the mean must not fall
    frame = _frames_of(layer)[len(_frames_of(layer)) // 2]
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, 'g.png')
        r = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', frame, '-vf', f'format=rgba,{f},format=rgba', out], capture_output=True, text=True)
        after = stats(sample(out)) if r.returncode == 0 and os.path.exists(out) else None
        before = stats(sample(frame))
    rep = {'vf': f, 'plan': plan,
           'layer_before': {k: round(before[k], 1) for k in ('p5', 'p50', 'mean', 'sat')},
           'layer_after': ({k: round(after[k], 1) for k in ('p5', 'p50', 'mean', 'sat')} if after else None),
           'base': {k: round(B[k], 1) for k in ('p1', 'p50', 'p99', 'mean', 'sat')}}
    ok = after is not None and after['mean'] >= before['mean'] - 1.0
    rep['ok'] = ok
    if as_json:
        print(json.dumps(rep, indent=1))
    else:
        print(f)
        print(f"# base   p1 {B['p1']:.0f} p50 {B['p50']:.0f} p99 {B['p99']:.0f} mean {B['mean']:.0f} sat {B['sat']:.2f} temp_sh {B['temp_sh']:+.0f}", file=sys.stderr)
        print(f"# layer  p1 {L['p1']:.0f} p50 {L['p50']:.0f} p99 {L['p99']:.0f} mean {L['mean']:.0f} sat {L['sat']:.2f} temp_sh {L['temp_sh']:+.0f}", file=sys.stderr)
        if after: print(f"# after  p5 {after['p5']:.0f} p50 {after['p50']:.0f} mean {after['mean']:.0f} (was {before['mean']:.0f}) sat {after['sat']:.2f} → {'ok' if ok else 'FAIL: layer mean dropped — grade too strong'}", file=sys.stderr)
    return 0 if ok else 1


def demo():
    for k in MOODS: assert 'colorbalance' in vf(k) and 'eq=' in vf(k)
    assert vf('neutral') == vf('horror', 0)
    assert 'saturation=0.81' in vf('horror', 0.5), vf('horror', 0.5)
    assert MOODS['horror']['s'][2] > MOODS['horror']['s'][0] and MOODS['nostalgia']['s'][0] > MOODS['nostalgia']['s'][2]
    assert _name(200) == 'blue' and _name(30) == 'orange' and _name(None) == 'neutral'
    m = {'bands': {'shadows': {'hue': 200, 'sat': .3, 'share': .4}, 'mids': {'hue': 30, 'sat': .3, 'share': .4}, 'highs': {'hue': 30, 'sat': .2, 'share': .2}},
         'saturation': .3, 'luma': {'median': 50}, 'temperature': 20}
    v = ' '.join(verdict(m)); assert 'split-toned' in v and 'low key' in v, v
    # match: a layer greyer and brighter than the base gets its black deepened, mid kept, white shaved, and stays monotone
    B = {'p1': 18, 'p50': 96, 'p99': 230, 'mean': 100, 'sat': .30, 'temp_sh': 6}
    L = {'p1': 34, 'p50': 150, 'p99': 252, 'mean': 150, 'sat': .22, 'temp_sh': -10}
    f, plan = match_filter(B, L)
    assert plan['black'][2] == 22 and plan['mid'][2] == 128 and 231 <= plan['white'][2] <= 240, plan
    assert 'rs=0.016' in f and plan['saturation'] == 1.12, f
    ys = [float(p.split('/')[1]) for p in f.split("'")[1].split()]
    assert ys == sorted(ys), ys
    # a layer darker than the base is lifted, never pushed down
    L2 = {'p1': 10, 'p50': 70, 'p99': 200, 'mean': 72, 'sat': .30, 'temp_sh': 6}
    f2, plan2 = match_filter(B, L2)
    assert plan2['mid'][2] > 128 and plan2['white'][2] == 200 and plan2['black'][2] == 18, plan2
    print('ok')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    s = ap.add_subparsers(dest='cmd', required=True)
    x = s.add_parser('measure'); x.add_argument('path'); x.add_argument('--json', action='store_true')
    x = s.add_parser('compare'); x.add_argument('mine'); x.add_argument('ref')
    s.add_parser('moods')
    x = s.add_parser('apply'); x.add_argument('mood', choices=list(MOODS)); x.add_argument('src'); x.add_argument('dst'); x.add_argument('-k', type=float, default=1.0)
    x = s.add_parser('filter'); x.add_argument('mood', choices=list(MOODS)); x.add_argument('-k', type=float, default=1.0)
    x = s.add_parser('accent'); x.add_argument('path'); x.add_argument('hex')
    x = s.add_parser('match'); x.add_argument('base'); x.add_argument('layer'); x.add_argument('--json', action='store_true')
    s.add_parser('demo')
    a = ap.parse_args()
    if a.cmd == 'demo': return demo()
    if a.cmd == 'moods':
        for k, v in MOODS.items(): print(f'{k:10} S{v["sat"]:<5} C{v["con"]:<5} — {v["note"]}')
        return
    if a.cmd == 'filter': return print(vf(a.mood, a.k))
    if a.cmd == 'apply': return apply(a.mood, a.src, a.dst, a.k)
    if a.cmd == 'accent': return accent(a.path, a.hex)
    if a.cmd == 'compare': return compare(a.mine, a.ref)
    if a.cmd == 'match': sys.exit(match(a.base, a.layer, a.json))
    m = measure(a.path)
    print(json.dumps(m, ensure_ascii=False, indent=2) if a.json else '', end='')
    if not a.json: show(m)


if __name__ == '__main__':
    main()
