#!/bin/bash
# _engine/tts.sh — local voice for a reel, one WAV per line, plus the timing
# file the composition reads. Run from the reel folder:
#   engine/tts.sh en script.txt [--ref voice.wav] [--tempo 1.06]
#   engine/tts.sh ru script.txt [--tempo 1.00]          # F5-TTS_RUSSIAN
#   engine/tts.sh kk script.txt --ref voice.wav   # ref обязателен: иначе голос меняется от реплики к реплике
#   engine/tts.sh kie script.txt                         # production: kie.ai Gemini TTS (VOICE, VSTYLE, PACE, TEMP, CTX, PROFILE env)
#   engine/tts.sh trim                                   # re-trim only, no generation
# Output: assets/vo/vo_NN.wav (trimmed, tempo, 48 kHz mono) and assets/vo/vo.js
#   window.VO    = [[duration, gapAfter], ...]
#   window.LINES = ["line", ...]
# Speech law baked in: the head is trimmed at -45 dB, the TAIL only at -55 dB —
# a final з/с/т/ж lives at -40..-50 dBFS and a -45 dB gate eats it, which the
# client hears as «не в этот ра» instead of «раз»; 0.12 s of tail is kept after
# the last sound (never cut to zero); pauses inside a line longer than 0.30 s
# are cut to 0.16 s (Gemini puts 0.4–0.8 s between sentences); gap between
# lines 0.12 s so the pause incl. the kept tail stays under 0.35 s — a SYNTHESISED-voice
# ceiling; cuts of live speech use 0.60 (/obrezka);
# words are never cut.
set -eu
LANG_CODE=${1:?en|ru|kk|kie|trim}; shift || true
LINES=script.txt
if [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; then LINES=$1; shift; fi
REF=""; REFTXT=""; TEMPO=${TEMPO:-1.04}; GENDER=female; GAP=${GAP:-0.12}
while [ $# -gt 0 ]; do case "$1" in
  --ref) REF=$2; shift 2;; --ref-text) REFTXT=$2; shift 2;; --tempo) TEMPO=$2; shift 2;; --gender) GENDER=$2; shift 2;; --gap) GAP=$2; shift 2;;
  *) echo "unknown flag $1" >&2; exit 1;; esac; done
mkdir -p work/raw assets/vo
# kie is paid: the no-ai-slop lint runs before the first request; a client's own text skips it with SLOP=skip
if [ "$LANG_CODE" = kie ] && [ "${SLOP:-}" != skip ]; then
  python3 ~/.claude/skills/no-ai-slop/lint.py "$LINES" || { echo "озвучка не запущена: текст сначала чистится"; exit 1; }
fi

