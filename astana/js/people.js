// Minecraft-style cardboard people: a skin painter that writes the classic 64×64 skin
// layout (or 128×128 for the heroes), box body parts mapped to it, an instanced crowd
// with walking/sitting/photo animations, and a Character class used by the two heroes.
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';

export const PX = 1.8 / 32;   // metres per skin pixel for a 1.8 m person

export const LAYOUT = {
  head: { u: 0, v: 0, w: 8, h: 8, d: 8 },
  hat: { u: 32, v: 0, w: 8, h: 8, d: 8 },
  body: { u: 16, v: 16, w: 8, h: 12, d: 4 },
  jacket: { u: 16, v: 32, w: 8, h: 12, d: 4 },
  armR: { u: 40, v: 16, w: 4, h: 12, d: 4 },
  sleeveR: { u: 40, v: 32, w: 4, h: 12, d: 4 },
  armL: { u: 32, v: 48, w: 4, h: 12, d: 4 },
  sleeveL: { u: 48, v: 48, w: 4, h: 12, d: 4 },
  legR: { u: 0, v: 16, w: 4, h: 12, d: 4 },
  pantsR: { u: 0, v: 32, w: 4, h: 12, d: 4 },
  legL: { u: 16, v: 48, w: 4, h: 12, d: 4 },
  pantsL: { u: 0, v: 48, w: 4, h: 12, d: 4 },
};

function faces(key, slim = false) {
  const b = LAYOUT[key];
  const w = slim && /arm|sleeve/i.test(key) ? 3 : b.w;
  return {
    top: [b.u + b.d, b.v, w, b.d],
    bottom: [b.u + b.d + w, b.v, w, b.d],
    right: [b.u, b.v + b.d, b.d, b.h],
    front: [b.u + b.d, b.v + b.d, w, b.h],
    left: [b.u + b.d + w, b.v + b.d, b.d, b.h],
    back: [b.u + 2 * b.d + w, b.v + b.d, w, b.h],
  };
}

// ---------------------------------------------------------------------------
// Skin painter

const hexCache = new Map();
function rgb(hex) {
  if (hexCache.has(hex)) return hexCache.get(hex);
  const c = new THREE.Color(hex);
  const v = [c.r * 255, c.g * 255, c.b * 255];
  hexCache.set(hex, v);
  return v;
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

class Skin {
  constructor(scale = 1, seed = 1, style = 'pixel') {
    this.s = scale;
    this.N = 64 * scale;
    this.d = new Uint8ClampedArray(this.N * this.N * 4);
    this.r = mulberry32(seed);
    this.style = style;
  }
  // x, y, w, h in base skin pixels (may be fractional when scale > 1)
  fill(x, y, w, h, color, { noise = 0.05, grad = 0, alpha = 255 } = {}) {
    const s = this.s, c = typeof color === 'string' ? rgb(color) : color;
    const x0 = Math.round(x * s), y0 = Math.round(y * s), x1 = Math.round((x + w) * s), y1 = Math.round((y + h) * s);
    for (let j = y0; j < y1; j++) {
      const g = grad ? 1 - grad * ((j - y0) / Math.max(1, y1 - y0 - 1) - 0.5) : 1;
      for (let i = x0; i < x1; i++) {
        const k = g * (1 + (this.r() - 0.5) * 2 * noise);
        const o = (j * this.N + i) * 4;
        this.d[o] = c[0] * k; this.d[o + 1] = c[1] * k; this.d[o + 2] = c[2] * k; this.d[o + 3] = alpha;
      }
    }
  }
  // fill every face of a box region
  part(key, color, opts = {}, slim = false) {
    const f = faces(key, slim);
    for (const name of Object.keys(f)) {
      const k = name === 'top' ? 1.06 : name === 'bottom' ? 0.8 : name === 'back' ? 0.96 : 1;
      this.fill(...f[name], mul(rgb(color), k), opts);
    }
  }
  // rows of a box's side faces (front/back/left/right), from row r0 to r1 (in base px from the top)
  band(key, r0, r1, color, opts = {}, slim = false, which = ['front', 'back', 'left', 'right']) {
    const f = faces(key, slim);
    for (const name of which) {
      const [x, y, w] = f[name];
      this.fill(x, y + r0, w, r1 - r0, color, opts);
    }
  }
  face(key, which, slim = false) { return faces(key, slim)[which]; }
  toCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = this.N;
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(this.d, this.N, this.N), 0, 0);
    return c;
  }
}

