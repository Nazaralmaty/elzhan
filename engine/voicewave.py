#!/usr/local/bin/python3
"""engine/voicewave.py — the reel's own voice as an amplitude envelope for genre/code.js `wave`.
   Run from the reel folder after tts.sh (and after any re-voice):  python3 engine/voicewave.py [hz]
   Lays assets/vo/vo_NN.wav on the timeline from assets/vo/vo.js exactly like build.sh does,
   takes RMS per 1/hz s window, normalises to the 98th percentile, compresses with sqrt,
   writes assets/vo/wave.js:  window.WAVE = {hz, a:[0..1, ...]}   (index = round(t * hz))."""
import json, re, subprocess, sys, pathlib
import numpy as np

HZ = int(sys.argv[1]) if len(sys.argv) > 1 else 20
SR = 16000
VO = json.loads(re.search(r'window\.VO=(\[.*?\]);', pathlib.Path('assets/vo/vo.js').read_text(), re.S).group(1))
total = sum(d + g for d, g in VO) + 1.5
buf = np.zeros(int(total * SR), dtype=np.float32); t = 0.0
for i, (d, g) in enumerate(VO):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f'assets/vo/vo_{i+1:02d}.wav', '-ar', str(SR), '-ac', '1', '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    k = int(t * SR); buf[k:k + len(a)] += a[:len(buf) - k]; t += d + g
win = SR // HZ
n = len(buf) // win
rms = np.sqrt((buf[:n * win].reshape(n, win) ** 2).mean(axis=1))
ref = np.percentile(rms[rms > 1e-4], 98) if (rms > 1e-4).any() else 1.0
env = np.sqrt(np.clip(rms / ref, 0, 1))
pathlib.Path('assets/vo/wave.js').write_text('window.WAVE=' + json.dumps({'hz': HZ, 'a': [round(float(x), 3) for x in env]}) + ';\n')
print(f'wave: {n} samples at {HZ} Hz ({n / HZ:.1f} s) → assets/vo/wave.js')
