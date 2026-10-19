#!/usr/bin/env python3
"""engine/musicfit.py — which track and which second of it to start from, judged by qa/musicsync.py's OWN functions on the
master's picture: for genres whose events beat.py fit cannot see (archive pieces, punches, prints). Coarse pass on the whole
track's grid, then every candidate re-measured on its cut segment exactly as the gate does (grid and strong hits depend on
the segment). Golovkin 12.10.2026: the coarse pass alone promised 76 % and the gate measured 59 %.
  ~/ai-local/.venv-f5/bin/python ~/.claude/engine/musicfit.py ~/.claude/engine/qa out/reel.mp4 <dur> <track.mp3>…
Prints the best (margin, on-grid share, hits answered, track, second); write it into reel.json "music" and rebuild."""
import sys, subprocess, tempfile, os, numpy as np
sys.path.insert(0, sys.argv[1]); import musicsync as M
video, dur, tracks = sys.argv[2], float(sys.argv[3]), sys.argv[4:]
pic = M.picture_events(video)[0]
tmp = tempfile.mkdtemp()
res = []
for tr in tracks:
    tl = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',tr],capture_output=True,text=True).stdout)
    g, h = M.music_grid(tr, tl); g, h = np.asarray(g), np.asarray(h)
    cand = []
    for off in np.arange(0, tl - dur, 0.02):
        gg = g - off; on = np.mean([np.min(np.abs(gg - t)) <= M.TOL for t in pic]); cand.append((on, off))
    cand.sort(reverse=True); picked = []
    for on, off in cand:
        if all(abs(off - p) > 0.3 for p in picked): picked.append(off)
        if len(picked) >= 25: break
    for off in picked:
        seg = os.path.join(tmp, 'seg.wav')
        subprocess.run(['ffmpeg','-v','error','-y','-ss',f'{off:.2f}','-t',f'{dur:.2f}','-i',tr,'-ac','1','-ar','22050',seg],check=True)
        gs, hs = M.music_grid(seg, dur)
        on = np.mean([M.near(t, gs) for t in pic]); ans = np.mean([M.near(x, pic) for x in hs]) if len(hs) else 0
        res.append((round(min(on - .70, ans - .62), 3), round(on, 2), round(ans, 2), os.path.basename(tr), round(off, 2)))
res.sort(reverse=True)
for r in res[:6]: print(r)
