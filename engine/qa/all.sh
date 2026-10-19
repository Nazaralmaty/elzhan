#!/bin/bash
# engine/qa/all.sh [--final] — every gate that applies to this reel, in one run. Run from the reel folder.
# build.sh calls it as its last step; exit ≠ 0 if any gate failed, and out/reel.FAILED.txt says which.
#
# Why it exists (23.09.2026): the gates were there and nobody ran them — build.sh called none, the genre
# skills listed different subsets, and ~10 masters went to Elzhan with a gate that would have caught the
# defect never started (icon/reel_038 top edge, abat/reel_019 ink, fragrancia/reel_036 edges).
#
# Two tiers (11.10.2026). Logs of 27 reels: gates take 10–35 s, time is lost in loops of red builds, and red
# had become normal (ElevenLabs Scribe at 0 credits failed every master) — so nobody looked at it. Elzhan
# watches the first master himself; his verdict replaces the taste checks there.
#   QA=fast  (default)  first master: red only on real, cheap, frequent defects
#     master   qa/master.py light — first sound, track lengths/frames, density · 4 s windows · hole > 3 s,
#              reading time, tail ≥ 0.3 s; loudness read from work/loudness.json (build.sh 5b measured it);
#              pauses/seams/fillers skipped when work/cut/approved.sha matches work/cut.mp4 (heard at П1)
#     paint    qa/paint.py (half-painted frames)
#     overlap  qa/overlap.js, + rows   qa/rows.js on canvas / speaker-canvas — skipped when the sha1 of
#              spec.js + index.html + work/els.json + the gate script equals work/qa_<gate>.ok (last pass)
#     source   qa/source.py on out/reel.mp4 only (cam.sh already checked the input)
#     slop     voiced script.txt through no-ai-slop lint.py
#     gesture  qa/gesture.js on footage — every pointing / open-palm span of qa/gestures.json (engine/gesture.py) gets a new
#              element in its direction
#     notext   qa/notext.py — picture events/min without text ≥ reel.json "notext" (only when the key is set)
#   QA=final  (engine/qa/all.sh --final, or QA=final engine/build.sh)  before delivery to the client:
#     all of fast without hash skips, master.py full (loudness re-measured, speech gates always),
#     + music (beat.py check; --grid on canvas genres), + musicsync (qa/musicsync.py: cuts on the beat,
#     strongest hits answered), + ink (motion, window.PAPER),
#     + speaker (qa/speaker.js incl. chiron with --frames) on genre speaker
# A gate line that prints `НЕ ПРОВЕРЕНО: <what> — <reason>` (a tool that cannot run: no credits, no venv, no key)
# is not red; such lines go under the table and into out/reel.UNCHECKED.txt for the delivery note.
# Red = a measured defect only. One table line per gate; details in work/qa_<name>.log.
# qa/overlaycheck.py is not here: it guards ffmpeg overlays of PNG sequences (make.py pipelines);
# the engine renders the footage inside the page, so there is nothing to overlay.
E="$(cd "$(dirname "$0")/.." && pwd)"
[ -f spec.js ] || { echo "qa/all.sh: run from the reel folder (spec.js not found)"; exit 2; }
QA=${QA:-fast}; [ "${1:-}" = --final ] && QA=final; [ "$QA" = final ] || QA=fast; export QA
G=$( { grep "mount" spec.js | grep -o "genre/[a-z-]*\.js"; grep -o "genre/[a-z-]*\.js" spec.js; } | head -1 | sed 's#genre/##; s#\.js##')   # the genre is the module `mount` comes from — a helper (genre/wall.js) never is
[ $QA = final ] && echo "── gates · genre ${G:-?} · QA final (сдача клиенту)" || echo "── gates · genre ${G:-?} · QA fast (первый мастер)"

