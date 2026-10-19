#!/usr/bin/env node
/* _engine/render.js — frame renderer for any reel built on core.js.
   Run from the reel folder:
     node engine/render.js                      full render → renders/frames
     node engine/render.js --at 0.8,4.2,9.0     a few frames by time → renders/probe + sheet
     node engine/render.js --only 12,48         a few frames by index
     node engine/render.js --sheet 12           N evenly spaced frames → renders/sheet.jpg
     node engine/render.js --cues               write work/cues.json only
     node engine/render.js --alpha              transparent frames (overlay over footage)
   Options: --loose (a missed `on:` anchor does not fail)  --page index.html  --workers 7  --out dir  --size 1920x1080 (landscape; default 1080x1920)
   Waits for window.READY (fonts by name + image decode + fit), never networkidle0. */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { launch } = require(path.join(__dirname, 'browser.js'));

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? true) : d; };
const has = n => argv.includes(n);
const PAGE = 'file://' + path.resolve(arg('--page', 'index.html'));
const WORKERS = Math.min(+arg('--workers', 7), Math.max(1, os.cpus().length - 2));
const LAUNCH = {};
/* A missed anchor (`on:` word not in the line) silently falls back to the start of the beat — the insert lands on the wrong word
   and nothing fails. After every re-cut Scribe writes words differently, and 5+ reels shipped that way (abat/reel_006: seven dead
   anchors). So a miss fails the full render and --cues; previews (--at/--only/--sheet) only shout. --loose keeps a draft going. */
const MISSES = new Set();
const ALPHA = has('--alpha');
const RJ = (() => { try { return JSON.parse(fs.readFileSync('reel.json', 'utf8')); } catch { return {}; } })();
const [VW, VH] = String(arg('--size', RJ.size || '1080x1920')).split('x').map(Number);   // reel.json "size": "1440x1080" — a master that is not 9:16   // --size 1920x1080 for a landscape reel   // transparent PNG frames: graphic overlay for the footage branch

async function open(b) {
  const p = await b.newPage();
  await p.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.error('page error:', e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || m.type() === 'warn') {   /* 15.09.2026: puppeteer names console.warn 'warn' — every `on:` miss and DIVE warning was silent before */
    console.error('console:', m.text()); if (/not found/.test(m.text())) MISSES.add(m.text()); } });
  await p.goto(PAGE, { waitUntil: 'load' });
  await p.waitForFunction('window.REEL !== undefined', { timeout: 60000 });
  await p.waitForFunction('window.READY === true', { timeout: 60000 });
  return p;
}

