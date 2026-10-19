#!/usr/local/bin/python3
"""engine/stem.py — a take with the client's music baked in → voice and music apart, the pause map as ready keeps, the
music's hit map. One command instead of the hand-run demucs + pause measurement of /kinetic-speaker §2 and /podcast-reel.
Run from the reel folder.

  python3 engine/stem.py <src.mp4|wav> [--keeps] [--hits] [--src src_1] [--limit 0.45] [--db -40]

Always: work/sep/vocals.wav + work/sep/no_vocals.wav (demucs two-stem on MPS, ~4 s per 50 s of audio).
--keeps  pause map of the VOCALS (the silence map cannot hear speech under music): −40 dB, 20 ms windows; every pause
         longer than --limit (0.45 s, the speech law at the gate) splits the take — printed as `--keep src_1:A:B …` for
         `engine/cut.py build`, each keep padded 0.10 s into its silence (the ≥ 0.10 s rule) and never into a word.
--hits   work/_music.wav = the music without the voice on the take's own timeline, then engine/hitmap.py --from 0 →
         assets/vo/hits.js (kicks / snares / hats) and assets/vo/beats.js (window.BEATS: canvas.js — canvas, canvas-pro,
         speaker-canvas, podcast — moves its cuts onto the nearest beat itself). qa/musicsync.py reads work/_music.wav.
         Run --hits on work/cut.mp4 (the cut timeline; it also writes work/cut_speech.mp4 = video + vocals for the master
         gate and links beats.js into index.html), --keeps on the source.
"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

DEMUCS = Path.home() / "ai-local/.venv-demucs/bin/python"
F5 = Path.home() / "ai-local/.venv-f5/bin/python"
ENGINE = Path(__file__).resolve().parent
a = sys.argv[1:]
if not a or a[0].startswith('--'): sys.exit(__doc__)
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
SRC, TAG, LIMIT, DB = Path(a[0]), opt('--src', 'src_1'), float(opt('--limit', 0.45)), float(opt('--db', -40))
out = Path('work/sep'); out.mkdir(parents=True, exist_ok=True)

wav_in = out / f'{SRC.stem}_in.wav'
subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', str(SRC), '-vn', '-ar', '44100', '-ac', '2', str(wav_in)], check=True)
subprocess.run([str(DEMUCS), '-m', 'demucs', '--two-stems', 'vocals', '-d', 'mps', '-o', str(out), str(wav_in)], check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
d = next(out.glob(f'*/{wav_in.stem}'))                       # demucs writes <out>/<model>/<name>/{vocals,no_vocals}.wav
for k in ('vocals', 'no_vocals'):
    (out / f'{k}.wav').unlink(missing_ok=True); (d / f'{k}.wav').replace(out / f'{k}.wav')
wav_in.unlink()
print(f'── stems → {out}/vocals.wav, {out}/no_vocals.wav')

def mono(p, sr=16000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768, sr

if '--keeps' in a:
    y, sr = mono(out / 'vocals.wav'); w = int(0.02 * sr)
    db = 20 * np.log10(np.sqrt(np.convolve(y ** 2, np.ones(w) / w, 'valid')[::w]) + 1e-9)
    loud = db > DB; t = np.arange(len(db)) * 0.02
    on = np.flatnonzero(loud)
    if not len(on): sys.exit('stem: no speech above the threshold in the vocals')
    keeps, s0, prev = [], t[on[0]], t[on[0]]
    for i in on[1:]:
        if t[i] - prev > LIMIT + 0.02:                          # a pause longer than the law: close the keep here
            keeps.append((s0, prev + 0.02)); s0 = t[i]
        prev = t[i]
    keeps.append((s0, prev + 0.02))
    pad = 0.10
    ks = [(max(0, s - pad), e + pad) for s, e in keeps if e - s > 0.15]
    merged = []
    for s, e in ks:                                             # paddings that touch become one keep
        if merged and s <= merged[-1][1]: merged[-1] = (merged[-1][0], e)
        else: merged.append((s, e))
    print(f'── {len(merged)} keeps (pauses > {LIMIT} s split at {DB} dB on the vocals):')
    print('   engine/cut.py build ' + ' '.join(f'--keep {TAG}:{s:.2f}:{e:.2f}' for s, e in merged))

if '--hits' in a:
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', str(out / 'no_vocals.wav'), '-ar', '48000', '-ac', '2', 'work/_music.wav'], check=True)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'work/_music.wav'],
                               capture_output=True, text=True).stdout)
    r = subprocess.run([str(F5), str(ENGINE / 'hitmap.py'), str(Path('work/_music.wav').resolve()), '--from', '0', '--dur', f'{dur:.2f}',
                        '--out', 'assets/vo/hits.js', '--no-reel'], capture_output=True, text=True)
    print(r.stdout.strip())
    if r.returncode: sys.exit(r.stderr[-800:])
    H = json.loads(Path('assets/vo/hits.js').read_text()[len('window.HITS='):-2])
    beats = sorted(set(round(x, 3) for x in H['K'] + H['S'] + H['H']))
    Path('assets/vo/beats.js').write_text(f'window.BEATS={json.dumps(beats)};\n')
    print(f'── work/_music.wav · assets/vo/hits.js · assets/vo/beats.js ({len(beats)} beats)')
    import re
    h = Path('index.html')
    if h.exists() and 'assets/vo/beats.js' not in h.read_text(encoding='utf-8'):   # beats.js only works if the page loads it
        t = h.read_text(encoding='utf-8'); tag = '<script src="assets/vo/beats.js"></script>\n'
        h.write_text(re.sub(r'(<script type="module")', tag + r'\1', t, count=1) if '<script type="module"' in t else t.replace('</head>', tag + '</head>', 1), encoding='utf-8')
        print('   index.html ← assets/vo/beats.js')
    if SRC.name == 'cut.mp4':                                   # the master gate reads the take with its voice only
        subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', str(SRC), '-i', str(out / 'vocals.wav'), '-map', '0:v', '-map', '1:a',
                        '-c:v', 'copy', '-c:a', 'aac', '-shortest', 'work/cut_speech.mp4'], check=True)
        print('   work/cut_speech.mp4 (video + vocals)')
