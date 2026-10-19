#!/usr/bin/env python3
"""engine/beat.py — the reel's music grid: where the beats are and which world changes land on them.

grid and fit need ~/ai-local/.venv-f5/bin/python (librosa); mix and repeat run on any python with numpy.

  reel.json "music": [{"file": "05_cinematic/x.mp3", "from": "auto"},          ← the problem
                      {"file": "/abs/y.mp3", "from": 16.60, "at": 26.165, "db": 2}]   ← the turn, its drop on the snap
  "from" — the second of the track the segment starts at; "at"/"to" — reel seconds (to = next at);
  "db" — level against the others after levelling; "out" — fade before the hand-over (0.6 s).
  The old "bgm" + "bgm_offset" is the one-segment form and still works.

Commands:

  beat.py grid <track>      bpm, beat period, the first beats and the drops (largest jumps in level) —
                            what you need to pick a track and the second it starts from
  beat.py mix <dur> <wav>   the music stem build.sh lays under the voice
  beat.py check [--grid]    the qa gate (qa/all.sh): repeat, and with --grid the fit report without writing
  beat.py repeat            exit 1 if a track of this reel sits in one of the four reels next to it
  beat.py fit               from the reel folder: reads reel.json "music" and work/cues.json,
                            fills every "from": "auto" with the second of the track whose beats catch
                            the most world changes, writes it back into reel.json, prints every world
                            change with its distance to the nearest beat. Exit 1 if fewer than half
                            the world changes sit on a beat (±0.07 s).

                            Also writes assets/vo/beats.js (window.BEATS, reel seconds): with it canvas.js moves every cut
                            and every dive start onto the nearest beat (≤ 0.3 s, never past the line's first word).
                            So: render.js --cues → beat.py fit → render.js --cues → beat.py fit (the report) → full render.

A world change is a cut between rooms or a dive into a new plane. Word pops, tears and stickers are not judged —
they land on their words, the music does not move them.
Why (Elzhan, 01.10.2026): «ты на абсолютно каждый рилс ставишь одну и ту же музыку … делай рилсы под
такт музыки» — ten I-CON reels in a row carried cine_dark_shadows laid from second 0, the beat never
looked at.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np

BGM = Path.home() / ".claude" / "assets" / "bgm"
WORLD = {"dive", "torn", "push", "iris", "band", "flash", "hard", "zoom", "slice"}   # the cues canvas.js puts on a beat
TOL = 0.07


def path(f):
    p = Path(f).expanduser()
    return p if p.is_absolute() else BGM / f


def grid(f):
    import librosa
    y, sr = librosa.load(str(path(f)), sr=22050, mono=True)
    hop = 256
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, units="time")
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    db = 20 * np.log10(rms + 1e-9)
    tr = librosa.times_like(rms, sr=sr, hop_length=hop)
    w = int(0.5 * sr / hop)   # level jump: mean of the next 0.5 s over the previous 1 s
    jumps = [(float(tr[i]), float(db[i:i + w].mean() - db[i - 2 * w:i].mean())) for i in range(2 * w, len(db) - w)]
    drops = []
    for t, j in sorted(jumps, key=lambda x: -x[1]):
        if j < 6 or t < 1.5: continue                      # the fade-in from silence is not a drop
        if all(abs(t - d) > 4 for d, _ in drops): drops.append((t, j))
        if len(drops) == 4: break
    on = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="time")
    drops = [(min(on, key=lambda o: abs(o - t)) if len(on) else t, j) for t, j in drops]   # snap to the hit itself
    return {"bpm": round(float(np.atleast_1d(tempo)[0]), 1), "period": round(float(np.median(np.diff(beats))), 4),
            "beats": [round(float(b), 3) for b in beats], "dur": round(len(y) / sr, 2),
            "drops": [{"t": round(float(t), 3), "db": round(j, 1)} for t, j in sorted(drops)]}


def link_beats(page='index.html'):
    """beats.js only works if the page loads it: 10 of 26 reels with a fitted grid never did (12.10.2026)."""
    from pathlib import Path as _P
    p = _P(page)
    if not p.exists(): return
    h = p.read_text(encoding='utf-8')
    if 'assets/vo/beats.js' in h: return
    tag = '<script src="assets/vo/beats.js"></script>\n'
    h = re.sub(r'(<script type="module")', tag + r'\1', h, count=1) if '<script type="module"' in h else h.replace('</head>', tag + '</head>', 1)
    p.write_text(h, encoding='utf-8'); print('   index.html ← assets/vo/beats.js')


def segments(cfg, dur):
    """reel.json "music": [{file, from, at, to}] — `bgm`/`bgm_offset` is the one-segment form."""
    m = [dict(s) for s in cfg.get("music") or ([{"file": cfg["bgm"], "from": cfg.get("bgm_offset", 0)}] if cfg.get("bgm") else [])]
    for i, s in enumerate(m):
        s.setdefault("at", 0)
        s.setdefault("to", m[i + 1]["at"] if i + 1 < len(m) else dur)
    return m


def fit(write=True):
    cfg = json.loads(Path("reel.json").read_text())
    cues = json.loads(Path("work/cues.json").read_text())
    world = sorted({round(c["t"], 2) for c in cues["cues"] if c["k"] in WORLD})
    segs = segments(cfg, cues["DUR"])
    if not segs: sys.exit("beat.py: no music in reel.json")
    on, total, rows, grid_all = 0, 0, [], []
    for k, s in enumerate(segs):
        g = grid(s["file"])
        B = np.array(g["beats"])
        ev = [t for t in world if s["at"] <= t < s["to"]]
        if s["from"] == "auto":   # every start second whose window fits the track; score = world changes on a beat
            best = None
            for f0 in np.arange(0, max(0.01, g["dur"] - (s["to"] - s["at"])), 0.01):
                b = B - f0 + s["at"]
                hit = sum(np.min(np.abs(b - t)) <= TOL for t in ev)
                near = -sum(np.min(np.abs(b - t)) for t in ev)
                if best is None or (hit, near) > best[:2]: best = (hit, near, round(float(f0), 2))
            s["from"] = best[2]
            if cfg.get("music"): cfg["music"][k]["from"] = best[2]
            else: cfg["bgm_offset"] = best[2]
            print(f"   {s['file']}: from = {s['from']} s")
        b = B - s["from"] + s["at"]
        grid_all += [round(float(x), 3) for x in b if s["at"] <= x < s["to"]]
        for t in ev:
            d = float(b[np.argmin(np.abs(b - t))] - t)
            rows.append((t, d, s["file"].split("/")[-1]))
            on += abs(d) <= TOL; total += 1
        print(f"── {s['file']} · {g['bpm']} bpm · track {s['from']}…{round(s['from'] + s['to'] - s['at'], 2)} s → reel {s['at']}…{round(s['to'], 2)} s")
    if not write:
        if any(x["from"] == "auto" for x in cfg.get("music", [])): sys.exit("beat.py: \"from\": \"auto\" not fitted — run beat.py fit")
    else:
        Path("reel.json").write_text(json.dumps(cfg, ensure_ascii=False))
        Path("assets/vo").mkdir(parents=True, exist_ok=True)
        Path("assets/vo/beats.js").write_text(f"window.BEATS={json.dumps(grid_all)};\n")
        link_beats()
    for t, d, f in rows:
        print(f"   {t:6.2f}  {'на доле' if abs(d) <= TOL else f'доля {d:+.2f} с'}")
    print(f"── смены миров на доле: {on}/{total}")
    return 0 if total == 0 or on * 2 >= total else 1


def mix(dur, out):
    """Lay the segments on the reel timeline → one music stem. Each segment is levelled to the same RMS
    (tracks differ by 10+ dB: a drop would otherwise jump out of the mix) plus its own "db". A segment
    that hands over fades out over "out" s before its "to" (the breath before the drop); the next one
    comes in hard — 15 ms, on its hit. The first one fades in 0.5 s, the last one out 1.2 s at the end."""
    import subprocess, wave
    SR = 48000
    cfg = json.loads(Path("reel.json").read_text())
    segs = segments(cfg, dur)
    buf = np.zeros((int(dur * SR), 2), dtype=np.float32)
    level = bool(cfg.get("music"))   # the old one-track "bgm" keeps its own level: bgm_vol of old reels was set by ear on it
    for i, s in enumerate(segs):
        n = int((s["to"] - s["at"]) * SR)
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(s["from"]), "-i", str(path(s["file"])), "-t", str(n / SR + 0.1),
                              "-ar", str(SR), "-ac", "2", "-f", "s16le", "-"], capture_output=True, check=True).stdout
        a = np.frombuffer(raw, dtype=np.int16).astype(np.float32).reshape(-1, 2)[:n] / 32768
        if level: a *= 0.025 / (np.sqrt(np.mean(a ** 2)) + 1e-9) * 10 ** (s.get("db", 0) / 20)   # −32 dB RMS: room for "db" without clipping, bgm_vol ≈ 2 brings it up
        fi = int((cfg.get("music_fade_in", 0.5) if i == 0 else 0.015) * SR)   # reel.json "music_fade_in": a reel that opens on the track's hit sets ~0.005, a 0.5 s fade eats the first kick
        fo = int((cfg.get("end_fade", 1.2) if i == len(segs) - 1 else s.get("out", 0.6)) * SR)   # reel.json "end_fade": the last segment's fade-out, s (default 1.2)
        a[:fi] *= np.linspace(0, 1, fi)[:len(a[:fi]), None]
        a[len(a) - fo:] *= np.linspace(1, 0, fo)[-len(a[len(a) - fo:]):, None]
        k = int(s["at"] * SR); buf[k:k + len(a)] += a[:len(buf) - k]
    w = wave.open(out, "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    if np.abs(buf).max() > 0.999: sys.exit(f"beat.py mix: the stem clips (peak {np.abs(buf).max():.2f}) — lower a segment's db")
    w.writeframes((buf * 32767).astype(np.int16).tobytes()); w.close()
    print("   music: " + " → ".join(f"{Path(s['file']).name} {s['from']}s @ {s['at']}s" for s in segs))


def repeat():
    """The same track in this reel and in one of the four reels next to it (by reel.json time) is a defect:
    ten I-CON reels in a row went out on cine_dark_shadows."""
    me = Path("reel.json").resolve()
    files = lambda p: {Path(s["file"]).name for s in segments(json.loads(p.read_text()), 1)}
    # A client's approved set (a folder with approved.txt next to the tracks) is meant to repeat: Elzhan gave I-CON
    # three tracks and said «возьми их в правила и используй чаще» (08.10.2026). Such tracks are not a clash;
    # the fragment (`from`) is what should differ from the neighbour reel.
    ok = {Path(s["file"]).name for s in segments(json.loads(me.read_text()), 1)
          if (path(s["file"]).parent / "approved.txt").exists()}
    for f in sorted(ok): print(f"   {f} — утверждённая подборка клиента, повтор разрешён")
    mine = files(me) - ok
    near = sorted((p for p in me.parent.parent.glob("*/reel.json") if p.resolve() != me), key=lambda p: -p.stat().st_mtime)[:4]
    clash = [(p.parent.name, f) for p in near for f in files(p) & mine]
    for r, f in clash: print(f"   {f} уже стоит в {r}")
    return 1 if clash else 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "mix":
        mix(float(sys.argv[2]), sys.argv[3])
    elif len(sys.argv) > 1 and sys.argv[1] == "repeat":
        sys.exit(repeat())
    elif len(sys.argv) > 2 and sys.argv[1] == "grid":
        g = grid(sys.argv[2])
        print(json.dumps({k: v for k, v in g.items() if k != "beats"} | {"first_beats": g["beats"][:8]}, ensure_ascii=False))
    elif len(sys.argv) > 1 and sys.argv[1] == "fit":
        sys.exit(fit())
    elif len(sys.argv) > 1 and sys.argv[1] == "check":   # the qa gate: no repeat; on a canvas genre (--grid) also fitted and on the beat
        r = repeat()
        if "--grid" in sys.argv:
            if not Path("assets/vo/beats.js").exists(): print("   нет assets/vo/beats.js — смены миров не стоят на долях: beat.py fit, потом рендер"); r = 1
            else: r = fit(write=False) or r
        sys.exit(r)
    else:
        sys.exit(__doc__)
