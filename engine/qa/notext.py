#!/usr/bin/env python3
"""qa/notext.py — picture events per minute WITHOUT text. Run from the reel folder after render.js.

Elzhan, 29.09.2026: «события в минуту не включают субтитры, иначе все события станут субтитрами и визуал бедный».
qa/master.py counts text and picture together, so a reel of plates and subtitles passes it; this gate does not.
Word cues and the appearance cues of text elements (text, pill, band from work/els.json) are dropped.
Norm from reel.json "notext" (podcast reels: 130); all.sh runs this gate only when that key is set.
Exit 1 below the norm or with a hole > 3 s without text."""
import json, subprocess, sys

norm = float(json.load(open('reel.json')).get('notext', 130))
c = json.load(open('work/cues.json')); c = c if isinstance(c, list) else c.get('cues', [])
E = json.load(open('work/els.json'))['els']
tt = sorted(e['t0'] for e in E if e['k'] in ('text', 'pill', 'band') and e.get('t'))
def is_text(x):
    return x['k'] == 'word' or (x['k'] in ('pop', 'card', 'draw') and any(abs(x['t'] - t) < 0.02 for t in tt))
n = [x for x in c if not str(x.get('k', '')).startswith('sfx:')]
nt = [x for x in n if not is_text(x)]
src = 'out/reel.mp4' if len(sys.argv) < 2 else sys.argv[1]
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src],
                           capture_output=True, text=True).stdout)
ts = sorted(x['t'] for x in nt); gaps = [b - a for a, b in zip([0] + ts, ts + [dur])]
rate, hole = len(nt) / dur * 60, max(gaps)
print(f'событий всего {len(n)} · без текста {len(nt)} · {rate:.0f}/мин без текста (норма ≥ {norm:.0f}) · '
      f'самая длинная дыра без текста {hole:.2f} с (≤ 3.0)')
sys.exit(0 if rate >= norm and hole <= 3.0 else 1)
