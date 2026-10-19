#!/usr/bin/env python3
"""engine/vo_stub.py — placeholder assets/vo/vo.js from script.txt, for layout
work before the paid TTS run. Durations estimated from syllables (kie Gemini,
Rapid Fire, TEMPO 1.07 ≈ 5.6 syl/s + 0.35 s tail). Overwritten by tts.sh."""
import json, pathlib, sys
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'script.txt')
lines = [l.strip() for l in src.read_text(encoding='utf-8').splitlines() if l.strip()]
V = 'aeiouyаеёиоуыэюяәіңғүұқөһ'
d = [round(0.35 + sum(ch in V for ch in l.lower()) / 5.6, 3) for l in lines]
VO = [[x, 0.12 if i < len(d) - 1 else 0.0] for i, x in enumerate(d)]
pathlib.Path('assets/vo').mkdir(parents=True, exist_ok=True)
pathlib.Path('assets/vo/vo.js').write_text('window.VO=' + json.dumps(VO) + ';\nwindow.LINES=' + json.dumps(lines, ensure_ascii=False) + ';\n// STUB: replace by engine/tts.sh\n', encoding='utf-8')
print(f'stub vo.js: {len(lines)} lines, {sum(d) + 0.12 * (len(d) - 1):.1f} s (estimate)')
