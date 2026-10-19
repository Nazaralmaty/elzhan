#!/usr/bin/env node
/* ~/.claude/engine/qa/overlap.js — layout gates measured on screen (after the camera), sampled over the reel.
   Run from the reel folder:
     node engine/qa/overlap.js [--step 0.1] [--sel ".txt,…"] [--empty 0.05]
   OUT OF FRAME     text past the frame edge, with a suggested font size
   TEXT OVER TEXT   two texts whose boxes intersect by > 15 % of the smaller; a text over an image box
   TEXT COVERED     a text hidden under a phone / photo / band / card / image drawn IN FRONT of it (hit-tested on a 5×3 grid, so
                    rotation and z-order count; a caption on its own print is fine)   — phone over «НАЖМИТЕ», 13.09.2026
   STAGE VISIBLE    canvas: the camera shows the stage outside every room (a room shorter than the camera's reach,
                    no `top`)                                                          — strip under a world, 13.09.2026
   EMPTY FRAME      canvas genre only: content (visible letters, images, cards, bars, gen canvases…) covers < 5 % of the frame for ≥ 1 s — a hard cut
                    into a world whose elements all wait for later words               — 1.5 s of «если» + bars, 13.09.2026
   HOOK DIMMED      a `spot` light is up in the first 1.2 s: the cover frame goes grey  — 13.09.2026
   Text / covered / stage count only when settled: effective opacity ≥ 0.9 and the camera at rest. */
const path = require('path');
const { launch } = require(path.join(__dirname, '..', 'browser.js'));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const STEP = +arg('--step', 0.1);   // at 0.2 s late bars (at: .22+) were never sampled settled: three collisions passed
const SEL = arg('--sel', '.txt,.tok,.cap,.sticker,.giant,.sub,.pill,.num,.chip,.bar,.row');   // chips and bars covered giants in passed reels
const IMG = '.e:not(.photo):not(.fig):not(.footage):not(.lift) img, .obj img, .det img, .g-grid';   // .lift — это кроп самого себя: картинка внутри крупнее контейнера и обрезана overflow, её rect врёт   // v5: a stack row is MEANT to have cards and pills sorted between its figures   // a photo's own caption sits on its print by design   // a cell grid laid over a word is a collision too
const OCC = '.phone, .photo, .band, .tear, .progress, .note, .streak, .cardel, .typebox, .shot, .comment, .e:not(.footage) img, .obj img, .det img';   // opaque things a word can hide under
const CONTENT = '.uiel, .gen, .three, .fcard, .ovl-iris, .ovl-band, .blinkcard, .tear, .progress, .note, .streak, .phone, .photo, .band, .cardel, .typebox, .shot, .comment, .count, .num, .bars, .tl, .grid, .pill, .bubble, .e > img, .obj img, .det img';
const EMPTY = +arg('--empty', 0.05), EMPTY_RUN = 1.0;
/* HEAD COVERED (speaker-canvas, 15.09.2026): with a take on the map, nothing in front of the speaker — words, subtitles, cards,
   stickers, lifted inserts — comes within 15 px of the head incl. hair (qa/face.json). Type with `behind: true` is exempt. */
const HEADSEL = SEL + ', .photo, .band, .cardel, .typebox, .comment, .glass, .e:not(.footage) img, .subs .ae-u';
const FACEJSON = require('fs').existsSync('qa/face.json') ? JSON.parse(require('fs').readFileSync('qa/face.json', 'utf8')) : null;
/* Без матта коробка головы недостоверна: Vision достраивает её вниз до y ~1295, и гейт даёт
   пачки ложных провалов (на atlas/reel_007 — 12, потом 27, потом 37). В этом случае находка
   остаётся предупреждением: гейт, печатающий починку, не должен врать. */
const PLATE = require('fs').existsSync('work/plate.json') ? JSON.parse(require('fs').readFileSync('work/plate.json', 'utf8')) : null;
const MATTE_OFF = !!(PLATE && PLATE.matte === false);
// frame size: reel.json "size" ("1440x1080") for a master that is not 9:16; the page code reads innerWidth / innerHeight
const [VW, VH] = String((() => { try { return JSON.parse(require('fs').readFileSync('reel.json', 'utf8')).size; } catch { return null; } })() || '1080x1920').split('x').map(Number);

