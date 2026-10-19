#!/bin/zsh
# gate_recut.sh REEL OFFSET a:b | '=s:e' … — episode ranges → edges → every filler cut → build →
# pause + filler check on the assembled track. REEL is a folder under atlas_tourism (podcast №2 layout).
R=$1; OFF=$2; shift 2
T=~/.claude/skills/podcast-reel/tools; PY=/usr/local/bin/python3
cd "/Users/elzhanmakhsot/Documents/Obsidian Vault/КОНТЕНТ ЗАВОД КЛИЕНТЫ/atlas_tourism/$R"
K=$($PY $T/gate_edges.py $OFF "$@")
KS=(${=${K//--keep src_1:/}})
FK=$($PY $T/gate_fillers.py --all $KS)
SIL=$(echo $FK | grep -o 'src_1:[0-9.]*:[0-9.]*' | awk -F: '{if($3-$2<0.5){print $2; exit}}')
[ -z "$SIL" ] && SIL=$($PY -c "print(open('work/cut/silence_1.txt').readline().split()[0])")
FK="--keep src_1:$SIL:$(echo "$SIL+0.12"|bc) $FK"
echo "$FK" > work/keeps_final.txt
python3 engine/cut.py build --lang kk --limit 0.44 --opening 0.12 --fade 0.02 ${=FK} 2>&1 | grep -E "^work"
ffmpeg -nostdin -y -v error -i work/cut.mp4 -vn -ar 48000 -ac 1 out/обрезка.wav
$PY $T/islands.py work/cut/cut16.wav --db -60 --silence /tmp/x_$R.txt >/dev/null; echo "pauses>0.50: $(awk '$3>0.50' /tmp/x_$R.txt | tr '\n' ' ')"
~/ai-local/.venv-f5/bin/python ~/.claude/engine/cut/fillers.py work/cut/cut16.wav --lang kk --words work/cut/cut16.words.kk.json 2>/dev/null > work/cut/fillers_track.txt
$PY - <<'PY'
P=[(float(a),float(b)) for _,a,b in (l.split('\t') for l in open('work/cut/edl.txt') if l.strip())]
for l in open('work/cut/fillers_track.txt'):
    if ' FILLER ' not in l and not (' UNCLEAR ' in l and 'похоже на филлер' in l): continue
    t=float(l.split()[0]); acc=0
    for s,e in P:
        if acc+e-s>t: print(f'LEFT track {l.strip()[:70]}  → src {s+t-acc:.2f}'); break
        acc+=e-s
PY
