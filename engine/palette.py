#!/usr/bin/env python3
"""palette.py — local stand-in for color.adobe.com/create/color-wheel.

Adobe's wheel is RYB (the painter's wheel), not HSV: the complement of orange
#FF6600 there is teal #00F1FF, not the #0099FF a plain hue+180 gives. The
RYB→RGB table below was read off the live tool (see demo()).

stdlib only; images / video frames are read through ffmpeg.

  python3 palette.py wheel "#FF6600" --rule triad
  python3 palette.py wheel "#FF6600" --rule analogous --json
  python3 palette.py from-image frame.png -n 5          # .mp4 works too (first frame)
  python3 palette.py contrast "#FF6600" "#101010"
  python3 palette.py html out.html "#FF6600" "#00F1FF"
  python3 palette.py demo
"""
import colorsys, json, subprocess, sys, random, argparse

# T[i] = RGB hue for RYB angle 15*i. Standard painter's table, checked against
# Adobe Color (≤4° off, in the greens).
T = [0, 8, 17, 26, 34, 41, 48, 54, 60, 81, 103, 123, 138,
     155, 171, 187, 204, 219, 234, 250, 267, 282, 300, 317, 360]


def ryb2rgb(a):
    a %= 360.0
    i = int(a // 15)
    f = (a - 15 * i) / 15.0
    return T[i] + (T[i + 1] - T[i]) * f


def rgb2ryb(h):
    h %= 360.0
    for i in range(24):
        if T[i] <= h <= T[i + 1]:
            span = T[i + 1] - T[i]
            f = 0.0 if span == 0 else (h - T[i]) / span
            return 15 * (i + f)
    return h


def hex2hsv(s):
    s = s.strip().lstrip('#')
    r, g, b = (int(s[i:i + 2], 16) / 255 for i in (0, 2, 4))
    h, sat, v = colorsys.rgb_to_hsv(r, g, b)
    return h * 360, sat, v


def hsv2hex(h, s, v):
    r, g, b = colorsys.hsv_to_rgb((h % 360) / 360, max(0, min(1, s)), max(0, min(1, v)))
    return '#%02X%02X%02X' % tuple(round(c * 255) for c in (r, g, b))


STEP = 18                                 # Adobe's "neighbour" step: analogous and split keep it
MONO = [1.0, 0.8, 0.6, 0.4, 0.2]          # S and V together
SHADE = [1.0, 0.86, 0.702, 0.541, 0.38]   # V only
OFFSETS = {
    'analogous':           [0, -STEP, STEP, -2 * STEP, 2 * STEP],
    'complementary':       [0, 180],
    'split-complementary': [0, 180 - STEP, 180 + STEP],
    'triad':               [0, 120, 240],
    'square':              [0, 90, 180, 270],
    'compound':            [0, -30, 180, 210],
}
RULES = list(OFFSETS) + ['monochromatic', 'shades']


def harmony(base, rule='analogous', n=5):
    """5 colours by an Adobe Color rule; the tail is filled with muted variants of the same hues, as the tool does."""
    h, s, v = hex2hsv(base)
    if rule == 'monochromatic':
        return [hsv2hex(h, s * k, v * k) for k in MONO[:n]]
    if rule == 'shades':
        return [hsv2hex(h, s, v * k) for k in SHADE[:n]]
    if rule not in OFFSETS:
        raise SystemExit(f'unknown rule {rule!r}; rules: {", ".join(RULES)}')
    a = rgb2ryb(h)
    hues = [ryb2rgb(a + d) for d in OFFSETS[rule]]
    out = [hsv2hex(x, s, v) for x in hues]
    for k in (0.75, 0.5):
        for x in hues:
            if len(out) >= n:
                return out
            out.append(hsv2hex(x, s * k, v * k))
    return out[:n]


def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hexs):
    s = hexs.strip().lstrip('#')
    r, g, b = (int(s[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def verdict(ratio):
    if ratio >= 7: return 'AAA — fine for small text and subtitles'
    if ratio >= 4.5: return 'AA — body text reads'
    if ratio >= 3: return 'large text (>32px) and plates only'
    return 'UNREADABLE — no text here'


def pixels(path, side=80):
    """RGB pixels of an image or of a video's first frame, via ffmpeg."""
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-frames:v', '1',
           '-vf', f'scale={side}:{side}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    if not raw:
        raise SystemExit(f'ffmpeg could not read {path}')
    return [tuple(raw[i:i + 3]) for i in range(0, len(raw) - 2, 3)]


def kmeans(pts, k=5, iters=24, seed=7):
    random.seed(seed)
    cent = random.sample(pts, k)
    for _ in range(iters):
        buckets = [[] for _ in range(k)]
        for p in pts:
            i = min(range(k), key=lambda j: sum((p[c] - cent[j][c]) ** 2 for c in range(3)))
            buckets[i].append(p)
        new = [tuple(sum(p[c] for p in b) / len(b) for c in range(3)) if b else cent[i] for i, b in enumerate(buckets)]
        if new == cent:
            break
        cent = new
    order = sorted(zip(cent, (len(b) for b in buckets)), key=lambda t: -t[1])
    return ['#%02X%02X%02X' % tuple(round(c) for c in cn) for cn, _ in order]


def swatch_html(colors, title='palette'):
    rows = ''.join(
        f'<div class=s style="background:{c}"><span style="color:'
        f'{"#000" if luminance(c) > 0.35 else "#fff"}">{c}</span></div>' for c in colors)
    pairs = ''.join(
        f'<tr><td>{a}</td><td>{b}</td><td>{contrast(a, b):.2f}</td><td>{verdict(contrast(a, b))}</td></tr>'
        for i, a in enumerate(colors) for b in colors[i + 1:])
    return f"""<!doctype html><meta charset=utf-8><title>{title}</title>
<style>body{{font:14px/1.5 -apple-system,sans-serif;margin:0;background:#111;color:#eee}}
.w{{display:flex;height:60vh}}.s{{flex:1;display:flex;align-items:flex-end;justify-content:center;padding:16px}}
.s span{{font:600 13px ui-monospace,monospace}}table{{border-collapse:collapse;margin:20px}}
td{{padding:4px 10px;border-bottom:1px solid #333}}</style>
<div class=w>{rows}</div><table>{pairs}</table>"""


def show(colors):
    for c in colors:
        h, s, v = hex2hsv(c)
        print(f'{c}   H {h:6.1f}°  RYB {rgb2ryb(h):6.1f}°  S {s:.2f}  V {v:.2f}')


def demo():
    """Values read off color.adobe.com with base #FF6600 (2026-09-01)."""
    def hue(x): return hex2hsv(x)[0]

    def close(got, want, tol=6, what=''):
        d = abs((got - want + 180) % 360 - 180)
        assert d <= tol, f'{what}: got {got:.1f}°, Adobe gives {want:.1f}° (Δ{d:.1f})'

    base = '#FF6600'
    close(hue(harmony(base, 'complementary')[1]), hue('#00F1FF'), what='complementary')
    tri = harmony(base, 'triad')
    close(hue(tri[1]), hue('#17FF00'), what='triad+120')
    close(hue(tri[2]), hue('#1C00FF'), what='triad+240')
    for got, want in zip(harmony(base, 'square')[1:4], ['#C9FF00', '#00F1FF', '#A800FF']):
        close(hue(got), hue(want), what='square')
    for got, want in zip(harmony(base, 'analogous')[1:], ['#FF3900', '#FF9300', '#FF0D00', '#FFB200']):
        close(hue(got), hue(want), what='analogous')
    for got, want in zip(harmony(base, 'split-complementary')[1:3], ['#00FFB8', '#00A0FF']):
        close(hue(got), hue(want), what='split')
    assert harmony(base, 'monochromatic') == ['#FF6600', '#CC6A29', '#99623D', '#664E3D', '#332D29']
    sh = harmony(base, 'shades')
    assert all(abs(hue(c) - 24) < 1 and abs(hex2hsv(c)[1] - 1) < 0.02 for c in sh)
    assert [round(hex2hsv(c)[2], 2) for c in sh] == [1.0, 0.86, 0.7, 0.54, 0.38]
    assert abs(contrast('#FFFFFF', '#000000') - 21) < 0.01
    assert 4.5 < contrast('#FF6600', '#101010') < 8
    print('ok — matches Adobe Color')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    w = sub.add_parser('wheel'); w.add_argument('base'); w.add_argument('--rule', default='analogous', choices=RULES)
    w.add_argument('-n', type=int, default=5); w.add_argument('--json', action='store_true')
    i = sub.add_parser('from-image'); i.add_argument('path'); i.add_argument('-n', type=int, default=5)
    i.add_argument('--json', action='store_true')
    c = sub.add_parser('contrast'); c.add_argument('a'); c.add_argument('b')
    h = sub.add_parser('html'); h.add_argument('out'); h.add_argument('colors', nargs='+')
    sub.add_parser('demo')
    a = p.parse_args()
    if a.cmd == 'demo':
        return demo()
    if a.cmd == 'wheel':
        cols = harmony(a.base, a.rule, a.n)
    elif a.cmd == 'from-image':
        cols = kmeans(pixels(a.path), a.n)
    elif a.cmd == 'contrast':
        r = contrast(a.a, a.b)
        return print(f'{a.a} on {a.b}: {r:.2f}:1 — {verdict(r)}')
    else:
        open(a.out, 'w').write(swatch_html(a.colors))
        return print(a.out)
    print(json.dumps(cols) if getattr(a, 'json', False) else '', end='')
    if not getattr(a, 'json', False):
        show(cols)


if __name__ == '__main__':
    main()
