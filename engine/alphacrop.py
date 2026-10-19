#!/usr/bin/env python3
"""engine/alphacrop.py PNG… — drop the green fringe haze (alpha < 40), eat a 1 px halo, crop to the subject + 4 px.
A crop that keeps the full canvas size means the background was not keyed: re-roll that seed."""
import sys
from PIL import Image, ImageFilter
for p in sys.argv[1:]:
    im = Image.open(p).convert('RGBA'); a = im.split()[3]
    a = a.point(lambda v: 0 if v < 40 else v)            # drop the green fringe haze
    a = a.filter(ImageFilter.MinFilter(3))                 # eat a 1 px halo
    im.putalpha(a); bb = a.getbbox()
    if bb: im = im.crop((max(0,bb[0]-4), max(0,bb[1]-4), min(im.width,bb[2]+4), min(im.height,bb[3]+4)))
    im.save(p); print(p, im.size)
