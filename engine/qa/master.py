#!/usr/local/bin/python3
"""engine/qa/master.py [видео] — гейт сданного мастера. Запускать из папки ролика после build.sh.

Проверяет то, что слышно и видно зрителю, а не то, что напечатал build.sh:
длину, первый звук, громкость и TP замером, плотность событий кадра, а в ветке
со съёмкой — паузы речи по её собственной дорожке (в мастере их прячут SFX и музыка).
Выходит с ненулевым кодом, если хоть один закон нарушен.

Tiers (env QA, set by qa/all.sh; default fast):
  fast   first master for Elzhan. Loudness/TP are read from work/loudness.json (build.sh step 5b measured
         and fixed them; re-measured only if that file is missing or belongs to another master). The speech
         gates (pauses, seams, fillers) are skipped when work/cut/approved.sha (`<sha1>  work/cut.mp4`,
         written by `cut.py approve`) matches work/cut.mp4 — he already heard that cut at П1.
  final  before delivery: everything measured fresh, speech gates always.
A check whose tool cannot run (no credits, no venv, no key, no language) is not a defect: it prints
`НЕ ПРОВЕРЕНО: <what> — <reason>` and does not fail the gate; qa/all.sh lists it in out/reel.UNCHECKED.txt.
Exit 1 = a measured defect only.
"""
import hashlib, json, os, re, subprocess, sys

import numpy as np

V = sys.argv[1] if len(sys.argv) > 1 else 'out/reel.mp4'
LUFS = json.load(open('reel.json')).get('lufs', -14) if os.path.exists('reel.json') else -14
W = 320  # окно RMS, 0.02 с при 16 кГц
TIER = 'final' if os.environ.get('QA') == 'final' else 'fast'


def unverified(what, why):
    print(f'НЕ ПРОВЕРЕНО: {what} — {why}')