RES=(); FAILED=(); UNCH=()
mkdir -p work
run() {   # run <name> <cmd…>: output goes to work/qa_<name>.log, a verdict line to the table
  local name=$1; shift
  if "$@" > "work/qa_$name.log" 2>&1; then RES+=("  ок    $name"); else RES+=("  БРАК  $name   → work/qa_$name.log"); FAILED+=("$name"); fi
  while IFS= read -r l; do UNCH+=("$name: ${l#НЕ ПРОВЕРЕНО: }"); done < <(grep '^НЕ ПРОВЕРЕНО:' "work/qa_$name.log")
}
unchecked() { RES+=("  —     $1   НЕ ПРОВЕРЕНО"); UNCH+=("$1: $2"); }
# fast: a layout gate that passed on the same spec + page + element timings is not rerun
hashed() {   # hashed <name> <gate file> <cmd…>
  local name=$1 gate=$2; shift 2
  local h; h=$(cat spec.js index.html work/els.json "$gate" 2>/dev/null | shasum | cut -d' ' -f1)
  if [ $QA = fast ] && [ "$(cat "work/qa_$name.ok" 2>/dev/null)" = "$h" ]; then RES+=("  ок    $name   (тот же хэш, не перезапускался)"); return; fi
  local n=${#FAILED[@]}; run "$name" "$@"
  if [ ${#FAILED[@]} = "$n" ]; then echo "$h" > "work/qa_$name.ok"; else rm -f "work/qa_$name.ok"; fi
}

if [ -f out/reel.mp4 ]; then
  run master /usr/local/bin/python3 "$E/qa/master.py"
  grep -q 'принята на П1' work/qa_master.log && RES[${#RES[@]}-1]+="   речь: принята на П1, не перепроверяется"
  # frames shot before Chrome finished painting them (half-black frame, atlas/reel_049 07.10.2026)
  run paint /usr/local/bin/python3 "$E/qa/paint.py"
  # master format: HDR left untonemapped, a rotation tag, not a 1080×1920 master (the input was checked by cam.sh)
  run source /usr/local/bin/python3 "$E/qa/source.py" out/reel.mp4
  # sound effects are mandatory in every reel: count, longest silence, level against the voice
  run sfx /usr/local/bin/python3 "$E/qa/sfx.py"
else RES+=("  —     master (нет out/reel.mp4)"); fi
hashed overlap "$E/qa/overlap.js" node "$E/qa/overlap.js"
case "$G" in canvas|speaker-canvas) hashed rows "$E/qa/rows.js" node "$E/qa/rows.js" ;; esac
# the montage answers the speaker's gesture: where she points or offers a palm, a new element lands (eto/reel_001_uip, 15.10.2026)
if [ -d work/fr ] && [ -f qa/face.json ]; then
  [ -f qa/gestures.json ] || python3.13 "$E/gesture.py" work/fr >/dev/null 2>&1
  hashed gesture "$E/qa/gesture.js" node "$E/qa/gesture.js"
fi
# picture events without text (podcast reels, "notext" in reel.json): a reel of plates and subtitles is poor visual
grep -q '"notext"' reel.json 2>/dev/null && [ -f out/reel.mp4 ] && run notext /usr/local/bin/python3 "$E/qa/notext.py"
# a voiced script we wrote goes through the no-ai-slop stop-list; a client's own text: "slop": "skip" in reel.json
if [ -f script.txt ] && [ -f assets/vo/vo.js ] && ! grep -q '"slop": *"skip"' reel.json 2>/dev/null; then
  run slop python3 "$HOME/.claude/skills/no-ai-slop/lint.py" script.txt
fi

if [ $QA = final ]; then
  # music: the same track as a neighbour reel is a defect; on a canvas genre the world changes sit on the beat (engine/beat.py)
  if /usr/local/bin/python3 -c "import json,sys; d=json.load(open('reel.json')); sys.exit(0 if d.get('music') or d.get('bgm') else 1)" 2>/dev/null; then
    F5="$HOME/ai-local/.venv-f5/bin/python"
    case "$G" in canvas|speaker-canvas)
      if [ -x "$F5" ]; then run music "$F5" "$E/beat.py" check --grid; else unchecked music "нет $F5 для beat.py --grid"; fi ;;
      *) run music /usr/local/bin/python3 "$E/beat.py" check ;; esac
    # the picture is cut to the music as to the voice: picture events on the beat grid, the strongest hits answered
    if [ -x "$F5" ]; then run musicsync "$F5" "$E/qa/musicsync.py"; else unchecked musicsync "нет $F5 (librosa)"; fi
  fi
  case "$G" in
    motion) run ink node "$E/qa/ink.js" ;;
    speaker) if [ -d renders/frames ]; then run speaker node "$E/qa/speaker.js" --frames renders/frames; else run speaker node "$E/qa/speaker.js"; fi ;;
  esac
fi

printf '%s\n' "${RES[@]}"
rm -f out/reel.FAILED.txt out/reel.UNCHECKED.txt
if [ ${#UNCH[@]} -gt 0 ]; then
  mkdir -p out
  printf '  НЕ ПРОВЕРЕНО: %s\n' "${UNCH[@]}"
  { echo "Не проверено в мастере (QA $QA, $(date '+%d.%m.%Y %H:%M')) — инструмент не смог запуститься, это не брак:"; printf -- '- %s\n' "${UNCH[@]}"; } > out/reel.UNCHECKED.txt
fi
if [ ${#FAILED[@]} -gt 0 ]; then
  mkdir -p out
  { echo "Мастер НЕ прошёл гейты (QA $QA) $(date '+%d.%m.%Y %H:%M'): ${FAILED[*]}"; for n in "${FAILED[@]}"; do echo; echo "── $n"; tail -25 "work/qa_$n.log"; done; } > out/reel.FAILED.txt
  echo "── БРАК: ${FAILED[*]} — не сдаётся, разбор в out/reel.FAILED.txt"
  exit 1
fi
[ $QA = final ] && echo "── все гейты чисты · можно сдавать клиенту" \
                || echo "── fast чисто · перед сдачей клиенту: engine/qa/all.sh --final"
