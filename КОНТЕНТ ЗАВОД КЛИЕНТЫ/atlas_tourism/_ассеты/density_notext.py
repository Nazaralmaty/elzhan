#!/usr/bin/env python3
"""Плотность событий кадра БЕЗ текста (Елжан, 29.09.2026: «события в минуту не включают субтитры»).
Из work/cues.json вычитаются кии слов и кии появления текстовых элементов (text, pill, band) по work/els.json.
Запуск из папки ролика после render.js. Норма клиента — ≥ 130/мин."""
import json, subprocess
c = json.load(open('work/cues.json')); c = c if isinstance(c, list) else c.get('cues', [])
E = json.load(open('work/els.json'))['els']
tt = sorted(e['t0'] for e in E if e['k'] in ('text', 'pill', 'band') and e.get('t'))
def is_text(x):
    return x['k'] == 'word' or (x['k'] in ('pop', 'card', 'draw') and any(abs(x['t'] - t) < 0.02 for t in tt))
n = [x for x in c if not str(x.get('k', '')).startswith('sfx:')]
nt = [x for x in n if not is_text(x)]
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'work/take.mov'], capture_output=True, text=True).stdout)
ts = sorted(x['t'] for x in nt); gaps = [b - a for a, b in zip([0] + ts, ts + [dur])]
print(f'событий всего {len(n)} · без текста {len(nt)} · {len(nt) / dur * 60:.0f}/мин без текста · самая длинная дыра без текста {max(gaps):.2f} с')
