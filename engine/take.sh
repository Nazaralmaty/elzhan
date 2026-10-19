#!/bin/bash
# engine/take.sh — a cut take → footage for the morph `take` window (/apple-design §18). Run from the reel folder.
#   engine/take.sh work/cut.mp4 [--scale 2]
# The take keeps its OWN aspect (a 16:9 park shot stays 16:9): the window crops it live, so nothing is cropped here.
# --scale: frames are stored larger than the source (lanczos + light unsharp) because a portrait window zooms into
#          a landscape take up to ~1.9×; the browser's own upscale is softer. 2 for a 1080-wide landscape take, 1 for 4K.
# Out: work/fr/f_%04d.jpg   work/amb/f_%04d.jpg (384 px, blurred: the ambient ground of a light world)
#      assets/vo/voice.wav (48 kHz) · work/voice16.wav · work/plate.json + work/plate.js (w, h, frames, fps, dur)
#      qa/face.json (Vision, faces only) · work/face.js (head centre per frame, σ 0.45 s)
# Word times are NOT made here: engine/words_scribe.py on the Scribe map of the cut (kk/ru/en), then fix orthography by hand.
# GPU: run alone — never alongside FLUX / TTS / render.
set -eu
SRC=${1:?take}; shift
SCALE=2
while [ $# -gt 0 ]; do case "$1" in --scale) SCALE=$2; shift 2;; *) echo "unknown flag $1" >&2; exit 1;; esac; done
FPS=30
IFS=x read -r SW SH <<<"$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$SRC")"
W=$(python3 -c "print(int(round($SW*$SCALE/2)*2))"); H=$(python3 -c "print(int(round($SH*$SCALE/2)*2))")
mkdir -p work/fr work/amb qa assets/vo
find work/fr work/amb -name 'f_*.jpg' -delete
echo "── frames ${SW}×${SH} → ${W}×${H}"
ffmpeg -nostdin -y -v error -i "$SRC" -vf "fps=$FPS,scale=$W:$H:flags=lanczos,unsharp=5:5:0.45:5:5:0" -q:v 2 -start_number 1 work/fr/f_%04d.jpg
ffmpeg -nostdin -y -v error -i "$SRC" -vf "fps=$FPS,scale=384:-2,gblur=sigma=9,eq=saturation=1.25" -q:v 3 -start_number 1 work/amb/f_%04d.jpg
N=$(find work/fr -name 'f_*.jpg' | wc -l | tr -d ' ')
ffmpeg -nostdin -y -v error -i "$SRC" -vn -ar 48000 -ac 1 assets/vo/voice.wav
ffmpeg -nostdin -y -v error -i assets/vo/voice.wav -ar 16000 work/voice16.wav
DUR=$(python3 -c "print(round($N/$FPS,3))")
echo "{ \"frames\": $N, \"fps\": $FPS, \"dur\": $DUR, \"src\": \"$SRC\", \"from\": 0, \"matte\": false, \"w\": $W, \"h\": $H }" > work/plate.json
echo "window.PLATE=$(cat work/plate.json);" > work/plate.js
echo "   $N frames, $DUR s"
echo "── face track (Vision)"
python3.13 ~/.claude/engine/matte.py work/fr work/mt --faces-only --faces qa/face.json --fps $FPS 2>&1 | tail -1
/usr/local/bin/python3 ~/.claude/engine/face_track.py
echo "done. next: words.js (engine/words_scribe.py), index.html loads work/plate.js, work/face.js, assets/vo/words.js"
