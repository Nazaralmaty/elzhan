# atlas_tourism/_ассеты/read.py — замер закона чтения по спеку, ДО рендера.
# Запуск из папки ролика:  /usr/local/bin/python3 ../_ассеты/read.py
# Читает spec.js и assets/vo/words.js, раскладывает биты по словам той же механикой,
# что speaker-canvas.js, и печатает, сколько секунд каждая надпись реально стоит в кадре.
# Зачем: `until` долей бита убивает плашку вместе с её битом, и ни один гейт этого не видит.
# Замер редакции 1 reel_015 — 25 надписей из 50 не дочитывались, худшие жили 0.2 с.
# Замер закона чтения по спеку: сколько секунд каждая надпись стоит в кадре.
# нужно = max(1.2, знаков/13 + 0.6) для крупного набора, max(0.9, знаков/15 + 0.45) для плашек.
import json, re, sys, unicodedata
W = json.loads(re.search(r'window\.WORDS_ALL=(\[.*\]);', open('assets/vo/words.js').read(), re.S).group(1))
norm = lambda s: re.sub(r'[^\w$]', '', s.lower().replace('ё','е'), flags=re.U)
src = open('spec.js').read()
# биты: строка, начинающаяся с "{ from:" или "{ room:" на верхнем уровне beats
blocks = re.split(r'\n    \{ (?=from:|room:)', src.split('beats: [',1)[1])
beats, cur = [], 0
for i, b in enumerate(blocks[1:]):
    b = '{ ' + b.split('\n  ],\n}));')[0]
    m = re.search(r"from: '([^']+)'", b)
    if i == 0 and not m: start = 0
    else:
        key, _, nth = m.group(1).partition('#'); k = int(nth or 1); j = -1
        for q in range(cur+1, len(W)):
            if norm(W[q]['w']).startswith(norm(key)):
                k -= 1
                if k == 0: j = q; break
        assert j >= 0, m.group(1)
        start = j; cur = j
    beats.append({'start': start, 'src': b})
for i, bt in enumerate(beats):
    e = (beats[i+1]['start'] if i+1 < len(beats) else len(W)) - 1
    bt['t0'] = 0 if i == 0 else W[bt['start']]['t0']
    bt['t1'] = max(W[e]['t1'], bt['t0'] + 0.2)
    bt['words'] = W[bt['start']:(beats[i+1]['start'] if i+1 < len(beats) else len(W))]
BIG = {'hit','whit','wtitle'}
bad = []
for i, bt in enumerate(beats):
    L = bt['t1'] - bt['t0']
    for m in re.finditer(r"\{ r: '(\w+)'.*", bt['src']):
        line = m.group(0); role = m.group(1)
        t = re.search(r"t: '([^']*)'", line)
        if not t: continue
        txt = t.group(1); n = len(txt)
        on = re.search(r"on: '([^']+)'", line); at = re.search(r"at: ([-\d.]+|'[\d.]+s')", line)
        u  = re.search(r"u: ('[\d.]+s'|[-\d.]+)", line)
        if on:
            key, _, nth = on.group(1).partition('#'); k = int(nth or 1); t0 = None
            hits = [w for w in bt['words'] if norm(w['w']) == norm(key)] or [w for w in bt['words'] if norm(w['w']).startswith(norm(key))]
            if len(hits) < k: bad.append(f'  бит {i}: слово "{on.group(1)}" не найдено — {txt}'); continue
            t0 = hits[k-1]['t0'] - 0.06
        else:
            v = at.group(1) if at else '.04'
            t0 = float(v.strip("'").rstrip('s')) if v.startswith("'") else bt['t0'] + float(v) * L
        v = u.group(1) if u else '.94'
        t1 = float(v.strip("'").rstrip('s')) if v.startswith("'") else bt['t0'] + float(v) * L
        live = t1 - t0
        need = max(1.2, n/13 + 0.6) if role in BIG else max(0.9, n/15 + 0.45)
        if role == 'hit': need += 0.5   # sweep есть только у лицевого HIT
        flag = 'МАЛО' if live < need - 0.05 else '    '
        print(f'{flag} бит {i:2d} {role:8s} {t0:6.2f}→{t1:6.2f} = {live:4.2f} с, нужно {need:4.2f}  «{txt}»')
