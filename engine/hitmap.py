#!/usr/bin/env python3
"""engine/hitmap.py — a track's hit map for a music-led reel: kicks, snares, hats, the break, and the start second.

  ~/ai-local/.venv-f5/bin/python engine/hitmap.py <track> [--dur 15.5] [--from auto|<sec>] [--break-at 0.2]
                                                   [--out assets/vo/hits.js] [--no-reel]

Track path: absolute or relative to ~/.claude/assets/bgm. Prints the table and writes window.HITS in REEL seconds:
  {from, bpm, beat, K:[…], S:[…], H:[…], brk:[start, end] | null, ret: the first kick after the break | null}
--from auto picks the start: a kick on frame 0, and — when the track has a break (a drop-out ≥ 0.8 s, ≥ 14 dB under
the median) — the break lands near --break-at × dur (default 20 %: the hook's turn). Then reel.json "music" is set
to this start with "music_fade_in": 0.005 when a reel.json is in the current folder.

Bands (percentile-normalised per track): kick = loud low (< 120 Hz), snare = loud mid (180–2500 Hz),
hat = the rest of the onsets on the beat grid. Measured once by hand on expert_hiphop_fast (12.10.2026); this
script reproduces that map — the hand pass cost ~6 tool calls and a guess at the break.
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
import librosa

BGM = Path.home() / ".claude" / "assets" / "bgm"
a = sys.argv[1:]
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
TRACK = Path(a[0]).expanduser(); TRACK = TRACK if TRACK.is_absolute() else BGM / a[0]
DUR, FROM, BRK_AT, OUT = float(opt('--dur', 15.5)), opt('--from', 'auto'), float(opt('--break-at', 0.2)), opt('--out', 'assets/vo/hits.js')

sr, hop = 22050, 128
y = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(TRACK), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                                 capture_output=True, check=True).stdout, dtype=np.float32)
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, units="time")
on = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="frames")
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)); fr = librosa.fft_frequencies(sr=sr, n_fft=2048)
band = lambda lo, hi: S[(fr >= lo) & (fr < hi)].sum(0)
low, mid, high = band(20, 120), band(180, 2500), band(5000, 11000)
rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop)[0]
t = librosa.frames_to_time(np.arange(len(env)), sr=sr, hop_length=hop)
n = lambda x: x / (np.percentile(x, 95) + 1e-9)
low, mid, high = n(low), n(mid), n(high)
db = 20 * np.log10(rms + 1e-9)

K, Sn, H = [], [], []
for i in on:
    j = min(len(t) - 1, i + 3)                     # the body of the hit, a few ms after its onset
    if db[j] < np.median(db) - 12: continue
    if low[j] > 1.3 and low[j] > mid[j]: K.append(float(t[i]))
    elif mid[j] > 1.0: Sn.append(float(t[i]))
    else: H.append(float(t[i]))
beat = float(np.median(np.diff(beats)))
def grid_hits():
    # no clear kick band (synth, orchestral): kick = the bar's downbeat, snare = its 3rd beat, hats = the rest;
    # the bar phase is the one whose beats carry the most onset strength
    bt = np.asarray(beats); st = np.interp(bt, t, env)
    ph = int(np.argmax([st[p::4].sum() for p in range(4)]))
    return ([float(x) for x in bt[ph::4]], [float(x) for x in bt[(ph + 2) % 4::4]],
            [float(x) for i, x in enumerate(bt) if (i - ph) % 2])
GRID = len(K) < len(y) / sr / (beat * 4) * 0.5
if GRID: K, Sn, H = grid_hits()

# breaks: runs ≥ 0.8 s at least 14 dB under the median level
quiet = db < np.median(db) - 14
brks, k = [], 0
while k < len(quiet):
    if quiet[k]:
        e = k
        while e < len(quiet) and quiet[e]: e += 1
        if t[min(e, len(t) - 1)] - t[k] >= 0.8: brks.append((float(t[k]), float(t[min(e, len(t) - 1)])))
        k = e
    else: k += 1

def window_from(f0):
    rel = lambda xs: [round(x - f0, 3) for x in xs if f0 - 0.01 <= x <= f0 + DUR + 0.01]
    b = next(((s - f0, e - f0) for s, e in brks if f0 < s < f0 + DUR), None)
    return rel(K), rel(Sn), rel(H), b

def search():
    best = None
    for k0 in K:
        f0 = k0 - 0.02
        if f0 < 0 or f0 + DUR > len(y) / sr: continue
        kk, ss, hh, b = window_from(f0)
        if len(kk) < DUR / (beat * 4) * 0.6: continue          # a window with the beat mostly missing
        score = abs(b[0] - BRK_AT * DUR) if b else 5.0
        if best is None or score < best[0]: best = (score, f0)
    return best
if FROM == 'auto':
    best = search()
    if best is None and not GRID:                               # kicks found but uneven: fall back to the grid
        GRID = True; K, Sn, H = grid_hits(); best = search()
    if best is None: sys.exit("hitmap: no window with a steady beat — pick --from by ear")
    f0 = best[1]
else:
    f0 = float(FROM)
kk, ss, hh, b = window_from(f0)
ret = next((x for x in kk if b and x >= b[1] - 0.15), None)
HITS = {"track": str(TRACK.relative_to(BGM)) if str(TRACK).startswith(str(BGM)) else str(TRACK), "from": round(f0, 3),
        "bpm": round(float(np.atleast_1d(tempo)[0]), 1), "beat": round(beat, 4), "K": kk, "S": ss, "H": hh,
        "brk": [round(b[0], 3), round(b[1], 3)] if b else None, "ret": ret, "dur": DUR, "grid": GRID}
Path(OUT).parent.mkdir(parents=True, exist_ok=True)
Path(OUT).write_text("window.HITS=" + json.dumps(HITS) + ";\n")
print(f"── {HITS['track']} · {HITS['bpm']} bpm · beat {beat:.4f} s · from {f0:.3f} s")
print(f"   K  {' '.join(f'{x:.3f}' for x in kk)}")
print(f"   S  {' '.join(f'{x:.3f}' for x in ss)}")
print(f"   H  {len(hh)} hats · break {HITS['brk']} · return kick {ret}" + (" · kicks from the beat grid (no clear kick band)" if GRID else ""))
rj = Path('reel.json')
if rj.exists() and '--no-reel' not in a:   # stem.py passes --no-reel: a take's baked-in music is not a reel.json track
    cfg = json.loads(rj.read_text())
    cfg["music"] = [{"file": HITS["track"], "from": HITS["from"], "at": 0}]; cfg["music_fade_in"] = 0.005
    cfg.pop("bgm", None); rj.write_text(json.dumps(cfg, ensure_ascii=False))
    print("   reel.json music ← this start")
print(f"→ {OUT}")