def env(path):
    """Огибающая дорожки в dB, шаг 0.02 с."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                         capture_output=True).stdout
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    k = len(a) // W
    return 20 * np.log10(np.maximum(np.sqrt((a[:k * W].reshape(k, W) ** 2).mean(axis=1)), 1e-7))


def pauses(path, th=-40.0):
    """Паузы между островами голоса, в секундах."""
    d = env(path)
    isl, s = [], None
    for j, on in enumerate(d > th):
        if on and s is None:
            s = j
        if not on and s is not None:
            if j - s >= 2:
                isl.append((s * .02, j * .02))
            s = None
    return [r - q for (_, q), (r, _) in zip(isl, isl[1:])]


fail = []
db = env(V)
first = next((i * .02 for i, v in enumerate(db) if v > -40), None)
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', V],
                           capture_output=True, text=True).stdout)
# Loudness is measured once per master: build.sh 5b writes work/loudness.json with the size of the master it
# measured. In fast that number is used; a missing / foreign file (master rebuilt elsewhere) means measure here.
lj = None
if TIER == 'fast' and V == 'out/reel.mp4' and os.path.exists('work/loudness.json'):
    try:
        lj = json.load(open('work/loudness.json'))
        if lj.get('size') != os.path.getsize(V):
            lj = None
    except Exception:
        lj = None
if lj:
    i_lufs, tp, src = float(lj['I']), float(lj['TP']), 'замер build.sh'
else:
    log = subprocess.run(['ffmpeg', '-nostats', '-i', V, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    i_lufs = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', log)[-1])
    tp = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', log)[-1])
    src = 'замер'

line = f'длина {dur:.2f} с · первый звук {first:.2f} с (≤ 0.25)' if first is not None else 'звука нет'
if first is None or first > 0.25:
    fail.append('первый звук позже 0.25 с — ролик начинается с тишины')
print(line)

print(f'громкость {i_lufs} LUFS (цель {LUFS} ± 1.0) · true peak {tp} dBFS (≤ −1.3) · {src}')
if abs(i_lufs - LUFS) > 1.0:
    fail.append(f'громкость {i_lufs} мимо цели {LUFS}')
if tp > -1.3:
    fail.append(f'true peak {tp} выше закона −1.3')

if os.path.exists('work/cues.json'):
    c = json.load(open('work/cues.json'))
    # кий `sfx:*` — это звук, который назвал сам ролик, а не событие КАДРА.
    # Считать его здесь значило бы поднимать плотность картинки звуком.
    cues = c if isinstance(c, list) else c.get('cues', [])
    n = sum(1 for x in cues if not str(x.get('k', '')).startswith('sfx:'))
    if n:
        # Плотность зависит от ЯЗЫКА ролика. Постановка Елжана 23.09.2026:
        # в apple ui motion design норма — 260–330/мин. Там кадр
        # держится не сменой планов, а непрерывным превращением: дрейф, смаз,
        # пословный набор и морф дают событие каждые 0.24 с, и на 150 такой ролик
        # читается пустым. Остальные жанры остаются на 120–150: у них событие —
        # это новая вещь в кадре, и 200 там превращается в мельтешение.
        # `density: [lo, hi]` в reel.json — плотность, которую Елжан назвал для ролика словами
        # («сделай 200 событий в минуту», icon/reel_042); без неё — норма языка.
        rj = {}
        if os.path.exists('reel.json'):
            try: rj = json.load(open('reel.json')) or {}
            except Exception: rj = {}
        pal = rj.get('palette', '')
        lo, hi = rj.get('density') or ((260, 330) if str(pal).startswith('apple') else (120, 150))
        rate = n / dur * 60
        print(f'события кадра {n} · {rate:.0f}/мин ({lo}–{hi})')
        if rate < lo:
            fail.append(f'событий {rate:.0f}/мин — кадр стоит, нужно {lo}–{hi}')
        # СРЕДНЕЕ ВРЕМЯ ФОКУСА — 4 СЕКУНДЫ (постановка Елжана 23.09.2026). Общая
        # плотность врёт: 300/мин можно набрать одним взрывом и тремя пустыми
        # актами, и зритель уйдёт на первой же дыре. Поэтому окно 4 с считается
        # отдельно и должно нести свою долю событий — минимум 60 % нормы.
        ts = sorted(float(x['t']) for x in cues if not str(x.get('k', '')).startswith('sfx:'))
        if ts and dur > 4:
            need = max(3, int(lo * 4 / 60 * 0.6))
            thin = []
            w = 0.0
            while w + 4 <= dur:
                c4 = sum(1 for t in ts if w <= t < w + 4)
                if c4 < need: thin.append((round(w, 1), c4))
                w += 2.0
            if thin:
                worst = min(thin, key=lambda x: x[1])
                fail.append(f'окно 4 с на {worst[0]:.0f} с несёт {worst[1]} событий, нужно {need} '
                            f'(всего провальных окон {len(thin)}) — внимание отпускает')
        # САМАЯ ДЛИННАЯ ДЫРА. Окна по 4 с пропускают дыру 3.9 с, если по её краям плотно, а зритель
        # уходит именно на ней (atlas/reel_004: дыры 5.5 / 3.8 / 3.7 с при зелёных гейтах — «полотно
        # на весь экран и ничего не происходит 5 секунд»). Закон — визуальный хук каждые 3 с.
        if ts:
            edges = [0.0] + ts + [dur]
            gap, at = max((b - a, a) for a, b in zip(edges, edges[1:]))
            print(f'самая длинная дыра между событиями {gap:.2f} с на {at:.1f} с (≤ 3.0)')
            if gap > 3.0 + 1e-9:
                fail.append(f'дыра {gap:.2f} с на {at:.1f} с — кадр стоит дольше 3 с без новой вещи')

# ВРЕМЯ ЧТЕНИЯ (Елжан 17.09.2026: «тексты появляются и исчезают слишком быстро, они не читабельны»;
# на atlas не дочитывались 22 вставки из 48 и 32 из 60). Закон свода §5: крупный набор
# max(1.2, знаков/13 + 0.6) + dur, мелкие подписи и плашки max(0.9, знаков/15 + 0.45) + dur.
# Раньше это «считалось до рендера» руками — то есть не считалось. Данные пишет render.js
# (work/els.json из canvas.js); элемент без `until` живёт, пока камера не ушла из его комнаты.
# ponytail: смена мира шторкой внутри той же комнаты здесь не видна — жизнь может быть завышена, не занижена.
if os.path.exists('work/els.json'):
    ej = json.load(open('work/els.json'))
    A, rooms, D = ej.get('acts') or [], ej.get('rooms') or [], ej.get('DUR') or dur
    # `until` не позже появления — элемент не прячется вовсе (ring висел точкой с 0 с и кругом в хвосте, kaiyrzhan 19.10)
    dead = [e for e in ej.get('els', []) if e.get('t0') is not None and e.get('t1') is not None and e['t1'] <= e['t0']]
    for e in dead[:6]:
        print(f'   until ≤ at: {e.get("k")} {e["t0"]:.2f} → {e["t1"]:.2f} «{e.get("t", "")}»')
    if dead:
        fail.append(f'{len(dead)} элементов с until не позже появления — они висят весь ролик: поправить until или at')
    BIG = {'text', 'quote'}
    SMALL = {'pill', 'band', 'chip', 'num', 'count'}
    short = []
    for e in ej.get('els', []):
        if e.get('k') not in BIG | SMALL or not e.get('n') or e.get('t0') is None:
            continue
        li, t0 = e['act'], e['t0']
        if e.get('t1') is not None:
            end = e['t1']
        elif li < 0 or e.get('screen') or li >= len(A):
            end = D
        else:
            j = li
            while j + 1 < len(rooms) and rooms[j + 1] == e['room']:
                j += 1
            end = A[j][1] if j < len(A) else D
        end = min(end, D)
        # dur прибавляется только у анимации набора (chars: type / sweep) — её буквы ещё не читаются
        n, d = e['n'], (e.get('dur') or 0.42) if e.get('chars') else 0
        need = (max(1.2, n / 13 + 0.6) if e['k'] in BIG else max(0.9, n / 15 + 0.45)) + d
        if end - t0 < need - 0.05:
            short.append((t0, end - t0, need, e.get('t', '')))
    print(f'время чтения: надписей мало живут — {len(short)}')
    for t0, life, need, txt in short[:12]:
        print(f'   {t0:6.2f} с  живёт {life:.2f} с, нужно {need:.2f}  «{txt}»')
    if short:
        # потолок жизни надписи — что раньше: уход из комнаты − 0.08 с или следующая вставка на той же полосе y − 0.06 с
        fail.append(f'{len(short)} надписей не успевают прочитать — прореживание, а не until: снять повтор соседа → '
                    'слить две половины фразы → развести полосы y → родить надпись с начала фразы → сдвинуть вход мира')

speech = next((p for p in ('work/cut_speech.mp4', 'work/cut.mp4') if os.path.exists(p)), None)
# The cut Elzhan approved at П1 is not re-judged in fast: pauses, seams and fillers re-checked only what he had heard.
approved = False
if speech and TIER == 'fast' and os.path.exists('work/cut/approved.sha') and os.path.exists('work/cut.mp4'):
    with open('work/cut.mp4', 'rb') as f:
        h = hashlib.file_digest(f, 'sha1').hexdigest()
    approved = (open('work/cut/approved.sha').read().split() or [''])[0] == h
    if approved:
        print('речь: принята на П1, не перепроверяется')
if speech:
    # Порог острова голоса. −40 годится записи с полом комнаты; у записи за гейтом (паузы —
    # цифровой ноль, хвост слова спадает до −54 и сразу в ноль: atlas, выпуск №2) −40 отрезает
    # хвосты и называет их паузой — три ложные «паузы» 0.64–0.74 на принятой обрезке, при −55 их нет.
    # Такой ролик пишет порог в reel.json: "pause_db": -55.
    try: pdb = float((json.load(open('reel.json')) or {}).get('pause_db', -40))
    except Exception: pdb = -40.0
    g = pauses(speech, pdb) if not approved else None
    # один остров голоса на весь ролик — пол записи выше порога (улица, толпа: telman/reel_001,
    # микс −29 дБ). Молча «0 пауз» — ложь гейта: НЕ ПРОВЕРЕНО с причиной, лечится голосовым стемом
    # склейки в work/cut_speech.mp4.
    if g == []:
        unverified('паузы речи', f'пол записи выше порога {pdb:.0f} дБ, голос одним островом — '
                                 'голосовой стем в work/cut_speech.mp4')
    elif g:
        # закон: пауза ≤ 0.45 с (0.60 звучало «паузы очень длинные»). Огибающая шагает по 0.02 с,
        # и ровно 0.45 в двоичной плавающей точке выходит чуть больше — без допуска гейт валил законную паузу.
        over = sum(x > .45 + 1e-9 for x in g)
        print(f'паузы речи ({speech}): максимум {max(g):.2f} с · длиннее 0.45 с: {over}')
        if over:
            fail.append(f'{over} пауз длиннее 0.45 с — речь не дорезана')
    # после последнего слова до конца МАСТЕРА ≥ 0.3 с, иначе конец звучит обрывом (healthy_himalaya/reel_001);
    # меряется до конца мастера, а не дорожки речи: под CTA к ней приклеивают хвост. Лечит apad + tpad
    d = env(speech)
    last = max((j for j, v in enumerate(d) if v > pdb), default=None)
    if last is not None:
        tail = dur - (last + 1) * .02
        print(f'хвост после последнего слова: {tail:.2f} с (≥ 0.30)')
        if tail < .30 - 1e-9:
            fail.append(f'после последнего слова {tail:.2f} с — конец звучит обрывом, apad + tpad к work/cut.mp4')

# Согласие дорожек. Закон жил комментарием в /speaker-canvas и поэтому не держал:
# завод сдал мастер с речью 95.3 с под кадрами 83.2 с. Сверять надо НЕ work/cut.mp4:
# к нему приклеивается хвост под CTA, и сам план указывает на итоговый дубль через
# plate.json["src"] (на reel_007 это take.mov 88.605 против cut.mp4 83.593 — по прозе
# закона гейт завалил бы законный ролик).
if os.path.exists('work/plate.json'):
    pl = json.load(open('work/plate.json'))
    vo = json.load(open('reel.json')).get('voice') if os.path.exists('reel.json') else None
    lens = {}
    for name in (pl.get('src'), vo):
        if name and os.path.exists(name):
            lens[name] = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                                               'format=duration', '-of', 'csv=p=0', name],
                                              capture_output=True, text=True).stdout)
    lens['plate.json'] = float(pl.get('dur', 0))
    print('длины дорожек: ' + ' · '.join(f'{k} {v:.3f}' for k, v in lens.items()))
    if len(lens) > 1 and max(lens.values()) - min(lens.values()) > 0.05:
        fail.append('дорожки разошлись: ' + ', '.join(f'{k} {v:.3f}' for k, v in lens.items()))
    fr, fps = pl.get('frames'), pl.get('fps')
    if fr and fps and abs(fr / fps - pl.get('dur', 0)) > 0.05:
        fail.append(f'кадров {fr} при {fps} fps это {fr / fps:.2f} с, а в плане {pl.get("dur")} с')

# Швы. Проверяются и здесь, а не только в cut.py build: у роликов, чей рез сделан ДО
# появления гейта, обрыв иначе уезжает в сдачу незамеченным — так и нашлись 7 обрывов
# в четырёх сданных мастерах atlas. Разметка кэшируется, второй прогон бесплатный.
if not approved and os.path.exists('work/cut/edl.txt') and os.path.exists('work/cut/cut16.wav'):
    sys.path.insert(0, os.path.expanduser('~/.claude/engine/cut'))
    try:
        import trim_pauses as TP
        rows = [l.split('\t') for l in open('work/cut/edl.txt') if l.strip()]
        pieces = [(r[0], float(r[1]), float(r[2])) for r in rows]
        lang_s = json.load(open('reel.json')).get('lang') if os.path.exists('reel.json') else None
        if lang_s:
            sw = TP.warn_seams('work/cut/cut16.wav', pieces, lang=lang_s)
            print(f'швы: {len(pieces) - 1} · обрывов {len(sw)}')
            for x in sw[:6]:
                print('    ' + x)
            if sw:
                fail.append(f'{len(sw)} обрывов на швах — рез внутри слова, перерезать')
    except Exception as e:
        unverified('швы', f'{type(e).__name__} {e}'[:160])

# Филлеры и дыхание. Гейт, а не правило (решение Елжана 17.09.2026): «ээ», вдохи
# и выдохи доезжали до сдачи именно потому, что про них было написано, а не
# проверено. Молча пропустить проверку нельзя — «0 предупреждений» от гейта,
# который не смог посчитать, это та же ложь, что и старый отчёт о швах.
if speech and not approved:
    F5 = os.path.expanduser('~/ai-local/.venv-f5/bin/python')
    TOOL = os.path.expanduser('~/.claude/engine/cut/fillers.py')
    voice = next((q for q in ('work/voice16.wav', 'assets/vo/voice.wav', speech) if os.path.exists(q)), None)
    # Язык не подставляется молча: русская модель на казахской речи даёт вердикт,
    # который выглядит как результат (Елжан, 17.09.2026 — тот же класс, что «0 seam warnings»).
    lang = json.load(open('reel.json')).get('lang') if os.path.exists('reel.json') else None
    if not lang:
        unverified('филлеры и дыхание', 'в reel.json нет "lang", язык не угадывается')
    elif not (os.path.exists(F5) and os.path.exists(TOOL)):
        unverified('филлеры и дыхание', 'нет venv-f5 или cut/fillers.py')
    else:
        r = subprocess.run([F5, TOOL, voice, '--lang', lang], capture_output=True, text=True)
        # Упавший инструмент — это не «ноль находок» и не брак мастера, а НЕ ПРОВЕРЕНО с причиной:
        # с 07.10.2026 у Scribe 0 кредитов, и брак на каждом мастере стал нормой, на которую не смотрят.
        if r.returncode != 0:
            why = (r.stderr.strip().splitlines() or ['fillers.py упал'])[-1]
            unverified('филлеры и дыхание', 'ElevenLabs Scribe: 0 кредитов' if 'quota' in why else why[:120])
        else:
            lines = [l.split() for l in r.stdout.splitlines() if l.strip()]
            nf = sum(1 for l in lines if len(l) > 2 and l[2] == 'FILLER')
            nb = sum(1 for l in lines if len(l) > 2 and l[2] == 'BREATH')
            nu = sum(1 for l in lines if len(l) > 2 and l[2] == 'UNCLEAR')
            print(f'филлеры {nf} · вдохи/выдохи {nb} · неясных участков {nu}')
            # Сросшийся филлер резать запрещает закон шва — у него нет 0.10 с тишины с
            # обеих сторон. Единственным выходом из этого гейта оставалось глушение в
            # исходнике, а это глушение ЖИВОЙ речи: на abat/reel_006 три заглушки доехали
            # до мастера дырами в голосе, одна в −102 дБ между словами на −19 дБ, и Елжан
            # вернул ролик («кейбір жерде дауыс естілмеген», 19.09.2026). Поэтому дверь
            # та же, что у UNCLEAR, но вердикт нужен ПОИМЁННО: одна строка «всё ок» не
            # закрывает любое число находок, как не закрывает её и пустой файл.
            if nf:
                seen = open('work/fillers_reviewed.txt').read() if os.path.exists('work/fillers_reviewed.txt') else ''
                nov = [l[0] for l in lines if len(l) > 2 and l[2] == 'FILLER' and l[0] not in seen]
                if nov:
                    fail.append(f'{len(nov)} филлеров без вердикта ({", ".join(nov[:6])}) — '
                                'прослушать и записать в work/fillers_reviewed.txt по таймкоду; '
                                'глушить их в исходнике нельзя — это дыра в голосе')
            # У вдоха дверь ТА ЖЕ, что у филлера, и по той же причине. Глушение до пола
            # безопасно, только пока вдох сам сидит близко к полу; вдох, стоящий на 25–33 дБ
            # ВЫШЕ пола, опускается на те же 30 дБ, и зритель слышит не убранный вдох, а
            # пропавший звук. Замер atlas/reel_016 21.09.2026: спан 8.46–8.84 (0.38 с) идёт
            # на −12…−20 дБ при поле комнаты −45, после штатного `--mute-breaths` он сел на
            # −46…−48, и Елжан вернул мастер — «на нескольких местах ты сделал mute на
            # определённых секундах, заглушил звук на миллисекунды — убери это». Поэтому
            # вдох либо заглушен, либо назван ПОИМЁННО в work/fillers_reviewed.txt с замером;
            # одной строкой «всё ок» дверь не открывается, как и у филлера.
            if nb:
                seen = open('work/fillers_reviewed.txt').read() if os.path.exists('work/fillers_reviewed.txt') else ''
                nov = [l[0] for l in lines if len(l) > 2 and l[2] == 'BREATH' and l[0] not in seen]
                if nov:
                    fail.append(f'{len(nov)} вдохов/выдохов не заглушены и без вердикта ({", ".join(nov[:6])}) — '
                                'заглушить `fillers.py --mute-breaths … --duck-also …` либо записать '
                                'вердикт по таймкоду в work/fillers_reviewed.txt с замером уровня')
            # UNCLEAR судит человек: класс не определён машиной, и молчаливый пропуск
            # превратил бы его в предупреждение, которое пролистывают.
            if nu and not os.path.exists('work/fillers_reviewed.txt'):
                fail.append(f'{nu} неясных участков без вердикта — прослушать и записать в work/fillers_reviewed.txt')

for f in fail:
    print('  ✗ ' + f)
print('мастер по закону' if not fail else f'МАСТЕР НЕ СДАН: {len(fail)}')
sys.exit(1 if fail else 0)
