#!/usr/bin/env node
/* engine/qa/rects.js <act index> [fraction=0.85] — boxes of every settled text / bar / chip / image in one act,
   measured on screen at act start + fraction·span. Run from the reel folder. Use it before moving things by eye. */
const path = require('path'); const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const ai = +process.argv[2], fr = +(process.argv[3] || 0.85);
(async () => {
  const b = await launch(); const p = await b.newPage(); await p.setViewport({ width: 1080, height: 1920 });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' }); await p.waitForFunction('window.READY === true', { timeout: 60000 });
  const out = await p.evaluate((ai, fr) => {
    const [a0, a1] = window.ACTS_A[ai]; const t = a0 + (a1 - a0) * fr; window.seek(t);
    const eff = e => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.visibility === 'hidden') return 0; o *= parseFloat(c.opacity); } return o; };
    const rows = [];
    for (const e of document.querySelectorAll('.tok,.bar,.chip,.row,.giant,.sub,.kick,.obj img,.det img,.g-grid,.g-cnt')) {
      if (eff(e) < 0.3) continue; const r = e.getBoundingClientRect(); if (r.width < 2) continue;
      const name = e.tagName === 'IMG' ? (e.getAttribute('src') || '').split('/').pop() : (e.className.split(' ')[0] + ' "' + e.textContent.trim().slice(0, 24) + '"');
      rows.push(`${name.padEnd(40)} x ${Math.round(r.left)}…${Math.round(r.right)}  y ${Math.round(r.top)}…${Math.round(r.bottom)}`);
    }
    return `t=${t.toFixed(2)}\n` + rows.join('\n');
  }, ai, fr);
  console.log(out); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
