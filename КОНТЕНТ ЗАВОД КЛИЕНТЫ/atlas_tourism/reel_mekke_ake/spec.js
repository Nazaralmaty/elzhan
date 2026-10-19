/* atlas_tourism / reel_mekke_ake — «Мекке — әке, Мәдина — ана»

   Выпуск №3, Райымбек Жайлау (0–28.3) и ведущий Рүстем Рахимов (28.3–55.7). Нарезка П1 принята.
   Текст — переложенная карта whisper (Scribe не оплачен): на экран идут только слова, которые читаются по смыслу;
   спорные места (12.8–13.9, 35.0–41.1) несут картинку без текста. Плашки — сжатая речь спикера, читать носителю.

   СКВОЗНОЙ ОБЪЕКТ — ось из двух пинов МЕККЕ · МӘДИНА с подписями ӘКЕ / АНА: хук (2.6), Мекке-әке (4.8),
   уайым (7.9), поворот Мәдина-ана (24.3, зелёный перелив), «әкеміз ғой» (35.0), вывод 1 күн / 6 күн (51.8).
   Миниатюра оси — иконка на лице (горит тот город, о котором речь).

   ПЛАНЫ (work/plans_take.txt, губы замерены): лицевая комната только там, где в кадре говорящий; общий план 4.6–15.7,
   реакции ведущего 19.7–20.7 и 22.2–23.7, смех Ақтөре 34.8 и 39.6 — миры. Ведущий 2.57–3.53 закрыт вставкой хука.
   Святые места не рисуются: Мекке и Мәдина — пины схемы. Музыки нет (клиент). */
import { mount } from './engine/genre/speaker-canvas.js';
import { reel, PAL } from '../_ассеты/mech.js';
import { outro } from '../_ассеты/outro.js';

const GOLD = PAL.gold, CREAM = '#F4EDE0', GREEN = '#13463B';
const FACE = { p: 'face', y: 930, z: 1.08 };
const FR2 = 'work/fr2';
const when = at => (typeof at === 'string' && !at.endsWith('s') ? { on: at } : { at });

/* ── схема и формы ─────────────────────────────────────────────────────── */
const pin = (t, cx, y, at, until, { dim, ...extra } = {}) =>
  ({ k: 'html', x: cx - 200, y, w: 400, h: 150, html: `<div class="pin${dim ? ' dim' : ''}"><i></i><b>${t}</b></div>`, ...when(at), anim: 'pop', until, ...extra });
const ring = (cx, cy, at, until, w = 90, extra = {}) =>
  ({ k: 'ring', w, sw: 5, color: GOLD, x: cx - w / 2, y: cy - w / 2, ...when(at), dur: .34, until, ...extra });
const lbl = (t, cx, y, at, until, cls = '') =>
  ({ k: 'html', x: cx - 150, y, w: 300, h: 50, html: `<div class="lbl c ${cls}">${t}</div>`, ...when(at), anim: 'up', until });
const arc = (x, y, w, at, until, dur = 1.2) =>
  ({ k: 'arrow', d: `M0 150 Q${w / 2} -70 ${w} 150`, x, y, w, h: 150, color: 'rgba(201,168,106,.8)', sw: 6, ...when(at), dur, until });
const orn = (at, until, x = 830, y = 230, w = 150) => ({ k: 'img', src: 'orn_shanirak_dim.svg', x, y, w, ...when(at), anim: 'fade', until });
const medal = until => ({ k: 'img', src: 'orn_shanirak_dim.svg', x: 660, y: 1220, w: 330, at: -.2, anim: 'fade', until });   // окно спикера невозможно (чужой план) — угол не пустует (клиент §5.5)
const rule = (at, until, y = 1080, w = 840) => ({ k: 'rule', x: 120, y, w, at, until });
const ico = (name, x, y, w, at, until, extra = {}) =>
  ({ k: 'html', x, y, w, h: w, html: `<div class="ico">${SVG[name]}</div>`, ...when(at), anim: 'pop', until, ...extra });
/* миниатюра оси на лице: два узла, горит названный город */
const mini = (lit, x, y, at, until) => ({ k: 'html', x, y, w: 220, h: 80, html:
  `<div class="mini"><i class="${lit === 'm' ? 'on' : ''}"></i><s></s><i class="${lit === 'd' ? 'on g' : ''}"></i><b>МЕККЕ</b><b>МӘДИНА</b></div>`, ...when(at), anim: 'pop', until });

