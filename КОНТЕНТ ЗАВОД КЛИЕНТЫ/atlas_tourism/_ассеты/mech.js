/* atlas_tourism — механика спека. Пишется один раз, ролик задаёт только переменные.
   Разворачивает компактное объявление бита в те же элементы, которые раньше писались руками.
   Проверено на принятом reel_008_ruhani.

   Спек ролика выглядит так:
     import { mount } from './engine/genre/speaker-canvas.js';
     import { reel } from '../_ассеты/mech.js';
     mount(reel({ rooms: [...], beats: [...] }));

   ЧЕМ ВЛАДЕЕТ МЕХАНИКА: лестница, кегль роли, цвет роли, связанная декорация,
   ключи камеры, жизнь элемента. Это законы клиента.
   ЧЕМ НЕ ВЛАДЕЕТ: какой приём в каком бите, сколько элементов, какой мир — это ритм,
   и он остаётся авторским. Иначе второй ролик станет копией первого. */

import { PAL, COL, ROW, SIZE, fitHit, CAM, CARD, FONTS, FX, BGM } from './geom.js';

const LEAVE = .94;                     // уйти в конце своего бита — типовой случай
const HIT_DEF = 104;                   // типовой кегль заголовка: закон `знаков × s × 0.58 ≤ wrap`
                                       // это ПОТОЛОК, а не решатель — на коротких словах он не связывает
const hitS = t => Math.min(fitHit(t), HIT_DEF);
const needWrap = t => String(t).length >= 8;

/* Ряд не вычисляется счётчиком — он ВЫБИРАЕТСЯ, но только из закрытого списка имён.
   Замер reel_008: автор ставит плашки то 1300→1390→1480, то снова 1390 — ряд освобождается,
   когда предыдущая ушла. Арифметикой это не берётся, а свободные числа дают «субтитры
   в разных местах». Поэтому переменные ролика называют ряд, а не координату. */

/* Роли. Каждая знает свою колонку, ряд, кегль и голос — в переменных ролика этого нет. */
const ROLE = {
  kicker: e => ({ k: 'text', voice: 'script', s: e.s || SIZE.kicker, x: COL.text,
                  y: ROW.face[e.row || 'kicker'], words: false,
                  ...(e.wrap ? { wrap: COL.wrap } : {}) }),
  hit:    e => ({ k: 'text', voice: e.gold ? 'hit gold' : 'hit', s: e.s || hitS(e.t),
                  x: COL.text, y: ROW.face.hit, ...(needWrap(e.t) ? { wrap: COL.wrap } : {}),
                  ...(e.type ? { chars: 'type', dur: e.dur || .5 } : { sweep: true, dur: e.dur || .5 }) }),
  pill:   (e, i) => ({ k: 'pill', s: e.s || SIZE.pill, x: COL.text,
                  y: ROW.face[e.row || 'pill1'], anim: 'pop', rot: e.rot ?? [-2, 2, -1][i % 3] }),
  band:   e => ({ k: 'band', s: e.s || Math.min(SIZE.band.max, fitHit(e.t)), x: COL.band,
                  y: ROW.face[e.row || 'band'], rot: e.rot ?? -4, anim: 'pop' }),

  /* Крупная строка поверх съёмки. Это `band` на ряду `ROW.face.line` и без поворота — единственная
     форма, в которой заголовок читается на светлой рубашке и не выходит из клетки Инстаграма
     (замер 20.09.2026, reel_014; причина — CLAUDE.md клиента §5).

     Кегль считается ОТ УЗКОЙ КЛЕТКИ, а не от `wrap`: ряд 1386 лежит ниже 1348, и правый край
     плашки обязан остаться ≤ 858. Ширина плашки = знаков × s × 0.582 + 120 px полей (замер
     экрана на reel_017: «САҒИ ЖӘНЕ ШАШ АЛДЫРУ», 20 знаков, s 60 → 818 px). Отсюда
     s ≤ (858 − 124 − 120) / (знаков × 0.582) ≈ 1020 / знаков с запасом 20 px.
     Потолок 54, пол 40. Строка, которой при этом не хватает кегля (длиннее ~25 знаков),
     разбивается автором на плашку и довод — растягивать её через всю клетку нельзя. */
  line:   e => ({ k: 'band', s: e.s || Math.max(40, Math.min(54, Math.floor(1020 / String(e.t).length))),
                  x: COL.band, y: ROW.face.line, rot: 0, anim: 'pop' }),

  /* Мировые роли — своя колонка рядов, считается от верха комнаты */
  /* `still: true` — заголовок появляется ЦЕЛИКОМ, а не по слову на своём слове речи.
     Кинетика (по умолчанию) собирает строку к моменту, когда в речи прозвучит её последнее
     слово: на бите в 4+ секунды это язык жанра, на бите в 2 секунды строка дочитывается
     за 0.7 с вместо законных двух. Замер reel_016: «ТРАНСФЕРЛІК БӨЛІМ ЖОҚ» родился на
     20.64, а собрался к 22.40 при жизни до 23.12. Короткий мир — `still`. */
  wtitle: e => ({ k: 'text', voice: e.gold ? 'hit gold' : 'hit', s: e.s || hitS(e.t),
                  x: COL.text, y: ROW.world[e.row || 'top'],
                  ...(e.still ? { words: false } : {}),
                  ...(needWrap(e.t) ? { wrap: COL.wrap } : {}) }),
  wscript:e => ({ k: 'text', voice: 'script', s: e.s || SIZE.script, x: COL.text,
                  y: ROW.world[e.row || 'script'], words: false,
                  ...(e.wrap ? { wrap: COL.wrap } : {}) }),
  witem:  (e, i) => ({ k: 'pill', s: e.s || 42, x: COL.text,
                  y: ROW.world[e.row || 'item1'], anim: 'pop', rot: e.rot ?? [-2, 2, -1][i % 3] }),
  whit:   e => ({ k: 'text', voice: e.gold ? 'hit gold' : 'hit', s: e.s || hitS(e.t),
                  x: COL.text, y: ROW.world[e.row || 'item1'],
                  ...(e.still ? { words: false } : {}),
                  ...(needWrap(e.t) ? { wrap: COL.wrap } : {}) }),
};

