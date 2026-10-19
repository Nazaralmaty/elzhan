#!/bin/zsh
# new_reel_03.sh reel_NNN_name START END [DB] — новая папка ролика из выпуска №3 (ПОДКАСТ_03_РАЗБОР.md §3):
# raw1.mp4 (видео pod3_1080.mp4 + звук audio.m4a, исходник = слайс + START), work/cut/src_1.mp4|wav (CFR 30, как cut.py
# transcribe), карта тишины DB (по умолчанию −46: звук без гейта, пол −52…−59), кусок пословной разметки выпуска
# (mlx whisper-large-v3 — Scribe 19.10.2026 недоступен, оплата), fillers_1_kk.txt по этой разметке с заголовком sha1,
# который читает cut.py build.
set -e
A="/Users/elzhanmakhsot/Documents/Obsidian Vault/КОНТЕНТ ЗАВОД КЛИЕНТЫ/atlas_tourism"
R=$1; S=$2; E=$3; DB=${4:--46}; T=~/.claude/skills/podcast-reel/tools; PY=/usr/local/bin/python3
cd "$A"; mkdir -p $R/work/cut $R/out; cd $R
[ -e engine ] || ln -s ~/.claude/engine engine
echo '{ "palette": "canvas", "voice": "assets/vo/voice.wav", "bgm": "", "lufs": -14, "lang": "kk", "pause_db": -40 }' > reel.json
D=$(echo "$E-$S" | bc)
ffmpeg -nostdin -y -v error -ss $S -i ../pod3_1080.mp4 -ss $S -i ../_ассеты/подкаст_03/audio.m4a -t $D \
  -map 0:v -map 1:a -c:v libx264 -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k raw1.mp4
ffmpeg -nostdin -y -v error -i raw1.mp4 -vf fps=30 -fps_mode cfr -r 30 -c:v libx264 -crf 16 -g 15 -pix_fmt yuv420p \
  -c:a aac -ar 48000 -ac 1 work/cut/src_1.mp4
cp work/cut/src_1.mp4 work/cut/src_1_orig.mp4
ffmpeg -nostdin -y -v error -i work/cut/src_1.mp4 -vn -ar 16000 -ac 1 work/cut/src_1.wav
$PY $T/islands.py work/cut/src_1.wav --db $DB --min 0.08 --silence work/cut/silence_1.txt >/dev/null
$PY - $S <<'PY'
import json, subprocess, sys
S = float(sys.argv[1])
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0',
                            'work/cut/src_1.wav'], capture_output=True, text=True).stdout)
ep = json.load(open('../_ассеты/подкаст_03/whisper_words.json'))
W = []
for w in ep['words']:
    s, e = w['start'] - S, w['end'] - S
    if s < 0 or e > dur: continue
    W.append({**w, 'start': round(s, 3), 'end': round(e, 3)})
import hashlib
json.dump({'language_code': 'kaz', 'words': W, 'audio_duration_secs': round(dur, 3),
           'audio_sha1': hashlib.sha1(open('work/cut/src_1.wav', 'rb').read()).hexdigest(),
           'note': f'episode map VAWZ--dNPps (mlx whisper-large-v3) shifted by -{S}'}, open('work/cut/scribe_src_1.wav.kk.json', 'w'), ensure_ascii=False)
json.dump([{'w': w['text'], 't0': w['start'], 't1': w['end']} for w in W if w.get('type') == 'word'],
          open('work/cut/words_1.json', 'w'), ensure_ascii=False)
print(f'{len(W)} tokens, {dur:.2f} s')
PY
{ echo "# audio $(shasum -a 1 work/cut/src_1.wav | cut -d' ' -f1)"
  ~/ai-local/.venv-f5/bin/python ~/.claude/engine/cut/fillers.py work/cut/src_1.wav --lang kk --words work/cut/scribe_src_1.wav.kk.json
} > work/cut/fillers_1_kk.txt
echo "$R ready: offset $S, $(grep -c FILLER work/cut/fillers_1_kk.txt) FILLER"