// Turn any painted skin into kraft cardboard: brown fibres, marker colours, darker cut edges.
function cardboardify(skin, slim) {
  const N = skin.N, d = skin.d, s = skin.s;
  const kraft = [196, 160, 118];
  const r = mulberry32(7);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = (j * N + i) * 4;
    if (d[o + 3] === 0) continue;
    const c = [d[o], d[o + 1], d[o + 2]];
    const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
    let out = mix(mul(kraft, 0.75 + lum * 0.45), c, 0.55);
    const fibre = 1 + (r() - 0.5) * 0.12 + Math.sin(j * 0.9 / s + i * 0.07) * 0.03;
    out = mul(out, fibre);
    d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2];
  }
  // dark cut edges on every face
  for (const key of Object.keys(LAYOUT)) {
    const f = faces(key, slim);
    for (const name of Object.keys(f)) {
      const [x, y, w, h] = f[name];
      const x0 = Math.round(x * s), y0 = Math.round(y * s), x1 = Math.round((x + w) * s) - 1, y1 = Math.round((y + h) * s) - 1;
      for (let i = x0; i <= x1; i++) for (const j of [y0, y1]) edge(i, j);
      for (let j = y0; j <= y1; j++) for (const i of [x0, x1]) edge(i, j);
    }
  }
  function edge(i, j) {
    const o = (j * N + i) * 4;
    if (d[o + 3] === 0) return;
    d[o] *= 0.62; d[o + 1] *= 0.55; d[o + 2] *= 0.48;
  }
}

