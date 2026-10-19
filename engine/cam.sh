#!/bin/bash
# engine/cam.sh — footage → frames, matte, face track, word times. Run from the reel folder.
#   engine/cam.sh work/cut.mp4 [--lang ru] [--no-matte] [--spans 120-260,900-1010] [--gate 140:215] [--from 0 --to 12.5]
#   Матт нужен только там, где спек просит mode:'cut' или behind:true. Нет ни того ни другого —
#   ставь --no-matte: слой матта над плейтом кладёт на кадр его же пиксели и стоит 10-23 минуты.
#   Есть, но не везде — --spans по кадрам этих актов (порядок: сначала спек, потом матт).
# Out: work/fr/f_%04d.jpg (1080×1920 or reel.json "size", CFR 30)   work/mt/f_%04d.png (RGBA, cleaned)   qa/face.json   qa/gestures.json
#      assets/vo/voice.wav (48 kHz)   assets/vo/words.js (window.WORDS_ALL = [{w,t0,t1}])   work/plate.json
# GPU: run alone — never alongside FLUX / TTS / render.
set -eu
SRC=${1:?video}; shift
LANG_CODE=ru; MATTE=1; GATE=""; FROM=0; TO=""; SPANS=""
while [ $# -gt 0 ]; do case "$1" in
  --lang) LANG_CODE=$2; shift 2;; --no-matte) MATTE=0; shift;; --gate) GATE="--gate $2"; shift 2;;
  --spans) SPANS="--spans $2"; shift 2;;
  --from) FROM=$2; shift 2;; --to) TO=$2; shift 2;; *) echo "unknown flag $1" >&2; exit 1;; esac; done
FPS=30; M=~/.claude/tools/whisper/ggml-large-v3-turbo.bin
# HDR or a rotation tag caught here costs one re-encode; after the matte it costs the matte too
/usr/local/bin/python3 ~/.claude/engine/qa/source.py "$SRC" || { echo "cam.sh: исходник не годится, см. БРАК выше"; exit 1; }
mkdir -p work/fr work/mt qa assets/vo
rm -f work/fr/f_*.jpg
TOARG=(); [ -n "$TO" ] && TOARG=(-to "$TO")
echo "── frames"
# frame size: reel.json "size" ("1440x1080") when the master is not 9:16 — the client's own 4:3 edit is kept whole, not cropped
SZ=$(python3 -c "import json;print(json.load(open('reel.json')).get('size','1080x1920'))" 2>/dev/null || echo 1080x1920); FW=${SZ%x*}; FH=${SZ#*x}
ffmpeg -nostdin -y -v error -ss "$FROM" ${TOARG[@]+"${TOARG[@]}"} -i "$SRC" -vf "fps=$FPS,scale=$FW:$FH:force_original_aspect_ratio=increase:flags=lanczos,crop=$FW:$FH" -q:v 2 -start_number 1 work/fr/f_%04d.jpg
N=$(ls work/fr | wc -l | tr -d ' ')
ffmpeg -nostdin -y -v error -ss "$FROM" ${TOARG[@]+"${TOARG[@]}"} -i "$SRC" -vn -ar 48000 -ac $(python3 -c "import json;print(2 if json.load(open('reel.json')).get('stereo') else 1)" 2>/dev/null || echo 1) assets/vo/voice.wav
ffmpeg -nostdin -y -v error -i assets/vo/voice.wav -ar 16000 work/voice16.wav
DUR=$(python3 -c "print(round($N/$FPS,3))")
echo "{ \"frames\": $N, \"fps\": $FPS, \"dur\": $DUR, \"src\": \"$SRC\", \"from\": $FROM, \"matte\": $([ "$MATTE" = 1 ] && echo true || echo false) }" > work/plate.json
echo "window.PLATE=$(cat work/plate.json);" > work/plate.js
echo "   $N frames, $DUR s"

echo "── words (whisper, per word)"
whisper-cli -m "$M" -f work/voice16.wav -l "$LANG_CODE" -ml 1 -sow -oj -of work/words >/dev/null 2>&1 || echo "   whisper failed — words.js empty" >&2
python3 - <<'PY'
import json, pathlib
out = []
p = pathlib.Path('work/words.json')
if p.exists():
    for s in json.load(open(p)).get('transcription', []):
        w = s['text'].strip()
        if not w: continue
        t0 = s['offsets']['from'] / 1000; t1 = s['offsets']['to'] / 1000
        if out and out[-1]['t1'] > t0 - 0.02 and not w[0].isalnum(): out[-1]['w'] += w; continue
        out.append({'w': w, 't0': round(t0, 3), 't1': round(t1, 3)})
pathlib.Path('assets/vo/words.js').write_text('window.WORDS_ALL=' + json.dumps(out, ensure_ascii=False) + ';\n', encoding='utf-8')
print(f'   {len(out)} words → assets/vo/words.js')
PY

if [ "$MATTE" = 1 ]; then
  echo "── matte + face track (Vision)"
  rm -f work/mt/f_*.png
  python3.13 ~/.claude/engine/matte.py work/fr work/mt --faces qa/face.json --fps $FPS $GATE $SPANS
else
  echo "── matte skipped (--no-matte): face track only, all graphics go over the footage"
  python3.13 ~/.claude/engine/matte.py work/fr work/mt --faces-only --faces qa/face.json --fps $FPS
fi
echo "── gestures (Vision hand pose): where the speaker points — the montage answers there (qa/gesture.js)"
python3.13 ~/.claude/engine/gesture.py work/fr --fps $FPS || echo "   gesture.py failed — qa/gesture.js will rerun it" >&2
echo "done. next: write spec.js (see speaker-reel), then  node engine/render.js --sheet 12"