if [ "$LANG_CODE" != trim ]; then
  i=0
  if [ "$LANG_CODE" = kie ]; then
    # kie.ai Gemini TTS, one task per line, lines in parallel. Gemini reads sample_context as an
    # instruction and pads short lines with invented text, so every line is verified by
    # back-transcription (engine/verify_vo.py) and regenerated, up to 3 passes.
    VOICE=${VOICE:-Achird}; VSTYLE=${VSTYLE:-Promo/Hype}; PACE=${PACE:-Rapid Fire}; TEMP=${TEMP:-0.35}
    CTX=${CTX:-"Рекламный ролик. Мужской голос: уверенный, деловой, собранный, будто объясняешь знакомому владельцу бизнеса. Говорит быстро и собранно. Русский язык, без пафоса и без крика. ВАЖНО: произнести ровно тот текст, который дан в реплике, слово в слово, и остановиться. Ничего не добавлять, не пояснять, не продолжать мысль и не повторять реплику."}
    PROFILE=${PROFILE:-"A confident man reading one short advertising line exactly as written, brisk and energetic, no pathos"}
    ARR=(); while IFS= read -r line; do [ -n "$line" ] && ARR+=("$line"); done < "$LINES"
    # a line with work/raw/l_NN_000.wav already there is kept (delete the file to redo it); a paid task is never repeated blindly
    gen() { local nn; nn=$(printf %02d "$1"); rm -f work/raw/k_${nn}* work/raw/l_${nn}_000.wav
      python3 ~/.claude/tools/kie/kie.py tts --text "${ARR[$1-1]}" --voice "$VOICE" --style "$VSTYLE" --pace "$PACE" \
        --temperature "$TEMP" --context "$CTX" --profile "$PROFILE" --out work/raw --name "k_$nn" >work/raw/k_$nn.json 2>work/raw/k_$nn.err || return 1
      local f; f=$(ls work/raw/k_${nn}_*.wav work/raw/k_${nn}_*.mp3 2>/dev/null | head -1)
      ffmpeg -nostdin -y -v error -i "$f" -ar 48000 -ac 1 "work/raw/l_${nn}_000.wav"; }
    TODO=$(for n in $(seq 1 ${#ARR[@]}); do [ -f "work/raw/l_$(printf %02d $n)_000.wav" ] || echo $n; done)
    for pass in 1 2 3; do
      echo "── kie pass $pass: lines $(echo $TODO | tr '\n' ' ')"
      for n in $TODO; do gen "$n" & done; wait || true
      TODO=$(python3 ~/.claude/engine/verify_vo.py "$LINES" work/raw | tee -a work/tts.log | awk '/^[0-9]+  (БРАК|НЕТ)/{print $1+0}')
      [ -z "$TODO" ] && break
    done
    [ -n "$TODO" ] && { echo "kie: lines still wrong after 3 passes: $TODO"; exit 1; }
  elif [ "$LANG_CODE" = ru ]; then
    rm -f work/raw/l_*.wav
    ARR=()
    while IFS= read -r line; do [ -n "$line" ] && ARR+=("$line"); done < "$LINES"
    ~/ai-local/bin/say-ru work/raw/l "${ARR[@]}" >work/tts.log 2>&1 || { tail -20 work/tts.log; exit 1; }
    # say-ru names l_01.wav … ; rename to l_NN_000.wav for the common path
    for f in work/raw/l_[0-9][0-9].wav; do mv "$f" "${f%.wav}_000.wav"; done
  else
    rm -f work/raw/l_*.wav
    # batch: the model loads once for all lines (per-line `say` reloads it every time, ~20 s each)
    . ~/ai-local/.venv/bin/activate; export HF_HUB_DISABLE_XET=1
    ARGS=(--lang "$LANG_CODE" --lines "$LINES" --out work/raw --name l)
    # kk: у OmniVoice нет пола, есть только клонирование. Без --ref модель выбирает
    # голос сама на КАЖДОЙ реплике — в abat/reel_019 так вышло 11 женских и 3 мужских
    # в одном ролике. Один человек на весь ролик = один --ref.
    [ -n "$REF" ] && ARGS+=(--ref "$REF")
    # без --ref-text mlx качает whisper-large-v3-turbo (1.6 ГБ) только чтобы распознать образец
    [ -n "$REFTXT" ] && ARGS+=(--ref-text "$REFTXT")
    [ "$LANG_CODE" = kk ] && [ -z "$REF" ] && echo "⚠ kk без --ref: пол и тембр прыгают по репликам" >&2
    python ~/.claude/skills/local-tts/assets/vo.py "${ARGS[@]}" >work/tts.log 2>&1 || { tail -20 work/tts.log; exit 1; }
  fi
fi

echo "── trim: edges at -45 dB, inner pauses > 0.30 s cut to 0.16 s, tempo $TEMPO, tail 0.12 s kept"
rm -f assets/vo/vo_*.wav
for f in work/raw/l_*_000.wav; do
  n=$(basename "$f" | sed -E 's/l_([0-9]+)_000.wav/\1/')
  ffmpeg -nostdin -y -v error -i "$f" -af \
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02:stop_periods=-1:stop_duration=0.30:stop_threshold=-45dB:stop_silence=0.16,areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.02,areverse,atempo=$TEMPO,apad=pad_dur=0.12,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono" \
    "assets/vo/vo_${n}.wav"
done

python3 - "$GAP" "$LINES" <<'PY'
import subprocess, pathlib, sys, json
GAP=float(sys.argv[1]); lines=[l.strip() for l in open(sys.argv[2], encoding='utf-8') if l.strip()] if pathlib.Path(sys.argv[2]).exists() else []
vo=sorted(pathlib.Path('assets/vo').glob('vo_*.wav'))
d=[float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(p)],capture_output=True,text=True).stdout) for p in vo]
VO=[[round(x,3), GAP if i<len(d)-1 else 0.0] for i,x in enumerate(d)]
pathlib.Path('assets/vo/vo.js').write_text('window.VO='+json.dumps(VO)+';\nwindow.LINES='+json.dumps(lines,ensure_ascii=False)+';\n', encoding='utf-8')
tot=sum(d)+GAP*(len(d)-1)
print(f'lines {len(d)} · speech {sum(d):.2f} s · with gaps {tot:.2f} s → assets/vo/vo.js')
BAD=[]
for i,(x,l) in enumerate(zip(d,lines+['']*len(d))):
    # цифры читаются словами («27 000» — «двадцать семь тысяч»): ~2 слога на цифру, иначе ложная тревога
    syl=sum(ch in 'aeiouyаеёиоуыэюяәіңғүұқөһ' for ch in l.lower()) + 2*sum(ch.isdigit() for ch in l)
    rate=syl/x if x else 0
    print(f'  {i+1:02d} {x:5.2f}s  {rate:4.1f} syl/s  {l[:60]}')
    # Повтор. Gemini иногда читает реплику дважды подряд; whisper на отдельной реплике склеивает
    # повтор в одну фразу, и verify_vo даёт «совпало 100%». Ловится только темпом: реплика вдвое
    # длиннее своего текста. Найдено 13.09.2026 на rakhat/reel_022, реплика 4 — 9.4 с, 3.1 слога/с.
    if l and rate < 3.4:
        print(f'  ✗ реплика {i+1:02d}: {rate:.1f} слога/с — повтор или дописанное. Удалить work/raw/l_{i+1:02d}_000.wav и перезапустить'); BAD.append(i+1)

