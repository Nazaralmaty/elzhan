/* _engine/core.js — shared runtime for every reel genre.
   Browser ES module. A frame is a pure function of time: seek(t) sets the
   whole DOM state, nothing else moves. Rules baked in here so a reel never
   has to re-derive them:
     - scale is interpolated in the logarithm (the eye sees d(log s)/dt)
     - one monotone Hermite curve per act, no piecewise easing
     - blur and opacity are always written, including 0 (toggling filter jerks)
     - fonts are awaited by name and images by decode before READY
     - the schedule of events (cues) is exported from the same objects that
       draw the frame, never re-typed for the sound score. */

export const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
export const pr = (t, t0, d) => cl((t - t0) / d);
export const eo = x => 1 - Math.pow(1 - x, 3);
export const ei = x => x * x * x;
export const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const back = (x, c = 1.05) => 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
export const lp = (a, b, u) => a + (b - a) * u;
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
/* deterministic pseudo-random from an integer: Math.random() breaks the render */
export const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* Cubic Hermite through non-uniform keys, Fritsch–Carlson monotone tangents.
   Feed log(scale) as V and exp() the result: a zoom then reads as one move. */
export function hermite(T, V, t) {
  let k = 0;
  for (let i = 0; i < T.length - 1; i++) if (t >= T[i]) k = i;
  const h = T[k + 1] - T[k], u = cl((t - T[k]) / h);
  const d = i => (V[i + 1] - V[i]) / (T[i + 1] - T[i]);
  const m = i => {
    if (i === 0) return d(0);
    if (i === V.length - 1) return d(i - 1);
    const a = d(i - 1), b = d(i);
    if (a * b <= 0) return 0;
    const s = (a + b) / 2;
    return Math.sign(s) * Math.min(Math.abs(s), 3 * Math.abs(a), 3 * Math.abs(b));
  };
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * V[k] + (u3 - 2 * u2 + u) * h * m(k) +
         (-2 * u3 + 3 * u2) * V[k + 1] + (u3 - u2) * h * m(k + 1);
}
export const zoom = (T, S, t) => Math.exp(hermite(T, S.map(Math.log), t));

/* ── timeline from the voice ─────────────────────────────────────────────
   window.VO = [[duration, gapAfter], ...] is written by tts.sh into
   assets/vo/vo.js. Acts start where their line starts. */
export function timeline(VO, TAIL = 1.2) {
  const A = []; let t = 0;
  for (const [d, g] of VO) { A.push([t, t + d]); t += d + g; }
  const BND = A.slice(0, -1).map((a, i) => (a[1] + A[i + 1][0]) / 2);
  return { A, BND, DUR: A[A.length - 1][1] + TAIL };
}

/* Token beats: where inside a spoken line a token starts, by cumulative
   characters. Cheaper than whisper and within ~0.15 s on short lines.
   ponytail: char-proportional; swap for whisper word timestamps if a client
   hears the text landing off the word. */
/* Word times from whisper (window.WORDS[li]) when present: for each token,
   find its first word in the line's word list (sequential prefix match) and
   return the fraction of the line; else fall back to char beats. */
export function beats(line, toks, li = -1, span = 1) {
  const W = (window.WORDS || [])[li];
  if (W && W.length && span > 0) {
    const key = w => w.toLowerCase().replace(/[^\p{L}\p{N}$]/gu, '');
    let cursor = 0; const out = []; let ok = true;
    for (const tk of toks) {
      const first = key(String(tk).split(/\s+/)[0] || '');
      let hit = -1;
      for (let i = cursor; i < W.length; i++) { const w = key(W[i].w); if (w && first && (w.startsWith(first.slice(0, 4)) || first.startsWith(w.slice(0, 4)))) { hit = i; break; } }
      if (hit < 0) { ok = false; break; }
      out.push(cl(W[hit].t / span)); cursor = hit + 1;
    }
    if (ok) return out;
  }
  return beatsByChars(line, toks);
}
export function beatsByChars(line, toks) {
  const L = line.toLowerCase().replace(/[^\p{L}\p{N}\s$]/gu, '');
  const total = L.replace(/\s/g, '').length || 1;
  return toks.map(tk => {
    const key = tk.toLowerCase().replace(/[^\p{L}\p{N}\s$]/gu, '').split(/\s+/).filter(Boolean)[0] || '';
    const i = key ? L.indexOf(key) : -1;
    const before = i < 0 ? 0 : L.slice(0, i).replace(/\s/g, '').length;
    return cl(before / total);
  });
}

/* ── element motion primitives ───────────────────────────────────────────── */
/* arrive: a token/card flies in along [dx, dy, rot] with an overshoot and a
   blur that is always present. Fade alone is forbidden in every genre. */
