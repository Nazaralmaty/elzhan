#!/usr/bin/env python3
"""engine/music_js.py — from the reel folder, after build.sh wrote work/_music.wav: assets/vo/music.js =
window.MGRID (beats + onsets) and window.MHITS (strongest hits), the same numbers qa/musicsync.py judges the master by.
A spec cuts on MGRID and answers MHITS (triplex `kicks: true`, `shotAt`). Rebuild after any change of reel.json "music",
then render + build again.   ~/ai-local/.venv-f5/bin/python engine/music_js.py"""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.realpath(__file__)), 'qa'))
import musicsync as M
import soundfile as sf
grid, hits = M.music_grid('work/_music.wav', sf.info('work/_music.wav').duration)
r = lambda a: [round(float(x), 3) for x in a]
open('assets/vo/music.js', 'w').write(f'window.MGRID={json.dumps(r(grid))};window.MHITS={json.dumps(r(hits))};\n')
print(f'music.js: {len(grid)} grid points, {len(hits)} strong hits')
