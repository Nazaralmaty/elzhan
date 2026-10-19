/* ~/.claude/engine/genre/speaker.js — the footage genre: a shot person + graphics behind and in front.
   Built on ae/. One composition, one seek(t); the frame's own pixels are the plate, the matte
   (same frame, cleaned alpha) sits over the BACK graphics, FRONT graphics sit over the matte.
   Matte over its own frame → the edge never shows (mnt-matte law); where a back layer is
   present, a shadow and a light wrap made from the same matte separate the body from it.

   Inputs written by cam.sh: work/plate.js (window.PLATE = {frames, fps, dur}), work/fr/f_%04d.jpg,
   work/mt/f_%04d.png, assets/vo/words.js (window.WORDS_ALL = [{w,t0,t1}]), qa/face.json.

   spec = {
     world: false,              // the BACK layer is the scene and the camera flies it; the speaker is pinned in screen space
     dur,                       // default PLATE.dur
     cuts: [s, …],              // hard cuts inside the take itself (a b-roll edit under a voiceover) — counted as events of the frame
     mark: '@client',           // small footer mark; '' for none
     push: 0.03,                // slow camera push / pull alternating per act (mnt-camera); 0 = static
     backBlur: 2.4,             // defocus of everything behind the speaker (mnt-depth)
     subs: { y: 1250, size: 64, words: 3, ink: 'var(--ink)', accent: 'var(--accent)', hits: ['8 лет'], off: [[t0,t1]], solo: false,
             pill: { bg, pad: [x, y], r } — one plate behind the group sized to its words; overInserts: false — keep running over inserts; dir: 'alt' | 'up', rise: 0.7 — entry travel in sizes, chars: 22 — max letters in a group } | false,
     acts: [{
       t0, t1,
       plate: { scale: 1, x: 0, y: 0, from: <footage time>, speed: 1 },   // speaker transform; arrives over 0.30 s (an insert act keeps the last one)
       arrive: 0.30,            // travel time into this act's plate; 0 — a hard cut (split ↔ full, cut with its lower half)
       cam: { x, y, z, at, hold },                                         // optional camera key, world coords
       back:  [elements],       // behind the speaker: bigtype, img, card, html …
       front: [elements],       // over the speaker: card, strip, counter, text, img, html …
       insert: { bg: '#111', img, add: [elements], flash: '#fff' | false, subs: false },  // full-frame plate: footage hidden, hard cut in/out; subs: true — subtitles run on over b-roll
       shot: 'matte' | 'full',    // world mode: 'matte' = only the cut-out over the world, 'full' = the whole frame
       subs: true               // false hides subtitles in this act
     }] }
   element: { k, x, y, w, h, at (abs s | fraction of act), until, hardOut (vanish exactly at until — a background ending on a cut), dur, anim: pop|up|slide|flip|grow|fade|left|right, depth, rot, rx, ry,
              cps: 20 — text types itself letter by letter at N chars/s (the black-card language, /speaker-reel gold branch),
              move: [{ at, x, y, scale, rot, rx, ry, blur, ease }] — explicit keyframes after the entry (a card pulling out, an icon drifting),
              live: { x, y, rot, rx, ry, scale, freq, ph } — endless slow motion so nothing on screen is frozen,
              seq: { src: 'dir/f_%04d.jpg' | file, frames, fps, kb: [s0, s1], blur, bright, r, shadow, sync } — b-roll inside an insert;
                   sync: true + src 'work/fr/f_%04d.jpg' = the take's CURRENT frame (blurred live speaker under cards, /literal-speaker),
              sfx: 'name' | { s, d, v, cut } | [...] — the object's own sound, named by the reel; keys: [s after entry] — silent frame events drawn by tick,
              tick: (u, node, t) => {} — motion inside an html element each frame after entry (dots, cursor, cells),
              t (text), s (font px), voice: hit|sans|script|sub, color, src, title, ar, html, from/to (counter), prefix, suffix, id }
   Every element is placed in world pixels 1080×1920. Text elements may carry <span class="a">accent</span>. */
import { css, ready, fitWidth } from '../core.js';
import { Comp, FX, clamp, pr, lerp } from '../ae/ae.js';
import * as P from '../ae/presets.js';
import { withClient } from './helpers.js';

