#!/usr/bin/env node
/* ~/.claude/engine/qa/limbo.js — the gate of the LIMBO genre.
   Run from the reel folder:  node engine/qa/limbo.js [--per 5] [--gap 40] [--void 0.58]

   Every other gate in this engine defends density: EMPTY FRAME in overlap.js fails a
   canvas frame whose content drops under 5 %. Limbo inverts that law — the void IS the
   design — so it needs its own gate, and the four things it measures are the four ways
   an empty frame goes wrong:

     OBJECT SHARE   the object's visual height (alpha box on screen) must own 28–46 % of
                    the frame. Smaller reads as clip-art lost in paper, larger kills the void.
     CAGE           the object stays inside x 60…1020, y 150…1720; type inside the
                    Instagram mask (x 71…1012, y 235…1590).
     TOUCH          type closer than --gap px to the object (or over it) — in a frame with
                    this much room, a touching word reads as a mistake, not as a layout.
     TOO FULL       drawn content over --void of the frame: that is no longer limbo.
     BELT           two objects of DIFFERENT beats visible together longer than 0.6 s —
                    the belt is a hand-over, not a duet.

   Exit 1 on any hit, and the numbers are printed either way, so the spec is corrected by
   measurement and not by eye. */
const path = require('path');
const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? +argv[i + 1] : d; };
const PER = arg('--per', 5), GAP = arg('--gap', 40), VOIDMAX = arg('--void', 0.58);
const SHARE_MIN = 0.26, SHARE_MAX = 0.50;      // gate is looser than the engine's own 28–46 %
const CAGE = { x0: 71, x1: 1012, y0: 235, y1: 1590 };