(async () => {
  const b = await launch(); const p = await b.newPage();
  await p.setViewport({ width: VW, height: VH });
  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await p.waitForFunction('window.READY === true', { timeout: 60000 });
  await p.addStyleTag({ content: '*{pointer-events:auto!important}' });   // hit-testing only; nothing is clicked
  const { DUR } = await p.evaluate(() => window.REEL);
  if (FACEJSON) await p.evaluate(f => { window.FACE = f; }, FACEJSON);
  const insOut = {};
  const over = {}, pairs = {}, covered = {}, stage = [], dens = [], heads = {};
  let dim = false;
  for (let t = 0; t < DUR; t += STEP) {
    let r = await p.evaluate(async (t, SEL, IMG, OCC, CONTENT, HEADSEL) => {
      await window.seek(t);
      const OP = new Map();
      const effOp = e => { if (!e || e === document.body || e === document.documentElement) return 1; if (OP.has(e)) return OP.get(e); const cs = getComputedStyle(e); const o = cs.visibility === 'hidden' || cs.display === 'none' ? 0 : parseFloat(cs.opacity) * effOp(e.parentElement); OP.set(e, o); return o; };
      const vis = q => q.width >= 2 && q.right > 0 && q.left < innerWidth && q.bottom > 0 && q.top < innerHeight;
      const area = q => Math.max(0, Math.min(q.right, innerWidth) - Math.max(q.left, 0)) * Math.max(0, Math.min(q.bottom, innerHeight) - Math.max(q.top, 0));
      /* density: every sample, the camera may be moving */
      let a = 0;
      for (const e of document.querySelectorAll(CONTENT)) { if (e.parentElement && e.parentElement.closest(CONTENT)) continue; if (effOp(e) < 0.5) continue; const q = e.getBoundingClientRect(); if (vis(q)) a += area(q); }
      for (const u of document.querySelectorAll('.ae-u')) { if (u.closest(CONTENT) || effOp(u) < 0.5) continue; const q = u.getBoundingClientRect(); if (vis(q)) a += area(q); }
      const dens = document.querySelector('.room') ? Math.min(1, a / (innerWidth * innerHeight)) : 1;   // calibrated on canvas; motion / triplex / zoomplex / infograph draw into a WebGL canvas and plates this selector does not see (8 s of false «empty» on fragrancia/reel_006)
      const dim = t < 1.2 && [...document.querySelectorAll('.spot')].some(s => effOp(s) > 0.05);
      const head = [];
      /* v2: every visible take on screen — full frame, a card, a cut-out — has its own head marker (.hm); during a tone flood the take is projected, not seen */
      const HDS = window.FOOT && window.FACE && !window.SWEEP ? window.FOOT.heads(t).filter(h => effOp(h.owner) >= 0.5) : [];
      for (const { r: hd, owner, room: hroom } of HDS) if (hd.b > 0 && hd.t < innerHeight && hd.r > 0 && hd.l < innerWidth) for (const e of document.querySelectorAll(HEADSEL)) {
        if (e.closest('.behind, .footage') || owner.contains(e) || effOp(e) < 0.5) continue;
        /* another world far on the map: under a tilt its projected box is garbage, it is never in front of the speaker */
        const er = e.closest('.room'); if (er && hroom && er.dataset.room !== hroom) continue;
        const q = e.getBoundingClientRect(); if (!vis(q)) continue;
        const g = Math.max(q.left - hd.r, hd.l - q.right, q.top - hd.b, hd.t - q.bottom);
        if (g < 15) head.push(`${(e.textContent || '').trim().slice(0, 24) || (e.getAttribute('src') || e.className || '').toString().split('/').pop().slice(0, 30)} ${g < 0 ? 'COVERS the head' : (g | 0) + 'px from the head'}`); }
      /* КРАЯ СЧИТАЮТСЯ ВСЕГДА (22.09.2026, Елжан: «элементы и вставки уходят за границу»).
         Девять версий гейт говорил «out of frame: none», потому что края он мерил только на
         покое камеры, а в этом жанре камера не стоит никогда (v9: 0.3 % кадров) и наклон
         возвращал пустой список. Слово за кромкой — брак независимо от того, едет камера
         или нет; наложения по-прежнему судятся только на посадке. */
      const edge = [], covE = [], ins = [];
      /* комната под центром кадра: элементы ДРУГИХ комнат под наклоном проецируются в коробки
         шириной в сотни тысяч пикселей и давали ложные «ушло за кадр» (лента карточек мира
         brand при камере в test) */
      const nowRoom = (document.elementsFromPoint(540, 960).find(h => h.classList && h.classList.contains('room')) || {}).dataset?.room;
      const mine = e => { const er = e.closest('.room'); return !(er && nowRoom && er.dataset.room !== nowRoom); };
      /* на шве элементы улетают из кадра по замыслу: 0.6 с у границы бита не судятся */
      const A = window.ACTS_A || [], seam = A.some(([a0, a1]) => Math.abs(t - a0) < 0.6 || Math.abs(a1 - t) < 0.6);
      if (!window.SWEEP && !seam) for (const e of document.querySelectorAll(SEL)) {
        if (!e.textContent.trim() || effOp(e) < 0.9 || !mine(e)) continue;
        const act = e.closest('.act,.layer'); if (act) { const m = (getComputedStyle(act).transform || '').match(/matrix(3d)?\(([^)]+)\)/); if (m) { const n = m[2].split(',').map(parseFloat); const tx = m[1] ? n[12] : n[4]; const sc = n[0]; if (Math.abs(tx) > 2 || sc < 0.94 || sc > 1.08) continue; } }
        const r = e.getBoundingClientRect(); if (r.width < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const text = e.textContent.trim().slice(0, 30);
        edge.push({ text, l: r.left, r: r.right, t: r.top, b: r.bottom, fs: parseFloat(getComputedStyle(e).fontSize) });
        /* «закрыт картинкой» — тоже на каждом сэмпле: это hit-test, он точен и под наклоном,
           в отличие от пересечения осевых коробок, которое под поворотом врёт */
        let n = 0, by = '';
        for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const fy of [0.3, 0.5, 0.7]) {
          const x = Math.min(1076, Math.max(4, r.left + (r.right - r.left) * fx)), y = Math.min(1916, Math.max(4, r.top + (r.bottom - r.top) * fy));
          /* only what is stacked ABOVE the text counts; a point where the text is not in the stack at all is not on the
             text (under a tilt the bounding rect overhangs the real quad) — sardor/reel_001: a torn strip UNDER the headline
             was counted as covering it on 20 samples of a dive */
          const hs = document.elementsFromPoint(x, y), me = hs.findIndex(h => h === e || e.contains(h));
          if (me < 0) continue;
          for (const h of hs.slice(0, me)) {
            if (h.contains(e)) continue;
            const o = h.closest(OCC); if (!o || o.contains(e) || effOp(o) < 0.5) continue;
            if (o.tagName === 'IMG') { const q = o.getBoundingClientRect(), mx = q.width * 0.12, my = q.height * 0.12; if (x < q.left + mx || x > q.right - mx || y < q.top + my || y > q.bottom - my) continue; }
            n++; by = o.tagName === 'IMG' ? (o.getAttribute('src') || '').split('/').pop() : [...o.classList].filter(c => c !== 'e').join('.'); break;
          }
        }
        if (n >= 2) covE.push(text + ' under ' + by);
      }
      /* ВСТАВКА ТОЖЕ НЕ ВЫХОДИТ ЗА КРОМКУ (22.09.2026): гейт судил только буквы, а из кадра
         уезжали принты, стеклянные панели и карточки ленты. Свет, поле земли и фоновая
         типографика сюда не входят — они выходят за кадр по замыслу. */
      /* `.seq` вон по тому же доводу, что `.lift`: у секвенции b-roll контейнер с overflow:hidden,
         а картинка внутри нарочно крупнее (ken burns `kb`) и обрезана им — «порезала» её рамка
         автора, а не кромка кадра. Судится контейнер: он в селекторе ниже как `.e.seq`. */
      /* `.footage` вон: плейт и матт — это САМ КАДР, а не вставка в нём. Оба лежат слоем
         1080×1920, и любая камера крупнее z 1.03 показывает 80-95 % плейта — доля видимой
         площади попадает ровно в окно 40…97 %, и гейт валил КАЖДЫЙ ролик жанра speaker-canvas
         (замер atlas/reel_021 22.09.2026: 88 «порезанных вставок», все — f_NNNN.jpg плейта).
         Исключение плейта из тестов по картинкам — контракт жанра, IMG и OCC его уже держат. */
      if (!window.SWEEP && !seam) for (const e of document.querySelectorAll('.seq, .photo, .glass:not(.gl), .feedcard, .cardel, .typebox, .count, .bars, .grid, .lift, .e:not(.footage):not(.lift):not(.seq) > img:not(.fig img)')) {   /* у .lift меряется САМ контейнер, а не картинка в нём: картинка нарочно больше и обрезана */
        /* `.wt` вон: плитка стены клиентов — кусок одного листа, который уходит за кромку по замыслу («и ещё», icon 15.10.2026);
           у triplex (genre/wall.js) плитки и так не попадают в селектор, canvas-стена (icon/_ассеты/abat/wall.js) помечает их тем же классом */
        if (e.closest('.wt')) continue;
        const own = e.closest('.e') || e; if (effOp(own) < 0.9 || !mine(e)) continue;
        const r = e.getBoundingClientRect(); if (r.width < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const of = Math.max(0, -r.left, r.right - innerWidth, -r.top, r.bottom - innerHeight);
        /* судится ПОРЕЗАННАЯ вставка, а не «стоит в другом месте карты»: доля видимой площади
           40…97 %. Проекция чужой комнаты под наклоном и предмет, целиком уехавший из кадра,
           сюда не попадают — там видно меньше 40 % */
        const vw = Math.min(r.right, innerWidth) - Math.max(r.left, 0), vh = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
        const vis = Math.max(0, vw) * Math.max(0, vh) / (r.width * r.height);
        /* вставка, перекрывшая ВСЕ четыре кромки, — фон на весь кадр (клип с работы полным кадром
           печатается листом крупнее кадра, чтобы кромка не заходила при движении камеры); её
           не «порезало», она и должна выходить за кадр (icon/reel_037: 57 из 57 — такие листы) */
        const bleeds = r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight;
        if (of > 8 && vis > 0.4 && vis < 0.97 && !bleeds) ins.push({ what: (e.getAttribute('src') || e.querySelector('img')?.getAttribute('src') || '').split('/').pop() || [...e.classList].filter(c => c !== 'e').join('.') || e.tagName.toLowerCase(), of });
      }
      const tilted = window.CAM && (Math.abs(window.CAM.rx || 0) + Math.abs(window.CAM.ry || 0)) > 0.5;
      if (window.CAM && window.CAM.moving && !tilted) return { dens, dim, head, edge, covE, ins };   // v8: a tilting move is checked too — its world edge was the defect (Elzhan 14.09.2026)
      if (window.SWEEP) return { dens, dim, head, edge, covE, ins };   // v6 tone flood: the new world covers the old words by design   // only resting camera states count below
      const root = document.querySelector('#ae-root') || document.querySelector('#cam');
      if (root && /blur\((\d+\.?\d*)px\)/.test(root.style.filter || '') && parseFloat(RegExp.$1) > 1) return { dens, dim, head, edge, covE, ins };   // camera in a fast move
      /* stage outside every room (canvas genre only) */
      const miss = [];
      if (document.querySelector('.room')) for (let gx = 0; gx < 6; gx++) for (let gy = 0; gy < 10; gy++) { const x = 12 + gx * 211, y = 12 + gy * 210; if (!document.elementsFromPoint(x, y).some(h => h.classList && h.classList.contains('room'))) miss.push(y); }
      if (tilted) return { dens, dim, head, edge, covE, ins, out: [], imgs: [], cov: [], miss };   // v8: a tilted sheet is judged for its edges only; axis boxes of rotated words overlap on paper, not on screen
      const out = [], cov = [];
      for (const e of document.querySelectorAll(SEL)) {
        if (!e.textContent.trim() || effOp(e) < 0.9) continue;
        const act = e.closest('.act,.layer'); if (act) { const m = (getComputedStyle(act).transform || '').match(/matrix(3d)?\(([^)]+)\)/); if (m) { const n = m[2].split(',').map(parseFloat); const tx = m[1] ? n[12] : n[4]; const sc = n[0]; if (Math.abs(tx) > 2 || sc < 0.94 || sc > 1.08) continue; } }   // act in a swipe or a zoom
        const r = e.getBoundingClientRect(); if (r.width < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;   // fully outside = elsewhere on the map, fine
        const text = e.textContent.trim().slice(0, 30);
        out.push({ text, kind: ['bar', 'row', 'chip'].find(k => e.classList.contains(k)) || 'text', l: r.left, r: r.right, t: r.top, b: r.bottom, fs: parseFloat(getComputedStyle(e).fontSize) });
        /* covered: hit-test a 5×3 grid over the text; an opaque thing above the text at ≥ 2 points (one letter under a phone is 3) */
        let n = 0, by = '';
        for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const fy of [0.3, 0.5, 0.7]) {
          const x = Math.min(1076, Math.max(4, r.left + (r.right - r.left) * fx)), y = Math.min(1916, Math.max(4, r.top + (r.bottom - r.top) * fy));
          const hs = document.elementsFromPoint(x, y), me = hs.findIndex(h => h === e || e.contains(h));   // only what is stacked above the text (see the edge pass)
          if (me < 0) continue;
          for (const h of hs.slice(0, me)) {
            if (h.contains(e)) continue;
            const o = h.closest(OCC); if (!o || o.contains(e) || effOp(o) < 0.5) continue;
            if (o.tagName === 'IMG') { const q = o.getBoundingClientRect(), mx = q.width * 0.12, my = q.height * 0.12; if (x < q.left + mx || x > q.right - mx || y < q.top + my || y > q.bottom - my) continue; }   // a cut-out's transparent margin is not the drawing
            n++; by = o.tagName === 'IMG' ? (o.getAttribute('src') || '').split('/').pop() : [...o.classList].filter(c => c !== 'e').join('.'); break;
          }
        }
        if (n >= 2) cov.push(text + ' under ' + by);
      }
      const imgs = [];
      for (const im of document.querySelectorAll(IMG)) { const e = im.closest('.e, .obj, .det') || im; if (effOp(e) < 0.5) continue; const r = im.getBoundingClientRect(); if (r.width < 2 || r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue; imgs.push({ l: r.left, r: r.right, t: r.top, b: r.bottom, src: im.classList.contains('g-grid') ? 'grid' : (im.getAttribute('src') || '').split('/').pop() }); }
      return { dens, dim, head, edge, covE, ins, out, imgs, cov, miss };
    }, t, SEL, IMG, OCC, CONTENT, HEADSEL);
    dens.push([t, r.dens]); if (r.dim) dim = true;
    for (const h of r.head || []) (heads[h] = heads[h] || []).push(t);
    for (const k of r.covE || []) covered[k] = (covered[k] || 0) + 1;
    for (const e of r.ins || []) { if (!insOut[e.what] || insOut[e.what].of < e.of) insOut[e.what] = { of: e.of, t }; }
    for (const e of r.edge || []) {
      /* Кромка судится с ЧЕТЫРЁХ сторон. До 22.09.2026 считались только бока, и HIT «ОТПРАВЛЯЮТ»,
         срезанный верхней кромкой наклоном камеры, проходил гейт чистым — брак нашёл клиент. */
      const of = Math.max(0, -e.l, e.r - VW);
      const ofv = Math.max(0, -e.t, e.b - VH);
      if (of > 8 && of < (e.r - e.l) * 0.6) { const k = e.text; const w = e.r - e.l; const sug = w > 1000 ? Math.floor(e.fs * 1000 / w) : null; if (!over[k] || over[k].of < of) over[k] = { of, fs: e.fs, sug, t }; }
      if (ofv > 8 && ofv < (e.b - e.t) * 0.6) { const k = e.text + ' ↕'; if (!over[k] || over[k].of < ofv) over[k] = { of: ofv, fs: e.fs, sug: null, t }; }
    }
    if (!r.out) continue;
    if (r.miss.length) stage.push([t, r.miss]);
    const imgs = r.imgs; r = r.out;
    for (const e of r) for (const im of imgs) { const iw = Math.min(e.r, im.r) - Math.max(e.l, im.l), ih = Math.min(e.b, im.b) - Math.max(e.t, im.t); if (iw > 0 && ih > 0 && iw * ih > (im.src === 'grid' ? 0.05 : 0.2) * (e.r - e.l) * (e.b - e.t)) { const k = e.text + ' × ' + im.src; pairs[k] = (pairs[k] || 0) + 1; } }
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i], c = r[j];
      if (a.kind !== 'text' && a.kind === c.kind) continue;   // stacked bars / rows touch each other by design
      const iw = Math.min(a.r, c.r) - Math.max(a.l, c.l), ih = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      if (iw <= 0 || ih <= 0) continue;
      const small = Math.min((a.r - a.l) * (a.b - a.t), (c.r - c.l) * (c.b - c.t));
      if (iw * ih > (a.kind !== 'text' || c.kind !== 'text' ? 0.05 : 0.15) * small) { const k = a.text + ' × ' + c.text; pairs[k] = (pairs[k] || 0) + 1; }   // a chip or bar may not touch a word at all; stacked words overlap by line-height
    }
  }
  await b.close();
  let fail = 0;
  const io = Object.entries(insOut);
  const o = Object.entries(over); const pp = Object.entries(pairs).filter(([, n]) => n >= 2);
  if (o.length) { fail++; console.log(`OUT OF FRAME: ${o.length}`); for (const [k, v] of o) console.log(`  "${k}"  +${v.of | 0}px at ${v.t.toFixed(1)}s  font ${v.fs | 0}` + (v.sug ? ` → suggest s: ${v.sug}` : ' → move it, or the camera')); } else console.log('out of frame: none');
  if (io.length) { fail++; console.log(`INSERT OUT OF FRAME: ${io.length}`); for (const [k, v] of io) console.log(`  ${k}  +${v.of | 0}px at ${v.t.toFixed(1)}s`); } else console.log('inserts out of frame: none');
  if (pp.length) { fail++; console.log(`TEXT OVER TEXT / IMAGE: ${pp.length}`); for (const [k, n] of pp) console.log(`  ${k}  (${n} samples)`); } else console.log('text overlaps: none');
  const cc = Object.entries(covered).filter(([, n]) => n >= 2);
  if (cc.length) { fail++; console.log(`TEXT COVERED: ${cc.length}  → move the text or the object, or put the object behind (lower depth / earlier in add)`); for (const [k, n] of cc) console.log(`  ${k}  (${n} samples)`); } else console.log('covered text: none');
  /* stage: group consecutive samples into ranges */
  const ranges = [];
  for (const [t, ys] of stage) { const last = ranges[ranges.length - 1]; if (last && t - last.t1 < STEP * 1.5 + 1e-6) { last.t1 = t; last.ys.push(...ys); } else ranges.push({ t0: t, t1: t, ys: [...ys] }); }
  const sr = ranges.filter(g => g.t1 - g.t0 >= 0.2);
  if (sr.length) { fail++; console.log(`STAGE VISIBLE: ${sr.length}  → make the room taller (h) or give it \`top\`, or keep the camera inside`); for (const g of sr) { const my = g.ys.reduce((s, y) => s + y, 0) / g.ys.length; console.log(`  ${g.t0.toFixed(1)}–${g.t1.toFixed(1)}s  ${my < 700 ? 'top' : my > 1220 ? 'bottom' : 'side'} edge`); } } else console.log('stage visible: none');
  /* empty: runs of samples under the threshold */
  const runs = []; let st = null;
  for (const [t, d] of dens) { if (d < EMPTY) { if (st === null) st = t; } else { if (st !== null && t - st >= EMPTY_RUN) runs.push([st, t]); st = null; } }
  if (st !== null && DUR - st >= EMPTY_RUN) runs.push([st, DUR]);
  let lo = { m: 1, t: 0 }; const W = Math.round(1 / STEP);
  for (let i = 0; i + W <= dens.length; i++) { const m = dens.slice(i, i + W).reduce((s, [, d]) => s + d, 0) / W; if (m < lo.m) lo = { m, t: dens[i][0] }; }
  if (runs.length) { fail++; console.log(`EMPTY FRAME: ${runs.length}  → something must stand in the world when it opens (at: -.05, or on the first word)`); for (const [a, z] of runs) console.log(`  ${a.toFixed(1)}–${z.toFixed(1)}s  content < ${EMPTY * 100 | 0} % of the frame`); } else console.log('empty frames: none');
  if (lo.m < 1) console.log(`  (emptiest second: ${(lo.m * 100).toFixed(1)} % at ${lo.t.toFixed(1)}s)`);
  const hh = Object.entries(heads);
  if (hh.length && MATTE_OFF) { console.log(`head clearance: ${hh.length} рядом с головой, но матт выключен — коробка головы недостоверна, проверить глазами`); for (const [k, ts] of hh) console.log(`  ${k}  ${ts[0].toFixed(1)}–${ts[ts.length - 1].toFixed(1)}s (${ts.length} samples)`); }
  else if (hh.length) { fail++; console.log(`HEAD COVERED: ${hh.length}  → move it off the head (≥ 15 px), or make it behind: true`); for (const [k, ts] of hh) console.log(`  ${k}  ${ts[0].toFixed(1)}–${ts[ts.length - 1].toFixed(1)}s (${ts.length} samples)`); } else if (FACEJSON) console.log('head covered: none');
  if (dim) { fail++; console.log('HOOK DIMMED: a spot light is up in the first 1.2 s — start it after the hook'); } else console.log('hook dimmed: no');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
