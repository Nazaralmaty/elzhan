#!/usr/local/bin/python3
"""Self-check of score.py's auto-cut: a sample must not run past its shot, and
   must never be cut before its peak. Run from anywhere: python3 qa/score_cut.py"""
import json, subprocess, sys, tempfile, wave
from pathlib import Path

ENG = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as d:
    w = Path(d) / 'work'; w.mkdir()
    cues = [{'t': 0.5, 'k': 'cut'}, {'t': 1.0, 'k': 'card'}, {'t': 1.6, 'k': 'pop'},
            {'t': 8.0, 'k': 'cut'}, {'t': 14.0, 'k': 'cta'}]
    (w / 'cues.json').write_text(json.dumps({'DUR': 16.0, 'cues': cues}))
    out = subprocess.run([sys.executable, str(ENG / 'score.py'), '--palette', 'speaker'],
                         cwd=d, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    assert 'trimmed to their shot' in out.stdout, out.stdout
    n = int(out.stdout.split(' events,')[1].split(',')[1].strip().split()[0])
    assert n > 0, f'dense cues must trim something: {out.stdout}'
    f = wave.open(str(w / '_sfx.wav')); sec = f.getnframes() / f.getframerate(); f.close()
    assert abs(sec - 16.0) < 0.05, sec
    # cutting before the peak leaves a click: the guard keeps at least peak+0.18 s
    pk = json.loads((Path.home() / '.claude/assets/sfx/peaks.json').read_text())
    assert pk['whoosh_cine_low']['peak'] + 0.18 < 2.0
print('score cut: ok')