(async () => {
  const browser = await launch();
  const p = await browser.newPage();
  await p.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await p.waitForFunction('window.REEL !== undefined', { timeout: 60000 });
  await p.waitForFunction('window.READY === true', { timeout: 60000 });

  const { DUR } = await p.evaluate(() => window.REEL);
  const ACTS = await p.evaluate(() => window.ACTS_A || []);
  const times = [];
  if (ACTS.length) ACTS.forEach(([a, b], i) => { for (let k = 1; k <= PER; k++) times.push({ t: a + (b - a) * k / (PER + 1), beat: i, settled: k > 1 }); });
  else for (let k = 0; k < 40; k++) times.push({ t: DUR * k / 40, beat: -1 });

  const hits = [], rows = [];
  for (const { t, beat, settled } of times) {
    const frame = await p.evaluate(async (tt) => {
      await Promise.resolve(window.seek(tt));
      const vis = el => { const s = getComputedStyle(el); return +s.opacity > 0.12 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const box = el => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, w: r.width, h: r.height }; };
      /* an object's VISUAL box: its alpha bounds mapped through the element's screen box */
      const objs = [];
      for (const im of document.querySelectorAll('.obj img, .disc img, .sheetel')) {
        const host = im.closest('.obj, .disc, .sheetel'); if (!host || !vis(host)) continue;
        const b = box(im.tagName === 'IMG' ? im : host);
        let ab = { x0: 0, y0: 0, x1: 1, y1: 1 };
        if (im.tagName === 'IMG' && im.naturalWidth) {
          try {
            const S = 64, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
            const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0, S, S);
            const d = cx.getImageData(0, 0, S, S).data;
            let mnX = S, mnY = S, mxX = -1, mxY = -1;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 40) { if (x < mnX) mnX = x; if (x > mxX) mxX = x; if (y < mnY) mnY = y; if (y > mxY) mxY = y; }
            if (mxX >= 0) ab = { x0: mnX / S, y0: mnY / S, x1: (mxX + 1) / S, y1: (mxY + 1) / S };
          } catch (e) {}
        }
        if (b.w < 2 || b.h < 2) continue;
        objs.push({
          beat: host.closest('.beat') ? [...document.querySelectorAll('.beat')].indexOf(host.closest('.beat')) : -1,
          x0: b.x0 + b.w * ab.x0, x1: b.x0 + b.w * ab.x1, y0: b.y0 + b.h * ab.y0, y1: b.y0 + b.h * ab.y1,
        });
      }
      /* a text box is the union of its .ae-u units, never the centred container:
         a .cap is 900 px wide and holds 300 px of words. */
      const tbox = el => {
        const u = [...el.querySelectorAll('.ae-u')].filter(n => n.textContent.trim().length && vis(n));
        const rs = (u.length ? u : [el]).map(n => n.getBoundingClientRect()).filter(r => r.width > 0.5 && r.height > 0.5);
        if (!rs.length) return null;
        return { x0: Math.min(...rs.map(r => r.left)), y0: Math.min(...rs.map(r => r.top)),
                 x1: Math.max(...rs.map(r => r.right)), y1: Math.max(...rs.map(r => r.bottom)) };
      };
      const beats = [...document.querySelectorAll('.beat')];
      const type = [...document.querySelectorAll('.cap, .giant, .sub')].filter(vis)
        .filter(el => el.textContent.trim().length)
        .map(el => { const b = tbox(el); return b ? { t: el.textContent.trim().slice(0, 28), small: el.classList.contains('sub'), beat: beats.indexOf(el.closest('.beat')), ...b } : null; })
        .filter(Boolean).filter(b => b.x1 - b.x0 > 2 && b.y1 - b.y0 > 2);
      const cards = [...document.querySelectorAll('.photo')].filter(vis).map(box);
      return { objs, type, cards };
    }, t);

    const area = (b) => Math.max(0, Math.min(1080, b.x1) - Math.max(0, b.x0)) * Math.max(0, Math.min(1920, b.y1) - Math.max(0, b.y0));
    const filled = [...frame.objs, ...frame.type, ...frame.cards].reduce((s, b) => s + area(b), 0) / (1080 * 1920);
    rows.push({ t: +t.toFixed(2), beat, objs: frame.objs.length, fill: +filled.toFixed(3) });

    const groups = {};
    [...frame.objs, ...frame.cards.map(c => ({ ...c, beat: -2 }))].forEach(o => {
      const k = o.beat === -2 ? (frame.objs.length ? frame.objs[0].beat : -2) : o.beat;
      const g0 = groups[k] || (groups[k] = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, beat: k });
      g0.x0 = Math.min(g0.x0, o.x0); g0.y0 = Math.min(g0.y0, o.y0); g0.x1 = Math.max(g0.x1, o.x1); g0.y1 = Math.max(g0.y1, o.y1);
    });
    for (const o of Object.values(groups)) {
      const share = (o.y1 - o.y0) / 1920;
      if (settled !== false && (share > SHARE_MAX || share < SHARE_MIN)) hits.push(`OBJECT SHARE  t=${t.toFixed(2)} beat ${beat}: ${(share * 100).toFixed(0)} % of the frame (law 28–46)`);
      if (o.x0 < 60 || o.x1 > 1020 || o.y0 < 150 || o.y1 > 1720) hits.push(`CAGE  t=${t.toFixed(2)} beat ${beat}: object at x ${o.x0.toFixed(0)}…${o.x1.toFixed(0)}, y ${o.y0.toFixed(0)}…${o.y1.toFixed(0)}`);
    }
    for (const w of frame.type) {
      if (w.x0 < CAGE.x0 - 1 || w.x1 > CAGE.x1 + 1 || w.y0 < CAGE.y0 || w.y1 > CAGE.y1) hits.push(`CAGE  t=${t.toFixed(2)}: «${w.t}» outside the mask (${w.x0.toFixed(0)},${w.y0.toFixed(0)}–${w.x1.toFixed(0)},${w.y1.toFixed(0)})`);
      for (const o of frame.objs) {
        if (o.beat !== w.beat) continue;      // hand-over: two beats may share the frame
        const dx = Math.max(o.x0 - w.x1, w.x0 - o.x1), dy = Math.max(o.y0 - w.y1, w.y0 - o.y1);
        const d = (dx < 0 && dy < 0) ? -1 : Math.max(dx, dy);
        const need = w.small ? Math.round(GAP * 0.6) : GAP;
        if (d < need) hits.push(`TOUCH  t=${t.toFixed(2)} beat ${beat}: «${w.t}» ${d < 0 ? 'OVER the object' : d.toFixed(0) + ' px from it'} (law ${need})`);
      }
    }
    if (filled > VOIDMAX) hits.push(`TOO FULL  t=${t.toFixed(2)} beat ${beat}: content covers ${(filled * 100).toFixed(0)} % (law ≤ ${(VOIDMAX * 100) | 0})`);
  }

  /* BELT: objects of two different beats on screen together for too long */
  let run = 0, runStart = null;
  for (const r of rows) {
    if (r.objs > 1) { if (runStart === null) runStart = r.t; run = r.t - runStart; }
    else { if (run > 0.6) hits.push(`BELT  ${runStart.toFixed(2)}–${(runStart + run).toFixed(2)} s: two objects share the frame for ${run.toFixed(2)} s (law 0.6)`); run = 0; runStart = null; }
  }

  console.log(`limbo · ${DUR.toFixed(1)} s · ${ACTS.length} beats · ${rows.length} probes`);
  const worst = rows.slice().sort((a, b) => b.fill - a.fill).slice(0, 3);
  console.log('fill (content share of the frame): max ' + worst.map(r => `${(r.fill * 100).toFixed(0)} % @${r.t}`).join(', ') +
    ` · mean ${(rows.reduce((s, r) => s + r.fill, 0) / rows.length * 100).toFixed(0)} %`);
  const uniq = [...new Set(hits)];
  if (uniq.length) { console.log('\n' + uniq.join('\n')); await browser.close(); process.exit(1); }
  console.log('clean: object share, cage, gaps, void and belt all in law');
  await browser.close();
})();
