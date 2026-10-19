#!/bin/bash
# engine/film.sh [reel folder] — /mnt-film over the finished master: gate weave (two sines), halation 0.22, grain 6 — one pass over footage AND graphics.
# Audio is copied untouched (the loudness law of build.sh holds). Run after engine/build.sh from the reel folder (or pass it).
# Pre-film master → out/_prefilm.mp4. qa/musicsync.py is measured on out/_prefilm.mp4: the weave and grain move every pixel
# and hid the hits from the gate (pulse v2: 73 % → 55 % answered, same edit, 19.10.2026).
set -e
cd "${1:-.}"
mv out/reel.mp4 out/_prefilm.mp4
ffmpeg -nostdin -v error -y -i out/_prefilm.mp4 -filter_complex "
 [0:v]scale=1112:1978:flags=lanczos,crop=1080:1920:'16+3*sin(2*PI*t*0.61)+2*sin(2*PI*t*1.77)':'29+3*cos(2*PI*t*0.47)+2*sin(2*PI*t*1.31)',split=2[m][h];
 [h]curves=all='0/0 0.66/0 0.87/0.72 1/1',gblur=sigma=28,colorchannelmixer=rr=1:gg=0.60:bb=0.32[hal];
 [m][hal]blend=all_mode=screen:all_opacity=0.22[b];
 [b]noise=alls=6:allf=t+u,eq=contrast=1.012:saturation=1.02[v]" \
 -map "[v]" -map 0:a -c:v libx264 -crf 16 -pix_fmt yuv420p -r 30 -c:a copy -movflags +faststart out/reel.mp4
echo "film → out/reel.mp4"
