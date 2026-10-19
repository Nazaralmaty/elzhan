#!/bin/zsh
# _engine/flux.sh — local FLUX in the REEL's own palette (not a preset).
#   engine/flux.sh "<what is shown, english>" out.png [WxH gen] [WxH final] [seed]
#   STYLE env overrides the style tail. Prints the seed used; write it into the reel's CLAUDE.md.
# ~30 s per image. Never ask for text inside the picture.
export HF_HUB_DISABLE_XET=1
. ~/ai-local/.venv/bin/activate
subject=$1; out=$2; gen=${3:-512x896}; fin=${4:-1080x1920}; seed=${5:-$RANDOM}
STYLE=${STYLE:-"3d clay render illustration, stylized simplified shapes, matte materials, deep navy ink background, muted desaturated palette with one warm amber accent, soft directional light, calm editorial mood, not photographic, no glow, no text, no letters, high detail"}
tmp="${out:r}_raw.png"
caffeinate -is mflux-generate-flux2 -m ~/ai-local/models/flux2-klein-4b-q4 --base-model flux2-klein-4b \
  --low-ram --vae-tiling --vae-tile-size 256 --seed $seed \
  --prompt "$subject, $STYLE" --steps 4 --width ${gen%x*} --height ${gen#*x} --output "$tmp" >/dev/null 2>&1
ffmpeg -y -loglevel error -i "$tmp" -vf "scale=${fin%x*}:${fin#*x}:flags=lanczos" "$out" && rm -f "$tmp"
echo "$out seed=$seed"
