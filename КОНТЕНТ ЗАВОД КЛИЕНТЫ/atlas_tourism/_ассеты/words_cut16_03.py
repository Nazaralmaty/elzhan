# words_cut16_03.py — run in a reel folder after `cut.py build`: writes work/cut/cut16.words.kk.json, the cache the seam
# gate (trim_pauses.words) and fillers.py read, by moving the slice's word map (work/cut/scribe_src_1.wav.kk.json) through
# work/cut/edl.txt. Scribe is unavailable since 19.10.2026 (ElevenLabs payment issue), so the map is remapped, not re-read.
# A word survives if its middle lies inside a piece; its edges are clipped to the piece. Then rebuild with the same keeps:
# cut16.wav is identical, sha1 matches, and the gate judges seams by words instead of level only.
import hashlib, json, subprocess

src = json.load(open('work/cut/scribe_src_1.wav.kk.json'))['words']
P = [(float(a), float(b)) for _, a, b in (l.split('\t') for l in open('work/cut/edl.txt') if l.strip())]
W, acc = [], 0.0
for s, e in P:
    for w in src:
        if w.get('type') != 'word': continue
        m = (w['start'] + w['end']) / 2
        if s <= m < e:
            W.append({'text': w['text'], 'type': 'word',
                      'start': round(acc + max(w['start'], s) - s, 3), 'end': round(acc + min(w['end'], e) - s, 3)})
    acc += e - s
wav = 'work/cut/cut16.wav'
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav],
                           capture_output=True, text=True).stdout)
json.dump({'language_code': 'kaz', 'words': W, 'audio_duration_secs': round(dur, 3),
           'audio_sha1': hashlib.sha1(open(wav, 'rb').read()).hexdigest(),
           'note': 'remapped from the episode whisper map through edl.txt, not re-read'},
          open('work/cut/cut16.words.kk.json', 'w'), ensure_ascii=False)
print(f'{len(W)} words, track {dur:.2f} s, pieces sum {acc:.2f} s')
