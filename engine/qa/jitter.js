#!/usr/bin/env node
/* engine/qa/jitter.js — text must not jerk. Two numbers, both accelerations:
     position |d²(x,y)|  limit 22 px/frame²      a jump of the whole element
     width    |d²(w)|    limit  8 px/frame²      a pulsing size (a refit loop, a scale fight)
   Run from the reel folder:  node engine/qa/jitter.js [--sel ".subs,.txt,.big,.strip,.counter"] [--fps 30] [--pos 22] [--wid 8]
   Measured in WORLD space (the camera transform is divided out), over EFFECTIVE opacity
   (the product down the ancestor chain) — otherwise invisible elements are measured and the
   number lies. An element is only measured while it is settled: effective opacity ≥ 0.9. */
const path = require('path');
const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const argv = process.argv.slice(2), arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SEL = arg('--sel', '.subs,.txt,.big,.strip,.counter,.tok,.cap,.giant,.hit');
const POS = +arg('--pos', 22), WID = +arg('--wid', 8);
(async () => {
  const b = await launch(); const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1920 });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await p.waitForFunction('window.READY === true', { timeout: 60000 });
  const { DUR, FPS } = await p.evaluate(() => window.REEL);
  const fps = +arg('--fps', FPS || 30);
  const track = {};
  for (let f = 0; f < Math.round(DUR * fps); f++) {
    const r = await p.evaluate(async (t, SEL) => {
      await window.seek(t);
      const eff = e => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= parseFloat(cs.opacity); } return o; };
      if (window.SWEEP) return [];   // перелив проецирует новый мир под старой камерой: шов — это и есть ход, не рывок (как в overlap.js)
      const cam = window.CAM || { x: 540, y: 960, zoom: 1 };
      const out = [];
      /* судится комната под центром кадра (как overlap.js): далёкий мир в наклоне проецируется в миллионы px, и зритель его не видит */
      const here = document.elementsFromPoint(540, 960).map(n => n.closest && n.closest('.room')).find(Boolean);
      document.querySelectorAll(SEL).forEach((e, i) => {
        const rm = e.closest('.room'); if (rm && here && rm !== here) return;
        if (eff(e) < 0.9) return; const r = e.getBoundingClientRect(); if (!r.width) return;
        if (r.right < 0 || r.left > 1080 || r.bottom < 0 || r.top > 1920) return;   // another world on the map: its projection swings with the camera, the viewer sees none of it
        out.push({ id: (e.id || e.className.split(' ')[0] || 'el') + '#' + i, x: (r.left - 540) / cam.zoom + cam.x, y: (r.top - 960) / cam.zoom + cam.y, w: r.width / cam.zoom, txt: (e.textContent || '').trim().slice(0, 40) });
      });
      return out;
    }, f / fps, SEL);
    for (const e of r) (track[e.id] || (track[e.id] = [])).push({ f, ...e });
  }
  await b.close();
  const bad = [];
  for (const id in track) {
    const T = track[id];
    for (let i = 2; i < T.length; i++) {
      if (T[i].f !== T[i - 1].f + 1 || T[i - 1].f !== T[i - 2].f + 1) continue;   // only across consecutive frames
      const ax = T[i].x - 2 * T[i - 1].x + T[i - 2].x, ay = T[i].y - 2 * T[i - 1].y + T[i - 2].y;
      const aw = T[i].w - 2 * T[i - 1].w + T[i - 2].w;
      const ap = Math.hypot(ax, ay);
      if (ap > POS) bad.push(`${(T[i].f / fps).toFixed(2)}s  ${id} "${T[i].txt}"  position ${ap.toFixed(1)} px/f² (limit ${POS})`);
      if (Math.abs(aw) > WID && T[i].txt === T[i - 1].txt && T[i - 1].txt === T[i - 2].txt) /* a counter legitimately grows a digit: only a STATIC string may not pulse */ bad.push(`${(T[i].f / fps).toFixed(2)}s  ${id} "${T[i].txt}"  width ${Math.abs(aw).toFixed(1)} px/f² (limit ${WID}) — a size fight or a refit loop`);
    }
  }
  const U = [...new Set(bad)];
  console.log(U.length ? `JITTER: ${U.length} hits\n  ` + U.slice(0, 30).join('\n  ') : `jitter: clean (${Object.keys(track).length} elements tracked)`);
  process.exit(U.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
