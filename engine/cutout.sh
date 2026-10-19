#!/bin/zsh
# _engine/cutout.sh — flat-vector illustration with transparent background, in the reel's palette.
#   engine/cutout.sh "<subject>" out.png [seed] [WxH]
# FLUX draws the subject on a solid green; chromakey + despill cut it out. Never ask for text.
export HF_HUB_DISABLE_XET=1
. ~/ai-local/.venv/bin/activate
subject=$1; out=$2; seed=${3:-$RANDOM}; size=${4:-768x768}
PAL=${PAL:-"periwinkle blue, lavender, indigo, cream and warm skin tones"}
STYLE="flat vector illustration, clean geometric shapes, no outlines, soft flat shading, palette of $PAL, absolutely no white and no green anywhere in the subject, centered, isolated on a solid flat pure bright green background (#00FF00), no text, no letters"
tmp="${out:r}_raw.png"
caffeinate -is mflux-generate-flux2 -m ~/ai-local/models/flux2-klein-4b-q4 --base-model flux2-klein-4b \
  --low-ram --vae-tiling --vae-tile-size 256 --seed $seed \
  --prompt "$subject, $STYLE" --steps 4 --width ${size%x*} --height ${size#*x} --output "$tmp" >/dev/null 2>&1
ffmpeg -y -loglevel error -i "$tmp" -vf "chromakey=0x00FF00:0.30:0.12,despill=type=green:mix=0.6:expand=0.4,format=rgba" "$out" && rm -f "$tmp"
echo "$out seed=$seed"
