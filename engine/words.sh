#!/bin/bash
# engine/words.sh — word timestamps for every voice line via whisper.cpp → assets/vo/words.js
#   engine/words.sh ru|en|kk        (run after tts.sh; ~2 s per line on M4)
# window.WORDS = [[{w:'почему', t:0.01}, ...], ...]   t = seconds from the line's own start
set -eu
LANG_CODE=${1:-ru}
M=~/.claude/tools/whisper/ggml-large-v3-turbo.bin
mkdir -p work/words
for f in assets/vo/vo_*.wav; do n=$(basename "$f" .wav); whisper-cli -m "$M" -f "$f" -l "$LANG_CODE" -ml 1 -sow -oj -of "work/words/$n" >/dev/null 2>&1 || true; done
python3 - <<'PY'
import json, glob, re
out=[]
for f in sorted(glob.glob('work/words/vo_*.json')):
    d=json.load(open(f))
    ws=[{'w':re.sub(r'[^\w$]+','',s['text'].strip().lower()), 't':round(s['offsets']['from']/1000,3)} for s in d['transcription'] if s['text'].strip()]
    out.append([w for w in ws if w['w']])
open('assets/vo/words.js','w').write('window.WORDS='+json.dumps(out,ensure_ascii=False)+';\n')
print('words:', [len(x) for x in out], '→ assets/vo/words.js')
PY
