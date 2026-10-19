#!/usr/bin/env python3
"""tint.py — put flat PNG illustrations onto the brand's hue band.

Library art arrives in whatever hue the generator felt like: the fragrancia set measured
hue 234–260° (blue/violet) against a brand of green 159° and gold 42° — a third hue nobody
chose, and the reason a frame reads as pasted-in clipart (grade.py measure shows it).

This maps the WHOLE wheel into one narrow band, keeping value and alpha: light stays light,
dark stays dark, the drawing survives, and objects keep a few degrees of separation because
their original hues were different. Greys and whites (S=0) are left alone.

  python3 tint.py 26 52 assets/img/*.png --out assets/img --backup work/img_orig
  python3 tint.py 26 52 one.png --sat 0.9 --smax 0.75

  lo hi   band in degrees (26→52 = brass→gold; 150→175 = the green side)
  --sat   saturation multiplier (default 0.9)
  --smax  saturation ceiling 0..1 (default 0.75) — flat art above this screams
  --vhi   value ceiling 0..1 (default 0.85): warm art whose whites stay at 1.0
          disappears on a paper ground; the ceiling keeps it readable on both worlds
"""
import argparse, pathlib, shutil, sys
from PIL import Image


def lut(lo, hi, sat, smax, vlo, vhi):
    h = [round(((lo + (i / 256) * (hi - lo)) % 360) * 255 / 360) for i in range(256)]
    s = [min(round(i * sat), round(smax * 255)) for i in range(256)]
    v = [round((vlo + (i / 255) * (vhi - vlo)) * 255) for i in range(256)]
    return h, s, v


def tint(path, out, lo, hi, sat, smax, backup=None, vlo=0.0, vhi=1.0):
    p = pathlib.Path(path)
    if backup:
        b = pathlib.Path(backup); b.mkdir(parents=True, exist_ok=True)
        if not (b / p.name).exists():
            shutil.copy2(p, b / p.name)
    im = Image.open(p).convert('RGBA')
    alpha = im.getchannel('A')
    H, S, V = im.convert('RGB').convert('HSV').split()
    lh, ls, lv = lut(lo, hi, sat, smax, vlo, vhi)
    res = Image.merge('HSV', (H.point(lh), S.point(ls), V.point(lv))).convert('RGB')
    res.putalpha(alpha)
    dst = pathlib.Path(out) / p.name if out else p
    dst.parent.mkdir(parents=True, exist_ok=True)
    res.save(dst)
    return dst


def main():
    a = argparse.ArgumentParser()
    a.add_argument('lo', type=float); a.add_argument('hi', type=float)
    a.add_argument('files', nargs='+')
    a.add_argument('--out', default=''); a.add_argument('--backup', default='')
    a.add_argument('--sat', type=float, default=0.9); a.add_argument('--smax', type=float, default=0.75)
    a.add_argument('--vlo', type=float, default=0.08); a.add_argument('--vhi', type=float, default=0.85)
    n = a.parse_args()
    for f in n.files:
        print(' ', tint(f, n.out, n.lo, n.hi, n.sat, n.smax, n.backup, n.vlo, n.vhi))


if __name__ == '__main__':
    main()
