#!/usr/bin/env node
/* _engine/qa/bounds.js — Instagram safe zone + layer count, sampled over the
   whole reel BEFORE the render. Run from the reel folder:
     node engine/qa/bounds.js [--step 0.1] [--sel ".tok,.bar,.chip"]
   Safe zone: x 40…1040, y 235…1590; below y 1348 the right edge ≤ 858.
   Only SETTLED text is checked: effective opacity ≥ 0.9 and the nearest
   .act/.layer ancestor at scale 0.94…1.08 (an arriving token or a departing
   act outside the frame is the design). Layers: visible groups per frame,
   flagged when fewer than 3 (the CTA plate is exempt). */
const path = require('path');
const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const STEP = +arg('--step', 0.1);
const SEL = arg('--sel', '.tok,.bar,.chip,.row,.cap,.sticker,.sub,.kick,.big,.giant,.pn,.pcta,.tally,.lbl,.foot');

(async () => {
  const b = await launch();
  const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1920 });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await p.waitForFunction('window.READY === true', { timeout: 60000 });
  const { DUR } = await p.evaluate(() => window.REEL);
  const bad = []; const thin = [];
  for (let t = 0; t < DUR; t += STEP) {
    const r = await p.evaluate((t, SEL) => {
      window.seek(t);
      const effOp = e => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= parseFloat(cs.opacity); } return o; };
      const scaleOf = e => { const a = e.closest('.act,.layer,#plate'); if (!a) return 1; const m = getComputedStyle(a).transform; if (!m || m === 'none') return 1; const v = m.match(/matrix(3d)?\(([^)]+)\)/); if (!v) return 1; const n = v[2].split(',').map(parseFloat); const tx = v[1] ? n[12] : n[4]; if (Math.abs(tx) > 2) return 0; return v[1] ? n[0] : n[0]; };
      const out = [];
      for (const e of document.querySelectorAll(SEL)) {
        if (!e.textContent.trim()) continue;
        const o = effOp(e); if (o < 0.9) continue;
        const s = scaleOf(e); if (s < 0.94 || s > 1.08) continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0) continue;
        const viol = [];
        if (r.left < 40) viol.push(`left ${r.left | 0}`);
        if (r.right > 1040) viol.push(`right ${r.right | 0}`);
        if (r.top < 235) viol.push(`top ${r.top | 0}`);
        if (r.bottom > 1590) viol.push(`bottom ${r.bottom | 0}`);
        if (r.bottom > 1348 && r.right > 858) viol.push(`right-bottom ${r.right | 0}@${r.bottom | 0}`);
        if (viol.length) out.push({ text: e.textContent.trim().slice(0, 28), viol });
      }
      // layers: visible groups
      const groups = ['.obj', '.det', '.g', '.tok', '.bar', '.chip', '.row', '.bgmark', '.card3d', '.sticker', '.tally', '.cap', '.secnum', '.badge', '.three', '.plate', '.cards', '.giant', '.sub', '.kick', '.tshape', '.revring', '#wipe',
        '.ic', '.rt', '.win', '.sep', '.bg', '.info'];   // infograph / zoomplex
      let layers = 0;
      for (const g of groups) if ([...document.querySelectorAll(g)].some(e => effOp(e) > 0.3 && e.getBoundingClientRect().width > 0)) layers++;
      const plate = document.querySelector('#plate'); const onPlate = plate && effOp(plate) > 0.5;
      return { out, layers, onPlate };
    }, t, SEL);
    for (const v of r.out) bad.push(`${t.toFixed(2)}s  "${v.text}"  ${v.viol.join(', ')}`);
    if (!r.onPlate && r.layers < 3) thin.push(`${t.toFixed(2)}s layers=${r.layers}`);
  }
  await b.close();
  const uniq = [...new Set(bad)];
  console.log(uniq.length ? `SAFE ZONE: ${uniq.length} hits\n  ` + uniq.slice(0, 40).join('\n  ') : 'safe zone: clean');
  console.log(thin.length ? `LAYERS < 3 at ${thin.length} samples: ${thin.slice(0, 12).join(', ')}` : 'layers: ≥3 everywhere');
  process.exit(uniq.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
