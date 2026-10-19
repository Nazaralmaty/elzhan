#!/usr/bin/env node
/* engine/qa/ink.js [--gap 12] — столкновения строк, померенные по ЧЕРНИЛАМ, а не по line-box.
   overlap.js сравнивает getBoundingClientRect, а `line-height:.86` у .giant делает эту коробку
   КОРОЧЕ букв: нога Д/Ц и хвост Щ живут вне её. На кириллице (abat/reel_019, акт 1) строки
   наезжали друг на друга, а все коробочные гейты были зелёные.
   Чернила берутся из canvas TextMetrics: base = (H − (fbAsc+fbDesc))/2 + fbAsc,
   ink = base − actualAsc … base + actualDesc. Меряем в БУМАЖНЫХ координатах (window.PAPER,
   до камеры и до поворота) — лестница верстается там же. exit 1 на любом попадании. */
const path = require('path'); const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const GAP = arg('--gap', 12);
(async () => {
  const b = await launch(); const p = await b.newPage(); await p.setViewport({ width: 1080, height: 1920 });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' }); await p.waitForFunction('window.READY === true', { timeout: 60000 });
  const hits = await p.evaluate(GAP => {
    if (!window.PAPER) return ['жанр не отдаёт window.PAPER — гейт умеет только motion'];
    const cx = document.createElement('canvas').getContext('2d');
    const ink = ({ x, y, node }) => {
      const c = getComputedStyle(node), s = parseFloat(c.fontSize);
      const H = parseFloat(c.lineHeight) || s;
      cx.font = `${c.fontStyle} ${c.fontWeight} ${s}px ${c.fontFamily}`;
      const m = cx.measureText(node.textContent);
      const base = (H - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      return { t: y + base - m.actualBoundingBoxAscent, b: y + base + m.actualBoundingBoxDescent,
               l: x, r: x + m.width, txt: node.textContent.trim().slice(0, 26) };
    };
    const out = [];
    window.PAPER.forEach((toks, ai) => {
      const R = toks.map(ink);
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
        const a = R[i], c = R[j];
        if (Math.min(a.r, c.r) - Math.max(a.l, c.l) <= 0) continue;
        const clear = Math.max(a.t, c.t) - Math.min(a.b, c.b);
        if (clear < GAP - 0.5) out.push(`акт ${ai + 1}: "${a.txt}" × "${c.txt}" — просвет ${Math.round(clear)} px, нужно ${GAP}`);
      }
    });
    return out;
  }, GAP);
  await b.close();
  if (hits.length) { console.log(`INK: ${hits.length}`); hits.forEach(h => console.log('  ' + h)); process.exit(1); }
  console.log('ink: строки не сходятся ближе ' + GAP + ' px — чисто');
})().catch(e => { console.error(e); process.exit(1); });