const STYLE = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:#000}
#stage{position:relative;width:1080px;height:1920px;overflow:hidden;background:#000;font-family:var(--f-sans),sans-serif;-webkit-font-smoothing:antialiased}
.plate img,.mt img{display:block;width:1080px;height:1920px}
.mt.sh img{filter:blur(18px) brightness(0)}
.mt.lw img{filter:blur(13px) brightness(2.2)}
.txt{line-height:1;white-space:nowrap}
.hit{font-family:var(--f-hit),sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:-.005em;line-height:.9;color:var(--ink)}
.sans{font-family:var(--f-sans),sans-serif;font-weight:800;line-height:1.1;color:var(--ink)}
.sub{font-family:var(--f-sans),sans-serif;font-weight:600;line-height:1.2;color:var(--ink)}
.script{font-family:var(--f-script),cursive;font-weight:400;line-height:1;color:var(--accent)}
.a{color:var(--accent)}
.big{font-family:var(--f-hit),sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:-.02em;line-height:.86;color:var(--ink);white-space:nowrap}
.cardel{background:var(--paper);border-radius:6px;box-shadow:0 30px 60px rgba(0,0,0,.35);padding:30px 34px;color:var(--paper-ink);overflow:hidden}
.cardel .ct{font-weight:800;font-size:52px;line-height:1.05}
.cardel .ca{font-family:var(--f-script),cursive;font-size:40px;opacity:.85;margin-top:8px}
.cardel img{display:block;width:100%;height:auto;margin-top:16px;border-radius:4px}
.cardel.photo{padding:0}.cardel.photo img{margin:0;border-radius:6px;width:100%;height:100%;object-fit:cover}
.strip{background:var(--accent);color:var(--strip-ink,#111);padding:26px 40px;font-weight:800;font-size:54px;line-height:1.05;white-space:nowrap}
.strip small{display:block;font-weight:600;font-size:30px;opacity:.8;margin-top:6px}
.counter{font-family:var(--f-hit),sans-serif;font-weight:700;color:var(--ink);line-height:.9;white-space:nowrap;font-variant-numeric:tabular-nums}
.e img{display:block;width:100%;height:auto}
.subs{position:absolute;left:0;width:1080px;text-align:center;font-family:var(--f-sans),sans-serif;font-weight:800;color:var(--ink);text-shadow:0 2px 8px rgba(0,0,0,.55),0 10px 30px rgba(0,0,0,.35);white-space:nowrap}
.subs .ae-u{padding:0 .08em}
.subs .subpill{position:absolute;z-index:-1;display:block}
.insert{position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden}
.insert img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#mark{position:absolute;left:0;right:0;bottom:64px;text-align:center;font-weight:700;font-size:24px;letter-spacing:.4em;text-transform:uppercase;color:rgba(255,255,255,.55)}
`;

export function mount(spec) {
  spec = withClient(spec, 'speaker');   // client preset fills what the spec leaves out; no CLIENT → same spec
  css(STYLE);
  const PL = window.PLATE || { frames: 1, fps: 30, dur: 10 };
  const FPS = PL.fps || 30, DUR = spec.dur ?? PL.dur;
  const stage = document.createElement('div'); stage.id = 'stage'; document.body.appendChild(stage);
  const comp = new Comp({ fps: FPS, duration: DUR, stage });
  const div = (cls, css = '', html = '') => { const n = document.createElement('div'); n.className = cls; n.style.cssText = css; n.innerHTML = html; return n; };
  const FULL = { x: 0, y: 0, w: 1080, h: 1920, ax: 0, ay: 0 };
  const acts = spec.acts.slice().sort((a, b) => a.t0 - b.t0);
  const actAt = t => acts.find(a => t >= a.t0 && t < a.t1) || null;

  /* ── plate / shadow / wrap / matte: four layers, one transform ─────────── */
  /* world mode (15.09.2026, Elzhan: «основа — канвас, сверху видео клиента, в основном как matte»):
     the BACK layer is the whole scene and the camera flies it; the speaker is a cut-out pinned in
     SCREEN space, so a camera move travels the world behind them and never drags the person. */
  const WORLD = !!spec.world;
  const scr = WORLD ? { parent: stage } : {};
  const pImg = document.createElement('img'), sImg = document.createElement('img'), wImg = document.createElement('img'), mImg = document.createElement('img');
  const _bk = WORLD ? comp.layer(div('back'), { base: { ...FULL, blur: spec.backBlur ?? 0 } }) : null;
  const plateL = comp.layer(div('plate'), { ...scr, base: { ...FULL, ax: .5, ay: .5 } }); plateL.node.appendChild(pImg);
  const backL = WORLD ? _bk : comp.layer(div('back'), { base: { ...FULL, blur: spec.backBlur ?? 2.4 } });
  const shadowL = comp.layer(div('mt sh'), { ...scr, base: { ...FULL, ax: .5, ay: .5, opacity: 0 } }); shadowL.node.appendChild(sImg); shadowL.node.style.mixBlendMode = 'multiply';
  const wrapL = comp.layer(div('mt lw'), { ...scr, base: { ...FULL, ax: .5, ay: .5, opacity: 0 } }); wrapL.node.appendChild(wImg); wrapL.node.style.mixBlendMode = 'screen';
  const matteL = comp.layer(div('mt'), { ...scr, base: { ...FULL, ax: .5, ay: .5 } }); matteL.node.appendChild(mImg);
  const frontL = comp.layer(div('front'), { ...scr, base: FULL });
  shadowL.expr('x', (t, v) => v + 14).expr('y', (t, v) => v + 22);
  const P4 = [plateL, shadowL, wrapL, matteL];
  const keyP = (prop, t, v, e) => P4.forEach(L => L.key(prop, t, v, e));
  // speaker transform per act, arriving over 0.30 s (a crop never jumps — it travels)
  let prev = { scale: 1, x: 0, y: 0 };
  acts.forEach((a, i) => {
    // a full-frame insert hides the plate: it keeps the previous crop (moving to scale 1 for it slid the speaker down in the
    // last 0.30 s of the shot before, icon/reel_083 «громкое»); the act after the insert travels from there, unseen
    const p = a.insert && !a.plate ? prev : { scale: 1, x: 0, y: 0, ...(a.plate || {}) };
    if (i > 0 && (p.scale !== prev.scale || p.x !== prev.x || p.y !== prev.y)) {
      // a.arrive: travel time (s); 0 — a hard cut, for a layout change whose other half cuts with it (split ↔ full: the plate
      // travelling 0.30 s under a still-visible lower half slid the head into it, icon/reel_081–083)
      const ar = Math.max(0.001, a.arrive ?? 0.30);
      for (const k of ['scale', 'x', 'y']) { keyP(k, a.t0 - ar, prev[k], 'hold'); keyP(k, a.t0, p[k], ar < 0.01 ? 'hold' : 'inOut'); }
    } else if (i === 0) for (const k of ['scale', 'x', 'y']) P4.forEach(L => L.set({ [k]: p[k] }));
    prev = p;
    /* shot: 'matte' drops the footage frame and leaves only the cut-out standing in the world */
    const show = a.shot === 'matte' ? 0 : 1, prevShow = i > 0 ? (acts[i - 1].shot === 'matte' ? 0 : 1) : show;
    if (i === 0) plateL.set({ opacity: show });
    else if (show !== prevShow) { plateL.key('opacity', a.t0 - 0.001, prevShow, 'hold'); plateL.key('opacity', a.t0, show, 'linear'); }
    const mt = a => (WORLD ? a.shot === 'matte' : (a.back || []).length > 0);
    const hasBack = mt(a), hadBack = i > 0 && mt(acts[i - 1]);
    if (hasBack !== hadBack || i === 0) {
      shadowL.key('opacity', a.t0, hadBack ? .32 : 0, 'hold').key('opacity', a.t0 + 0.3, hasBack ? .32 : 0, 'out');
      wrapL.key('opacity', a.t0, hadBack ? .42 : 0, 'hold').key('opacity', a.t0 + 0.3, hasBack ? .42 : 0, 'out');
    }
    if (a.insert) { comp.cue(a.t0, 'cut'); comp.cue(a.t1, 'cut'); }
    if (i > 0 && a.plate && !a.insert) comp.cue(a.t0, 'cam');   // the crop travels to a new size — a visible camera move
  });
  // hard cuts already baked into the take (a b-roll edit under a voiceover, tools/broll.py): they are events of the frame
  (spec.cuts || []).forEach(t => comp.cue(t, 'cut'));
  // footage frame for time t: act.plate.from / speed remap the footage, default plate time = t
  const frameAt = t => {
    const a = actAt(t); const p = (a && a.plate) || {};
    const ft = p.from !== undefined ? p.from + (t - a.t0) * (p.speed ?? 1) : t;
    return Math.max(1, Math.min(PL.frames, Math.round(ft * FPS) + 1));
  };
  let curN = -1;
  const loadFrame = async t => {
    const n = frameAt(t); if (n === curN) return; curN = n;
    const p4 = String(n).padStart(4, '0');
    pImg.src = `work/fr/f_${p4}.jpg`; if (PL.matte !== false) mImg.src = sImg.src = wImg.src = `work/mt/f_${p4}.png`;
    await Promise.all((PL.matte === false ? [pImg] : [pImg, mImg]).map(i => i.decode().catch(() => {})));
  };

  /* ── elements ──────────────────────────────────────────────────────────── */
  const byId = {}, RECS = [], SEQS = [];
  const atTime = (at, a) => at === undefined ? a.t0 : typeof at === 'string' && at.endsWith('s') ? parseFloat(at) : at > 1.0001 ? at : a.t0 + at * (a.t1 - a.t0);
  const entry = (L, kind, t0, dur) => { const f = P.ENTRY[kind || 'pop']; if (f) f(L, t0, dur); return L; };
  function element(e, a, parent, inFront) {
    const t0 = atTime(e.at, a), dur = e.dur ?? 0.42;
    const base = { x: e.x ?? 0, y: e.y ?? 0, w: e.w || 0, h: e.h || 0, rot: e.rot || 0, rx: e.rx || 0, ry: e.ry || 0 };
    const opts = { parent, depth: e.depth ?? (inFront ? 1 : 0.92), base };
    let L = null;
    switch (e.k) {
      case 'text': {
        L = comp.text(e.t, { ...opts, cls: 'e txt ' + (e.voice || 'sans'), split: (e.chars || e.cps) ? 'chars' : 'words', css: `font-size:${e.s || 72}px;${e.color ? `color:${e.color};` : ''}${e.align ? `text-align:${e.align};` : ''}${e.w ? `width:${e.w}px;` : ''}`, wrap: e.wrap });
        L.animate({ t0, stagger: e.cps ? 1 / e.cps : e.chars ? 0.03 : 0.06, dur: e.cps ? 0.10 : 0.30, from: e.cps ? { opacity: 0 } : { y: 24, opacity: 0, blur: 8 }, ease: 'out' });
        L.set({ opacity: 0 }).key('opacity', t0 - 0.01, 0, 'hold').key('opacity', t0, 1, 'linear'); comp.cue(t0, 'pop'); break;
      }
      case 'bigtype': {
        L = comp.text(e.t, { ...opts, cls: 'e big', css: `font-size:${e.s || 300}px;${e.color ? `color:${e.color};` : ''}opacity:${e.o ?? .92}` });
        entry(L, e.anim || 'up', t0, 0.5); P.float(L, t0 + 0.5, 4, 0.9); comp.cue(t0, 'bigtype'); break;
      }
      case 'img': L = entry(comp.layer(div('e', `width:${e.w}px`, `<img src="${e.src.includes('/') ? e.src : 'assets/img/' + e.src}" alt="">`), opts), e.anim, t0, dur); P.float(L, t0 + dur, 5, 1.1); comp.cue(t0, 'pop'); break;
      case 'card': {
        const photo = e.img && !e.title && !e.html;
        L = comp.layer(div('e cardel' + (photo ? ' photo' : ''), `width:${e.w}px;${e.h ? `height:${e.h}px;` : ''}`,
          `${e.title ? `<div class="ct">${e.title}</div>` : ''}${e.ar ? `<div class="ca">${e.ar}</div>` : ''}${e.img ? `<img src="${e.img.includes('/') ? e.img : 'assets/img/' + e.img}" alt="">` : ''}${e.html || ''}`), opts);
        entry(L, e.anim || 'flip', t0, dur); P.sway(L, t0 + dur, 4, 2.5); P.float(L, t0 + dur, 5, 1.2); comp.cue(t0, 'card'); break;
      }
      case 'strip': {
        L = comp.layer(div('e strip', `${e.w ? `width:${e.w}px;` : ''}${e.color ? `background:${e.color};` : ''}`, `${e.t}${e.sub ? `<small>${e.sub}</small>` : ''}`), opts);
        L.set({ opacity: 0 }).key('opacity', t0 - 0.01, 0, 'hold').key('opacity', t0, 1, 'linear');
        FX.wipe(L, t0, e.dur ?? 0.5, 'left'); comp.cue(t0, 'strip'); break;
      }
      case 'counter': {
        const fmt = v => (e.prefix || '') + (e.dec ? v.toFixed(e.dec) : Math.round(v).toLocaleString('ru-RU').replace(/,/g, ' ')) + (e.suffix || '');
        L = comp.layer(div('e counter', `font-size:${e.s || 220}px`, fmt(e.from || 0)), opts);
        entry(L, e.anim || 'pop', t0, 0.4);
        const ap = L.apply.bind(L), d = e.count ?? 1.2, f0 = e.from || 0, f1 = e.to ?? 0;
        L.apply = (t, ex) => { if (!ap(t, ex)) return false; const u = 1 - Math.pow(1 - pr(t, t0, d), 3); L.node.textContent = fmt(lerp(f0, f1, u)); return true; };
        comp.cue(t0, 'counter'); comp.cue(t0 + d, 'tick'); break;
      }
      case 'seq': {   // b-roll: an image sequence (src with %04d, frames, fps from `at`) or a still; kb: [s0, s1] slow push over the act; blur: a soft ground copy
        const n = div('e seq', `width:${e.w}px;height:${e.h}px;overflow:hidden;border-radius:${e.r ?? 0}px;${e.shadow ? 'box-shadow:0 34px 90px rgba(0,0,0,.38);' : ''}`);
        const im = document.createElement('img'); im.alt = '';
        im.style.cssText = `width:100%;height:100%;object-fit:cover;display:block;transform-origin:50% 50%;${e.blur ? `filter:blur(${e.blur}px) brightness(${e.bright ?? 1});` : ''}`;
        n.appendChild(im);
        L = entry(comp.layer(n, opts), e.anim || 'fade', t0, dur);
        const frames = e.frames || 1, fps = e.fps || 30, base0 = e.blur ? 1.15 : 1; let cur = '';
        const ap = L.apply.bind(L);
        L.apply = (t, ex) => {
          if (!ap(t, ex)) return false;
          // sync: the take's own frame for this second (a blurred live speaker under the cards) — lips stay on the voice
          const k = e.sync ? frameAt(t) : Math.max(1, Math.min(frames, Math.floor((t - t0) * fps) + 1));
          const src = (e.sync || frames > 1) ? e.src.replace('%04d', String(k).padStart(4, '0')) : e.src;
          if (src !== cur) { im.src = src; cur = src; }
          const q = Math.max(0, Math.min(1, (t - a.t0) / Math.max(0.01, a.t1 - a.t0)));
          const kb = e.kb ? e.kb[0] + (e.kb[1] - e.kb[0]) * q : 1;
          im.style.transform = `scale(${(base0 * kb).toFixed(4)})`;
          return true;
        };
        if (!e.quiet) comp.cue(t0, 'seq');
        SEQS.push(im); break;
      }
      default: L = entry(comp.layer(div('e', `${e.w ? `width:${e.w}px;` : ''}${e.h ? `height:${e.h}px;` : ''}`, e.html || ''), opts), e.anim, t0, dur); if (!e.quiet) comp.cue(t0, 'html');
    }
    if (!L) return null;
    /* sfx: the sound this object makes, named by the reel ('cash_register', 'stamp') — `/sound` §2.2.
       'name' | { s, d (s after entry), v, cut } | [ … ]; score.py plays the cue verbatim. */
    // a sound after the entry (d > 0) marks a change the tick draws — it is also a frame event ('key': counted by qa/master.py, silent in the palettes)
    if (e.sfx) [].concat(e.sfx).forEach(x => { const q = typeof x === 'string' ? { s: x } : x; comp.cue(t0 + (q.d || 0), 'sfx:' + q.s + '@' + (q.v ?? 0.26) + (q.cut ? '~' + q.cut : '')); if (q.d > 0.05) comp.cue(t0 + q.d, 'key'); });
    /* tick: motion design inside the element — fn(u = s since entry, node, t) runs every frame after the entry
       (dots falling, a cursor travelling, a cell filling). Deterministic in t, never in wall time. */
    // keys: [s after entry] — changes the tick draws inside the element (a row landing, a colour flip): frame events, silent in every palette
    if (e.keys) e.keys.forEach(d => comp.cue(t0 + d, 'key'));
    if (e.tick) { const ap = L.apply.bind(L); L.apply = (t, ex) => { if (!ap(t, ex)) return false; e.tick(t - t0, L.node, t); return true; }; }
    /* move: explicit keyframes on any element — the pull-out of a card, the drift of an icon.
       [{ at, x, y, scale, rot, rx, ry, blur, ease }], each step starts where the previous one ended. */
    if (e.move) {
      const st = { x: base.x, y: base.y, scale: 1, rot: base.rot, rx: base.rx, ry: base.ry, blur: 0 };
      let pt = t0 + (e.moveFrom ?? dur);
      for (const m of e.move) {
        const mt = atTime(m.at, a);
        for (const p of ['x', 'y', 'scale', 'rot', 'rx', 'ry', 'blur']) {
          if (m[p] === undefined) continue;
          L.key(p, pt, st[p], 'hold'); L.key(p, mt, m[p], m.ease || 'out'); st[p] = m[p];
        }
        pt = mt;
      }
    }
    /* live: the null-object law — nothing on screen is ever frozen. Amplitudes in px / deg. */
    if (e.live) {
      const v = typeof e.live === 'number' ? { x: e.live, y: e.live * 0.6 } : e.live;
      const f = v.freq ?? 0.22, ph = v.ph ?? 0;
      if (v.x) L.expr('x', (t, q) => q + Math.sin(t * f + ph) * v.x);
      if (v.y) L.expr('y', (t, q) => q + Math.cos(t * f * 0.74 + ph) * v.y);
      if (v.rot) L.expr('rot', (t, q) => q + Math.sin(t * f * 0.83 + ph) * v.rot);
      if (v.rx) L.expr('rx', (t, q) => q + Math.cos(t * f * 0.61 + ph) * v.rx);
      if (v.ry) L.expr('ry', (t, q) => q + Math.sin(t * f * 0.69 + ph) * v.ry);
      if (v.scale) L.expr('scale', (t, q) => q * (1 + Math.sin(t * f * 0.5 + ph) * v.scale));
    }
    if (e.until !== undefined && e.hardOut) { const tu = atTime(e.until, a); L.key('opacity', tu - 0.001, 1, 'hold').key('opacity', tu, 0, 'hold'); }   // gone exactly at a hard cut, no fade onto the next shot
    else if (e.until !== undefined) P.leave(L, atTime(e.until, a), 0.26);
    else if (!e.stay) P.leave(L, a.t1 - 0.02, 0.22);           // an element belongs to its act unless `stay`
    if (e.id) byId[e.id] = L;
    L.node.classList.add(inFront ? 'chk' : 'bk');               // .chk = must not cover the head (qa/speaker.js)
    RECS.push({ e, L, a, front: inFront });
    return L;
  }
  if (PL.matte === false) { [shadowL, wrapL, matteL].forEach(L => { L.visible = false; }); acts.forEach(a => { a.front = [...(a.back || []), ...(a.front || [])]; a.back = []; }); }   // no matte: nothing can sit behind the speaker
  acts.forEach(a => {
    (a.back || []).forEach(e => element(e, a, backL, false));
    (a.front || []).forEach(e => element(e, a, frontL, true));
  });

  /* ── full-frame inserts: screen space, hard in / hard out, flash on the cut ── */
  acts.forEach(a => {
    if (!a.insert) return;
    const I = a.insert;
    const n = div('insert', `background:${I.bg || '#111'}`, I.img ? `<img class="bg" src="${I.img.includes('/') ? I.img : 'assets/img/' + I.img}" alt="">` : '');
    const L = comp.layer(n, { parent: stage, inPoint: a.t0, outPoint: a.t1, base: FULL });
    (I.add || []).forEach(e => element({ stay: true, ...e }, a, L, true));
    if (I.flash !== false) FX.flash(comp, a.t0 - 0.06, 0.22, I.flash || '#fff');
  });

  /* ── subtitles: shared with genre/speaker-canvas.js (export below) ─────── */
  const S = spec.subs === false ? null : { y: 1250, size: 64, words: 3, gap: 0.35, hold: 0.30, ...(spec.subs || {}) };
  const SUB = subtitles(comp, S, { DUR, FPS, stage,
    hidden: t => (!S.overInserts && acts.some(a => a.insert && !a.insert.subs && t >= a.t0 && t < a.t1)) || (S.off || []).some(([x, y]) => t >= x && t < y) || (actAt(t) && actAt(t).subs === false),
    stops: S && !S.overInserts ? acts.filter(a => a.insert && !a.insert.subs).map(a => a.t0) : [] });   // insert.subs: true — b-roll the voice keeps talking over (subtitles run on)
  const subLayers = SUB.layers;

  /* ── camera: per-act key or a slow alternating push (mnt-camera) ────────── */
  const push = spec.push ?? 0.03;
  let lastCam = { x: 540, y: 960, z: 1 };
  comp.camera.key(0, { x: 540, y: 960, zoom: 1, hold: 0 });
  acts.forEach((a, i) => {
    if (a.cam) {
      const c = { ...lastCam, ...a.cam }; const t = a.t0 + (a.cam.at ?? 0) * (a.t1 - a.t0);
      comp.camera.key(t, { x: c.x, y: c.y, zoom: c.z ?? c.zoom ?? 1, hold: a.cam.hold ?? 0.2 }); lastCam = { x: c.x, y: c.y, z: c.z ?? 1 };
      if (t > 0) comp.cue(t - 0.2, 'cam');
    } else if (push > 0 && !a.insert) {
      const z0 = 1 + (i % 2 ? push : 0), z1 = 1 + (i % 2 ? 0 : push);
      comp.camera.key(a.t0 + 0.001, { x: lastCam.x, y: lastCam.y, zoom: z0, hold: 0, ease: 'linear' });
      comp.camera.key(a.t1, { x: lastCam.x, y: lastCam.y, zoom: z1, hold: 0, ease: 'linear' });
    }
  });
  comp.camera.breath = 0; comp.camera.lift = 0; comp.camera.wig = 0;
  comp.cue(DUR - 1.2, 'cta');

  FX.vignette(comp, spec.vignette ?? 0.22);
  const mark = document.createElement('div'); mark.id = 'mark'; mark.textContent = spec.mark || ''; stage.appendChild(mark);

  /* ── ready + expose: seek awaits the frame decode, render.js awaits seek ── */
  const fit = () => { SUB.fit(); fitWidth([...document.querySelectorAll('.big')], 1180, 120); };
  window.PLATE_INFO = { frameAt, acts: acts.map(a => ({ t0: a.t0, t1: a.t1, insert: !!a.insert })) };
  window.SUBS = subLayers.map(L => L.node);
  loadFrame(0).then(() => ready(spec.fonts || ['700 100px Osw', '800 100px Golos', '400 100px Marck'], fit)).then(() => comp.seek(0));
  comp.expose();
  const sync = comp.seek.bind(comp);
  window.seek = async t => { await loadFrame(t); const r = sync(t); if (SEQS.length) await Promise.all(SEQS.filter(i => i.getAttribute('src')).map(i => i.decode().catch(() => {}))); return r; };
  window.ACTS_A = acts.map(a => [a.t0, a.t1]);
  if (location.search.includes('t=')) { const t = parseFloat(new URLSearchParams(location.search).get('t')); loadFrame(t).then(() => sync(t)); }
  return comp;
}

/* subtitles: one level, one line, word by word from WORDS_ALL. Exported for genre/speaker-canvas.js (15.09.2026).
   hidden(t) → no group starts at t; stops = sorted times a running group must be gone by (inserts, cuts into worlds). */
export function subtitles(comp, S, { DUR, FPS = 30, stage, hidden = () => false, stops = [] }) {
  const subLayers = [];
  stops = stops.slice().sort((a, b) => a - b);
  /* ── subtitles: one level, one line, word by word from WORDS_ALL ────────── */
  if (!S || !window.WORDS_ALL || !window.WORDS_ALL.length) return { layers: subLayers, fit: () => {} };
  {
    const W = window.WORDS_ALL, hits = (S.hits || []).map(h => h.toLowerCase());
    const groups = []; let g = [];
    const flush = () => { if (g.length) groups.push(g); g = []; };
    W.forEach((w, i) => {
      if (S.chars && g.length && (g.map(x => x.w).join(' ') + ' ' + w.w).length > S.chars) flush();   // a group never grows wider than `chars` letters
      g.push(w);
      const nx = W[i + 1];
      if (g.length >= S.words || !nx || nx.t0 - w.t1 > S.gap || /[.!?…]$/.test(w.w)) flush();
    });
    groups.forEach((gr, gi) => {
      const t0 = gr[0].t0, tEnd = Math.max(gr[gr.length - 1].t1 + S.hold, gr[0].t0 + 0.6);
      const FO = S.solo ? 0.14 : 0.22;   // solo: the old group is fully gone before the next one enters (two groups never share the frame)
      let t1 = Math.min(tEnd, groups[gi + 1] ? groups[gi + 1][0].t0 - 0.04 - (S.solo ? FO + 0.02 : 0) : DUR);
      if (S.solo) t1 = Math.max(t1, t0 + 0.15);
      const cutAt = (S.cuts || []).find(c => c > t0 + 0.05 && c < t1 + FO + 0.01); if (cutAt) t1 = Math.max(t0 + 0.15, cutAt - FO - 1 / FPS);   // a subtitle is gone before a hard cut of the footage — it never fades over the next shot
      if (hidden(t0)) return;
      const stop = stops.find(x => x > t0 && x < t1); if (stop !== undefined) t1 = stop - 0.06;   // a subtitle never survives into a full-frame insert (or a canvas world)
      const html = gr.map(w => { const k = w.w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); const hit = hits.some(h => k && (h === k || h.split(/\s+/).includes(k))); return hit ? `<span class="a">${w.w}</span>` : w.w; }).join(' ');
      const L = comp.text(html, { parent: stage, cls: 'subs', css: `top:0;font-size:${S.size}px;${S.ink ? `color:${S.ink};` : ''}`, base: { x: 0, y: S.y, w: 1080, h: S.size * 1.2, ax: 0, ay: 0 }, inPoint: t0 - 0.02, outPoint: t1 + 0.3 });
      if (S.pill) { const pb = document.createElement('i'); pb.className = 'subpill'; pb.style.cssText += `;background:${S.pill.bg || 'rgba(22,17,15,.72)'};border-radius:${S.pill.r ?? 14}px`; L.node.prepend(pb); const ap = L.apply.bind(L), pt0 = t0; L.apply = (t, ex) => { if (!ap(t, ex)) return false; pb.style.opacity = Math.max(0, Math.min(1, (t - pt0 + 0.02) / 0.16)).toFixed(3); return true; }; }
      // every word: from below (70 % of the size) or above alternating, blur 9 → 0 (the "super combination")
      const times = gr.map(w => Math.max(t0, w.t0 - 0.05));
      L.animate({ times, dur: 0.30, from: { y: S.size * (S.rise ?? 0.7) * (S.dir === 'up' ? 1 : gi % 2 ? -1 : 1), opacity: 0, blur: 9 }, ease: 'out' });   // rise: 0 — words land in place (a band at the cage edge)
      L.set({ opacity: 1 }).key('opacity', t1, 1, 'hold').key('opacity', t1 + FO, 0, 'in');
      subLayers.push(L); comp.cue(t0, 'sub');
    });
  }

  const fitSubs = (max = 880, min = 40) => {
    for (const n of document.querySelectorAll('.subs')) {
      const u = n.querySelectorAll('.ae-u'); if (!u.length) continue;
      let s = parseFloat(n.style.fontSize);
      const width = () => u[u.length - 1].getBoundingClientRect().right - u[0].getBoundingClientRect().left;
      while (s > min && width() > max) { s -= 2; n.style.fontSize = s + 'px'; }
    }
  };
  const fitPills = () => {
    if (!S.pill) return;
    const [px, py] = S.pill.pad || [26, 10];
    for (const n of document.querySelectorAll('.subs')) {
      const u = n.querySelectorAll('.ae-u'), pb = n.querySelector('.subpill'); if (!u.length || !pb) continue;
      const l = u[0].offsetLeft, r = u[u.length - 1].offsetLeft + u[u.length - 1].offsetWidth;
      Object.assign(pb.style, { left: (l - px) + 'px', width: (r - l + 2 * px) + 'px', top: (-py) + 'px', height: (n.offsetHeight + 2 * py) + 'px' });
    }
  };
  return { layers: subLayers, fit: () => { fitSubs(S.max || 880, 40); fitPills(); } };
}
