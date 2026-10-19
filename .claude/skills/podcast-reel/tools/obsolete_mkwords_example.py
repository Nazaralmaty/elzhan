# -*- coding: utf-8 -*-
"""Word track for the cut — text corrected by hand, times MEASURED, segment by segment.

   Neither source is right alone:
   • whisper on the whole cut (work/words.json) is used only where its token count matches the
     real reading one for one (its first token of a window is pinned to the window start: on the
     first take it put «Ағамыз» 1.3 s before the man speaks);
   • an energy map of the cut (islands above −47 dB) covers what whisper dropped or merged — it
     lost «Пайғамбарымыздың қабірі мен мінберінің арасы» entirely and ran 2.5 s early after it.
"""
import json, subprocess
import numpy as np

SRC, TAIL = 'work/cut_speech.mp4', 3.7
WJ = [(x['offsets']['from'] / 1000, x['text'].strip())
      for x in json.load(open('work/words.json')).get('transcription', []) if x['text'].strip()]

# ('w', a, b, skip, text)  — whisper tokens a…b-1, minus `skip` indices
# ('i', t0, t1, groups)    — spread over the sound islands inside [t0, t1], one group per phrase
SEG = [
 ('w', 0, 23, (), "Ағамыз бен келіншегі анасын жаңағы әкелгенде енді күштеп әкелген шыны керек "
                  "күштеп әкелген. Ана кісі орысша өскен жаңағы өзі мұғалім бірдеңе мүлдем түсінбейді."),
 ('w', 24, 29, (), "Содан бірінші Мәдинадан басталып сапарымыз."),
 ('w', 29, 37, (), "Содан Алла нәсіп етіп Раудаға кіргіздік Рауданы білесіздер"),
 ('i', 17.80, 20.10, ["Пайғамбарымыздың", "қабірі мен", "мінберінің арасы."]),
 ('i', 20.30, 25.30, ["Раудаға кіргеннен кейін", "апам шықты", "Мен мұнда жақта", "күтіп тұрмын."]),
 ('w', 48, 57, (), "Кірген кездегі апа басқа шыққаннан кейінгі апа басқа ғой."),
 ('w', 57, 80, (), "Жылап Қағбаға барған кезде жылап кәдімгідей рақаттанып құлшылық қылып. "
                   "Алла Тағала Мәдинадағы Рауданың өзінде жүрегін ашып қойып отырғанда "
                   "Қағбаның алдында жүрек ашылады екен."),
 ('w', 80, 104, (85,), "Сен бәлкім үлкен күнәһар боларсың. Бірақ сонда да қандай күнәһар болсаң да "
                       "қандай күнәң болса да ұмытпағанымыз керек Алланың мейірімі одан әрдайым жоғары."),
]
# «сол үшін … жәннат» whisper застрял: девять слов на одном тайм-коде 52.54 — этот кусок руками
K7 = [(50.84, 'Шексіз.'), (51.11, 'Алланың'), (51.45, 'мейірімінде'), (52.00, 'шек жоқ.'),
      (52.38, 'Сол'), (52.58, 'үшін'), (52.78, 'дейміз'), (52.98, 'қажылықтың'), (53.32, 'сауабы'),
      (53.75, 'жәннат'), (54.15, 'умраның'), (54.71, 'сауабы'), (55.14, 'жәннат'), (55.45, 'деп'),
      (55.72, 'отырғанның'), (56.16, 'хикметі'), (56.74, 'сол.')]

raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', SRC, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                     capture_output=True).stdout
a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
W = 320; k = len(a) // W
db = 20 * np.log10(np.maximum(np.sqrt((a[:k * W].reshape(k, W) ** 2).mean(axis=1)), 1e-7))
idx = np.where(db > -47.0)[0]
isl = []
for i in idx:
    if isl and i - isl[-1][1] <= 7: isl[-1][1] = i
    else: isl.append([i, i])
ISL = [(s * .02, (e + 1) * .02) for s, e in isl if (e - s + 1) * .02 >= .10]
DUR = k * .02

out = []
for s in SEG:
    if s[0] == 'w':
        _, a0, b0, skip, txt = s
        ts = [t for i, (t, _) in enumerate(WJ[a0:b0], start=a0) if i not in skip]
        ws = txt.split()
        assert len(ts) == len(ws), f'{a0}-{b0}: {len(ts)} times vs {len(ws)} words'
        out += list(zip(ws, ts))
    else:
        _, t0, t1, groups = s
        mine = [(x, y) for x, y in ISL if x >= t0 - .05 and y <= t1 + .05] or [(t0, t1)]
        # islands split between the phrases by their letter weight
        gw = [sum(len(w) + 1 for w in g.split()) for g in groups]; tot = sum(gw); acc = 0
        T = sum(y - x for x, y in mine)
        bounds = []
        for q in gw:
            bounds.append((acc, acc + T * q / tot)); acc += T * q / tot
        def at(x):
            r = x
            for p, q in mine:
                if r <= q - p: return p + r
                r -= q - p
            return mine[-1][1]
        for g, (b0, b1) in zip(groups, bounds):
            ws = g.split(); wt = [len(w) + 1 for w in ws]; s2 = sum(wt); pos = b0
            for w, q in zip(ws, wt):
                out.append((w, round(at(pos), 3))); pos += (b1 - b0) * q / s2

out += [(w, t) for t, w in K7]
out += [('cta', DUR + .55), ('cta2', DUR + 1.85), ('cta3', DUR + 3.05)]

res = []
for i, (w, t) in enumerate(out):
    nxt = out[i + 1][1] if i + 1 < len(out) else DUR
    res.append({'w': w, 't0': round(t, 3), 't1': round(min(max(nxt, t + .14), t + .8), 3)})
open('assets/vo/words.js', 'w', encoding='utf-8').write(
    'window.WORDS_ALL=' + json.dumps(res, ensure_ascii=False) + ';\n')
print(f'{len(res)} words · speech {DUR:.2f} s · reel {DUR + TAIL:.2f} s')
for x in res: print(f"{x['t0']:6.2f} {x['t1']:6.2f}  {x['w']}")
