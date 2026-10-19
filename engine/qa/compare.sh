#!/bin/bash
# engine/qa/compare.sh <A> <B> [outdir] — the same brief, two versions, side by side.
#   A, B: a reel dir (uses <dir>/out/reel.mp4) or an mp4 path. A = the old one, B = the new one.
# Writes <outdir>/compare_sheet.jpg (6 paired frames, A on top, B under it, same timecodes)
#   and <outdir>/compare.mp4 (A | B playing together, audio from B).
# Why: a rule is kept or dropped by looking at two renders next to each other, not by remembering
# what the last one looked like. Times are taken as fractions of the SHORTER master, so the pairs
# stay on the same beat when a re-render changed the length.
set -eu
pick() { [ -d "$1" ] && echo "$1/out/reel.mp4" || echo "$1"; }
A=$(pick "${1:?A: reel dir or mp4}"); B=$(pick "${2:?B: reel dir or mp4}")
OUT=${3:-$(dirname "$B")}; mkdir -p "$OUT"
for f in "$A" "$B"; do [ -f "$f" ] || { echo "no master: $f" >&2; exit 1; }; done
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
DA=$(dur "$A"); DB=$(dur "$B")
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# 6 times at the same fraction of the shorter master (0.8 s hook + 5 spread)
TIMES=$(python3 -c "
d=min($DA,$DB); print(' '.join(['0.80']+[f'{d*k/6:.2f}' for k in range(1,6)]))")
i=0
for t in $TIMES; do
  for v in A B; do
    src=$A; [ $v = B ] && src=$B
    ffmpeg -nostdin -v error -y -ss "$t" -i "$src" -frames:v 1 \
      -vf "scale=300:533,drawtext=text='$v ${t}s':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6" \
      "$TMP/${v}_$i.png"
  done
  i=$((i+1))
done
ffmpeg -nostdin -v error -y $(for k in 0 1 2 3 4 5; do echo -i "$TMP/A_$k.png"; done) \
                           $(for k in 0 1 2 3 4 5; do echo -i "$TMP/B_$k.png"; done) \
  -filter_complex "xstack=inputs=12:layout=0_0|300_0|600_0|900_0|1200_0|1500_0|0_533|300_533|600_533|900_533|1200_533|1500_533" \
  -q:v 3 "$OUT/compare_sheet.jpg"

ffmpeg -nostdin -v error -y -i "$A" -i "$B" \
  -filter_complex "[0:v]scale=540:960,drawtext=text='A':x=16:y=16:fontsize=40:fontcolor=white:box=1:boxcolor=black@0.6[a];[1:v]scale=540:960,drawtext=text='B':x=16:y=16:fontsize=40:fontcolor=white:box=1:boxcolor=black@0.6[b];[a][b]hstack=inputs=2,format=yuv420p[v]" \
  -map "[v]" -map 1:a? -shortest -c:v libx264 -crf 20 -r 30 "$OUT/compare.mp4"

echo "$OUT/compare_sheet.jpg   A ${DA}s | B ${DB}s"
echo "$OUT/compare.mp4"
