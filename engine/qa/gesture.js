#!/usr/bin/env node
/* engine/qa/gesture.js — the montage answers the speaker's gesture. Run from the reel folder after engine/gesture.py.
   node engine/qa/gesture.js [--lead 0.8] [--cone 50]

   Law (Elzhan, 15.10.2026, client eto reel_001_uip: in the card she pointed up while the checklist landed on the left,
   and offered her palm to the right while the cursor went left): «куда показывает или на что акцентирует внимание спикер
   жестами — туда и был акцент визуального монтажа».

   For every span of qa/gestures.json (point / open palm, dir up | left | right) the take on screen is found (full frame or
   card), the hand is projected onto the screen through it, and an ACCENT is required: an element (not footage, not the
   subtitle line, not background glow) that becomes visible between t0 − lead and t1 and stands in the gesture's cone
   (± cone° around dir from the hand, centre at least 40 px away, outside the take itself). A gesture while no take is in
   frame is not seen and is skipped. Exit 1 on any miss.
*/
const fs = require('fs'), path = require('path');
const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? +argv[i + 1] : d; };
const LEAD = arg('--lead', 0.8), CONE = arg('--cone', 50), STEP = 0.1;

if (!fs.existsSync('qa/gestures.json')) { console.log('gesture: НЕ ПРОВЕРЕНО — нет qa/gestures.json (python3.13 engine/gesture.py work/fr)'); process.exit(0); }
const G = JSON.parse(fs.readFileSync('qa/gestures.json', 'utf8'));
if (!G.spans.length) { console.log('gesture: жестов в дубле нет — чисто'); process.exit(0); }
const DIRV = { up: [0, -1], left: [-1, 0], right: [1, 0], down: [0, 1] };

(async () => {
  const b = await launch(); const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1920 });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await p.waitForFunction('window.READY === true', { timeout: 60000 });
  let fail = 0;
  for (const s of G.spans) {
    const seen = new Set(), base = new Set(), hits = [], others = []; let takeSeen = false, first = true;
    for (let t = Math.max(0, s.t0 - LEAD); t <= s.t1 + 1e-6; t += STEP) {
      const r = await p.evaluate(async (t, s, W, H) => {
        await window.seek(t);
        const op = e => { let o = 1, n = e; while (n && n !== document.body) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity); n = n.parentElement; } return o; };
        let take = null;
        // a 3D space tagged footage (/flight-speaker) holds several speaker billboards: the take is a visible billboard, not the space
        const parts = [...document.querySelectorAll('.footage')].flatMap(e => { const fm = e.querySelectorAll('img.fm'); return fm.length > 1 ? [...fm] : [e]; });
        for (const e of parts) {
          if (op(e) < 0.5) continue; const q = e.getBoundingClientRect();
          if (q.width < 50 || q.right < 0 || q.left > 1080 || q.bottom < 0 || q.top > 1920) continue;
          if (!take || q.width > take.width) take = q;
        }
        const els = [];
        for (const e of document.querySelectorAll('.e:not(.footage)')) {
          if (e.parentElement && e.parentElement.closest('.e')) continue;
          if (e.closest('.subs') || /\b(glow|beam|ghost|spot|gobo|grain)\b/.test(e.className)) continue;
          if (op(e) < 0.5) continue;
          const q = e.getBoundingClientRect();
          if (q.width < 20 || q.height < 20 || q.right < 0 || q.left > 1080 || q.bottom < 0 || q.top > 1920) continue;
          e.dataset.qid = e.dataset.qid || String(Math.random()).slice(2, 10);
          els.push({ id: e.dataset.qid, x: (q.left + q.right) / 2, y: (q.top + q.bottom) / 2, l: q.left, r: q.right, t: q.top, b: q.bottom,
                     what: (e.textContent || '').trim().slice(0, 24) || [...e.classList].filter(c => c !== 'e').join('.') });
        }
        const hand = take && { x: take.left + s.x / W * take.width, y: take.top + s.y / H * take.height };
        return { take: take && { l: take.left, r: take.right, t: take.top, b: take.bottom }, hand, els };
      }, t, s, G.w, G.h);
      const inGesture = t >= s.t0 - 1e-6;
      if (first) { for (const e of r.els) base.add(e.id); first = false; continue; }   // what already stood before the lead window is not an answer
      if (!inGesture || !r.hand) continue;
      takeSeen = true;
      for (const e of r.els) {
        if (base.has(e.id)) continue;
        const dx = e.x - r.hand.x, dy = e.y - r.hand.y, d = Math.hypot(dx, dy);
        const inside = r.take && e.x > r.take.l && e.x < r.take.r && e.y > r.take.t && e.y < r.take.b;
        const [vx, vy] = DIRV[s.dir];
        const ang = Math.round(Math.acos(Math.max(-1, Math.min(1, (dx * vx + dy * vy) / (d || 1)))) * 180 / Math.PI);
        const rec = { t: +t.toFixed(2), what: e.what, ang };
        if (d >= 40 && !inside && ang <= CONE) hits.push(rec);
        else if (!seen.has(e.id)) others.push(rec);
        seen.add(e.id);
      }
    }
    const tag = `${s.t0.toFixed(2)}–${s.t1.toFixed(2)} ${s.kind} ${s.dir}`;
    if (!takeSeen) { console.log(`  ${tag}: дубля в кадре нет — жест не виден`); continue; }
    if (hits.length) console.log(`  ok ${tag}: акцент «${hits[0].what}» на ${hits[0].t} с (${hits[0].ang}° от направления)`);
    else {
      fail++;
      console.log(`  GESTURE UNANSWERED ${tag}: спикер показывает ${s.dir === 'up' ? 'вверх' : s.dir === 'left' ? 'влево' : 'вправо'}, а новый элемент туда не пришёл` +
        (others.length ? ` — пришли не туда: ${others.slice(0, 3).map(o => `«${o.what}» ${o.ang}°`).join(', ')}` : ''));
    }
  }
  await b.close();
  console.log(fail ? `gesture: ${fail} жест(ов) без ответа монтажа → карточку ставить так, чтобы жест смотрел на предмет, или элемент — туда, куда жест` : 'gesture: каждый жест получил акцент — чисто');
  process.exit(fail ? 1 : 0);
})();
