#!/bin/bash
# _engine/build.sh — voice + SFX + music → the 9:16 master out/reel.mp4, for any reel. No cover, no crops (Elzhan, 14.09.2026).
# Run from the reel folder after the full render:  engine/build.sh   (gates QA=fast; QA=final engine/build.sh before delivery)
# Reads reel.json:
#   { "palette": "motion", "bgm": "04_review/review_mornings.mp3", "bgm_offset": 8,   ← one track, or
#     "music": [{file, from, at, db}, …]   ← tracks by parts, the turn on a drop: engine/beat.py
#     "bgm_vol": 0.115, "lufs": -14,
#     "voice": "assets/vo/voice.wav" }            ← footage branch: the clip's own voice instead of assets/vo/vo_NN.wav
# Voice timing comes from assets/vo/vo.js (written by tts.sh), cues from
# work/cues.json (written by render.js). Master: two-pass loudnorm, TP -1.3,
# level 4.0, CFR 30, keyframe every 2 s (VideoToolbox-safe). alimiter with
# level=disabled: otherwise ffmpeg normalises back into clipping.
set -eu
PY=/usr/local/bin/python3
# FPS берётся из композиции (work/cues.json), а не константой: apple-жанр идёт 60 fps,
# и сборка на 30 растянула бы мастер вдвое. Остальные жанры пишут туда 30 — поведение прежнее.
FPS=$(/usr/local/bin/python3 -c "import json;print(int(json.load(open('work/cues.json'))['FPS']))" 2>/dev/null || echo 30)
cfg() { $PY -c "import json,sys; d=json.load(open('reel.json')); v=d.get('$1', $2); print(v)"; }
PAL=$(cfg palette '"motion"'); BVOL=$(cfg bgm_vol 0.12)
# duck — сила сайдчейна. 9 по замеру icon/reel_050 (01.10.2026) кладёт музыку на 29–39 дБ под голос при законе
# /mnt-sfx 12–18: музыки почти не слышно. Ролик с "music" ставит 4 и bgm_vol 0.3 (куски выровнены к −32 дБ; потолок громкости — замер в шаге 4); 9 — для старых роликов.
DUCK=$(cfg duck 9)
LUFS=$(cfg lufs -14)
DUR=$($PY -c "import json; d=json.load(open('work/cues.json')); print(round(d['DUR'],3))")
mkdir -p out work
echo "── length ${DUR}s · palette $PAL"

# frames older than the page = a render that failed and left the previous frames (ritm_demo 12.10.2026: a syntax error,
# render.js died, build.sh shipped the old frames and two measurements were read off a stale master)
G=$(grep -o "genre/[a-z-]*\.js" spec.js 2>/dev/null | head -1)
for f in spec.js index.html ${G:+engine/$G}; do
  [ -f "$f" ] && [ "$f" -nt renders/frames/f_0000.png ] && { echo "build.sh: $f is newer than renders/frames — render first (node engine/render.js)"; exit 4; }
done
echo "── 1. video"
ffmpeg -nostdin -y -v error -framerate $FPS -start_number 0 -i renders/frames/f_%04d.png \
  -vf "trim=duration=$DUR,setpts=PTS-STARTPTS,fps=$FPS,format=yuv420p" -fps_mode cfr -r $FPS \
  -c:v libx264 -crf 17 -preset medium -level 4.0 -g 60 -keyint_min 30 out/_video.mp4

VOICE=$(cfg voice '""')
echo "── 2. voice on the timeline"
if [ -n "$VOICE" ] && [ -f "$VOICE" ]; then
  # footage branch: the voice is the clip's own track (cam.sh → assets/vo/voice.wav), padded / trimmed to DUR
  ffmpeg -nostdin -y -v error -i "$VOICE" -af "apad,atrim=duration=$DUR,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=$($PY -c "import json;print('stereo' if json.load(open('reel.json')).get('stereo') else 'mono')")" work/_voice.wav   # "stereo": true — the voice track is the client's finished stereo mix (music baked in)
  echo "   footage voice $VOICE → work/_voice.wav"