/* Связанная декорация мира: луч, призрачное слово и карточка спикера приходят втроём
   на вход в мир. Раньше это были три написанных руками элемента на каждый мир. */
const worldDecor = (w, i) => {
  const life = w.life ?? 3.9;
  return [
    { k: 'beam', x: -500, y: -520 - (i % 2) * 40, w: 2100, speed: 10 + (i % 3), o: .45,
      depth: .86, at: -.25, until: life },
    ...(w.ghost ? [{ k: 'ghost', t: w.ghost, outline: true, s: w.ghostS || SIZE.ghost,
      x: -20, y: w.ghostY || 1330, depth: .8, at: -.15, until: life }] : []),
    /* `cardDir` — вторая дорожка кадров (`work/fr2`), кропнутая по ГОВОРЯЩЕМУ. Нужна там,
       где под полотном лежит общий план: штатная карточка берёт кроп плейта, а он снят под
       крупный, и в окно попадает середина стола. Дорожка режется тем же резом, что основная. */
    ...(w.card === false ? [] : [{ k: 'footage', mode: 'card', ...CARD,
      ...(w.cardDir ? { dir: w.cardDir } : {}),
      x: w.cardX ?? 660, y: w.cardY ?? 1180, w: w.cardW ?? CARD.w, at: -.2, until: life }]),
  ];
};

/* until: доля — уйти в своём бите, строка/число — абсолютная секунда или секунды от входа */
const life = e => (e.u === undefined ? LEAVE : e.u);

function expand(b, bi, ctx) {
  const out = [];
  if (b.world) out.push(...worldDecor(b.world, bi));
  /* Ряды `line` (1386) и `pill1` (1404) стоят в 18 px друг от друга — под головой больше
     места нет (geom.js ROW). Поэтому бит с крупной строкой кладёт свой довод на `pill2`
     сам, а не надеется на память автора: иначе плашка и довод налезают друг на друга. */
  const hasLine = (b.el || []).some(e => e.r === 'line');
  for (let e of b.el || []) {
    if (hasLine && e.r === 'pill' && (e.row || 'pill1') === 'pill1') e = { ...e, row: 'pill2' };
    const make = ROLE[e.r];
    if (!make) throw new Error(`mech: неизвестная роль "${e.r}" в бите ${bi}`);
    const idx = e.r === 'pill' ? ctx.pill++ : e.r === 'witem' ? ctx.item++ : 0;   // только для дребезга rot
    const base = make(e, idx);
    out.push({
      ...base,
      ...(e.t !== undefined ? { t: e.t } : {}),
      ...(e.id ? { id: e.id } : {}),
      ...(e.on ? { on: e.on } : { at: e.at ?? .04 }),
      until: life(e),
      ...(e.x !== undefined ? { x: e.x } : {}),
      ...(e.y !== undefined ? { y: e.y } : {}),
      ...(e.rot !== undefined ? { rot: e.rot } : {}),
    });
  }
  /* Люк: сырые элементы дописываются ПОСЛЕ механики, не вместо неё.
     Нужен нырками (aim), полноэкранными вставками, mode:'cut' и аутро. */
  if (b.raw) out.push(...b.raw);
  return out;
}

export function reel(spec) {
  let room = null, ctx = { pill: 0, item: 0 };
  const beats = spec.beats.map((b, i) => {
    const { el, raw, world, cam, ...rest } = b;
    if (b.room !== room) { room = b.room; ctx = { pill: 0, item: 0 }; }   // смена комнаты обнуляет счёт
    return {
      ...rest,
      ...(cam ? { cam: typeof cam === 'string' ? CAM[cam]() : Array.isArray(cam) ? cam
                     : CAM[cam.p || 'face'](cam.y, cam.z, cam.end) } : {}),
      add: expand(b, i, ctx),
    };
  });
  return {
    ...FX, fonts: FONTS, bgm: BGM,
    /* wig и drift НЕ трогаем: speaker-canvas.js уже ставит `spec.wig ?? 0` (дрожания нет)
       и свой drift по умолчанию. Принятые эталоны отрендерены с ним — выключать его значит
       менять картинку против того, на чём механика проверялась. */
    subs: spec.subs ?? false,
    rooms: spec.rooms,
    beats,
    ...(spec.extra || {}),
  };
}

export { PAL, ROW, COL, SIZE, fitHit };