// A look describes a person; paintLook writes it into a skin.
export function paintLook(look, { scale = 1, style = 'pixel', seed = 1 } = {}) {
  const S = new Skin(scale, seed, style);
  const slim = !!look.slim;
  const skin = look.skin;
  const hair = look.hair;
  const shoe = look.shoes || '#f0f0f0';

  // --- head ---
  S.part('head', skin, { noise: 0.025 });
  const [fx, fy] = S.face('head', 'front');
  const eyeWhite = '#f4f4f4', iris = look.eyes || '#2a1a10';
  // eyes
  if (scale >= 2) {
    for (const ex of [1.5, 4.5]) {
      const inner = ex < 3 ? 1 : 0; // iris sits toward the nose
      S.fill(fx + ex, fy + 4, 2, 1, eyeWhite, { noise: 0 });
      S.fill(fx + ex + inner, fy + 4, 1, 1, iris, { noise: 0 });
      S.fill(fx + ex + inner + 0.25, fy + 4.25, 0.5, 0.5, '#0b0806', { noise: 0 });
      S.fill(fx + ex + inner, fy + 4, 0.5, 0.5, '#ffffff', { noise: 0 });
      // soft eyebrow, slightly arched (outer half lower)
      const brow = mix(rgb(hair), rgb(skin), 0.35);
      S.fill(fx + ex + (inner ? 0.5 : 0), fy + 3, 1.5, 0.5, brow, { noise: 0 });
      S.fill(fx + ex + (inner ? 0 : 1.5), fy + 3.25, 0.5, 0.5, brow, { noise: 0 });
      if (look.lashes) S.fill(fx + ex, fy + 3.75, 2, 0.25, '#2a1a12', { noise: 0 });
    }
    S.fill(fx + 3.5, fy + 5, 1, 0.5, mul(rgb(skin), 0.88), { noise: 0 }); // nose shadow
    // gentle smile: lip line with raised corners
    const lip = look.lips ? rgb(look.lips) : mul(rgb(skin), 0.72);
    S.fill(fx + 3, fy + 6.25, 2, 0.5, lip, { noise: 0 });
    S.fill(fx + 2.5, fy + 6, 0.5, 0.5, mix(lip, rgb(skin), 0.35), { noise: 0 });
    S.fill(fx + 5, fy + 6, 0.5, 0.5, mix(lip, rgb(skin), 0.35), { noise: 0 });
    if (look.lips) S.fill(fx + 3.25, fy + 6.75, 1.5, 0.25, mix(lip, rgb(skin), 0.45), { noise: 0 });
    if (look.blush) for (const bx of [1, 6]) S.fill(fx + bx, fy + 5, 1, 0.75, mix(rgb(skin), [230, 120, 120], 0.35), { noise: 0 });
  } else {
    S.fill(fx + 1, fy + 4, 1, 1, eyeWhite, { noise: 0 });
    S.fill(fx + 2, fy + 4, 1, 1, iris, { noise: 0 });
    S.fill(fx + 5, fy + 4, 1, 1, iris, { noise: 0 });
    S.fill(fx + 6, fy + 4, 1, 1, eyeWhite, { noise: 0 });
    S.fill(fx + 3, fy + 5, 2, 1, mul(rgb(skin), 0.88), { noise: 0 });
    S.fill(fx + 3, fy + 6, 2, 1, look.lips || mul(rgb(skin), 0.68), { noise: 0 });
  }
  if (look.beard) {
    const bc = mix(rgb(hair), rgb(skin), 0.25);
    S.fill(fx, fy + 5, 1, 3, bc); S.fill(fx + 7, fy + 5, 1, 3, bc);
    S.fill(fx + 1, fy + 7, 6, 1, bc);
    S.fill(fx + 2, fy + 6.5, 1, 0.5, bc); S.fill(fx + 5, fy + 6.5, 1, 0.5, bc);
    const [rx, ry] = S.face('head', 'right'); const [lx, ly] = S.face('head', 'left');
    S.fill(rx + 5, ry + 4, 3, 4, bc); S.fill(lx, ly + 4, 3, 4, bc);
  }
  if (look.glasses) {
    S.fill(fx + 1, fy + 3.75, 6, 0.5, '#1a1a1a', { noise: 0 });
    for (const ex of [1, 4.5]) { S.fill(fx + ex, fy + 3.75, 2.5, 1.5, look.glasses, { noise: 0, alpha: 255 }); }
  }
  paintHair(S, look, hair);
  if (look.earrings && scale >= 2) {
    const [rx, ry] = S.face('head', 'right'); const [lx, ly] = S.face('head', 'left');
    S.fill(rx + 3.5, ry + 5.5, 1, 1, '#f2c14e', { noise: 0 }); S.fill(lx + 3.5, ly + 5.5, 1, 1, '#f2c14e', { noise: 0 });
  }

  // --- legs ---
  const bottom = look.bottom;
  for (const leg of ['legR', 'legL']) {
    S.part(leg, bottom.color, { noise: 0.06, grad: 0.08 });
    if (bottom.style === 'shorts') S.band(leg, 5, 12, skin, { noise: 0.02 });
    if (bottom.style === 'skirt') S.band(leg, 6, 12, look.tights || skin, { noise: 0.02 });
    if (bottom.style === 'jeans') {
      const f = S.face(leg, 'front');
      S.fill(f[0] + 1, f[1] + 1, 0.5, 9, mul(rgb(bottom.color), 1.12), { noise: 0.04 });
    }
    S.band(leg, 10.5, 12, shoe, { noise: 0.03 });
    const b = S.face(leg, 'bottom');
    S.fill(...b, mul(rgb(shoe), 0.7));
    if (look.socks) S.band(leg, 10, 10.5, look.socks, { noise: 0 });
  }
  if (bottom.style === 'skirt' || look.dress) {
    for (const p of ['pantsR', 'pantsL']) S.band(p, 0, bottom.len || 6, look.dress ? look.top.color : bottom.color, { noise: 0.05 });
  }

  // --- body ---
  const top = look.top;
  S.part('body', top.color, { noise: 0.05, grad: 0.06 });
  const [bx, by] = S.face('body', 'front');
  if (top.style === 'tshirt' || top.style === 'dress') S.fill(bx + 3, by, 2, 1, skin, { noise: 0.02 });
  if (top.style === 'shirt') {
    S.fill(bx + 3, by, 2, 1, mul(rgb(top.color), 0.85));
    for (let y = 2; y < 11; y += 2) S.fill(bx + 3.5, by + y, 0.5, 0.5, '#e8e8e8', { noise: 0 });
  }
  if (top.style === 'jacket' || top.style === 'coat' || top.style === 'blazer') {
    const inner = top.inner || '#f2f2f2';
    S.fill(bx + 3, by, 2, top.style === 'coat' ? 4 : 7, inner, { noise: 0.03 });
    if (scale >= 2) {
      // lapels and buttons
      S.fill(bx + 2.5, by, 0.5, 6, mul(rgb(top.color), 0.75), { noise: 0 });
      S.fill(bx + 5, by, 0.5, 6, mul(rgb(top.color), 0.75), { noise: 0 });
      S.fill(bx + 4.75, by + 7.5, 0.5, 0.5, '#1d1d1d', { noise: 0 });
      S.fill(bx + 4.75, by + 9.5, 0.5, 0.5, '#1d1d1d', { noise: 0 });
      if (top.pocket) S.fill(bx + 1, by + 2.5, 1, 0.5, top.pocket, { noise: 0 });
    }
  }
  if (top.style === 'hoodie') {
    S.fill(bx + 2, by + 7, 4, 3, mul(rgb(top.color), 0.88));
    const [kx, ky] = S.face('body', 'back');
    S.fill(kx + 1, ky, 6, 3, mul(rgb(top.color), 0.85));
  }
  if (top.print) S.fill(bx + 2, by + 3, 4, 3, top.print, { noise: 0.1 });
  if (top.belt) S.band('body', 8, 9, top.belt, { noise: 0.02 });
  if (top.style === 'dress' || top.style === 'coat') S.band('body', 11, 12, mul(rgb(top.color), 0.95));

  // --- arms ---
  for (const arm of ['armR', 'armL']) {
    S.part(arm, skin, { noise: 0.025 }, slim);
    const sleeveRows = top.sleeve === 'none' ? 0 : top.sleeve === 'short' ? 4 : 10.5;
    if (sleeveRows) {
      S.band(arm, 0, sleeveRows, top.color, { noise: 0.05, grad: 0.05 }, slim);
      const tp = S.face(arm, 'top', slim);
      S.fill(...tp, mul(rgb(top.color), 1.05));
    }
    if (top.style === 'blazer' && scale >= 2) S.band(arm, 10, 10.5, top.inner || '#ffffff', { noise: 0 }, slim);
    if (look.watch && arm === 'armL') S.band(arm, 9.5, 10.25, look.watch, { noise: 0 }, slim, ['front', 'left', 'back', 'right']);
    if (look.gloves) S.band(arm, 10.5, 12, look.gloves, {}, slim);
  }
  if (look.coatLong) {
    for (const p of ['pantsR', 'pantsL']) S.band(p, 0, 5, top.color, { noise: 0.05 });
  }

  if (style === 'cardboard') cardboardify(S, slim);
  return S;
}

