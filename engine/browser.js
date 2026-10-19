/* _engine/browser.js — one place that knows which Chrome to launch.
   Prefers puppeteer's own headless shell (fast); falls back to the installed
   Google Chrome so a wiped ~/.cache/puppeteer never stops a render again. */
const fs = require('fs');
const path = require('path');
const puppeteer = require(path.join(__dirname, 'node_modules', 'puppeteer'));
const SYS = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHELLS = [
  path.join(process.env.HOME, '.cache/puppeteer/chrome-headless-shell'),
  path.join(process.env.HOME, '.cache/hyperframes/chrome/chrome-headless-shell'),
];
function findShell() {
  for (const d of SHELLS) {
    if (!fs.existsSync(d)) continue;
    for (const v of fs.readdirSync(d).sort().reverse()) {
      const f = path.join(d, v, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
      if (fs.existsSync(f)) return f;
    }
  }
  return null;
}
let exe = null;
try { exe = puppeteer.executablePath(); if (!exe || !fs.existsSync(exe)) exe = null; } catch { exe = null; }
if (!exe) exe = findShell();
if (!exe && fs.existsSync(SYS)) exe = SYS;
/* cloud (Linux): Playwright's Chromium, software GL instead of Metal */
const LINUX = process.platform === 'linux';
if (LINUX) exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
/* GPU memory: a big CSS-3D scene (T1_polet: 7200×8600 floor, glows, 20 blurred screens) overran the default compositor budget and Chrome
   dropped random tiles — black rectangles for one frame on the floor and walls, different on every render. */
const ARGS = ['--allow-file-access-from-files', ...(process.platform === 'linux' ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=metal']), '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
  '--force-gpu-mem-available-mb=8192', '--force-gpu-rasterization'];
module.exports = {
  puppeteer,
  launch: (extra = {}) => puppeteer.launch({ headless: exe && exe.includes('headless-shell') ? 'shell' : true, executablePath: exe || undefined, args: ARGS, ...extra }),
  exe,
};
