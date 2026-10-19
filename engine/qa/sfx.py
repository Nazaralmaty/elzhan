#!/usr/bin/env python3
"""qa/sfx.py — sound effects are mandatory in every reel (Elzhan, icon/reel_067–069: «добавить саунд эффекты —
это обязательно»; reel_061: the layer at −11.6 dBFS read as «звуков нет»). Measured on work/_sfx.wav (score.py) against
work/_voice.wav, both written by build.sh:
  - the layer exists and carries ≥ 40 events a minute (an onset = the envelope rising over −42 dBFS after ≥ 0.12 s under it);
  - no stretch of silence (layer under −42 dBFS) longer than 3.0 s between the first sound and the last;
  - the layer's peak sits within 8 dB of the voice peak — quieter is inaudible under music.
Exit 1 on any. Run from the reel folder."""
import json, subprocess, sys
from pathlib import Path
import numpy as np

MIN_RATE, MAX_GAP, MAX_BELOW = 40, 3.0, 8.0
SR, WIN = 16000, 0.02


def pcm(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def main():
    s, v = Path('work/_sfx.wav'), Path('work/_voice.wav')
    if not s.exists():
        print('звуковых эффектов нет: work/_sfx.wav не собран'); return 1
    x = pcm(s); dur = len(x) / SR
    n = int(WIN * SR); env = np.array([np.sqrt(np.mean(x[i:i + n] ** 2)) + 1e-9 for i in range(0, len(x) - n, n)])
    db = 20 * np.log10(env); on, quiet = [], 99
    for i, d in enumerate(db):
        if d > -42 and quiet * WIN >= .12: on.append(i * WIN)
        quiet = 0 if d > -42 else quiet + 1
    fail = []
    rate = len(on) / dur * 60 if dur else 0
    # reel.json sfx_keep (the client asked for fewer sounds, score.py) lowers the floor by the same share
    keep = json.loads(Path('reel.json').read_text()).get('sfx_keep', 1) if Path('reel.json').exists() else 1
    global MIN_RATE; MIN_RATE = round(MIN_RATE * keep)
    # the longest run of real silence (layer under −42 dBFS) between the first and the last sound — not onset to onset:
    # a riser under the hook sounds for 3 s with no new onset and is not a hole
    loud = np.where(db > -42)[0]; worst, at = 0.0, 0.0
    if len(loud) > 1:
        g = np.diff(loud); j = int(g.argmax()); worst, at = float((g[j] - 1) * WIN), float(loud[j] * WIN)
    else: worst = dur
    print(f'эффекты: {len(on)} событий · {rate:.0f}/мин (≥ {MIN_RATE}) · самая длинная тишина {worst:.2f} с на {at:.1f} с (≤ {MAX_GAP})')
    if rate < MIN_RATE: fail.append(f'эффектов {rate:.0f}/мин — мало, нужно ≥ {MIN_RATE}')
    if worst > MAX_GAP: fail.append(f'без эффектов {worst:.2f} с на {at:.1f} с — дольше {MAX_GAP}')
    if v.exists():
        vp, sp = np.abs(pcm(v)).max(), np.abs(x).max()
        below = 20 * np.log10(vp / sp) if sp > 0 and vp > 0 else 99
        print(f'пик слоя на {below:.1f} дБ ниже голоса (≤ {MAX_BELOW})')
        if below > MAX_BELOW: fail.append(f'слой эффектов на {below:.1f} дБ тише голоса — не слышно')
    for f in fail: print('  ✗ ' + f)
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main())