function paintHair(S, look, hair) {
  const style = look.hairStyle || 'short';
  const h = rgb(hair);
  const hl = mul(h, 1.25);
  const f = faces('head');
  if (style === 'bald') { S.fill(...f.top, mix(h, rgb(look.skin), 0.7)); return; }
  if (style === 'cap' || style === 'beanie') {
    const c = look.hat || '#1d3557';
    S.fill(...f.top, c);
    for (const n of ['front', 'back', 'left', 'right']) S.fill(f[n][0], f[n][1], f[n][2], style === 'beanie' ? 3 : 2, c);
    const hf = faces('hat');
    if (style === 'cap') S.fill(hf.front[0], hf.front[1] + 1, 8, 1, mul(rgb(c), 0.85), { alpha: 255 });
    S.fill(f.back[0], f.back[1] + 2, 8, 2, h);
    return;
  }
  if (style === 'scarf') {
    const c = look.hat || '#7a2e3a';
    S.fill(...f.top, c);
    for (const n of ['back', 'left', 'right']) S.fill(f[n][0], f[n][1], f[n][2], 8, c);
    S.fill(f.front[0], f.front[1], 8, 2, c);
    S.fill(f.front[0], f.front[1], 1, 8, c); S.fill(f.front[0] + 7, f.front[1], 1, 8, c);
    return;
  }
  S.fill(...f.top, h, { noise: 0.08 });
  S.fill(f.front[0], f.front[1], 8, style === 'bangs' ? 3 : 1.5, h, { noise: 0.08 });
  if (style === 'short' || style === 'bangs') {
    S.fill(f.back[0], f.back[1], 8, 4, h, { noise: 0.08 });
    S.fill(f.left[0], f.left[1], 8, 2.5, h); S.fill(f.right[0], f.right[1], 8, 2.5, h);
    S.fill(f.left[0] + 6, f.left[1] + 2, 2, 1.5, h); S.fill(f.right[0], f.right[1] + 2, 2, 1.5, h);
  }
  if (style === 'long' || style === 'bun' || style === 'ponytail') {
    S.fill(f.back[0], f.back[1], 8, style === 'long' ? 8 : 5, h, { noise: 0.08 });
    S.fill(f.left[0], f.left[1], 8, style === 'long' ? 8 : 3, h, { noise: 0.08 });
    S.fill(f.right[0], f.right[1], 8, style === 'long' ? 8 : 3, h, { noise: 0.08 });
    // the face stays visible
    S.fill(f.left[0], f.left[1] + 3, 3, 5, look.skin, { noise: 0.02 });
    S.fill(f.right[0] + 5, f.right[1] + 3, 3, 5, look.skin, { noise: 0.02 });
    if (style === 'long') {
      S.fill(f.left[0], f.left[1] + 3, 1, 5, h); S.fill(f.right[0] + 7, f.right[1] + 3, 1, 5, h);
      S.fill(f.left[0] + 3, f.left[1] + 3, 5, 5, h, { noise: 0.08 });
      S.fill(f.right[0], f.right[1] + 3, 5, 5, h, { noise: 0.08 });
      S.fill(f.left[0], f.left[1] + 3, 3, 5, look.skin, { noise: 0.02 });
      S.fill(f.right[0] + 5, f.right[1] + 3, 3, 5, look.skin, { noise: 0.02 });
    }
    // part line / highlights
    S.fill(f.top[0] + 3.5, f.top[1], 0.5, 8, mul(h, 0.7), { noise: 0 });
    if (S.s >= 2) for (let i = 0; i < 6; i++) S.fill(f.back[0] + 1 + i * 1.2, f.back[1] + 1, 0.5, 5, hl, { noise: 0.05 });
  }
  // hat layer: hair volume
  const hf = faces('hat');
  S.fill(...hf.top, h, { noise: 0.1 });
  S.fill(hf.front[0], hf.front[1], 8, 1, h, { noise: 0.1 });
  if (style === 'long') {
    S.fill(hf.back[0], hf.back[1], 8, 8, h, { noise: 0.1 });
    S.fill(hf.left[0], hf.left[1], 6, 8, h, { noise: 0.1 });
    S.fill(hf.right[0] + 2, hf.right[1], 6, 8, h, { noise: 0.1 });
    S.fill(hf.left[0], hf.left[1], 8, 2, h); S.fill(hf.right[0], hf.right[1], 8, 2, h);
  } else if (style === 'bun') {
    S.fill(hf.back[0], hf.back[1], 8, 3, h);
    S.fill(hf.left[0], hf.left[1], 8, 1, h); S.fill(hf.right[0], hf.right[1], 8, 1, h);
  } else {
    S.fill(hf.back[0], hf.back[1], 8, 2, h, { noise: 0.1 });
    S.fill(hf.left[0], hf.left[1], 8, 1, h); S.fill(hf.right[0], hf.right[1], 8, 1, h);
  }
}

