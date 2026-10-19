#!/usr/bin/env node
/* engine/qa/speaker.js — every gate of the footage branch in one run, before the full render.
   Run from the reel folder:  node engine/qa/speaker.js [--step 0.1] [--frames renders/frames]
   1. head clearance   nothing in FRONT (.chk, subtitles) comes within 15 px of the head (face.json: matte top incl. hair)
   2. cage             subtitle glyphs inside x 71…1012, y 235…1590 and x ≤ 858 below y 1348; other front graphics inside x 40…1040
   3. geometry         frame.py check on each act's midpoint layout (insert width 30–62 %, grid line, edges, centre of mass)
   4. layers           share of time with only the footage in frame (information, not a fail)
   5. chiron           with --frames: layer motion vs footage motion ≥ 0.33 (recut §4.5), via qa/chiron.py
   Exit 1 on any clearance or cage hit. */
const path = require('path'), fs = require('fs'), { execFileSync, spawnSync } = require('child_process');
const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const STEP = +arg('--step', 0.1), FRAMES = arg('--frames', fs.existsSync('renders/frames') ? 'renders/frames' : null);
const FACE = JSON.parse(fs.readFileSync('qa/face.json', 'utf8'));

(async () => {
  const b = await launch(); const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1920 });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await p.waitForFunction('window.READY === true', { timeout: 60000 });
  const { DUR, FPS } = await p.evaluate(() => window.REEL);
  const acts = await p.evaluate(() => window.PLATE_INFO.acts);
  const clear = [], cage = [], thin = [], samples = [];
  /* judge the frames that get rendered (n / FPS): `t += 0.1` drifted to 8.4999999 and caught a cut between two frames */
  for (let k = 0, t = 0; t < DUR; k++, t = Math.round(k * STEP * FPS) / FPS) {
    const r = await p.evaluate(async t => {
      await window.seek(t);
      const effOp = e => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= parseFloat(cs.opacity); } return o; };
      const n = window.PLATE_INFO.frameAt(t);
      const pl = document.querySelector('.plate').getBoundingClientRect();
      const k = pl.width / 1080;
      const map = bx => bx ? { x: pl.left + bx[0] * k, y: pl.top + bx[1] * k, w: bx[2] * k, h: bx[3] * k } : null;
      const inInsert = [...document.querySelectorAll('.insert')].some(e => effOp(e) > 0.5);
      const rect = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      const front = [...document.querySelectorAll('.chk')].filter(e => effOp(e) > 0.3 && !e.closest('.insert') && e.getBoundingClientRect().width > 0).map(e => ({ r: rect(e), txt: (e.textContent || '').trim().slice(0, 24), cls: e.className.split(' ').slice(1, 3).join(' '), text: /txt|counter|strip/.test(e.className) }));
      const back = [...document.querySelectorAll('.bk')].filter(e => effOp(e) > 0.3 && e.getBoundingClientRect().width > 0).map(e => ({ r: rect(e) }));
      const words = [...document.querySelectorAll('.subs')].filter(e => effOp(e) > 0.3).flatMap(e => [...e.querySelectorAll('.ae-u')].filter(u => parseFloat(getComputedStyle(u).opacity) > 0.5).map(u => ({ r: rect(u), txt: u.textContent })));
      return { n, inInsert, front, back, words, plate: { x: pl.left, y: pl.top, w: pl.width, h: pl.height } };
    }, t);
    const fr = FACE.frames[r.n - 1] || {};
    const k = r.plate.w / 1080, head = fr.head ? { x: r.plate.x + fr.head[0] * k, y: r.plate.y + fr.head[1] * k, w: fr.head[2] * k, h: fr.head[3] * k } : null;
    const gap = (a, h) => Math.max(a.x - (h.x + h.w), h.x - (a.x + a.w), a.y - (h.y + h.h), h.y - (a.y + a.h));
    const ts = t.toFixed(2);
    if (head && !r.inInsert) {
      /* a full-frame overlay (a light leak or flash over a cut) is the transition itself, not a graphic placed at the head */
      for (const e of r.front) { if (e.r.x <= 0 && e.r.y <= 0 && e.r.x + e.r.w >= 1080 && e.r.y + e.r.h >= 1920) continue; const g = gap(e.r, head); if (g < 15) clear.push(`${ts}s  ${e.cls} "${e.txt}"  ${g < 0 ? 'COVERS the head' : `${g | 0}px from the head`}`); }
      for (const w of r.words) { const g = gap(w.r, head); if (g < 15) clear.push(`${ts}s  sub "${w.txt}"  ${g < 0 ? 'COVERS the head' : `${g | 0}px from the head`}`); }
    }
    const zone = (rc, x0, x1, label) => { const v = []; if (rc.x < x0) v.push(`left ${rc.x | 0}`); if (rc.x + rc.w > x1) v.push(`right ${(rc.x + rc.w) | 0}`); if (rc.y < 235) v.push(`top ${rc.y | 0}`); if (rc.y + rc.h > 1590) v.push(`bottom ${(rc.y + rc.h) | 0}`); if (rc.y + rc.h > 1348 && rc.x + rc.w > 858) v.push(`icon column ${(rc.x + rc.w) | 0}@${(rc.y + rc.h) | 0}`); if (v.length) cage.push(`${ts}s  ${label}  ${v.join(', ')}`); };
    for (const w of r.words) zone(w.r, 71, 1012, `sub "${w.txt}"`);
    /* Полоса в край — это САМ КАДР, а не графика в нём (тот же довод, что `bleeds` в overlap.js):
       b-roll половиной кадра в жанре сплита и полнокадровая хроника стоят вплотную к кромке по
       замыслу, клетка судит вставки внутри картинки. Судится всё, что уже кромки. */
    /* the same for a split's half tile (two clips side by side): flush to a side and to the top or bottom edge, ≥ 40 % wide */
    const tile = rc => (rc.x <= 0 || rc.x + rc.w >= 1080) && (rc.y <= 0 || rc.y + rc.h >= 1920) && rc.w >= 432;
    for (const e of r.front) { if ((e.r.x <= 0 && e.r.x + e.r.w >= 1080) || tile(e.r)) continue; zone(e.r, e.text ? 71 : 40, e.text ? 1012 : 1040, `${e.cls} "${e.txt}"`); }
    const layers = 1 + (r.front.length ? 1 : 0) + (r.back.length ? 1 : 0) + (r.words.length ? 1 : 0) + (r.inInsert ? 1 : 0);
    if (layers < 2) thin.push(ts);
    samples.push({ t: +ts, n: r.n, rects: [...r.front.map(e => e.r), ...r.back.map(e => e.r), ...r.words.map(w => w.r)], plate: r.plate, insert: r.inInsert });
  }
  /* geometry per act midpoint */
  const geo = [];
  for (const a of acts) {
    if (a.insert) continue;
    const t = (a.t0 + a.t1) / 2;
    const s = samples.reduce((b, x) => Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b, samples[0]);
    const fr = FACE.frames[s.n - 1] || {}; const k = s.plate.w / 1080;
    const els = [];
    if (fr.body) els.push({ id: 'speaker', type: 'subject', box: [Math.round(s.plate.x + fr.body[0] * k), Math.round(s.plate.y + fr.body[1] * k), Math.round(fr.body[2] * k), Math.round(fr.body[3] * k)],
      face: fr.face ? [Math.round(s.plate.x + fr.face[0] * k), Math.round(s.plate.y + fr.face[1] * k), Math.round(fr.face[2] * k), Math.round(fr.face[3] * k)] : undefined,
      head: fr.head ? [Math.round(s.plate.x + fr.head[0] * k), Math.round(s.plate.y + fr.head[1] * k), Math.round(fr.head[2] * k), Math.round(fr.head[3] * k)] : undefined });
    const fe = await p.evaluate(async t => {
      await window.seek(t);
      const effOp = e => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= parseFloat(cs.opacity); } return o; };
      const out = [];
      /* back-layer graphics (.bk) sit behind the speaker by design: no insert-width / safe-zone law */
      document.querySelectorAll('.chk').forEach((e, i) => { if (effOp(e) < 0.5 || e.closest('.insert')) return; const r = e.getBoundingClientRect(); if (r.width < 2) return; if (r.left <= 0 && r.right >= innerWidth) return;   /* полоса в край — кадр, а не вставка: законы ширины 30–62 % и сетки к ней не применяются */ out.push({ id: (e.className.split(' ')[1] || 'el') + i, type: /txt|counter/.test(e.className) ? 'text' : 'insert', layer: e.classList.contains('bk') ? 'back' : 'front', box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }); });
      document.querySelectorAll('.subs').forEach((e, i) => { if (effOp(e) < 0.5) return; const u = [...e.querySelectorAll('.ae-u')]; if (!u.length) return; const l = u[0].getBoundingClientRect(), rr = u[u.length - 1].getBoundingClientRect(); out.push({ id: 'subs' + i, type: 'text', box: [Math.round(l.left), Math.round(l.top), Math.round(rr.right - l.left), Math.round(l.height)] }); });
      return out;
    }, t);
    els.push(...fe);
    if (els.length < 2) continue;
    fs.mkdirSync('work', { recursive: true });
    const lf = `work/layout_${t.toFixed(1)}.json`; fs.writeFileSync(lf, JSON.stringify({ frame: [1080, 1920], elements: els }));
    const res = spawnSync('python3', [path.join(__dirname, '..', 'frame.py'), 'check', lf], { encoding: 'utf8' });
    const fails = res.stdout.split('\n').filter(l => l.includes('FAIL')).map(l => l.replace(/\s+FAIL\s+/, '').trim());
    geo.push(`act ${a.t0}–${a.t1} @${t.toFixed(1)}s: ` + (fails.length ? '\n    ' + fails.join('\n    ') : 'ok'));
  }
  await b.close();
  const U = a => [...new Set(a)];
  console.log(U(clear).length ? `HEAD CLEARANCE: ${U(clear).length} hits\n  ` + U(clear).slice(0, 40).join('\n  ') : 'head clearance: clean');
  console.log(U(cage).length ? `CAGE: ${U(cage).length} hits\n  ` + U(cage).slice(0, 40).join('\n  ') : 'cage: clean');
  console.log('geometry:\n  ' + geo.join('\n  '));
  console.log(`layers: footage alone at ${thin.length} of ${samples.length} samples` + (thin.length ? ` (${thin.slice(0, 8).join(', ')}${thin.length > 8 ? '…' : ''})` : ''));
  fs.writeFileSync('work/qa_rects.json', JSON.stringify({ fps: FPS, samples }));
  if (FRAMES) {
    const r = spawnSync('/usr/local/bin/python3', [path.join(__dirname, 'chiron.py'), FRAMES, 'work/qa_rects.json'], { encoding: 'utf8' });
    process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  } else console.log('chiron: skipped (no rendered frames yet; rerun with --frames renders/frames after the render)');
  process.exit(U(clear).length || U(cage).length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
