#!/usr/bin/env python3
"""engine/p1check.py — before a cut goes to Elzhan at P1: the reasons cuts were rejected there, measured.

  python3 engine/p1check.py work/cut/cut16.wav --words work/cut/cut16.words.ru.json [--lang ru|kk] [--min 15] [--max 60]

--words: Scribe JSON ({"words": [{text, start, end}]}), whisper-cli JSON ({"transcription": [{text, offsets}]}) or
assets/vo/words.js (window.WORDS_ALL). Times on the cut16.wav timeline. Exit 1 = do not send yet.

  length     min…max s (podcast cuts 28–50 s, abat ≤ ~60 s)
  head       the first words are not an intro / announcement / reference back («как я говорил», «сегодня мы»,
             «сәлеметсіздер», «алдыңғы») — the hook is the strongest first-person line from second one
  tail word  the last word is a content word, not a connective (abat: «басы бар аяғы жоқ» killed nine P1s)
  tail pitch the last phrase ends FALLING: F0 over the last 0.8 s of speech, a rise above +1 semitone fails
             (a cut that stops on a rising tone sounds unfinished)
  fillers    no «ээ» / «эм» left as words (Elzhan: every «ээ» goes); parasites («типа», «короче», «яғни») listed
cut.py's own review.txt (seams, breaths, filler spots by sound) still applies — this adds what it does not measure.
"""
import json, os, re, subprocess, sys

try:
    import numpy as np, librosa
except ImportError:                                  # librosa lives in the F5 venv: re-run there
    py = os.path.expanduser('~/ai-local/.venv-f5/bin/python')
    if os.path.exists(py) and sys.executable != py: os.execv(py, [py] + sys.argv)
    sys.exit('p1check: needs librosa (~/ai-local/.venv-f5)')

a = sys.argv[1:]
if not a or a[0].startswith('--'): sys.exit(__doc__)
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
WAV, WORDS, LANG, MN, MX = a[0], opt('--words', None), opt('--lang', 'ru'), float(opt('--min', 15)), float(opt('--max', 60))

CONNECT = {'ru': {'и', 'а', 'но', 'что', 'чтобы', 'потому', 'поэтому', 'то', 'вот', 'ну', 'типа', 'короче', 'значит', 'или', 'если', 'когда', 'как', 'в', 'на', 'с', 'к', 'по', 'это'},
           'kk': {'деп', 'және', 'де', 'немесе', 'сондықтан', 'яғни', 'бірақ', 'енді', 'мен', 'менен', 'әрі', 'себебі', 'өйткені', 'сосын', 'ал'}}
INTRO = {'ru': ['как я говорил', 'как я уже', 'в прошлом', 'сегодня мы', 'сегодня я', 'всем привет', 'привет', 'итак', 'давайте начнём', 'в этом видео', 'продолжаем'],
         'kk': ['сәлеметсіздер', 'бүгін біз', 'бүгін мен', 'алдыңғы', 'жалғастырамыз', 'айтқандай', 'баяғы']}
FILL = {'ээ', 'эээ', 'эм', 'ммм', 'мм', 'э'}
PARA = {'ru': {'типа', 'короче', 'как бы', 'собственно', 'вообще-то'}, 'kk': {'яғни', 'енді', 'кәне'}}
key = lambda s: re.sub(r'[^\w-]', '', s.lower().replace('ё', 'е'))

def load_words(p):
    t = open(p, encoding='utf-8').read()
    m = re.search(r'WORDS_ALL\s*=\s*(\[.*?\])\s*;', t, re.S)
    if m: return [(w['w'], w['t0'], w['t1']) for w in json.loads(m.group(1)) if w['w'] != 'cta']
    d = json.loads(t)
    if isinstance(d, dict) and 'words' in d:
        return [(w['text'], w['start'], w['end']) for w in d['words'] if w.get('type', 'word') == 'word' and w['text'].strip()]
    if isinstance(d, dict) and 'transcription' in d:
        return [(s['text'].strip(), s['offsets']['from'] / 1000, s['offsets']['to'] / 1000) for s in d['transcription'] if s['text'].strip()]
    sys.exit(f'p1check: unknown words format {p}')

y, sr = librosa.load(WAV, sr=16000, mono=True)
dur = len(y) / sr
W = load_words(WORDS) if WORDS else []
rows, bad = [], False
def row(name, ok, what):
    global bad
    rows.append(f"  {'ок  ' if ok else 'БРАК'}  {name:10s} {what}"); bad |= not ok

row('length', MN <= dur <= MX, f'{dur:.1f} s (норма {MN:.0f}–{MX:.0f})')
if W:
    head = ' '.join(key(w[0]) for w in W[:6])
    hit = next((p for p in INTRO.get(LANG, []) if head.startswith(p) or f' {p}' in ' ' + head[:40]), None)
    row('head', hit is None, f'«{" ".join(w[0] for w in W[:6])}…»' + (f' — вступление «{hit}»' if hit else ''))
    last = key(W[-1][0])
    row('tail word', last not in CONNECT.get(LANG, set()), f'последнее слово «{W[-1][0]}»' + (' — связка, мысль не закончена' if last in CONNECT.get(LANG, set()) else ''))
    f = [w for w in W if key(w[0]) in FILL]
    row('fillers', not f, 'нет «ээ»' if not f else 'оставлены: ' + ', '.join(f'{w[0]} {w[1]:.2f}' for w in f))
    p = [w for w in W if key(w[0]) in PARA.get(LANG, set())]
    if p: rows.append('  инфо  parasites  ' + ', '.join(f'{w[0]} {w[1]:.2f}' for w in p) + ' — послушать, держит ли фраза без них')
    end = W[-1][2]
else:
    rms = librosa.feature.rms(y=y, hop_length=160)[0]; on = np.flatnonzero(20 * np.log10(rms + 1e-9) > -40)
    end = on[-1] * 0.01 if len(on) else dur
seg = y[int(max(0, end - 0.8) * sr):int(end * sr)]
f0, vf, _ = librosa.pyin(seg, fmin=65, fmax=400, sr=sr, frame_length=1024, hop_length=160)
v = f0[vf] if vf is not None else np.array([])
if len(v) >= 8:
    st = 12 * np.log2(v / np.median(v)); n = len(st)
    rise = float(np.median(st[-max(3, n // 4):]) - np.median(st[:max(3, n // 4)]))
    row('tail pitch', rise <= 1.0, f'{rise:+.1f} полутона за последние 0.8 с' + (' — конец вверх, звучит незаконченным' if rise > 1.0 else ''))
else:
    rows.append('  —     tail pitch не измерен: мало звонких кадров в конце')
print(f'── P1 check · {os.path.basename(WAV)} · {LANG}')
print('\n'.join(rows))
print('── можно отправлять на П1' if not bad else '── не отправлять: сначала перерезать (cut.py build / fix)')
sys.exit(1 if bad else 0)