// ---------------------------------------------------------------------------
// Random looks for the crowd (Astana street style, adjusted per season)

const SKINS = ['#f2d3b8', '#e9c3a0', '#e0b48e', '#d4a37a', '#c8966c', '#b8835c', '#a8714d', '#f6dcc6'];
const HAIRS = ['#14100d', '#1d1611', '#2b1f17', '#3a2a1d', '#4b3523', '#6b4a2e', '#8a6b4a', '#b9b3aa', '#d8c39a'];
const SUMMER_TOPS = ['#ffffff', '#f4f1ea', '#1d1d1f', '#283a5c', '#4f7ca8', '#c94a4a', '#e8b84a', '#7fb58d', '#d98fae', '#8f6bbf', '#e07b39', '#a7c7e7', '#b8b1a0', '#3d6e5a'];
const BOTTOMS = ['#2c3e5c', '#3b5378', '#1e1e22', '#5a5a5e', '#c9b99a', '#e9e4da', '#6d4f3b', '#3f4a3c'];
const COATS = ['#2a2a2e', '#3b3f4a', '#5b4636', '#7a5a3a', '#1f2f4a', '#6b6b70', '#8a2f3a', '#c7b69a', '#24402f'];

export function randomLook(r, { season = 0, kid = false, female = r() < 0.5, elder = false } = {}) {
  const pick = (a) => a[(r() * a.length) | 0];
  const look = { skin: pick(SKINS), hair: elder ? pick(['#b9b3aa', '#d6d2cc', '#8a8580']) : pick(HAIRS.slice(0, 7)), slim: false };
  look.eyes = pick(['#2a1a10', '#3b2716', '#1a1a1a', '#4a3a26']);
  look.shoes = pick(['#f0f0f0', '#1b1b1b', '#3a2a1e', '#d0d0d0', '#5a5a5a']);
  if (female) {
    look.hairStyle = elder && r() < 0.4 ? 'scarf' : pick(['long', 'long', 'bun', 'ponytail', 'bangs']);
    look.lips = pick(['#b5545a', '#c06a6a', '#a8464e']);
    look.blush = r() < 0.5;
    look.lashes = true;
  } else {
    look.hairStyle = elder && r() < 0.3 ? 'bald' : pick(['short', 'short', 'short', 'cap', 'bangs']);
    look.beard = !kid && r() < 0.18;
    look.hat = pick(['#1d3557', '#2b2b2b', '#c1121f', '#f1faee', '#264653']);
  }
  if (season === 2) {
    look.top = { color: pick(COATS), style: 'coat', sleeve: 'long', inner: pick(['#d9d9d9', '#7a1f2b', '#ffffff']) };
    look.bottom = { color: pick(['#1e1e22', '#2c3e5c', '#3b3b40']), style: 'pants' };
    look.coatLong = r() < 0.6;
    look.gloves = pick(['#1b1b1b', '#5a3b2a', '#7a1f2b']);
    if (r() < 0.6) { look.hairStyle = 'beanie'; look.hat = pick(['#c1121f', '#1d3557', '#e9e4da', '#2b2b2b', '#6b705c']); }
    look.shoes = pick(['#1b1b1b', '#3a2a1e', '#4a4a4a']);
  } else if (season === 1) {
    look.top = { color: pick(['#7a5a3a', '#c7b69a', '#2a2a2e', '#556b2f', '#8a2f3a', '#1f2f4a', '#b5651d']), style: r() < 0.6 ? 'jacket' : 'hoodie', sleeve: 'long', inner: pick(['#ffffff', '#d9d9d9', '#1d1d1f']) };
    look.bottom = { color: pick(BOTTOMS), style: r() < 0.6 ? 'jeans' : 'pants' };
    if (female && r() < 0.3) look.bottom = { color: pick(['#2a2a2e', '#7a5a3a', '#556b2f']), style: 'skirt', len: 7 };
  } else {
    const st = female ? pick(['tshirt', 'tshirt', 'dress', 'shirt', 'blazer']) : pick(['tshirt', 'tshirt', 'shirt', 'shirt', 'hoodie', 'blazer']);
    look.top = { color: pick(SUMMER_TOPS), style: st, sleeve: st === 'tshirt' || st === 'dress' ? (r() < 0.8 ? 'short' : 'none') : 'long', inner: '#ffffff' };
    if (r() < 0.25) look.top.print = pick(['#ffd23f', '#00afca', '#ffffff', '#e63946']);
    if (st === 'dress') { look.dress = true; look.bottom = { color: look.top.color, style: 'skirt', len: 7 }; look.top.belt = r() < 0.4 ? '#3a2a1e' : null; }
    else if (female && r() < 0.35) look.bottom = { color: pick(['#e9e4da', '#1e1e22', '#d98fae', '#2c3e5c', '#c9b99a']), style: 'skirt', len: 6 };
    else look.bottom = { color: pick(BOTTOMS), style: r() < 0.25 ? 'shorts' : r() < 0.6 ? 'jeans' : 'pants' };
    if (kid && r() < 0.5) look.bottom.style = 'shorts';
  }
  return look;
}

