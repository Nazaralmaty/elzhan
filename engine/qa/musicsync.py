#!/usr/bin/env python3
"""qa/musicsync.py — the picture is cut to the music the way it is cut to the voice. Measured on the master.

  python qa/musicsync.py                      from the reel folder: out/reel.mp4 + work/_music.wav (build.sh step 4)
  python qa/musicsync.py VIDEO [--audio WAV]  any file (a reference: its own mixed track is the music)
  needs librosa: ~/ai-local/.venv-f5/bin/python

Picture events: frame-difference spikes of the master against their ±5-frame neighbourhood (a cut, a one-frame
flash, a world change, a hard pop — not continuous motion); spike frames ≤ 2 frames apart (a flash in and out, a 2-frame
negative, two flashes in a row) are one event at its first frame. Music grid: the beats of the music stem plus its onsets of at
least median strength. Two numbers, both must pass:

  on grid   share of picture events within ±TOL of the grid. The bar is max(60 %, chance + 25 %): chance is the
            share of the timeline the ±TOL windows cover, so a fast track cannot pass a random cut.
  answered  share of the track's strongest hits (top 15 % onsets, at most one per 0.6 s, drops included) that
            have a picture event within ±TOL. A hit the picture ignores is the sync failure the ear notices first.
            Bar: 60 %. Needs the clean music stem: on a mixed track (a reference) voice syllables count as hits.

Why (Elzhan, 12.10.2026, after the @jordans.archivess review): «как мы сводим визуальный монтаж с аудио речью
спикера, так же мы и должны сводить это с музыкой, его ритмикой и битами» — sound and music rank first, equal to
the picture. Before this gate only canvas world changes were checked against beats (beat.py fit, ≥ half);
flashes, pops and every other genre were never measured.
"""
import subprocess, sys
from pathlib import Path
import numpy as np

TOL = 0.06          # 1.5 frames at 24–30 fps: a one-frame flash a frame off the hit still reads as on it
ON_GRID, ANSWERED = 0.60, 0.60


def picture_events(video):
    w, h = 72, 128
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                            "-of", "csv=p=0", video], capture_output=True, text=True).stdout.strip()
    n, d = probe.split("/"); fps = float(n) / float(d)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"scale={w}:{h},format=gray", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    fr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w).astype(np.float32)
    diff = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))            # diff[i]: change from frame i to i+1
    thr = max(10.0, 4 * np.median(diff))
    # a cut is a spike against its neighbourhood: continuous motion (a whip, a turning ring) has uniformly high
    # differences and is not a cut. A one-frame flash and a run of flashes are one event, timed at their first frame.
    peaks = []
    for i in range(len(diff)):
        ring = np.concatenate([diff[max(0, i - 5):max(0, i - 1)], diff[i + 2:i + 6]])
        if diff[i] >= thr and diff[i] >= 2 * (np.median(ring) if len(ring) else 0): peaks.append(i + 1)
    ev = []
    for p in peaks:
        if not ev or p - last > 2: ev.append(p)          # a 2-frame flash/negative is one event, not an in and an off-grid out
        last = p
    return [p / fps for p in ev], fps, len(fr) / fps


def music_grid(audio, dur):
    import librosa
    sr, hop = 22050, 256   # ffmpeg decodes: librosa/soundfile cannot open an mp4
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", audio, "-t", str(dur), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    y = np.frombuffer(raw, dtype=np.float32)
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    _, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, units="time")
    of = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="frames")
    ot = librosa.frames_to_time(of, sr=sr, hop_length=hop); st = env[of] if len(of) else np.array([])
    strong = ot[st >= np.median(st)] if len(st) else np.array([])
    grid = np.sort(np.concatenate([beats, strong]))
    hits = []                                                         # top 15 %, one per 0.6 s, loudest first
    for t, s in sorted(zip(ot, st), key=lambda x: -x[1])[:max(1, int(len(ot) * 0.15))]:
        if all(abs(t - u) > 0.6 for u in hits): hits.append(float(t))
    return grid, sorted(hits)


def near(t, arr):
    return len(arr) > 0 and np.min(np.abs(np.asarray(arr) - t)) <= TOL


def main():
    a = sys.argv[1:]
    video = a[0] if a and not a[0].startswith("--") else "out/reel.mp4"
    audio = a[a.index("--audio") + 1] if "--audio" in a else ("work/_music.wav" if video == "out/reel.mp4" else video)
    if not Path(video).exists(): print(f"НЕ ПРОВЕРЕНО: musicsync — нет {video}"); return 0
    if not Path(audio).exists(): print(f"НЕ ПРОВЕРЕНО: musicsync — нет {audio} (ролик без музыки?)"); return 0
    try: import librosa  # noqa: F401
    except ImportError: print("НЕ ПРОВЕРЕНО: musicsync — нет librosa, запускать ~/ai-local/.venv-f5/bin/python"); return 0
    pic, fps, dur = picture_events(video)
    grid, hits = music_grid(audio, dur)
    if not pic: print("musicsync: в картинке нет ни одной склейки — смотреть мастер"); return 1
    cover = np.zeros(int(dur * 1000) + 1, bool)
    for g in grid: cover[max(0, int((g - TOL) * 1000)):int((g + TOL) * 1000) + 1] = True
    chance = cover.mean()
    on = [t for t in pic if near(t, grid)]
    ans = [h for h in hits if near(h, pic)]
    bar = max(ON_GRID, min(0.9, chance + 0.25))
    r_on, r_ans = len(on) / len(pic), (len(ans) / len(hits) if hits else 1.0)
    print(f"── картинка: {len(pic)} событий · музыка: сетка {len(grid)} точек, сильных ударов {len(hits)} · допуск ±{TOL:.2f} с")
    for t in pic: print(f"   {t:6.2f}  {'в доле' if near(t, grid) else 'мимо музыки'}")
    for h in hits:
        if not near(h, pic): print(f"   удар {h:6.2f} без ответа в картинке")
    print(f"── в сетке: {r_on:.0%} (порог {bar:.0%}, случайно {chance:.0%}) · ответ на сильные удары: {r_ans:.0%} (порог {ANSWERED:.0%})")
    return 0 if r_on >= bar and r_ans >= ANSWERED else 1


if __name__ == "__main__":
    sys.exit(main())
