#!/usr/bin/env python3
"""qa/paint.py — frames shot before Chrome finished painting them. Run from the reel folder.

Why (atlas/reel_049, 07.10.2026): under load render.js took 30 screenshots before the lower tiles of the
take were rasterised — the bottom half of the frame went black for one frame, ~every 6th frame from 30 s
to the end. Every gate was green; Elzhan saw it as «мигает чёрный экран».

A broken frame: its BOTTOM half is darker than both neighbours by > 4 luma while its TOP half stays put
(< 2). Seams (band, iris, flash) move both halves or last several frames, so they do not match.
Fix: re-shoot the listed frames — node engine/render.js --only a-b --out renders/frames --workers 3 — then build.sh.

Usage: qa/paint.py [video]   (default out/reel.mp4); exit 1 when broken frames are found.
"""
import re, subprocess, sys


def halves(video):
    out = {}
    for name, crop in (('top', 'crop=iw:ih/2:0:0'), ('bot', 'crop=iw:ih/2:0:ih/2')):
        log = subprocess.run(['ffmpeg', '-nostdin', '-i', video, '-vf',
                              f'{crop},scale=270:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
                              '-f', 'null', '-'], capture_output=True, text=True).stdout
        out[name] = [float(x) for x in re.findall(r'YAVG=([\d.]+)', log)]
    return out['top'], out['bot']


def broken(top, bot):
    return [i for i in range(1, min(len(top), len(bot)) - 1)
            if bot[i] < bot[i - 1] - 4 and bot[i] < bot[i + 1] - 4
            and abs(top[i] - top[i - 1]) < 2 and abs(top[i] - top[i + 1]) < 2]


if __name__ == '__main__':
    assert broken([50] * 5, [80, 80, 60, 80, 80]) == [2]          # half-painted frame
    assert broken([50, 50, 30, 50, 50], [80, 80, 60, 80, 80]) == []  # whole-frame dip = a seam
    video = sys.argv[1] if len(sys.argv) > 1 else 'out/reel.mp4'
    bad = broken(*halves(video))
    if bad:
        print(f'НЕДОРИСОВАННЫЕ КАДРЫ: {len(bad)} — {bad}')
        print(f'перерендер: node engine/render.js --only {bad[0]}-{bad[-1]} --out renders/frames --workers 3 && engine/build.sh')
        sys.exit(1)
    print('paint: ок')