// ---------------------------------------------------------------------------
// Geometry: boxes in skin-pixel units with UVs mapped to the skin layout (cell space 0..1).

export function partGeometry(key, size, offset, inflate = 0, slim = false) {
  const [w, h, d] = size;
  const g = new THREE.BoxGeometry(w + inflate * 2, h + inflate * 2, d + inflate * 2);
  g.translate(offset[0], offset[1], offset[2]);
  const f = faces(key, slim);
  const order = ['left', 'right', 'top', 'bottom', 'front', 'back']; // +X,-X,+Y,-Y,+Z,-Z
  const uv = g.attributes.uv;
  for (let fi = 0; fi < 6; fi++) {
    const [rx, ry, rw, rh] = f[order[fi]];
    for (let v = 0; v < 4; v++) {
      const i = fi * 4 + v;
      const u0 = uv.getX(i), v0 = uv.getY(i);
      uv.setXY(i, (rx + u0 * rw) / 64, 1 - (ry + (1 - v0) * rh) / 64);
    }
  }
  return g;
}

// pivot (skin px, relative to feet) and geometry offset relative to the pivot
export const RIG = {
  legR: { key: 'legR', size: [4, 12, 4], pivot: [-2, 12, 0], off: [0, -6, 0] },
  legL: { key: 'legL', size: [4, 12, 4], pivot: [2, 12, 0], off: [0, -6, 0] },
  body: { key: 'body', size: [8, 12, 4], pivot: [0, 12, 0], off: [0, 6, 0] },
  armR: { key: 'armR', size: [4, 12, 4], pivot: [-6, 22, 0], off: [0, -4, 0] },
  armL: { key: 'armL', size: [4, 12, 4], pivot: [6, 22, 0], off: [0, -4, 0] },
  head: { key: 'head', size: [8, 8, 8], pivot: [0, 24, 0], off: [0, 4, 0] },
  hat: { key: 'hat', size: [8, 8, 8], pivot: [0, 24, 0], off: [0, 4, 0], inflate: 0.5, overlay: true },
  pantsR: { key: 'pantsR', size: [4, 12, 4], pivot: [-2, 12, 0], off: [0, -6, 0], inflate: 0.3, overlay: true, follows: 'legR' },
  pantsL: { key: 'pantsL', size: [4, 12, 4], pivot: [2, 12, 0], off: [0, -6, 0], inflate: 0.3, overlay: true, follows: 'legL' },
};

// ---------------------------------------------------------------------------
// Pose: rotations (radians) per part plus body bob/lean.
export function emptyPose() {
  return {
    legR: [0, 0, 0], legL: [0, 0, 0], armR: [0, 0, 0], armL: [0, 0, 0],
    head: [0, 0, 0], body: [0, 0, 0], bob: 0, sit: 0,
  };
}

