#!/bin/zsh
# engine/cutphoto.sh "<subject, english>" out.png [WxH] [seed] — an archival b/w PHOTO cut-out with alpha (genre archive):
# FLUX draws the subject on pure green, chromakey + despill cut it, hue=s=0 makes it grey, alphacrop.py trims it.
# Green is safe here because the subject is black and white. Check every result by eye: hands, a person in an
# object prompt, an unkeyed white or grey background happen (Golovkin: 3 of 9 re-rolled with another seed).
export HF_HUB_DISABLE_XET=1
. ~/ai-local/.venv/bin/activate
subject=$1; out=$2; size=${3:-576x1024}; seed=${4:-$RANDOM}
TAIL="authentic black and white archival press photograph, documentary, film grain, the whole figure inside the frame with margin, isolated on a solid flat pure bright green background (#00FF00), even green, no shadow on the background, no text, no letters"
tmp="${out:r}_raw.png"
caffeinate -is mflux-generate-flux2 -m ~/ai-local/models/flux2-klein-4b-q4 --base-model flux2-klein-4b --low-ram --vae-tiling --vae-tile-size 256 \
  --seed $seed --prompt "$subject, $TAIL" --steps 4 --width ${size%x*} --height ${size#*x} --output "$tmp" >/dev/null 2>&1
ffmpeg -y -loglevel error -i "$tmp" -vf "chromakey=0x00FF00:0.28:0.10,despill=type=green:mix=0.8:expand=0.5,format=rgba,hue=s=0" "$out" && rm -f "$tmp"
~/ai-local/.venv/bin/python -I ~/.claude/engine/alphacrop.py "$out"
echo "$out seed=$seed"