const S = 'stroke-linecap="round" stroke-linejoin="round"';
const SVG = {
  scissors: `<svg viewBox="0 0 100 100" fill="none" ${S}><circle cx="26" cy="72" r="13" stroke="${GOLD}" stroke-width="7"/><circle cx="74" cy="72" r="13" stroke="${GOLD}" stroke-width="7"/><path d="M34 62 L72 10 M66 62 L28 10" stroke="${CREAM}" stroke-width="7"/></svg>`,
  coins: `<svg viewBox="0 0 100 100" fill="none" ${S}><ellipse cx="50" cy="78" rx="34" ry="11" fill="${GOLD}"/><ellipse cx="50" cy="64" rx="34" ry="11" fill="#D9B778" stroke="#8C6E39" stroke-width="2"/><ellipse cx="50" cy="50" rx="34" ry="11" fill="${GOLD}" stroke="#8C6E39" stroke-width="2"/><ellipse cx="50" cy="36" rx="34" ry="11" fill="#E3C98F" stroke="#8C6E39" stroke-width="2"/></svg>`,
  house: `<svg viewBox="0 0 100 100" fill="none" ${S}><path d="M14 48 L50 16 L86 48" stroke="${GOLD}" stroke-width="7"/><path d="M24 44 V86 H76 V44" stroke="${CREAM}" stroke-width="7"/><path d="M43 86 V64 H57 V86" stroke="${GOLD}" stroke-width="6"/></svg>`,
  plate: `<svg viewBox="0 0 100 100" fill="none" ${S}><circle cx="54" cy="54" r="30" stroke="${CREAM}" stroke-width="6"/><circle cx="54" cy="54" r="18" stroke="rgba(244,237,224,.45)" stroke-width="4"/><path d="M12 22 V44 M7 22 V36 Q12 44 17 36 V22 M12 44 V86" stroke="${GOLD}" stroke-width="5"/></svg>`,
  bowl: `<svg viewBox="0 0 100 100" fill="none" ${S}><path d="M12 50 H88 Q86 84 50 86 Q14 84 12 50 Z" fill="${GOLD}"/><path d="M36 40 Q30 30 36 22 M50 40 Q44 28 50 18 M64 40 Q58 30 64 22" stroke="${CREAM}" stroke-width="4"/></svg>`,
  pan: `<svg viewBox="0 0 200 120" fill="none" ${S}><ellipse cx="80" cy="64" rx="74" ry="40" fill="#20272E" stroke="${CREAM}" stroke-width="6"/><ellipse cx="80" cy="60" rx="58" ry="28" fill="#151A1F"/><path d="M152 60 L196 52" stroke="${GOLD}" stroke-width="12"/></svg>`,
  egg: `<svg viewBox="0 0 120 100" fill="none"><path d="M18 52 Q10 22 44 20 Q60 6 82 18 Q112 22 104 52 Q112 80 78 82 Q58 96 36 82 Q8 80 18 52 Z" fill="#F7F1E4"/><circle cx="60" cy="50" r="17" fill="#F0B23C"/><circle cx="54" cy="44" r="5" fill="#FFE3A0"/></svg>`,
  clock: `<svg viewBox="0 0 100 100" fill="none" ${S}><circle cx="50" cy="50" r="42" stroke="${CREAM}" stroke-width="5"/><path d="M50 12 V18 M50 82 V88 M12 50 H18 M82 50 H88" stroke="${GOLD}" stroke-width="5"/><circle cx="50" cy="50" r="4" fill="${GOLD}"/></svg>`,
  hand: `<svg viewBox="0 0 100 100" fill="none" ${S}><path d="M50 50 L50 18" stroke="${GOLD}" stroke-width="6"/></svg>`,
  ticket: `<svg viewBox="0 0 120 160" fill="none" ${S}><path d="M8 6 H112 V146 L99 156 L86 146 L73 156 L60 146 L47 156 L34 146 L21 156 L8 146 Z" fill="${CREAM}"/><path d="M24 64 H96 M24 84 H86 M24 104 H92" stroke="rgba(20,24,28,.35)" stroke-width="6"/><text x="60" y="42" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="26" fill="#14181C">ЗАКАЗ</text></svg>`,
  spark: `<svg viewBox="0 0 100 100" fill="none" ${S}><path d="M50 8 V30 M50 70 V92 M8 50 H30 M70 50 H92 M22 22 L36 36 M64 64 L78 78 M78 22 L64 36 M36 64 L22 78" stroke="${GOLD}" stroke-width="5"/></svg>`,
  dots: `<svg viewBox="0 0 100 40" fill="${CREAM}"><circle cx="15" cy="20" r="9"/><circle cx="50" cy="20" r="9" opacity=".7"/><circle cx="85" cy="20" r="9" opacity=".45"/></svg>`,
};
const list = rows => `<div class="lst">${rows.map((r, i) => `<p><span>${r}</span></p>`).join('')}</div>`;
const tick = (x, y, at, until, extra = {}) => ({ k: 'stamp', color: GOLD, w: 62, x, y, ...when(at), until, ...extra });
const cell = (i, cls, at, until, txt = '') => ({ k: 'html', x: 120 + i * 122, y: 860, w: 104, h: 104, html: `<div class="cell ${cls}">${txt}</div>`, ...when(at), anim: 'pop', until });