(async () => {
  const probe = await launch();
  const pp = await open(probe);
  const { FRAMES, FPS, DUR } = await pp.evaluate(() => window.REEL);
  const cues = await pp.evaluate(() => window.CUES || []);
  fs.mkdirSync('work', { recursive: true });
  fs.writeFileSync('work/cues.json', JSON.stringify({ FRAMES, FPS, DUR, cues }, null, 1));
  fs.writeFileSync('work/els.json', JSON.stringify({ DUR, acts: await pp.evaluate(() => window.ACTS_A || []), rooms: await pp.evaluate(() => window.BEAT_ROOMS || []), els: await pp.evaluate(() => window.ELS || []) }));
  if (MISSES.size) {
    const preview = has('--at') || has('--only') || has('--sheet');
    console.error(`\nЯКОРЬ НЕ НАЙДЕН: ${MISSES.size} — вставка уедет на начало бита. Сверь on:/from: с assets/vo/words.js:\n  ` + [...MISSES].join('\n  '));
    if (!preview && !has('--loose')) { await probe.close(); process.exit(3); }
  }
  if (has('--cues')) { console.log(`cues: ${cues.length} → work/cues.json (${DUR.toFixed(2)} s, ${FRAMES} frames)`); await probe.close(); return; }

  let list, OUT;
  if (has('--at')) { list = String(arg('--at')).split(',').map(x => Math.round(parseFloat(x) * FPS)); OUT = path.resolve(arg('--out', 'renders/probe')); }
  else if (has('--only')) { list = String(arg('--only')).split(',').flatMap(x => {   // 900-1050 — диапазон, чинится участок, а не ролик
      const m = String(x).match(/^(\d+)-(\d+)$/);
      return m ? Array.from({ length: +m[2] - +m[1] + 1 }, (_, k) => +m[1] + k) : [Number(x)]; });
    OUT = path.resolve(arg('--out', 'renders/probe')); }
  else if (has('--sheet')) { const n = +arg('--sheet', 12); list = [...Array(n).keys()].map(k => Math.round((k + 0.5) * FRAMES / n)); OUT = path.resolve(arg('--out', 'renders/probe')); }
  else { list = [...Array(FRAMES).keys()]; OUT = path.resolve(arg('--out', 'renders/frames')); }
  fs.mkdirSync(OUT, { recursive: true });
  /* Явный --out значит «дописать в готовое»: чистка снесла бы уже отрендеренные кадры.
     Так чинится участок по границам акта вместо полного рендера всех 1100 кадров. */
  if (!has('--out') && (has('--at') || has('--only') || has('--sheet')))
    for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

  const small = list.length < 40;
  const nW = small ? 1 : WORKERS;
  console.log(`frames: ${list.length} of ${FRAMES}, fps ${FPS}, ${DUR.toFixed(2)} s, workers ${nW}`);
  const queue = list.slice(); const t0 = Date.now(); let done = 0;
  const pages = [pp];
  const browsers = [probe];
  for (let w = 1; w < nW; w++) { const b = await launch(); browsers.push(b); pages.push(await open(b)); }
  await Promise.all(pages.map(async p => {
    for (;;) {
      const f = queue.shift(); if (f === undefined) break;
      // painted before the shot: два rAF + короткая осадка. Двух rAF мало —
      // при 7 воркерах Chrome успевает отдать скриншот до растеризации нового
      // изображения, и в кадр уходит чёрный прямоугольник или весь кадр.
      await p.evaluate(t => new Promise(r => { Promise.resolve(window.seek(t)).then(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 12)))); }), f / FPS);   // seek may be async (speaker: awaits the frame decode)
      await p.screenshot({ path: path.join(OUT, `f_${String(f).padStart(4, '0')}.png`), omitBackground: ALPHA });
      if (++done % 90 === 0) console.log(`${done}/${list.length}  ${((Date.now() - t0) / 1000 / done).toFixed(3)} s/frame`);
    }
  }));
  await Promise.all(browsers.map(b => b.close()));
  const s = (Date.now() - t0) / 1000;
  console.log(`done: ${done} frames in ${s.toFixed(1)} s (${(s / done).toFixed(3)} s/frame) → ${OUT}`);

  if (small) {
    /* contact sheet: 3 columns, each cell labelled with its time */
    const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort();
    const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols);
    const inputs = files.flatMap(f => ['-i', path.join(OUT, f)]);
    const fc = files.map((f, i) => {
      const t = (parseInt(f.slice(2, 6)) / FPS).toFixed(2);
      return `[${i}:v]scale=${VW > VH ? '640:360' : '360:640'},drawtext=text='${t}s':x=12:y=12:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`;
    }).join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * (VW > VH ? 640 : 360)}_${Math.floor(i / cols) * (VW > VH ? 360 : 640)}`).join('|')}:fill=black[o]`;
    const sheet = path.resolve('renders/sheet.jpg');
    // xstack needs 2+ inputs: a single --at frame is just scaled
    if (files.length === 1) execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-vf', VW > VH ? 'scale=960:540' : 'scale=540:960', '-q:v', '3', sheet]);
    else execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', fc, '-map', '[o]', '-q:v', '3', sheet]);
    console.log(`sheet → ${sheet}  (${cols}x${rows})`);
  }
})().catch(e => { console.error(e); process.exit(1); });
