#!/bin/bash
# Облачная замена prep_take_02.py / cam.sh --no-matte для этого рилса (Linux: macOS Vision нет).
# Запуск из папки рилса: bash work/prep_take_cloud.sh
# Пишет work/fr/f_%04d.jpg (кроп 9:16 по плану, таблица work/plans_take.txt: начало конец план кроп-x),
# 5.5 с тёмного хвоста под аутро, assets/vo/voice.wav, work/plate.json|js, assets/vo/words.js (+ токен cta).
set -eu
TAIL=5.5; FPS=30
rm -rf work/fr && mkdir -p work/fr assets/vo
expr=$(awk '!/^#/{printf "if(between(t,%s,%s),%s,", $1, $2, $4; n++} END{printf "656"; for(i=0;i<n;i++) printf ")"}' work/plans_take.txt)
ffmpeg -nostdin -v error -y -i work/cut.mp4 -vf "crop=608:1080:'$expr':0,scale=1080:1920:flags=lanczos" -q:v 2 -start_number 1 work/fr/f_%04d.jpg
N=$(ls work/fr | wc -l); T=$(python3 -c "print(round($TAIL*$FPS))")
ffmpeg -nostdin -v error -y -f lavfi -i color=c=0x0A0D10:s=1080x1920:r=$FPS -frames:v $T -q:v 2 -start_number $((N+1)) work/fr/f_%04d.jpg
NT=$((N+T)); DUR=$(python3 -c "print(round($NT/$FPS,3))")
ffmpeg -nostdin -v error -y -i work/cut.mp4 -vn -ar 48000 -ac 1 -af apad=whole_dur=$DUR -t $DUR assets/vo/voice.wav
ffmpeg -nostdin -v error -y -i assets/vo/voice.wav -ar 16000 work/voice16.wav
python3 - "$NT" "$DUR" "$N" <<'PY'
import json, sys
NT, DUR, N = int(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3])
pj = {'frames': NT, 'fps': 30, 'dur': DUR, 'src': 'work/take.mov', 'from': 0, 'matte': False}
json.dump(pj, open('work/plate.json', 'w')); open('work/plate.js', 'w').write('window.PLATE=' + json.dumps(pj) + ';\n')
W = json.load(open('work/cut/cut16.words.kk.json'))['words']
out = [{'w': w['text'], 't0': w['start'], 't1': w['end']} for w in W if w.get('type') == 'word']
end = N / 30; out.append({'w': 'cta', 't0': round(end + 0.5, 3), 't1': round(DUR, 3)})   # клиент: 0.5 с тишины перед аутро
open('assets/vo/words.js', 'w').write('window.WORDS_ALL=' + json.dumps(out, ensure_ascii=False) + ';\n')
print(f'{NT} кадров, {DUR} с (речь {N/30:.2f} + хвост), {len(out)} слов')
PY