export function walkPose(p, phase, amp = 1, carry = 0) {
  const s = Math.sin(phase);
  p.legR[0] = s * 0.62 * amp; p.legL[0] = -s * 0.62 * amp;
  p.armR[0] = -s * 0.5 * amp; p.armL[0] = s * 0.5 * amp * (1 - carry);
  p.armR[2] = -0.05; p.armL[2] = 0.05;
  p.bob = Math.abs(Math.cos(phase)) * 0.035 * amp;
  p.body[1] = s * 0.05 * amp;
  p.head[1] = -s * 0.04 * amp;
  return p;
}

export function idlePose(p, t, seed) {
  p.armR[0] = Math.sin(t * 0.9 + seed) * 0.04; p.armL[0] = -Math.sin(t * 0.9 + seed) * 0.04;
  p.armR[2] = -0.06; p.armL[2] = 0.06;
  p.head[1] = Math.sin(t * 0.23 + seed * 3) * 0.55;
  p.head[0] = Math.sin(t * 0.17 + seed) * 0.08;
  p.bob = Math.sin(t * 1.6 + seed) * 0.004;
  return p;
}

// ---------------------------------------------------------------------------
// Crowd: one InstancedMesh per body part, skins in a shared atlas.

function atlasMaterial(map, cols, rows, overlay) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.88, metalness: 0, alphaTest: overlay ? 0.5 : 0, side: overlay ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCell = { value: new THREE.Vector2(1 / cols, 1 / rows) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSkin; uniform vec2 uCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * uCell + aSkin;\n#endif');
  };
  m.customProgramCacheKey = () => 'atlas' + overlay;
  return m;
}

const PARTS = ['legR', 'legL', 'body', 'armR', 'armL', 'head', 'hat', 'pantsR', 'pantsL'];

export class Crowd {
  constructor(ctx, { capacity = 400 } = {}) {
    this.ctx = ctx;
    this.capacity = capacity;
    this.cols = 8; this.rows = 8;
    this.skinCount = this.cols * this.rows;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 64 * this.cols; this.canvas.height = 64 * this.rows;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.anisotropy = 4;
    this.style = 'pixel';
    this.season = 0;
    this.kidSkins = new Set();
    this.paintAtlas();
    this.matBase = atlasMaterial(this.tex, this.cols, this.rows, false);
    this.matOver = atlasMaterial(this.tex, this.cols, this.rows, true);
    this.group = new THREE.Group();
    this.group.name = 'Crowd';
    this.meshes = {};
    this.aSkin = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    for (const name of PARTS) {
      const r = RIG[name];
      const g = partGeometry(r.key, r.size, r.off, r.inflate || 0);
      g.setAttribute('aSkin', this.aSkin);
      const im = new THREE.InstancedMesh(g, r.overlay ? this.matOver : this.matBase, capacity);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = !r.overlay || name === 'hat';
      im.receiveShadow = true;
      im.count = 0;
      im.frustumCulled = false;
      this.meshes[name] = im;
      this.group.add(im);
    }
    ctx.scene.add(this.group);
    this.people = [];
    this.tmp = { m: new THREE.Matrix4(), root: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3(), p: new THREE.Vector3() };
    this.pose = emptyPose();
  }