# Оторванный хвост. Gemini иногда оставляет после точки щелчок или вздох в
# несколько кадров, отделённый паузой: обратная транскрипция его не видит
# (текст-то верный), а на мастере он звучит обрывом речи. Найдено 12.09.2026
# на vicco/reel_002, реплика 8 — 0.04 с через 0.32 с тишины.
# Речь не режется автоматически, но сборка останавливается: решает человек.
import re
for i,p_ in enumerate(vo):
    out=subprocess.run(['ffmpeg','-nostdin','-v','info','-i',str(p_),'-af',
                        'silencedetect=noise=-45dB:d=0.25','-f','null','-'],
                       capture_output=True,text=True).stderr
    ends=[float(m) for m in re.findall(r'silence_end: ([0-9.]+)', out)]
    if not ends: continue
    tail=d[i]-ends[-1]-0.12          # apad добавляет 0.12 с в конец каждой реплики
    if 0 < tail <= 0.18:
        print(f'  ✗ реплика {i+1:02d}: обрывок {tail:.2f} с после паузы — послушать '
              f'work/raw/l_{i+1:02d}_000.wav и обрезать перед ним (или удалить и перегенерировать), затем tts.sh trim')
        BAD.append(i+1)
# брак останавливает конвейер: предупреждение в логе пропускают (13.09.2026 — обрывок в reel_022 ушёл в мастер)
if BAD:
    print(f'брак озвучки: реплики {sorted(set(BAD))}'); sys.exit(3)
PY
