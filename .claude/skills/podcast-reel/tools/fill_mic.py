#!/usr/local/bin/python3
"""Заполняет дыру от микрофона в матте: Vision считает микрофон фоном, и в груди
спикера остаётся сквозной вырез. Дыра — это всегда разрыв между торсом и правым
плечом в строках 900…1300, в полосе x 420…850. Заполняем именно его, остальную
альфу не трогаем."""
import sys, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage
from multiprocessing import Pool

Y0, Y1, X0, X1 = 900, 1310, 415, 860

def one(p):
    im = Image.open(p).convert('RGBA')
    a = np.array(im)
    al = a[..., 3]
    m = al > 100
    add = np.zeros_like(m)
    for y in range(Y0, Y1):
        xs = np.flatnonzero(m[y])
        if xs.size < 2: continue
        d = np.diff(xs)
        if d.max() <= 1: continue                       # цельная строка — дыры нет
        lo, hi = xs[0], xs[-1]
        if hi - lo < 300: continue
        seg = np.zeros(m.shape[1], bool); seg[lo:hi + 1] = True
        gap = seg & ~m[y]
        gap[:X0] = False; gap[X1:] = False
        add[y] = gap
    if not add.any(): return 0
    add = ndimage.binary_closing(add, np.ones((5, 5)))
    soft = ndimage.gaussian_filter(add.astype(np.float32), 1.6)
    al = np.maximum(al, (np.clip(soft, 0, 1) * 255).astype(np.uint8))
    a[..., 3] = al
    Image.fromarray(a).save(p)
    return int(add.sum())

if __name__ == '__main__':
    files = sorted(glob.glob('work/mt/f_*.png'))
    with Pool(8) as pool: r = pool.map(one, files)
    print(f'{len(files)} frames, filled in {sum(1 for x in r if x)} of them, mean {int(np.mean(r))} px')
