#!/usr/bin/env node
/* ~/.claude/engine/qa/rows.js — the type ladder: ONE column, FEW rows, ONE coordinate system.
   Run from the reel folder:  node engine/qa/rows.js [--tol 8] [--near 40] [--rows 6] [--cols 2] [--fr 0.82]

   Why it exists: Elzhan, 17.09.2026, on atlas reel_008 — «субтитры появляются все время в разных местах,
   нет единой концепции». Every gate before this one judged elements one at a time (out of frame, over each
   other, off the head) and every one of them was clean while the reel put lettering on 21 different rows:
   the y in the spec was ONE (1150/1210/1380/1470) and the camera zoom of each beat (1.06…1.30) multiplied
   the distance from the frame centre. A composition is the RELATION between acts, so it is measured across
   acts — and in the coordinate system the viewer actually reads:

     screen space (the #hud layer, subtitles, anything `screen: true`) — rows measured on the frame edge;
                  the cage lives here too: x 71…1012, y 235…1590, right ≤ 858 below y 1348.
     world space  (a room the camera flies through) — rows measured in the room's own coordinates
                  (window.ELS, the declared x/y), because a world moves as a whole and that reads as design.

   FAIL:
     RIDES THE CAMERA   lettering in front of the take sitting inside the footage room — one zoom and the
                        ladder is somewhere else. Type in the headroom (`behind: true`) is exempt.
     NEAR ROWS/COLUMNS  two rows (columns) --tol…--near px apart: flush or 40+, the rule frame.py already
                        applies to edges inside one frame.
     TOO MANY           more than --rows rows or --cols columns in one space — that IS «нет единой концепции».
     OUT OF CAGE        screen lettering outside the Instagram mask.
   Prints the ladder either way, so the numbers for the spec come from the gate and not from the eye. */
const path = require('path');
const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? +argv[i + 1] : d; };
const TOL = arg('--tol', 8), NEAR = arg('--near', 40), MAXROWS = arg('--rows', 6), MAXCOLS = arg('--cols', 2), FR = arg('--fr', 0.82);
/* lettering only: a ghost word is the background, a caption belongs to its own print, footage is not type */
const SEL = '.txt,.pill,.band,.chip,.bar,.row,.num,.count,.giant,.subs';
const LETTER = ['text', 'pill', 'band', 'chip', 'num', 'count', 'quote'];
const CAGE = { x0: 71, x1: 1012, y0: 235, y1: 1590, icy: 1348, icx: 858 };

const clusters = (vals, tol) => {
  const out = [];
  for (const it of [...vals].sort((a, b) => a.v - b.v)) {
    const last = out[out.length - 1];
    if (last && it.v - last.max <= tol) { last.items.push(it); last.max = it.v; last.mean = last.items.reduce((s, x) => s + x.v, 0) / last.items.length; }
    else out.push({ items: [it], max: it.v, mean: it.v });
  }
  return out;
};
const label = e => `${e.cls || e.k} "${(e.txt || '').slice(0, 18)}" (act ${e.act}${e.y2 ? `, h ${e.y2 - e.y}` : ''})`;
const line = c => `${Math.round(c.mean).toString().padStart(5)}  ×${String(c.items.length).padEnd(3)} ` +
  c.items.slice(0, 4).map(i => label(i.e)).join(' · ') + (c.items.length > 4 ? ' …' : '');

let fail = 0;
const ladder = (name, els, maxRows) => {
  if (!els.length) return;
  console.log(`\n── ${name}: ${els.length} pieces of lettering in ${new Set(els.map(e => e.act)).size} acts`);
  for (const [axis, key, limit, tag] of [['rows', 'y', maxRows, 'ROWS'], ['columns', 'x', MAXCOLS, 'COLUMNS']]) {
    const cl = clusters(els.map(e => ({ v: e[key], e })), TOL);
    console.log(`  ${axis} (${cl.length}):`); cl.forEach(c => console.log('    ' + line(c)));
    for (let i = 1; i < cl.length; i++) {
      const gap = cl[i].mean - cl[i - 1].mean;
      if (gap > TOL && gap < NEAR) { fail++; console.log(`  NEAR ${tag}: ${Math.round(cl[i - 1].mean)} and ${Math.round(cl[i].mean)} — ${Math.round(gap)}px apart, flush or ${NEAR}+  (${label(cl[i - 1].items[0].e)} / ${label(cl[i].items[0].e)})`); }
    }
    if (cl.length > limit) { fail++; console.log(`  TOO MANY ${tag}: ${cl.length} in ${name}, ceiling ${limit} — one ladder for the reel, not one per beat`); }
  }
};

