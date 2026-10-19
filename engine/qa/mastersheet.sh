#!/bin/bash
# engine/qa/mastersheet.sh <reel dir> [out.jpg] — 8 frames from out/reel.mp4 (0.8 s + 7 evenly spaced), 4×2 sheet.
# Looks at the MASTER (voice timing, final engine), not at the spec probe.
set -eu
D=${1:?reel dir}; OUT=${2:-$D/renders/master_sheet.jpg}
M="$D/out/reel.mp4"; [ -f "$M" ] || { echo "no master: $M" >&2; exit 1; }
TMP=$(mktemp -d); DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$M")
i=0
for t in 0.8 $(python3 -c "d=$DUR; print(' '.join(f'{d*k/8:.2f}' for k in range(1,8)))"); do
  ffmpeg -nostdin -v error -y -ss "$t" -i "$M" -frames:v 1 -vf "scale=300:533,drawtext=text='${t}s':x=8:y=8:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6" "$TMP/f_$i.png"
  i=$((i+1))
done
ffmpeg -nostdin -v error -y $(for k in 0 1 2 3 4 5 6 7; do echo -i "$TMP/f_$k.png"; done) \
  -filter_complex "xstack=inputs=8:layout=0_0|300_0|600_0|900_0|0_533|300_533|600_533|900_533" -q:v 3 "$OUT"
rm -rf "$TMP"; echo "$OUT ($DUR s)"