else
$PY - "$DUR" <<'PY'
import json, re, subprocess, sys, wave, pathlib
import numpy as np
SR = 48000; DUR = float(sys.argv[1])
js = pathlib.Path('assets/vo/vo.js').read_text()
VO = json.loads(re.search(r'window\.VO=(\[.*?\]);', js, re.S).group(1))
buf = np.zeros(int(DUR * SR) + SR, dtype=np.float32); t = 0.0
for i, (d, g) in enumerate(VO):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f"assets/vo/vo_{i+1:02d}.wav", "-ar", str(SR), "-ac", "1", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    k = int(t * SR); buf[k:k + len(a)] += a[:len(buf) - k]; t += d + g
buf = buf[:int(DUR * SR)]
w = wave.open('work/_voice.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((np.clip(buf, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
print(f"   {len(VO)} lines laid, speech ends at {t:.2f}s")
PY
fi

echo "── 3. SFX"
$PY engine/score.py --palette "$PAL"

echo "── 4. mix (music ducked under voice by sidechain)"
# "stereo": true — the voice track is the client's finished mix (music baked in): it passes untouched; the voice chain
# (highpass 80 Hz + compressor) would cut the bass of their music and re-squash a mix they already balanced
VCH="highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=6:release=180:makeup=2,volume=-1dB,alimiter=limit=0.92:level=disabled,"
[ "$($PY -c "import json;print(1 if json.load(open('reel.json')).get('stereo') else '')")" = 1 ] && VCH=""
# Музыка — дорожка из кусков reel.json "music" (engine/beat.py mix): проблема на одном треке, поворот на дропе
# другого. Старая форма "bgm" + "bgm_offset" — тот же путь с одним куском.
MUS=$($PY -c "import json; d=json.load(open('reel.json')); print(1 if d.get('music') or d.get('bgm') else '')")
if [ -n "$MUS" ]; then
  $PY engine/beat.py mix "$DUR" work/_music.wav
  # Потолок музыки — замер, а не параметр: приглушённая музыка ≥ 20 дБ тише обработанного голоса (integrated LUFS).
  # docmed/reel_009: 6.4 дБ — «слишком громкая, никогда больше»; 12.4 дБ — «всё ещё громко, значительно тише».
  # Рецепт «bgm_vol ≈ 2 → 15–20 дБ под голосом» на деле давал 3–6 дБ.
  # reel.json "music_under": the floor in dB (default 20, docmed). A music-led reel (sparse voice, the edit built on the track)
  # may ask for less — only with Elzhan's ear on the master, never to make an explainer's music «заметная».
  UNDER=$(cfg music_under 20)
  lufs_of() { ffmpeg -nostdin -i "$1" -filter_complex "$2" -f null - 2>&1 | awk '/^ +I:/{v=$2} END{print v}'; }
  VI=$(lufs_of work/_voice.wav "[0:a]${VCH}aformat=channel_layouts=stereo,ebur128")
  MI=$(ffmpeg -nostdin -i work/_voice.wav -i work/_music.wav -filter_complex "[0:a]${VCH}aformat=channel_layouts=stereo[k];[1:a]volume=$BVOL,aformat=channel_layouts=stereo[m];[m][k]sidechaincompress=threshold=0.03:ratio=$DUCK:attack=8:release=320,ebur128" -f null - 2>&1 | awk '/^ +I:/{v=$2} END{print v}')
  BVOL=$($PY -c "
b=float('$BVOL'); fl=float('$UNDER')
try: g=float('$VI')-float('$MI'); print(b if g>=fl else round(b*10**((g-fl)/20),4))
except ValueError: print(b)")
  echo "   music $MI LUFS under voice $VI LUFS → bgm_vol $BVOL (floor $UNDER dB under)"
  ffmpeg -nostdin -y -v error -i work/_voice.wav -i work/_music.wav -i work/_sfx.wav -filter_complex "\
   [0:a]${VCH}aformat=channel_layouts=stereo,asplit=2[v1][vkey];\
   [1:a]volume=$BVOL,aformat=channel_layouts=stereo[m];\
   [m][vkey]sidechaincompress=threshold=0.03:ratio=$DUCK:attack=8:release=320[md];\
   [v1][md][2:a]amix=inputs=3:normalize=0:duration=first,atrim=duration=$DUR,\
   acompressor=threshold=-18dB:ratio=3:attack=10:release=200:makeup=3,alimiter=limit=0.94:level=disabled,aresample=48000[a]" \
   -map "[a]" -ac 2 -c:a pcm_s16le work/_mix.wav
else
  echo "   (no music)"
  # Компрессора шины здесь нет намеренно: замер на reel_003 (16.09.2026) показал, что он
  # не лечит уехавший TP мастера (I -14.0, TP -0.2 всё равно) и только сплющивает динамику
  # (LRA 1.9 → 1.5). Закон TP держит шаг 5b — пересборка мастера по замеру.
  ffmpeg -nostdin -y -v error -i work/_voice.wav -i work/_sfx.wav -filter_complex "\
   [0:a]${VCH}aformat=channel_layouts=stereo[v1];\
   [v1][1:a]amix=inputs=2:normalize=0:duration=first,atrim=duration=$DUR,alimiter=limit=0.94:level=disabled,aresample=48000[a]" \
   -map "[a]" -ac 2 -c:a pcm_s16le work/_mix.wav
fi

echo "── 5. master (two-pass loudnorm)"
M=$(ffmpeg -nostdin -hide_banner -i work/_mix.wav -af "loudnorm=I=$LUFS:TP=-1.3:LRA=11:print_format=json" -f null - 2>&1 \
  | $PY -c "import sys,json; s=sys.stdin.read(); d=json.loads(s[s.rindex('{'):s.rindex('}')+1]); print(f\"measured_I={d['input_i']}:measured_TP={d['input_tp']}:measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}\")")
ffmpeg -nostdin -y -v error -i out/_video.mp4 -i work/_mix.wav -map 0:v -map 1:a -c:v copy \
  -af "loudnorm=I=$LUFS:TP=-1.3:LRA=11:$M:linear=true" -ar 48000 -ac 2 -c:a aac -b:a 192k -movflags +faststart out/reel.mp4

# 5b. Мастер проверяется замером, а не доверием к loudnorm: linear=true на плотном слое
# отдаёт TP -0.1 при законе -1.3. Не сошлось — мастер пересобирается из work/_mix.wav
# подъёмом по замеру и alimiter'ом. Первый предел ставится на 0.7 dB ниже цели (inter-sample
# пики выше сэмплов), но зазор зависит от материала — на плотном SFX он доходит до 1.2 dB,
# поэтому следующий предел считается из промаха по TP, а не из новой константы.
# Лимитер работает на 4× передискретизации (192 кГц): на 48 кГц он видит только сэмплы, и
# межсэмпловый пик уходил на 1.6 dB выше предела — три попытки не сходились (icon/reel_037 v5).
law() { ffmpeg -nostdin -hide_banner -nostats -i "$1" -af ebur128=peak=true:framelog=quiet -f null - 2>&1 \
  | $PY -c "import sys,re; s=sys.stdin.read(); print(re.findall(r'I:\s+(-?[\d.]+) LUFS',s)[-1], re.findall(r'Peak:\s+(-?[\d.]+) dBFS',s)[-1])"; }
read -r GI GT <<<"$(law out/reel.mp4)"
if $PY -c "import sys; sys.exit(0 if abs($GI-($LUFS))>0.5 or $GT>-1.3 else 1)"; then
  echo "   мастер вне закона: I $GI (цель $LUFS) · TP $GT (≤ -1.3) → пересборка по замеру"
  read -r MI _ <<<"$(law work/_mix.wav)"
  G=$($PY -c "print(round($LUFS-($MI),2))"); L=$($PY -c "print(round(10**((-1.3-0.7)/20),3))")
  for try in 1 2 3; do
    ffmpeg -nostdin -y -v error -i out/_video.mp4 -i work/_mix.wav \
      -filter_complex "[1:a]volume=${G}dB,aresample=192000,alimiter=limit=$L:level=disabled,aresample=48000[a]" \
      -map 0:v -map "[a]" -c:v copy -ac 2 -c:a aac -b:a 192k -movflags +faststart work/_master.mp4
    mv work/_master.mp4 out/reel.mp4
    read -r GI GT <<<"$(law out/reel.mp4)"
    echo "   попытка $try: подъём ${G} dB, предел $L → I $GI · TP $GT"
    $PY -c "import sys; sys.exit(0 if abs($GI-($LUFS))<=1.0 and $GT<=-1.3 else 1)" && break
    [ "$try" = 3 ] && { echo "   МАСТЕР НЕ СОШЁЛСЯ: I $GI · TP $GT — смотреть work/_mix.wav"; exit 5; }
    L=$($PY -c "print(round($L*10**((-1.4-($GT))/20),3))")   # предел по промаху TP, с запасом 0.1 dB
  done
fi
# Loudness is measured once: these are the numbers of the final master. qa/master.py (QA=fast) reads them instead
# of measuring again; "size" ties them to this exact out/reel.mp4 — a master rebuilt elsewhere gets re-measured.
echo "{\"I\": $GI, \"TP\": $GT, \"lufs\": $LUFS, \"size\": $(stat -c %s out/reel.mp4 2>/dev/null || stat -f %z out/reel.mp4)}" > work/loudness.json

echo "── 6. checks"
ffprobe -v error -show_entries format=duration -show_entries stream=width,height,level -of default=nw=1 out/reel.mp4 | head -4
echo "   I $GI LUFS · TP $GT dBFS (замер 5b → work/loudness.json)"
[ "$(uname)" = Darwin ] && echo "   videotoolbox decode errors: $(ffmpeg -v warning -hwaccel videotoolbox -i out/reel.mp4 -f null - 2>&1 | grep -c 'failed to decode' || true)"
echo "── 7. gates"
bash engine/qa/all.sh   # QA=fast by default; QA=final engine/build.sh before delivery. exit ≠ 0 → out/reel.FAILED.txt
echo "done: out/reel.mp4"