(async () => {
  const b = await launch(); const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1920 });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await p.waitForFunction('window.READY === true', { timeout: 60000 });
  const acts = await p.evaluate(() => window.ACTS_A);
  const FRoom = await p.evaluate(() => { const pl = document.querySelector('.footage.plate'); const rm = pl && pl.closest('.room'); return rm ? rm.dataset.room : ''; });
  const screen = [], rides = {}, cage = {};
  for (let i = 0; i < acts.length; i++) {
    const [a0, a1] = acts[i]; const t = a0 + (a1 - a0) * FR;
    const r = await p.evaluate(async (t, SEL, FRoom) => {
      await window.seek(t);
      const effOp = e => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= parseFloat(cs.opacity); } return o; };
      const out = [];
      for (const e of document.querySelectorAll(SEL)) {
        const txt = (e.textContent || '').trim(); if (!txt) continue;
        if (e.closest('.ghost, .footage, .photo, .yt, .amark, .behind')) continue;
        if (effOp(e) < 0.9) continue;
        const q = e.getBoundingClientRect();
        /* Слой субтитров движка — строка во всю ширину 1080, текст по центру. Клетку судят БУКВЫ
           (коробка слоя давала OUT OF CAGE на каждом ролике жанра: icon/reel_037 — 9 из 9 субтитры),
           а лестницу — коробка слоя: у центрированной строки левый край свой на каждой фразе. */
        let g = q;
        if (e.classList.contains('subs')) {
          const us = [...e.querySelectorAll('.ae-u')].map(u => u.getBoundingClientRect()).filter(b => b.width > 1);
          if (us.length) g = { left: Math.min(...us.map(b => b.left)), right: Math.max(...us.map(b => b.right)),
                               top: Math.min(...us.map(b => b.top)), bottom: Math.max(...us.map(b => b.bottom)) };
        }
        if (q.width < 2 || q.right < 0 || q.left > 1080 || q.bottom < 0 || q.top > 1920) continue;   // another world on the map
        const rm = e.closest('.room');
        out.push({ txt: txt.slice(0, 26), cls: [...e.classList].filter(c => c !== 'e').join('.'),
          room: rm ? rm.dataset.room : '', inRoom: !!rm,
          screen: !!e.closest('#hud') || e.classList.contains('subs') || !!e.closest('.subs'),
          x: Math.round(q.left), y: Math.round(q.top), x2: Math.round(q.right), y2: Math.round(q.bottom),
          gx: Math.round(g.left), gy: Math.round(g.top), gx2: Math.round(g.right), gy2: Math.round(g.bottom) });
      }
      return out;
    }, t, SEL, FRoom);
    for (const e of r) {
      const el = { ...e, act: i };
      if (e.screen) {                                    // screen space: the ladder the viewer reads
        screen.push(el);
        const v = [];
        if (e.gx < CAGE.x0) v.push(`left ${e.gx}`);
        if (e.gx2 > CAGE.x1) v.push(`right ${e.gx2}`);
        if (e.gy < CAGE.y0) v.push(`top ${e.gy}`);
        if (e.gy2 > CAGE.y1) v.push(`bottom ${e.gy2}`);
        if (e.gy2 > CAGE.icy && e.gx2 > CAGE.icx) v.push(`icon column ${e.gx2}@${e.gy2}`);
        if (v.length) cage[`${label(el)}  ${v.join(', ')}`] = 1;
      } else if (FRoom && e.room === FRoom) rides[label(el)] = 1;  // front lettering welded to the plate; no footage → no plate (lifted lettering has no room either)
    }
  }
  const els = (await p.evaluate(() => window.ELS || [])).filter(e => LETTER.includes(e.k) && !e.screen && e.room !== FRoom && e.room !== '__hud');
  await b.close();

  ladder('screen space', screen, MAXROWS);
  ladder('world space (declared x/y)', els.map(e => ({ ...e, txt: e.t, cls: e.k })), MAXROWS);
  const R = Object.keys(rides), C = Object.keys(cage);
  if (R.length) { fail++; console.log(`\nRIDES THE CAMERA: ${R.length} — front lettering inside the footage room, the zoom moves it (screen: true, or behind: true if it belongs in the headroom)\n  ` + R.slice(0, 20).join('\n  ')); }
  if (C.length) { fail++; console.log(`\nOUT OF CAGE: ${C.length} — screen lettering outside x ${CAGE.x0}…${CAGE.x1}, y ${CAGE.y0}…${CAGE.y1} (right ≤ ${CAGE.icx} below ${CAGE.icy})\n  ` + C.slice(0, 20).join('\n  ')); }
  console.log(fail ? `\nrows: ${fail} hits` : '\nrows: one column, one ladder, inside the cage — clean');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
