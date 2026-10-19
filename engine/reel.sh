#!/bin/bash
# engine/reel.sh <stage> — one command per stage, run from the reel folder. Short output, details in work/reel_<stage>.log.
#
# Why (11.10.2026, 194 reels measured): 98 % of tokens are the context re-read on every turn (~300k per turn),
# so cost = number of turns. A first master used to take 5–8 turns of render / build / gates / reading logs and
# 6 builds on average; one command per stage and a 20-line answer cut that, without dropping a check.
#
#   brief    what the factory learned about this client (engine/learn/feedback.py) + the client preset — read first
#   sheet    contact sheet renders/sheet.jpg (12 frames) — goes to Elzhan within 20 minutes, read it once
#   master   full render → build.sh → QA fast: out/reel.mp4 for Elzhan; prints gates + НЕ ПРОВЕРЕНО
#   final    QA=final gates on the existing master, before delivery to the client
#   learn    <stage> <kind> "<his words>" [t] [fix] — log one point of Elzhan's verdict (cut / master / final / client)
set -u
E="$(cd "$(dirname "$0")" && pwd)"
STAGE=${1:?brief|sheet|master|final|learn}; shift || true
REEL=$(pwd); CLIENT=$(basename "$(dirname "$REEL")"); NAME=$(basename "$REEL")
mkdir -p work
log() { echo "work/reel_$STAGE.log"; }
tailsum() { grep -E '^── |^  (ок|БРАК|—) |НЕ ПРОВЕРЕНО|error|Error' "$(log)" | grep -vE '^── ([0-9]\.|length )' | tail -25; }

case "$STAGE" in
  brief)
    python3 "$E/learn/feedback.py" brief --client "$CLIENT"
    P="../_ассеты/client.json"; [ -f "$P" ] && echo "preset: $P" || echo "preset: none (../_ассеты/client.json) — facts only in ../CLAUDE.md"
    ;;
  sheet)
    [ -f spec.js ] || { echo "reel.sh: run from the reel folder"; exit 2; }
    node "$E/render.js" --sheet "${1:-12}" > "$(log)" 2>&1 && echo "renders/sheet.jpg" || { tail -15 "$(log)"; exit 1; }
    ;;
  master)
    [ -f spec.js ] || { echo "reel.sh: run from the reel folder"; exit 2; }
    t0=$(date +%s)
    { caffeinate -i node "$E/render.js" --workers "${WORKERS:-7}" && caffeinate -i bash "$E/build.sh"; } > "$(log)" 2>&1
    rc=$?
    tailsum
    [ -f out/reel.mp4 ] && echo "── out/reel.mp4 · $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/reel.mp4 | cut -c1-5) s · $(( $(date +%s) - t0 )) s на рендер и сборку"
    [ $rc = 0 ] || echo "── код $rc, полный лог: $(log)"
    exit $rc
    ;;
  final)
    bash "$E/qa/all.sh" --final > "$(log)" 2>&1; rc=$?; tailsum; exit $rc
    ;;
  learn)
    st=${1:?stage}; kind=${2:?kind}; quote=${3:?quote}
    python3 "$E/learn/feedback.py" add --client "$CLIENT" --reel "$NAME" --stage "$st" --kind "$kind" --quote "$quote" \
      ${4:+--t "$4"} ${5:+--fix "$5"}
    ;;
  *) echo "reel.sh: unknown stage $STAGE"; exit 2 ;;
esac