mount(reel({
  subs: false,
  extra: { tail: 0.2,
    /* звук объекта, названный роликом: часы идут, пока он думает «қашан»; список и чек — бумага; яйцо шипит на сковороде */
    sfx: [{ t: 12.85, s: 'stopwatch', v: .14, cut: 2.6 }, { t: 18.82, s: 'paper_pull_a', v: .18, cut: .6 },
          { t: 41.12, s: 'paper_slide', v: .2, cut: .5 }, { t: 44.50, s: 'stove_sizzle', v: .2, cut: 1.5 },
          /* монеты кәффарата на «төлеп», яйцо падает на сковороду, клетки дней отсчитываются */
          { t: 19.94, s: 'tokens_drop', v: .16, cut: .7 }, { t: 41.95, s: 'drop', v: .14, cut: .5 }, { t: 53.40, s: 'tick', v: .16, cut: .5 }] },
  rooms: [
    { id: 'face',   x: 0,     y: 0,     footage: true },
    { id: 'axis',   x: 6000,  y: 0,     w: 1080, h: 2700, top: 700, bg: 'dark' },
    { id: 'yalla',  x: 12000, y: 0,     w: 1080, h: 2700, top: 700, bg: 'dark' },
    { id: 'when',   x: 18000, y: 0,     w: 1080, h: 2700, top: 700, bg: 'dark' },
    { id: 'list',   x: 24000, y: 0,     w: 1080, h: 2700, top: 700, bg: 'dark' },
    { id: 'medina', x: 0,     y: 7000,  w: 1080, h: 2700, top: 700, bg: 'peri' },
    { id: 'father', x: 6000,  y: 7000,  w: 1080, h: 2700, top: 700, bg: 'dark' },
    { id: 'egg',    x: 12000, y: 7000,  w: 1080, h: 2700, top: 700, bg: 'dark' },
    { id: 'days',   x: 18000, y: 7000,  w: 1080, h: 2700, top: 700, bg: 'dark' },
    { id: 'cta',    x: 24000, y: 7000,  w: 1080, h: 2700, top: 700, bg: 'dark' },
  ],
  beats: [

    /* 0 · 0.00–4.84 · ЛИЦО, Райымбек · «Мекке, сен әке сияқтысың дейді. Мәдина, сен ана сияқтысың. Әке…»
         Хук его словами: тема плашкой с 0.03 (Мекке — первое слово); на плане ведущего 2.57–3.53 — вставка оси
         на весь кадр (МЕККЕ·ӘКЕ, МӘДИНА·АНА встают на свои слова), обратно на Райымбека со второй плашкой. */
    { room: 'face', cam: [{ at: 0, x: 540, y: 930, z: 1.08 }, { at: .12, x: 541, y: 932, z: 1.13 }, { at: .3, x: 543, y: 934, z: 1.10 },
                          { at: .78, x: 540, y: 938, z: 1.12 }, { at: .95, x: 544, y: 942, z: 1.14, hold: .1 }],
      el: [
        { r: 'line', t: 'МЕККЕ — ӘКЕ', at: '0.03s', u: '2.48s' },
        { r: 'pill', t: 'сен әке сияқтысың', on: 'сен', u: '2.48s' },
        { r: 'line', t: 'МӘДИНА — АНА', on: 'ана', u: '4.66s' },
      ],
      raw: [
        mini('m', 780, 1250, 'әке', '2.48s'),
        { k: 'html', x: 0, y: 0, w: 1080, h: 1920, html: '<div class="hookpanel"></div>', at: '2.47s', anim: 'fade', dur: .08, until: '3.56s', z: 5 },
        pin('МЕККЕ', 290, 860, '2.47s', '3.56s', { z: 6 }),
        { ...lbl('ӘКЕ', 290, 1000, '2.50s', '3.56s', 'big'), z: 6 },
        { ...arc(290, 730, 500, '2.52s', '3.56s', .7), z: 6 },
        pin('МӘДИНА', 790, 860, 'мәдина', '3.56s', { z: 6 }),
        { ...lbl('АНА', 790, 1000, 'ана', '3.56s', 'big g'), z: 6 },
        mini('d', 780, 1250, '3.62s', '4.66s'),
      ] },

    /* 1 · 4.84–7.52 · МИР «ось», общий план под картинкой · «…сияқты, Мекке әке сияқты ғой». Ирис золотом; пин МЕККЕ
         встаёт на «Мекке», подпись ӘКЕ на «әке», ринг на втором «сияқты». */
    { from: 'яқты', room: 'axis', cut: { kind: 'iris', color: GOLD, x: 540, y: 900, in: .28, out: .32 },
      cam: [{ at: .02, x: 540, y: 940, z: 1.02 }, { at: .3, x: 546, y: 950, z: 1.05 }, { at: .55, x: 548, y: 960, z: 1.07 },
            { at: .78, x: 552, y: 966, z: 1.09 }, { at: .95, x: 554, y: 972, z: 1.10, hold: .1 }],
      world: { ghost: 'ӘКЕ', ghostS: 300, ghostY: 1240, life: '7.70s', cardDir: FR2 },
      el: [{ r: 'wtitle', t: 'МЕККЕ — ӘКЕ СИЯҚТЫ', on: 'мекке', row: 'title', still: true, gold: true, u: '7.62s' }],
      raw: [
        orn(-.1, '7.70s'),
        rule(-.1, '7.70s'),
        pin('МӘДИНА', 810, 880, -.1, '7.70s', { dim: true }),
        arc(270, 760, 540, -.05, '7.70s', 1.4),
        pin('МЕККЕ', 270, 880, 'мекке', '7.70s'),
        lbl('ӘКЕ', 270, 1010, 'әкес', '7.70s', 'big'),
        ring(270, 900, 'яқты#2', '7.70s', 110),
      ] },

    /* 2 · 7.88–10.64 · тот же мир · «Мәдинада уайымдамайсыз. Уайыммен жүресіз ғой». Загорается МӘДИНА (нырок на неё),
         галочка покоя; на «уайым» стрелка к МЕККЕ и ринг — там ходят с уайымом. */
    { from: 'мәдене', room: 'axis',
      cam: [{ at: .04, x: 560, y: 960, z: 1.06 },
            { aim: 'pmd', dx: -230, dy: 100, z: 1.12, rot: 2, rx: 6, ry: 9, move: 1.1 },
            { at: .62, x: 580, y: 930, z: 1.12, rot: 2, rx: 6, ry: 9 },
            { at: .80, x: 480, y: 930, z: 1.11, rot: 1, rx: 6, ry: 7 },
            { at: .95, x: 470, y: 925, z: 1.12, rot: 1, rx: 6, ry: 7, hold: 0 }],
      world: { life: '10.60s', cardDir: FR2 },
      el: [
        { r: 'wscript', t: 'Мәдинада', on: 'мәдене', row: 'top', u: '10.55s' },
        { r: 'wtitle', t: 'УАЙЫМДАМАЙСЫЗ', on: 'мәдене', row: 'title', still: true, u: '9.60s' },
      ],
      raw: [
        orn(-.1, '10.60s'),
        rule(-.1, '10.60s'),
        pin('МЕККЕ', 270, 880, -.1, '10.60s'),
        pin('МӘДИНА', 810, 880, 'мәдене', '10.60s', { id: 'pmd', lift: 110 }),
        lbl('АНА', 810, 1010, 'мәдене', '10.60s', 'g'),
        tick(780, 1060, 'оайымдамайыз', '10.60s'),
        { k: 'arrow', d: 'M520 40 Q270 -40 30 40', head: 'M58 18 L30 40 L60 58', x: 270, y: 800, w: 540, h: 80, color: CREAM, sw: 5, on: 'оайым', dur: .6, until: '10.60s' },
        lbl('УАЙЫММЕН', 270, 1010, 'оайым', '10.60s', 'big'),
        ring(270, 900, 'жересін', '10.60s', 130),
      ] },

    /* 3 · 10.88–12.74 · МИР «Ялла» · «Ялла, хаджи, ялла, хаджи, дейді». Шов — полоса с его фразой гигантским набором;
         в мире стрелки торопят вправо на каждое слово. */
    { from: 'ялла', room: 'yalla', cut: { kind: 'band', color: GOLD, label: 'ЯЛЛА, ХАДЖИ!', textColor: '#0A0D10', lead: .05 },
      cam: [{ at: .02, x: 540, y: 950, z: 1.03 }, { at: .25, x: 552, y: 956, z: 1.06 }, { at: .5, x: 560, y: 962, z: 1.08 },
            { at: .75, x: 568, y: 966, z: 1.11 }, { at: .95, x: 574, y: 970, z: 1.13, hold: .1 }],
      world: { ghost: 'ЯЛЛА', ghostS: 320, ghostY: 1240, life: '12.80s', cardDir: FR2 },
      el: [
        { r: 'wtitle', t: 'ЯЛЛА, ХАДЖИ!', s: 130, on: 'ялла', row: 'title', still: true, gold: true, u: '12.70s' },
      ],
      raw: [
        orn(-.1, '12.80s'),
        rule(-.1, '12.80s', 1100),
        { k: 'arrow', d: 'M0 60 L200 60', head: 'M160 20 L200 60 L160 100', x: 120, y: 860, w: 210, h: 120, color: GOLD, sw: 14, on: 'хаджи', dur: .3, until: '12.80s' },
        { k: 'arrow', d: 'M0 60 L200 60', head: 'M160 20 L200 60 L160 100', x: 380, y: 860, w: 210, h: 120, color: GOLD, sw: 14, on: 'ялла#2', dur: .3, until: '12.80s' },
        { k: 'arrow', d: 'M0 60 L200 60', head: 'M160 20 L200 60 L160 100', x: 640, y: 860, w: 210, h: 120, color: GOLD, sw: 14, on: 'хаджи#2', dur: .3, until: '12.80s' },
      ] },

    /* 4 · 12.80–15.56 · МИР «қашан» · «… ойлайсыз. Қашан шығам?». Часы стоят с входа, стрелка бежит; на «қашан»
         заголовок, на «шығам» — вопрос. Начало фразы не прочитано — без текста, точки мысли. */
    { from: 'харректі', room: 'when', cut: { kind: 'flash', color: CREAM },
      cam: [{ at: .02, x: 540, y: 940, z: 1.02 },
            { at: .3, x: 546, y: 950, z: 1.05 },
            { aim: 'q', dx: -210, dy: 60, z: 1.10, rot: -2, rx: 6, ry: -8, move: 1.1 },
            { at: .95, x: 560, y: 930, z: 1.10, rot: -2, rx: 6, ry: -8, hold: 0 }],
      world: { ghost: 'ҚАШАН', ghostS: 260, ghostY: 1240, life: '15.85s', cardDir: FR2 },
      el: [{ r: 'wtitle', t: 'ҚАШАН ШЫҒАМ?', on: 'қашан', row: 'title', still: true, gold: true, u: '15.72s' }],
      raw: [
        orn(-.1, '15.65s'),
        rule(-.1, '15.65s', 1120),
        ico('clock', 190, 580, 380, -.08, '15.65s'),
        { k: 'html', x: 190, y: 580, w: 380, h: 380, html: `<div class="ico">${SVG.hand}</div>`, at: -.08, anim: 'fade', until: '15.65s',
          expr: { rot: (t, v) => v + (t < 14.6 ? t * 540 : 14.6 * 540) } },
        ico('dots', 620, 640, 200, 'харректі', '15.65s'),
        ico('dots', 700, 600, 140, 'ойқыратыз', '15.65s'),
        { k: 'html', id: 'q', x: 640, y: 690, w: 260, h: 320, html: '<div class="big fill" style="font-size:300px">?</div>', on: 'шығам', anim: 'pop', lift: 100, until: '15.65s' },
      ] },

    /* 5 · 16.08–18.76 · ЛИЦО, Райымбек · «Шашты дұрыс қысқартып, жазаға түсіп қалмаймын ба». Ножницы на «қысқартып»,
         крестик на «қалмаймын». */
    { from: 'шашты', room: 'face', cut: { kind: 'focus' }, cam: FACE,
      el: [
        { r: 'line', t: 'ШАШТЫ ДҰРЫС ҚЫСҚАРТЫП', s: 45, on: 'шашты', u: '18.70s' },
        { r: 'pill', t: 'жаза?', on: 'жазаға', u: '18.70s' },
      ],
      raw: [
        ico('scissors', 820, 1150, 170, 'сқартып', '18.70s', { expr: { rot: (t, v) => v + Math.sin(t * 14) * 8 } }),
        { k: 'stamp', kind: 'cross', color: GOLD, w: 90, x: 860, y: 1470, on: 'қомайым', until: '18.70s' },
      ] },

    /* 6 · 18.94–20.88 · МИР «тізім» (реакция ведущего 19.7–20.7 — окна нет, медальон) · «кәффарат төлеп қалмаймын ба».
         Список его тревог: шаш, жаза отмечаются с входа, кәффарат на своём слове; монеты на «төлеп». */
    { from: 'кафарат', room: 'list', cut: { kind: 'band', color: GOLD, lead: .05 },
      cam: [{ at: .02, x: 540, y: 940, z: 1.02 },
            { aim: 'cn', dx: -250, dy: 80, z: 1.12, rot: 2, rx: 6, ry: 9, move: 1.1 },
            { at: .95, x: 560, y: 920, z: 1.12, rot: 2, rx: 6, ry: 9, hold: 0 }],
      world: { card: false, ghost: 'КӘФФАРАТ', ghostS: 190, ghostY: 1240, life: '20.95s' },
      el: [
        { r: 'wtitle', t: 'КӘФФАРАТ', on: 'кафарат', row: 'title', still: true, gold: true, u: '20.85s' },
      ],
      raw: [
        medal('20.95s'),
        orn(-.1, '20.95s', 830, 230, 140),
        { k: 'html', x: 120, y: 560, w: 520, h: 470, html: list(['Шаш', 'Жаза', 'Кәффарат', 'Садақа']), at: -.15, anim: 'up', until: '20.95s' },
        tick(520, 610, -.05, '20.95s'), tick(520, 720, '19.20s', '20.95s'), tick(520, 830, 'кафарат', '20.95s'),
        ico('coins', 690, 640, 230, 'төліп', '20.95s', { id: 'cn', lift: 100 }),
      ] },

    /* 7 · 20.90–22.32 · ЛИЦО, Райымбек · «садақасы бар деген сияқты» */
    { from: 'садақасы', room: 'face', cut: { kind: 'flash', color: CREAM }, cam: { p: 'pull', y: 935, z: 1.14 },
      el: [{ r: 'line', id: 'sd', t: 'САДАҚАСЫ БАР', on: 'садақасы', u: '22.20s' }],
      raw: [ico('coins', 640, 1360, 130, 'бар', '22.20s')] },

    /* 8 · 22.40–24.27 · МИР «тізім» снова (реакция ведущего) · «Сонда сол оймен жүресіз». Список заполнен целиком, кольцо вокруг. */
    { from: 'сонда', room: 'list', cut: { kind: 'iris', color: GOLD, x: 540, y: 1300, in: .28, out: .32 },
      cam: [{ at: .02, x: 540, y: 930, z: 1.03 }, { at: .3, x: 536, y: 920, z: 1.05 }, { at: .6, x: 532, y: 912, z: 1.07 },
            { at: .95, x: 528, y: 904, z: 1.09, hold: .1 }],
      world: { card: false, ghost: 'ОЙ', ghostS: 330, ghostY: 1240, life: '24.10s' },
      el: [{ r: 'wtitle', t: 'ОЙМЕН ЖҮРЕСІЗ', on: 'сонда', row: 'title', still: true, u: '24.02s' }],
      raw: [
        medal('24.10s'),
        { k: 'html', x: 120, y: 560, w: 520, h: 470, html: list(['Шаш', 'Жаза', 'Кәффарат', 'Садақа']), at: -.2, anim: 'fade', until: '24.10s' },
        tick(520, 610, -.2, '24.10s'), tick(520, 720, -.2, '24.10s'), tick(520, 830, -.2, '24.10s'), tick(520, 940, 'сонда', '24.10s'),
        { k: 'brk', x: 80, y: 520, w: 600, h: 550, on: 'жүресіз', until: '24.10s' },
      ] },

    /* 9 · 24.34–28.33 · МИР-ПОВОРОТ (зелёный перелив) · «Мәдина қаласының өзі … келеді, ана сияқты деп тұр ғой».
         Ось возвращается: МӘДИНА горит, подпись АНА на «ана», нырок на неё. */
    { from: 'мәдене', room: 'medina', cut: { kind: 'tone', color: GREEN, lead: .1, dur: .6, dir: 'up' },
      cam: [{ at: .03, x: 540, y: 950, z: 1.02 }, { at: .3, x: 546, y: 960, z: 1.05 },
            { aim: 'pmd2', dx: -260, dy: 100, z: 1.12, rot: -2, rx: 7, ry: -9, move: 1.2 },
            { at: .95, x: 560, y: 920, z: 1.12, rot: -2, rx: 7, ry: -9, hold: 0 }],
      world: { ghost: 'АНА', ghostS: 330, ghostY: 1240, life: '28.30s', cardDir: FR2 },
      el: [
        { r: 'wscript', t: 'Мәдина қаласы', on: 'мәдене', row: 'top', u: '28.20s' },
        { r: 'wtitle', t: 'АНА СИЯҚТЫ', s: 120, on: 'келеді', row: 'title', still: true, gold: true, u: '28.40s' },
      ],
      raw: [
        orn(-.1, '28.30s'),
        rule(-.1, '28.30s'),
        pin('МЕККЕ', 270, 880, -.1, '28.30s', { dim: true }),
        lbl('ӘКЕ', 270, 1010, -.1, '28.30s', 'w'),
        arc(270, 760, 540, -.05, '28.30s', 1.4),
        pin('МӘДИНА', 810, 880, 'қаласы', '28.30s', { id: 'pmd2', lift: 110 }),
        lbl('АНА', 810, 1010, 'ана', '28.30s', 'big'),
        ring(810, 900, 'сияқты', '28.30s', 130),
      ] },

    /* 10 · 28.53–31.69 · ЛИЦО, ведущий · «Әкеңмен үйде қалсаң, кейде аш қаласың» — дом, потом пустая тарелка. */
    { from: 'әкенгімен', room: 'face', cut: { kind: 'flash', color: GOLD }, cam: FACE,
      el: [
        { r: 'pill', t: 'әкеңмен үйде қалсаң,', on: 'әкенгімен', u: '31.60s' },
        { r: 'line', t: 'КЕЙДЕ АШ ҚАЛАСЫҢ', on: 'кейді', u: '31.60s' },
      ],
      raw: [
        ico('house', 830, 1170, 150, 'үйде', '29.70s'),
        ico('plate', 830, 1170, 150, 'ашқаласын', '31.60s'),
        mini('m', 780, 1060, 'әкенгімен', '29.50s'),
      ] },

    /* 11 · 31.77–34.47 · ЛИЦО, ведущий, отъезд · «Меккенің тамағы (табақтары?) кейбір кісілерге ұнамай қалады».
         Спорное слово на экран не идёт: миска на нём, крест на «ұнамай». */
    { from: 'меккенің', room: 'face', cam: { p: 'pull', y: 935, z: 1.14 },
      el: [
        { r: 'pill', t: 'кейбір кісілерге', on: 'меккенің', u: '34.60s' },
        { r: 'line', t: 'ҰНАМАЙ ҚАЛАДЫ', on: 'кейбіркісілерге', u: '34.62s' },
      ],
      raw: [
        mini('m', 780, 1060, 'меккенің', '34.60s'),
        ico('bowl', 830, 1170, 150, 'табақтары', '34.60s'),
        { k: 'stamp', kind: 'cross', color: CREAM, w: 120, x: 845, y: 1185, on: 'қалады', until: '34.60s' },
      ] },

    /* 12 · 35.01–37.61 · МИР «әке» (смех Ақтөре — окна нет) · «… әкеміз ғой, дейді». Ось с горящей МЕККЕ. */
    { from: 'сол', room: 'father', cut: { kind: 'band', color: CREAM, lead: .05 },
      cam: [{ at: .02, x: 540, y: 940, z: 1.02 }, { at: .26, x: 536, y: 948, z: 1.04 }, { at: .5, x: 532, y: 956, z: 1.06 },
            { at: .74, x: 528, y: 962, z: 1.08 }, { at: .95, x: 524, y: 968, z: 1.10, hold: .1 }],
      world: { card: false, ghost: 'ӘКЕ', ghostS: 330, ghostY: 1240, life: '38.00s' },
      el: [{ r: 'wtitle', t: 'ӘКЕМІЗ ҒОЙ', s: 120, on: 'әкенгіміз', row: 'title', still: true, gold: true, u: '37.95s' }],
      raw: [
        medal('38.00s'),
        orn(-.1, '38.00s'),
        rule(-.1, '38.00s'),
        pin('МЕККЕ', 270, 880, -.06, '38.00s'),
        pin('МӘДИНА', 810, 880, -.06, '38.00s', { dim: true }),
        arc(270, 760, 540, 'секілді', '38.00s', 1.0),
        lbl('ӘКЕ', 270, 1010, 'әкенгіміз', '38.00s', 'big'),
        ring(270, 900, 'қой', '38.00s', 130),
      ] },

    /* 13 · 38.03–39.29 · ЛИЦО, ведущий · фраза не прочитана — без текста, наезд. */
    { from: 'балашаған', room: 'face', cut: { kind: 'focus' },
      cam: [{ at: 0, x: 540, y: 930, z: 1.08 }, { at: .3, x: 542, y: 928, z: 1.11 }, { at: .6, x: 544, y: 926, z: 1.13 }, { at: .95, x: 546, y: 924, z: 1.15, hold: .1 }],
      raw: [mini('m', 780, 1250, '38.20s', '39.30s')] },

    /* 14 · 39.57–41.05 · МИР «жұмыртқа» (смех Ақтөре 39.6–40.4 в окне) · фраза не прочитана — сковорода ждёт. */
    { from: 'басық', room: 'egg', cut: { kind: 'iris', color: GOLD, x: 540, y: 1000, in: .28, out: .32 },
      cam: [{ at: .02, x: 540, y: 950, z: 1.03 }, { at: .4, x: 546, y: 956, z: 1.05 }, { at: .95, x: 552, y: 962, z: 1.07, hold: .1 }],
      world: { life: '41.40s' },
      raw: [
        orn(-.1, '46.30s'),
        rule(-.1, '46.30s', 1090),
        ico('pan', 110, 690, 520, -.06, '46.30s', { h: 312 }),
        ico('spark', 700, 560, 110, '40.30s', '41.20s'),
        ring(370, 860, 'кезде', '41.30s', 300),
      ] },

    /* 15 · 41.17–46.19 · тот же мир · «заказ бересің де, жұмыртқа қуырып береміз біз». Чек заказа влетает на «заказ»,
         яйцо падает на сковороду на «жұмыртқа» (нырок), искры жарки на «қуырып». Последний ключ — рост в окно. */
    { from: 'заказ', room: 'egg', grow: 'tk5',
      world: { card: false, ghost: 'ЖҰМЫРТҚА', ghostS: 180, ghostY: 1250, life: '46.30s' },
      cam: [{ at: .02, x: 546, y: 950, z: 1.05 },
            { aim: 'eg', dx: 180, dy: 100, z: 1.08, rot: -2, rx: 6, ry: -8, move: 1.1 },
            { at: .55, x: 520, y: 940, z: 1.08, rot: -2, rx: 6, ry: -8 },
            { at: .78, x: 540, y: 970, z: 1.07, rot: -1, rx: 5, ry: -6 }],
      el: [
        { r: 'wtitle', t: 'ЗАКАЗ БЕРЕСІҢ —', s: 92, on: 'заказ', row: 'title', still: true, u: '46.10s' },
        { r: 'whit', t: 'ҚУЫРЫП БЕРЕМІЗ', s: 60, y: 1120, on: 'құрып', still: true, gold: true, u: '46.10s' },
      ],
      raw: [
        { k: 'footage', mode: 'card', id: 'tk5', w: 300, border: 10, r: 26, anim: 'none', x: 660, y: 1180, at: -.02, until: '46.30s' },
        { ...ico('ticket', 700, 520, 190, 'заказ', '46.30s', { h: 253 }), anim: 'right' },
        ico('egg', 210, 660, 300, 'жұмыртқа', '46.30s', { id: 'eg', lift: 100, h: 250 }),
        lbl('ЖҰМЫРТҚА', 360, 1010, 'жұмыртқа', '46.30s', 'w'),
        ico('spark', 150, 600, 120, 'құрып', '46.30s'),
        ico('spark', 470, 640, 90, 'береміз', '46.30s'),
        ring(360, 820, 'бізді', '46.30s', 330),
      ] },

    /* 16 · 46.91–50.23 · ЛИЦО, ведущий · «Анамен болған кезде, Мәдинаға барған кезде — барлық рахат». */
    { from: 'анамен', room: 'face', cam: FACE,
      el: [
        { r: 'pill', t: 'анамен болған кезде,', on: 'анамен', u: '50.40s' },
        { r: 'line', t: 'БАРЛЫҚ РАХАТ', on: 'барған', u: '50.45s' },
      ],
      raw: [
        mini('d', 780, 1060, 'мәдин', '50.40s'),
        ico('spark', 820, 1170, 120, 'рахат', '50.40s'),
      ] },

    /* 17 · 50.55–55.01 · МИР-ВЫВОД «күндер» · «Қажылар айтады: бір күн Меккеде болып, қалған алты күнді Мәдинада
         өткізсек болады». Подводка «қажылар айтады» живёт в мире, а не отдельной плашкой на лице (1.2 с — не прочесть).
         Лицо сжимается в окно; семь клеток-дней: одна золотая МЕККЕ, шесть зелёных МӘДИНА, скобка-вывод вокруг шести. */
    { from: 'қазылар', room: 'days', shrink: 'tk9',
      cam: [{ at: .24, x: 540, y: 960, z: 1.0 }, { at: .45, x: 546, y: 950, z: 1.02 }, { at: .62, x: 552, y: 942, z: 1.04 },
            { at: .8, x: 556, y: 932, z: 1.06 }, { at: .97, x: 560, y: 924, z: 1.07, hold: .1 }],
      world: { card: false, ghost: '7 КҮН', ghostS: 260, ghostY: 1250, life: '55.70s' },
      el: [
        { r: 'wscript', t: 'қажылар айтады:', on: 'қазылар', row: 'top', u: '55.60s' },
        { r: 'wtitle', t: '1 КҮН — МЕККЕ', on: 'біргін', row: 'title', still: true, u: '55.60s' },
        { r: 'whit', t: '6 КҮН — МӘДИНА', on: 'алтыгынды', row: 'item1', still: true, gold: true, u: '55.60s' },
      ],
      raw: [
        { k: 'footage', mode: 'card', id: 'tk9', w: 300, border: 10, r: 26, anim: 'none', x: 660, y: 1180, at: -.3, until: '55.70s' },
        orn(-.1, '55.70s'),
        cell(0, 'gold', 'біргін', '55.70s', '1'),
        ...[1, 2, 3, 4, 5, 6].map(i => cell(i, 'green', `${(53.40 + (i - 1) * 0.07).toFixed(2)}s`, '55.70s', String(i + 1))),
        lbl('МЕККЕ', 172, 980, 'мекке', '55.70s'),
        lbl('МӘДИНА', 600, 980, 'мәдин', '55.70s', 'g'),
        { k: 'brk', x: 222, y: 840, w: 754, h: 144, on: 'өткісек', until: '55.70s' },
      ] },

    /* 18 · АУТРО — общее для клиента, выпуск №3. Превью выпуска — yt_thumb_03. */
    outro({ from: 'cta', title: 'УМРАНЫҢ ҚАБЫЛ БОЛУЫНА НЕ КЕДЕРГІ?', ep: 3, photo: 'yt_thumb_03.jpg' }),
  ],
}));