export function arrive(el, t, t0, d, from = [0, 60, 0], rot = 0, c = 1.05) {
  const p = pr(t, t0, d);
  if (p <= 0) { hide(el); return 0; }
  const e = back(p, c);
  el.style.visibility = 'visible';
  el.style.opacity = cl(p * 2.6).toFixed(3);
  el.style.filter = `blur(${((1 - p) * 9).toFixed(2)}px)`;
  el.style.transform = `translate3d(${lp(from[0], 0, e).toFixed(1)}px,${lp(from[1], 0, e).toFixed(1)}px,0) ` +
                       `rotate(${(rot + lp(from[2], 0, e)).toFixed(2)}deg)`;
  return p;
}
/* breathe: arrive + a sine bob whose phase starts at landing, one expression
   so there is no hand-over jump between "flying" and "breathing". */
export function breathe(el, t, t0, d, from, rot, amp = 10, w = 1.1, ph = 0) {
  const p = pr(t, t0, d);
  if (p <= 0) { hide(el); return 0; }
  const u = back(p), dt = t - (t0 + d);
  el.style.visibility = 'visible';
  el.style.opacity = cl(p * 2.6).toFixed(3);
  el.style.filter = `blur(${((1 - p) * 9).toFixed(2)}px)`;
  const bob = Math.sin(dt * w + ph) * amp * p, dr = Math.sin(dt * w * 0.72 + ph) * 0.85 * p;
  el.style.transform = `translate3d(${lp(from[0], 0, u).toFixed(1)}px,${(lp(from[1], 0, u) + bob).toFixed(1)}px,0) ` +
                       `rotate(${(rot + lp(from[2], 0, u) + dr).toFixed(2)}deg)`;
  return p;
}
export function hide(el) { el.style.opacity = '0'; el.style.visibility = 'hidden'; }
export function fadeScale(el, t, t0, d, s0 = 0.72, ease = eo) {
  const p = pr(t, t0, d);
  if (p <= 0) { hide(el); return 0; }
  el.style.visibility = 'visible';
  el.style.opacity = cl(p * 2.2).toFixed(3);
  el.style.transform = `scale(${lp(s0, 1, ease(p)).toFixed(3)})`;
  return p;
}

/* word-by-word reveal: wraps words in .w spans once, then animates them */
export function splitWords(el) {
  if (el.dataset.split) return [...el.querySelectorAll('.w')];
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map(w => `<span class="w">${w}</span>`).join(' ');
  el.dataset.split = '1';
  return [...el.querySelectorAll('.w')];
}
export function words(spans, t, t0, step = 0.075, d = 0.40, dy = 34) {
  spans.forEach((w, i) => {
    const p = pr(t, t0 + i * step, d), e = eo(p);
    w.style.opacity = p.toFixed(3);
    w.style.filter = `blur(${((1 - p) * 7).toFixed(2)}px)`;
    w.style.transform = `translate3d(0,${((1 - e) * dy).toFixed(1)}px,0)`;
  });
}

/* ── DOM helpers ─────────────────────────────────────────────────────────── */
export function el(cls, css = '', html = '', parent = null) {
  const e = document.createElement('div');
  e.className = cls;
  if (css) e.style.cssText = css;
  if (html) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
export function css(text) {
  const s = document.createElement('style'); s.textContent = text; document.head.appendChild(s);
}

/* ── readiness gate ──────────────────────────────────────────────────────
   Awaits each font by name (document.fonts.ready resolves even when nothing
   was requested) and each image decode, then runs fit() once, then READY. */
export function ready(fonts, fit) {
  window.READY = false;
  return Promise.all([
    ...fonts.map(f => document.fonts.load(f).catch(() => {})),
    ...[...document.images].map(im => (im.decode ? im.decode() : Promise.resolve()).catch(() => {})),
  ]).then(() => document.fonts.ready).then(() => { if (fit) fit(); window.READY = true; });
}

/* Type-size gate on offsetWidth (NOT getBoundingClientRect: that is the width
   after the camera transform). Shrinks by 3px until the line fits maxW. */
export function fitWidth(nodes, maxW = 860, min = 40) {
  for (const n of nodes) {
    let s = parseFloat(n.dataset.max || n.style.fontSize);
    n.dataset.max = s; n.style.fontSize = s + 'px';
    while (s > min && n.offsetWidth > maxW) { s -= 3; n.style.fontSize = s + 'px'; }
  }
}

/* ── expose to render.js / qa ────────────────────────────────────────────── */
export function expose({ seek, DUR, FPS = 30, cues = [], A = [] }) {
  window.seek = seek;
  window.REEL = { DUR, FPS, FRAMES: Math.round(DUR * FPS) };
  window.CUES = cues.slice().sort((x, y) => x.t - y.t);
  window.ACTS_A = A;
  if (location.search.includes('play')) {
    const t0 = performance.now();
    (function loop() { seek(((performance.now() - t0) / 1000) % DUR); requestAnimationFrame(loop); })();
  } else if (location.search.includes('t=')) {
    seek(parseFloat(new URLSearchParams(location.search).get('t')));
  } else seek(0);
}
