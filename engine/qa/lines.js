/* engine/qa/lines.js — beat windows + text + console warnings of a reel page (speaker-canvas: check `from` before the first sheet). Run from the reel folder. */
const path = require('path'); const { launch } = require(path.join(process.env.HOME, '.claude/engine/browser.js'));
(async () => { const b = await launch(); const p = await b.newPage(); const msgs = [];
  p.on('console', m => msgs.push(m.type() + ': ' + m.text())); p.on('pageerror', e => msgs.push('ERR ' + e.message));
  await p.goto('file://' + path.resolve('index.html')); await p.waitForFunction('window.READY === true', { timeout: 60000 });
  const r = await p.evaluate(() => window.ACTS_A.map((a, i) => `${i} ${a[0].toFixed(2)}–${a[1].toFixed(2)}  ${window.LINES[i]}`));
  console.log(r.join('\n')); console.log(msgs.join('\n')); await b.close(); })();