  paintAtlas() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const r = mulberry32(4242);
    this.kidSkins.clear();
    for (let i = 0; i < this.skinCount; i++) {
      const kid = i % 9 === 4;
      const elder = i % 11 === 7;
      if (kid) this.kidSkins.add(i);
      const look = randomLook(r, { season: this.season, kid, elder, female: i % 2 === 0 });
      const skin = paintLook(look, { scale: 1, style: this.style, seed: 100 + i });
      ctx.drawImage(skin.toCanvas(), (i % this.cols) * 64, Math.floor(i / this.cols) * 64);
    }
    this.tex.needsUpdate = true;
  }

  setStyle(style) { this.style = style; this.paintAtlas(); }
  setSeason(season) { this.season = season; this.paintAtlas(); }

  skinOffset(i) {
    const cx = i % this.cols, cy = Math.floor(i / this.cols);
    return [cx / this.cols, 1 - (cy + 1) / this.rows];
  }

  add(person) {
    if (this.people.length >= this.capacity) return null;
    person.index = this.people.length;
    const [ox, oy] = this.skinOffset(person.skin);
    this.aSkin.setXY(person.index, ox, oy);
    this.aSkin.needsUpdate = true;
    this.people.push(person);
    for (const name of PARTS) this.meshes[name].count = this.people.length;
    return person;
  }

  clear() {
    this.people.length = 0;
    for (const name of PARTS) this.meshes[name].count = 0;
  }

  // Write instance matrices for one person given world position, heading and pose.
  write(i, x, y, z, heading, scale, pose) {
    const { m, root, q, e, v, s } = this.tmp;
    e.set(pose.body[0], heading + pose.body[1], pose.body[2], 'YXZ');
    q.setFromEuler(e);
    v.set(x, y + pose.bob, z);
    const k = PX * scale;
    s.set(k, k, k);
    root.compose(v, q, s);
    for (const name of PARTS) {
      const r = RIG[name];
      const rotName = r.follows || (name === 'hat' ? 'head' : name);
      const rot = rotName === 'body' ? [0, 0, 0] : pose[rotName];
      e.set(rot[0], rot[1], rot[2], 'XYZ');
      q.setFromEuler(e);
      v.set(r.pivot[0], r.pivot[1], r.pivot[2]);
      s.set(1, 1, 1);
      m.compose(v, q, s);
      m.premultiply(root);
      this.meshes[name].setMatrixAt(i, m);
    }
  }

  flush() {
    for (const name of PARTS) this.meshes[name].instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Character: a full-detail person made of individual meshes (used for the heroes).

export class Character {
  constructor({ look, height = 1.8, name = 'hero', style = 'pixel' }) {
    this.look = look;
    this.height = height;
    this.name = name;
    this.style = style;
    this.group = new THREE.Group();
    this.group.name = name;
    this.rig = new THREE.Group();
    this.rig.scale.setScalar((height / 1.8) * PX);
    this.group.add(this.rig);
    this.canvas = null;
    this.tex = new THREE.CanvasTexture(document.createElement('canvas'));
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.anisotropy = 8;
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.82 });
    this.matOver = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide });
    this.repaint();
    this.pivots = {};
    const slim = !!look.slim;
    for (const name of ['legR', 'legL', 'body', 'armR', 'armL', 'head']) {
      const r = RIG[name];
      const piv = new THREE.Group();
      let pv = r.pivot.slice();
      let size = r.size.slice();
      if (slim && name.startsWith('arm')) { size = [3, 12, 4]; pv = [name === 'armR' ? -5.5 : 5.5, 22, 0]; }
      piv.position.set(...pv);
      const mesh = new THREE.Mesh(partGeometry(r.key, size, r.off, 0, slim), this.mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      piv.add(mesh);
      this.rig.add(piv);
      this.pivots[name] = piv;
    }
    const hat = new THREE.Mesh(partGeometry('hat', [8, 8, 8], [0, 4, 0], 0.5), this.matOver);
    hat.castShadow = true;
    this.pivots.head.add(hat);
    for (const [name, leg] of [['pantsR', 'legR'], ['pantsL', 'legL']]) {
      const m = new THREE.Mesh(partGeometry(name, [4, 12, 4], [0, -6, 0], 0.35), this.matOver);
      m.castShadow = true;
      this.pivots[leg].add(m);
    }
    // long hair panel hanging behind the head and down the back
    if (look.hairStyle === 'long') {
      const hairMat = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.6 });
      const hp = new THREE.Mesh(new THREE.BoxGeometry(8.4, 9, 1.0).translate(0, 1.2, -4.3), hairMat);
      hp.castShadow = true;
      this.pivots.head.add(hp);
      this.hairPanel = hp;
    }
    this.props = {};
    this.pose = emptyPose();
  }

  repaint(style = this.style) {
    this.style = style;
    const skin = paintLook(this.look, { scale: 2, style, seed: this.name.length * 13 });
    this.tex.image = skin.toCanvas();
    this.tex.needsUpdate = true;
  }

  // Attach a box prop to a pivot (skin px coordinates relative to the pivot).
  addProp(name, pivot, size, pos, color, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.5, metalness: opts.metalness ?? 0, emissive: opts.emissive || '#000', emissiveIntensity: opts.emissive ? 1 : 0 }));
    m.position.set(...pos);
    if (opts.rot) m.rotation.set(...opts.rot);
    m.castShadow = true;
    this.pivots[pivot].add(m);
    this.props[name] = m;
    return m;
  }

  apply(pose = this.pose) {
    const P = this.pivots;
    P.legR.rotation.set(...pose.legR); P.legL.rotation.set(...pose.legL);
    P.armR.rotation.set(...pose.armR); P.armL.rotation.set(...pose.armL);
    P.head.rotation.set(pose.head[0], pose.head[1], pose.head[2], 'YXZ');
    this.rig.rotation.set(pose.body[0], pose.body[1], pose.body[2], 'YXZ');
    this.rig.position.y = pose.bob;
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

export function lerpPose(a, b, t, out = emptyPose()) {
  for (const k of ['legR', 'legL', 'armR', 'armL', 'head', 'body']) {
    for (let i = 0; i < 3; i++) out[k][i] = a[k][i] + (b[k][i] - a[k][i]) * t;
  }
  out.bob = a.bob + (b.bob - a.bob) * t;
  out.sit = a.sit + (b.sit - a.sit) * t;
  return out;
}

export function copyPose(src, dst = emptyPose()) { return lerpPose(src, src, 0, dst); }

export { clamp };
