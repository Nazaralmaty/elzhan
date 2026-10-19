#!/usr/bin/env node
/* engine/qa/take.js — два закона Елжана про дубль в кадре, замером по отрендеренной странице.
   Запускать из папки ролика: node engine/qa/take.js [--step 0.1]

   1. РОЛИК ОТКРЫВАЕТСЯ ЛИЦОМ (Елжан, 17.09.2026, reel_005): на первых кадрах в кадре
      стоит дубль, и это не крохотная карточка. Общий план лица не даёт никаким кропом,
      поэтому порядок кусков подчиняется этому закону, а не хронологии.
   2. КРОМКА ВЫРЕЗКИ НЕ ВИДНА В КАДРЕ («нельзя никогда делать так, что границы матте
      спикера стоят до границ экрана… снизу, справа и слева он вырезан»): брак — это
      кромка, которая ВИДНА ВНУТРИ кадра (бюст обрывается посреди экрана и читается как
      человек, стоящий ни на чём). Кромка, уходящая ЗА рамку, — норма: её не видно.
      Низ исключается, если он растворён маской (`fade`, по умолчанию .16): у reel_006
      вырезка x 130 w 900 уходит низом на 2500 и гаснет на последних 16 % — это приём,
      а не брак, и первая версия этого гейта браковала именно его.

   Почему отдельный файл, а не правка qa/overlap.js: там пять точек раннего выхода
   (камера в движении, наклон, перелив, блюр), а кромки вылезают именно на отъезде —
   проверка обязана идти на каждом кадре. Главный гейт раскладки из-за этого не трогаем.
*/
const path = require('path');
const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? +argv[i + 1] : d; };
const STEP = arg('--step', 0.1);
const OPEN_BY = arg('--open-by', 0.30);   // к этому времени лицо обязано стоять
const MIN_W = arg('--min-w', 700);        // карточка уже лица: ниже этого «открылся карточкой»
const EDGE = arg('--edge', 2);            // на сколько px кромка должна уйти за рамку, чтобы её не было видно

(async () => {
  const b = await launch(); const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1920 });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await p.waitForFunction('window.READY === true', { timeout: 60000 });
  const { DUR } = await p.evaluate(() => window.REEL);

  const edges = [];
  let openedWith = null;
  for (let t = 0; t < DUR; t += STEP) {
    const r = await p.evaluate(async (t, EDGE) => {
      await window.seek(t);
      const op = e => { let o = 1, n = e; while (n && n !== document.body) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity); n = n.parentElement; } return o; };
      const takes = [];
      for (const e of document.querySelectorAll('.footage')) {
        if (op(e) < 0.5) continue;
        const q = e.getBoundingClientRect();
        if (q.width < 2 || q.right < 0 || q.left > 1080 || q.bottom < 0 || q.top > 1920) continue;
        const im = e.querySelector('img');
        const mask = im ? (getComputedStyle(im).maskImage || getComputedStyle(im).webkitMaskImage || 'none') : 'none';
        takes.push({ card: e.classList.contains('card'), cut: e.classList.contains('cut'),
                     faded: mask !== 'none' && mask !== '',
                     l: q.left, r: q.right, t: q.top, b: q.bottom, w: q.width });
      }
      const bad = takes.filter(k => k.cut && (k.l > EDGE || k.r < 1080 - EDGE || (!k.faded && k.b < 1920 - EDGE)));
      return { takes, bad };
    }, t, EDGE);

    if (openedWith === null && t <= OPEN_BY) {
      const big = r.takes.find(k => !k.card || k.w >= MIN_W);
      if (big) openedWith = { t, w: Math.round(big.w), kind: big.cut ? 'вырезка' : big.card ? 'карточка' : 'полный кадр' };
    }
    for (const k of r.bad) {
      const sides = [k.l > EDGE && `слева (${Math.round(k.l)}px в кадре)`,
                     k.r < 1080 - EDGE && `справа (${Math.round(1080 - k.r)}px в кадре)`,
                     !k.faded && k.b < 1920 - EDGE && `снизу (${Math.round(1920 - k.b)}px в кадре, без fade)`].filter(Boolean);
      edges.push({ t, sides: sides.join(', '), w: Math.round(k.r - k.l) });
    }
  }
  await b.close();

  let fail = 0;
  if (openedWith) console.log(`открытие: ${openedWith.kind} ${openedWith.w}px на ${openedWith.t.toFixed(2)} с`);
  else { fail++; console.log(`OPENS WITHOUT A FACE: к ${OPEN_BY.toFixed(2)} с в кадре нет дубля крупнее ${MIN_W}px → первым куском ставится крупный план, а не общий`); }

  if (edges.length) {
    fail++;
    const byside = {};
    for (const e of edges) (byside[e.sides] = byside[e.sides] || []).push(e.t);
    console.log(`MATTE EDGE VISIBLE: ${edges.length} кадров → камера ближе (z ≥ 1.06 по центру), или вырезка шире полосы камеры, или бит идёт полным кадром 9:16`);
    for (const [s, ts] of Object.entries(byside)) console.log(`  ${s}: ${ts[0].toFixed(1)}–${ts[ts.length - 1].toFixed(1)} с (${ts.length})`);
  } else console.log('кромки вырезки: не касаются кадра');

  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
