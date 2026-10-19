/* atlas_tourism — АУТРО. Один на все ролики клиента.

   Правка Елжана 20.09.2026 на reel_015: «конец сделай таким же, какой был на остальных
   роликах, один единый аутро для всех рилсов». До этого аутро писалось в каждом спеке
   заново, и роликов стало два вида: 009–013 — тёмный грунт, фотография подкаста на скотче,
   кнопка YouTube и призрак ATLAS; 014–015 — плоский зелёный лист с тремя строками.
   Второй вид снят. Числа ниже сняты с принятого reel_013 (54.50–59.50) и reel_012.

   ВРЕМЯ СЧИТАЕТСЯ ДОЛЯМИ БИТА, А НЕ СЕКУНДАМИ. Бит аутро существует потому, что в
   `assets/vo/words.js` дописано синтетическое слово:
       {"w": "cta", "t0": <конец речи>, "t1": <конец речи + 5.0>}
   Пять секунд — длина, на которой считался закон чтения (`_ассеты/read.py`): ярлыку
   «Atlas Tourism YouTube-та» нужно 2.05 с, и на четырёх секундах он их не получает.
   Без этого слова бит аутро равен последнему слову речи (доли ужимаются в 0.4 с),
   и вся вёрстка съезжает в один кадр.

   Ролик подключает так:
       import { outro } from '../_ассеты/outro.js';
       ...beats: [ ..., outro({ from: 'cta' }) ]
   и держит комнату `{ id: 'cta', ..., bg: 'dark' }` — грунт тёмный, золото на нём живое.  */

import { PAL, COL, ROW } from './geom.js';

const GOLD = PAL.gold;

const A_MARK = `<div class="amark"><svg width="46" height="46" viewBox="0 0 46 46"><path d="M23 5 L41 40 H5 Z" fill="none" stroke="${GOLD}" stroke-width="3.4"/><path d="M23 20 L31 36 H15 Z" fill="${GOLD}"/></svg><b>Atlas&nbsp;Podcast</b></div>`;
const YT = `<div class="yt"><svg width="64" height="46" viewBox="0 0 64 46"><rect width="64" height="46" rx="12" fill="#0A0D10"/><path d="M26 14 L44 23 L26 32 Z" fill="#F4EDE0"/></svg><b>ATLAS TOURISM</b></div>`;

const hitS = t => Math.max(40, Math.min(112, Math.floor(830 / (t.length * 0.62))));

/* Ролик вправе поменять только выпуск: название, номер и отпечаток (№2 — title 'ҚАЖЫЛЫҚҚА
   БАРАТЫНДАР АРАБҚҰЛ МА?', ep 2, photo 'yt_thumb_02.jpg' — превью самого выпуска). */
export function outro({ from = 'cta', room = 'cta', title = 'УМРА САПАРЫНА ДАЙЫНДЫҚ', ep = 1, photo = 'pod_wide.jpg',
                        cut = { kind: 'iris', color: GOLD, x: 540, y: 880, in: .30, out: .34, lead: .08 } } = {}) {
  return {
    from, room, cut,
    /* Нырок на кнопку YouTube: последнее движение ролика ведёт глаз в действие, а не в текст. */
    cam: [
      { at: 0, x: 540, y: 950, z: 1.04 },
      { aim: 'yt', dx: 0, dy: -60, z: 1.12, rot: -2, rx: 8, ry: -9, move: 1.20 },
      { at: .90, x: 552, y: 1010, z: 1.12, rot: -2, rx: 8, ry: -9, hold: .40 },
    ],
    raw: [
      { k: 'beam', x: -500, y: -520, w: 2100, speed: 12, o: .45, depth: .86, at: -.20 },
      { k: 'ghost', t: 'ATLAS', outline: true, s: 380, x: -20, y: 1470, depth: .8, at: -.18 },
      { /* x 596, а не 640: на нырке аутро (ry −9) правый край фриза уезжал за кромку на 12 px —
            замер `qa/overlap.js` 22.09.2026, INSERT OUT OF FRAME. Орнамент дальше от края на
            44 px, композиция та же. */
        k: 'img', src: 'orn_frieze_dim.svg', x: 596, y: 1440, w: 300, at: .04, anim: 'fade' },
      /* at .04, а не −.06 (30.09.2026): вставка звучит в момент появления, а на −.06 бит аутро ещё закрыт ирисом —
         «поп» играл за 0.3 с до перехода в тишине после последнего слова (reel_024, reel_026: «в конце обрыв»). */
      { k: 'html', x: COL.text, y: 200, w: 420, h: 50, at: -.02, anim: 'up', html: A_MARK },
      { k: 'text', t: 'Подкасттың толық нұсқасы —', voice: 'script', s: 44, x: COL.text, y: ROW.world.top,
        at: .10, words: false, until: .93 },
      /* 21.09.2026 (Елжан на reel_017: «вставка с ютубом atlas tourism затмевает слова atlas
         podcast»): фотография стояла на 780, и её подпись `ATLAS PODCAST · №1` уходила под
         кнопку YouTube. Замер экрана: низ отпечатка 1145, верх кнопки 1069 — перекрытие 76 px.
         Отпечаток поднят на 110 px (низ 1022), кнопка и ярлык остались на своих рядах. */
      { k: 'photo', src: photo, cap: `ATLAS PODCAST · №${ep}`, tape: 'lt',
        x: 200, y: 670, w: 560, rot: -3, at: .12 },
      { k: 'text', t: title, voice: 'hit', s: hitS(title), wrap: COL.wrap, x: COL.text, y: ROW.world.title,
        at: .22, sweep: true, dur: .5, until: .93 },
      { k: 'html', id: 'yt', x: 240, y: 1120, w: 480, h: 92, at: .42, anim: 'up', lift: 130, html: YT },
      { k: 'pill', cls: 'tag', t: 'Atlas Tourism YouTube-та', s: 34, x: COL.text, y: ROW.world.cta,
        at: .48, anim: 'pop', until: .93 },
    ],
  };
}
