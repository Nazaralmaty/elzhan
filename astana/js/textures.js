// Procedural textures painted on canvases: granite paving, the radial plaza around
// Bayterek, grass, water normals, foliage, bark, the Kazakh flag, Bayterek's sphere panels.
import * as THREE from 'three';
import { makeCanvas, makeNoise, heightToNormal, tex, mulberry32, clamp } from './util.js';

const cache = {};

function speckle(ctx, w, h, rand, count, palette, size = [0.6, 1.6]) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = palette[(rand() * palette.length) | 0];
    const s = size[0] + rand() * (size[1] - size[0]);
    ctx.globalAlpha = 0.25 + rand() * 0.6;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

// Fine granite speckle used as a world-space detail layer on all paving.
export function graniteDetail() {
  if (cache.detail) return cache.detail;
  const S = 512;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const n = makeNoise(11, 64);
  const img = x.createImageData(S, S), d = img.data;
  const r = mulberry32(5);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = n.fbm(i / 8, j / 8, 3);
    let g = 200 + (v - 0.5) * 50;
    const k = r();
    if (k < 0.06) g -= 70 + r() * 50; else if (k < 0.1) g += 30;
    const o = (j * S + i) * 4;
    d[o] = clamp(g + 4, 0, 255); d[o + 1] = clamp(g, 0, 255); d[o + 2] = clamp(g - 3, 0, 255); d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  cache.detail = tex(c, { srgb: true, repeat: [1, 1] });
  return cache.detail;
}

// Rectangular granite slabs in running bond. Returns {map, normalMap, roughnessMap}.
// One texture tile covers `metres` metres.
export function paving({ seed = 1, metres = 4.8, tileW = 0.6, tileH = 0.3, colors = ['#c9c6bf', '#bdb9b1', '#d4d0c8'], band = null, size = 1024 } = {}) {
  const key = 'pav' + seed + colors.join() + band;
  if (cache[key]) return cache[key];
  const S = size, ppm = S / metres;
  const col = makeCanvas(S, S), cx = col.getContext('2d');
  const hgt = makeCanvas(S, S), hx = hgt.getContext('2d');
  const rgh = makeCanvas(S, S), rx = rgh.getContext('2d');
  const r = mulberry32(seed);
  cx.fillStyle = '#6d6a64'; cx.fillRect(0, 0, S, S);
  hx.fillStyle = '#202020'; hx.fillRect(0, 0, S, S);
  rx.fillStyle = '#f0f0f0'; rx.fillRect(0, 0, S, S);
  const rows = Math.round(metres / tileH);
  const cols = Math.round(metres / tileW);
  const tw = S / cols, th = S / rows;
  const joint = Math.max(1.5, ppm * 0.006);
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * tw * 0.5;
    for (let i = -1; i < cols + 1; i++) {
      const x0 = i * tw + off, y0 = j * th;
      let base = colors[(r() * colors.length) | 0];
      if (band && band.rows.includes(j % band.every)) base = band.color;
      const c = new THREE.Color(base);
      const k = 0.93 + r() * 0.12;
      cx.fillStyle = `rgb(${c.r * 255 * k | 0},${c.g * 255 * k | 0},${c.b * 255 * k | 0})`;
      cx.fillRect(x0 + joint / 2, y0 + joint / 2, tw - joint, th - joint);
      const hv = 170 + r() * 50;
      hx.fillStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`;
      hx.fillRect(x0 + joint / 2, y0 + joint / 2, tw - joint, th - joint);
      const rv = 140 + r() * 60;
      rx.fillStyle = `rgb(${rv | 0},${rv | 0},${rv | 0})`;
      rx.fillRect(x0 + joint / 2, y0 + joint / 2, tw - joint, th - joint);
    }
  }
  speckle(cx, S, S, r, S * S * 0.05, ['#2b2a28', '#efece6', '#9a8f86', '#5a5651', '#c8b8a8']);
  // weathering
  const n = makeNoise(seed + 7, 8);
  const img = cx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    const v = 0.9 + 0.16 * n.fbm(xx / S * 8, y / S * 8, 4);
    const o = (y * S + xx) * 4;
    d[o] *= v; d[o + 1] *= v; d[o + 2] *= v;
  }
  cx.putImageData(img, 0, 0);
  const out = {
    map: tex(col, { repeat: [1, 1] }),
    normalMap: tex(heightToNormal(hgt, 3), { srgb: false, repeat: [1, 1] }),
    roughnessMap: tex(rgh, { srgb: false, repeat: [1, 1] }),
    metres,
  };
  cache[key] = out;
  return out;
}

// The big radial plaza around Bayterek: concentric granite rings, radial joints
// and a band of Kazakh "koshkar-muiz" (ram's horn) ornament.
export function plazaDisc(radius = 44, S = 4096) {
  if (cache.plaza) return cache.plaza;
  const col = makeCanvas(S, S), cx = col.getContext('2d');
  const hgt = makeCanvas(S, S), hx = hgt.getContext('2d');
  const ppm = S / (radius * 2);
  const C = S / 2;
  const r = mulberry32(42);
  cx.fillStyle = '#bcb8b0'; cx.fillRect(0, 0, S, S);
  hx.fillStyle = '#b0b0b0'; hx.fillRect(0, 0, S, S);
  const ringW = 1.2;
  const palette = (i) => {
    if (i % 9 === 4) return ['#7b5a4e', '#835f52'];  // red granite bands
    if (i % 3 === 0) return ['#9d9a94', '#a6a39c'];
    return ['#cdc9c1', '#d6d2ca', '#c4c0b8'];
  };
  const rings = Math.ceil(radius / ringW);
  for (let i = 0; i < rings; i++) {
    const r0 = i * ringW, r1 = r0 + ringW;
    const seg = Math.max(8, Math.round((2 * Math.PI * (r0 + r1) / 2) / 0.9));
    const pal = palette(i);
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const c = new THREE.Color(pal[(r() * pal.length) | 0]);
      const k = 0.94 + r() * 0.1;
      cx.fillStyle = `rgb(${c.r * 255 * k | 0},${c.g * 255 * k | 0},${c.b * 255 * k | 0})`;
      cx.beginPath();
      cx.arc(C, C, r1 * ppm, a0, a1);
      cx.arc(C, C, r0 * ppm, a1, a0, true);
      cx.closePath();
      cx.fill();
    }
  }
  // joints
  cx.strokeStyle = 'rgba(70,66,60,0.85)';
  hx.strokeStyle = '#303030';
  const jw = Math.max(1.4, ppm * 0.008);
  cx.lineWidth = hx.lineWidth = jw;
  for (let i = 1; i <= rings; i++) {
    for (const g of [cx, hx]) { g.beginPath(); g.arc(C, C, i * ringW * ppm, 0, Math.PI * 2); g.stroke(); }
    const r0 = (i - 1) * ringW, r1 = i * ringW;
    const seg = Math.max(8, Math.round((2 * Math.PI * (r0 + r1) / 2) / 0.9));
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      for (const g of [cx, hx]) {
        g.beginPath();
        g.moveTo(C + Math.cos(a) * r0 * ppm, C + Math.sin(a) * r0 * ppm);
        g.lineTo(C + Math.cos(a) * r1 * ppm, C + Math.sin(a) * r1 * ppm);
        g.stroke();
      }
    }
  }
  // ornament bands
  const ornamentBand = (rr, count, scale, color) => {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      cx.save();
      cx.translate(C + Math.cos(a) * rr * ppm, C + Math.sin(a) * rr * ppm);
      cx.rotate(a + Math.PI / 2);
      drawRamHorn(cx, scale * ppm, color);
      cx.restore();
    }
  };
  ornamentBand(30.6, 96, 0.85, '#6a4a3e');
  ornamentBand(41.4, 128, 0.85, '#6a4a3e');
  // eight-point star rosettes on the compass directions
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    cx.save();
    cx.translate(C + Math.cos(a) * 36 * ppm, C + Math.sin(a) * 36 * ppm);
    drawRosette(cx, 2.4 * ppm);
    cx.restore();
  }
  speckle(cx, S, S, r, S * S * 0.03, ['#2b2a28', '#f2efe9', '#8f857c', '#5a5651']);
  const out = {
    map: tex(col, { aniso: 16 }),
    normalMap: tex(heightToNormal(hgt, 2.5, false), { srgb: false, aniso: 16 }),
    radius,
  };
  cache.plaza = out;
  return out;
}

// Stylised koshkar-muiz: a pair of spiralling ram horns, symmetrical.
export function drawRamHorn(g, s, color) {
  g.save();
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = s * 0.12;
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(0, s * 0.35);
    g.bezierCurveTo(side * s * 0.05, -s * 0.1, side * s * 0.55, -s * 0.45, side * s * 0.6, -s * 0.05);
    g.bezierCurveTo(side * s * 0.62, s * 0.2, side * s * 0.3, s * 0.22, side * s * 0.32, s * 0.02);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(-s * 0.12, s * 0.35); g.lineTo(0, s * 0.55); g.lineTo(s * 0.12, s * 0.35); g.closePath(); g.fill();
  g.restore();
}

function drawRosette(g, s) {
  g.save();
  g.fillStyle = '#7b5a4e';
  for (let i = 0; i < 8; i++) {
    g.rotate(Math.PI / 4);
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(s * 0.18, s * 0.35); g.lineTo(0, s); g.lineTo(-s * 0.18, s * 0.35); g.closePath();
    g.fill();
  }
  g.fillStyle = '#c9a54a';
  g.beginPath(); g.arc(0, 0, s * 0.28, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#7b5a4e'; g.lineWidth = s * 0.05;
  g.beginPath(); g.arc(0, 0, s * 1.08, 0, Math.PI * 2); g.stroke();
  g.restore();
}

export function grass(seed = 3) {
  const key = 'grass' + seed;
  if (cache[key]) return cache[key];
  const S = 512;
  const col = makeCanvas(S, S), cx = col.getContext('2d');
  const hgt = makeCanvas(S, S), hx = hgt.getContext('2d');
  const r = mulberry32(seed);
  const n = makeNoise(seed, 8);
  const img = cx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = n.fbm(x / S * 8, y / S * 8, 4);
    const o = (y * S + x) * 4;
    d[o] = 58 + v * 30; d[o + 1] = 98 + v * 40; d[o + 2] = 32 + v * 14; d[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  hx.fillStyle = '#606060'; hx.fillRect(0, 0, S, S);
  const greens = ['#4f8a2c', '#5d9933', '#6aa83d', '#3f7524', '#7bb54a', '#86a83a', '#4a7f30'];
  for (let i = 0; i < 26000; i++) {
    const x = r() * S, y = r() * S, len = 3 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    cx.strokeStyle = greens[(r() * greens.length) | 0];
    cx.globalAlpha = 0.55 + r() * 0.45;
    cx.lineWidth = 0.8 + r() * 0.9;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox < -12 || x + ox > S + 12 || y + oy < -12 || y + oy > S + 12) continue;
      cx.beginPath(); cx.moveTo(x + ox, y + oy); cx.lineTo(x2 + ox, y2 + oy); cx.stroke();
      const hv = 120 + r() * 120;
      hx.strokeStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`; hx.lineWidth = cx.lineWidth;
      hx.beginPath(); hx.moveTo(x + ox, y + oy); hx.lineTo(x2 + ox, y2 + oy); hx.stroke();
    }
  }
  cx.globalAlpha = 1;
  // clover / tiny flowers
  for (let i = 0; i < 160; i++) {
    cx.fillStyle = r() < 0.5 ? '#f3f0e2' : '#e8d84f';
    cx.beginPath(); cx.arc(r() * S, r() * S, 1 + r() * 1.2, 0, Math.PI * 2); cx.fill();
  }
  const out = {
    map: tex(col, { repeat: [1, 1] }),
    normalMap: tex(heightToNormal(hgt, 1.6), { srgb: false, repeat: [1, 1] }),
  };
  cache[key] = out;
  return out;
}

// Large-scale variation (mowing patches, dry spots) sampled in world space.
export function macroNoise() {
  if (cache.macro) return cache.macro;
  const S = 256;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const n = makeNoise(77, 16);
  const img = x.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = n.fbm(i / S * 16, j / S * 16, 5);
    const o = (j * S + i) * 4;
    d[o] = d[o + 1] = d[o + 2] = v * 255; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  cache.macro = tex(c, { srgb: false, repeat: [1, 1] });
  return cache.macro;
}

export function waterNormal() {
  if (cache.water) return cache.water;
  const S = 512;
  const h = makeCanvas(S, S), hx = h.getContext('2d');
  const n = makeNoise(9, 16), n2 = makeNoise(19, 32);
  const img = hx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = 0.6 * n.fbm(x / S * 16, y / S * 16, 4) + 0.4 * n2.fbm(x / S * 32, y / S * 32, 3);
    const o = (y * S + x) * 4;
    d[o] = d[o + 1] = d[o + 2] = v * 255; d[o + 3] = 255;
  }
  hx.putImageData(img, 0, 0);
  cache.water = tex(heightToNormal(h, 5), { srgb: false, repeat: [1, 1] });
  return cache.water;
}

// Cluster of leaves with alpha: used on crossed cards inside tree crowns.
export function leafCard(palette = ['#3d6b25', '#4f7f2c', '#5f9434', '#2f5a1d', '#6ea23f', '#88b04b'], seed = 4) {
  const key = 'leaf' + palette.join() + seed;
  if (cache[key]) return cache[key];
  const S = 256;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const r = mulberry32(seed);
  // twigs
  x.strokeStyle = '#4a3a28'; x.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    x.beginPath(); x.moveTo(S / 2, S / 2);
    x.lineTo(S / 2 + (r() - 0.5) * S * 0.8, S / 2 + (r() - 0.5) * S * 0.8); x.stroke();
  }
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * S * 0.44;
    const px = S / 2 + Math.cos(a) * rad, py = S / 2 + Math.sin(a) * rad;
    const len = 9 + r() * 10;
    x.save();
    x.translate(px, py);
    x.rotate(r() * Math.PI * 2);
    const g = x.createLinearGradient(-len, 0, len, 0);
    const base = palette[(r() * palette.length) | 0];
    g.addColorStop(0, base); g.addColorStop(1, '#1f3a12');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(0, 0, len, len * 0.48, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(20,40,10,0.35)'; x.lineWidth = 0.8;
    x.beginPath(); x.moveTo(-len, 0); x.lineTo(len, 0); x.stroke();
    x.restore();
  }
  const t = tex(c, { repeat: null });
  cache[key] = t;
  return t;
}

export function needleCard(seed = 8) {
  if (cache.needle) return cache.needle;
  const S = 256;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const r = mulberry32(seed);
  x.lineCap = 'round';
  for (let b = 0; b < 7; b++) {
    const bx = S * 0.5 + (r() - 0.5) * 40, by = 10 + b * 34;
    x.strokeStyle = '#3b2f22'; x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(S * 0.5, by); x.lineTo(bx, by + 60); x.stroke();
    for (let i = 0; i < 160; i++) {
      const t = r();
      const px = S * 0.5 + (bx - S * 0.5) * t + (r() - 0.5) * (70 * (1 - t) + 18);
      const py = by + 60 * t + (r() - 0.5) * 18;
      x.strokeStyle = ['#2c4a3a', '#3a5f49', '#4b7058', '#5b7f6a', '#6d8e7e'][(r() * 5) | 0];
      x.lineWidth = 1.2;
      const a = r() * Math.PI * 2, l = 5 + r() * 6;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
  }
  cache.needle = tex(c);
  return cache.needle;
}

export function bark() {
  if (cache.bark) return cache.bark;
  const W = 128, H = 256;
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const n = makeNoise(31, 16);
  const img = x.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = n.fbm(i / W * 16, j / H * 4, 4);
    const crack = Math.abs(Math.sin(i / W * Math.PI * 10 + v * 5)) < 0.18 ? 0.55 : 1;
    const o = (j * W + i) * 4;
    d[o] = (82 + v * 50) * crack; d[o + 1] = (70 + v * 40) * crack; d[o + 2] = (58 + v * 30) * crack; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  cache.bark = tex(c, { repeat: [1, 1] });
  return cache.bark;
}

export function hedge() {
  if (cache.hedge) return cache.hedge;
  const S = 512;
  const col = makeCanvas(S, S), cx = col.getContext('2d');
  const hgt = makeCanvas(S, S), hx = hgt.getContext('2d');
  const r = mulberry32(13);
  cx.fillStyle = '#28461a'; cx.fillRect(0, 0, S, S);
  hx.fillStyle = '#202020'; hx.fillRect(0, 0, S, S);
  const greens = ['#3e6b26', '#4a7a2c', '#568a33', '#335c1f', '#62953a', '#2c5019'];
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S, s = 2 + r() * 5;
    cx.fillStyle = greens[(r() * greens.length) | 0];
    const hv = 90 + r() * 165;
    hx.fillStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox < -8 || x + ox > S + 8 || y + oy < -8 || y + oy > S + 8) continue;
      cx.beginPath(); cx.ellipse(x + ox, y + oy, s, s * 0.6, r() * 3, 0, Math.PI * 2); cx.fill();
      hx.beginPath(); hx.ellipse(x + ox, y + oy, s, s * 0.6, 0, 0, Math.PI * 2); hx.fill();
    }
  }
  cache.hedge = {
    map: tex(col, { repeat: [1, 1] }),
    normalMap: tex(heightToNormal(hgt, 4), { srgb: false, repeat: [1, 1] }),
  };
  return cache.hedge;
}

export function flowerbed(scheme = 0) {
  const key = 'flowers' + scheme;
  if (cache[key]) return cache[key];
  const S = 512;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const r = mulberry32(100 + scheme);
  x.fillStyle = '#2f4a1f'; x.fillRect(0, 0, S, S);
  const schemes = [
    ['#d7263d', '#f46036', '#e83f6f'],
    ['#f5c518', '#ffd23f', '#f7a000'],
    ['#7b2cbf', '#9d4edd', '#c77dff'],
    ['#ffffff', '#f2e9e4', '#ffd6e0'],
  ];
  const pal = schemes[scheme % schemes.length];
  for (let i = 0; i < 5200; i++) {
    const px = r() * S, py = r() * S;
    x.fillStyle = r() < 0.2 ? '#3b6b26' : pal[(r() * pal.length) | 0];
    x.beginPath(); x.arc(px, py, 1.6 + r() * 2.6, 0, Math.PI * 2); x.fill();
    if (r() < 0.3) { x.fillStyle = '#ffe680'; x.beginPath(); x.arc(px, py, 0.8, 0, Math.PI * 2); x.fill(); }
  }
  cache[key] = tex(c, { repeat: [1, 1] });
  return cache[key];
}

export function asphalt() {
  if (cache.asphalt) return cache.asphalt;
  const S = 512;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const n = makeNoise(55, 32);
  const r = mulberry32(55);
  const img = x.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = n.fbm(i / S * 32, j / S * 32, 3);
    let g = 58 + v * 22;
    const k = r();
    if (k < 0.08) g += 30; else if (k < 0.14) g -= 18;
    const o = (j * S + i) * 4;
    d[o] = g; d[o + 1] = g; d[o + 2] = g + 3; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  cache.asphalt = tex(c, { repeat: [1, 1] });
  return cache.asphalt;
}

// Flag of Kazakhstan: sky blue field, golden sun with 32 rays, steppe eagle, ornament at the hoist.
export function kazFlag() {
  if (cache.flag) return cache.flag;
  const W = 1024, H = 512;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#00AFCA'; g.fillRect(0, 0, W, H);
  const gold = '#FEC50C';
  // ornament stripe
  g.save();
  g.translate(W * 0.06, 0);
  for (let i = 0; i < 6; i++) {
    g.save();
    g.translate(0, H * (0.09 + i * 0.165));
    drawRamHorn(g, H * 0.12, gold);
    g.scale(1, -1);
    g.translate(0, -H * 0.08);
    drawRamHorn(g, H * 0.12, gold);
    g.restore();
  }
  g.restore();
  g.fillStyle = gold;
  g.fillRect(W * 0.11, 0, W * 0.006, H);
  // sun
  const sx = W * 0.5, sy = H * 0.4, sr = H * 0.13;
  g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    g.save(); g.translate(sx, sy); g.rotate(a);
    g.beginPath();
    g.moveTo(-H * 0.012, sr * 1.18); g.lineTo(0, sr * 1.75); g.lineTo(H * 0.012, sr * 1.18); g.closePath(); g.fill();
    g.restore();
  }
  // eagle: wings spread under the sun
  g.save();
  g.translate(sx, H * 0.7);
  g.beginPath();
  g.moveTo(0, -H * 0.03);
  for (const s of [1, -1]) {
    g.moveTo(0, -H * 0.02);
    g.bezierCurveTo(s * W * 0.06, -H * 0.1, s * W * 0.16, -H * 0.06, s * W * 0.2, -H * 0.12);
    g.bezierCurveTo(s * W * 0.17, -H * 0.02, s * W * 0.12, H * 0.02, s * W * 0.05, H * 0.03);
    g.bezierCurveTo(s * W * 0.03, H * 0.035, s * W * 0.015, H * 0.03, 0, H * 0.04);
  }
  g.fill();
  g.beginPath(); g.ellipse(0, H * 0.02, W * 0.016, H * 0.05, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-W * 0.015, H * 0.06); g.lineTo(0, H * 0.1); g.lineTo(W * 0.015, H * 0.06); g.fill();
  g.restore();
  cache.flag = tex(c, { aniso: 8 });
  return cache.flag;
}

// Bayterek sphere: diamond lattice of mirrored gold glass panels in an equirect map.
// Returns { map, roughnessMap, emissiveMap }.
export function spherePanels() {
  if (cache.sphere) return cache.sphere;
  const W = 2048, H = 1024;
  const M = 36, K = M / 2;
  const col = makeCanvas(W, H), cx = col.getContext('2d');
  const rg = makeCanvas(W, H), rx = rg.getContext('2d');
  const em = makeCanvas(W, H), ex = em.getContext('2d');
  const ci = cx.createImageData(W, H), ri = rx.createImageData(W, H), ei = ex.createImageData(W, H);
  const hash = (a, b) => {
    let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const lat = (0.5 - v) * Math.PI;
    const shrink = Math.max(0.08, Math.cos(lat));
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const a = u * M + v * K, b = u * M - v * K;
      const fa = a - Math.floor(a), fb = b - Math.floor(b);
      const da = Math.min(fa, 1 - fa), db = Math.min(fb, 1 - fb);
      const lw = 0.035 / Math.max(0.35, shrink);
      const frame = Math.min(da, db) < lw;
      const ring = Math.abs(((v * 18) % 1) - 0.5) > 0.485;
      const id = hash(Math.floor(a) + 1000, Math.floor(b) + 1000);
      const o = (y * W + x) * 4;
      if (frame || ring) {
        ci.data[o] = 150; ci.data[o + 1] = 120; ci.data[o + 2] = 70;
        ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = 150;
        ei.data[o] = 30; ei.data[o + 1] = 18; ei.data[o + 2] = 6;
      } else {
        const k = 0.88 + id * 0.2;
        ci.data[o] = Math.min(255, 255 * k); ci.data[o + 1] = Math.min(255, 196 * k); ci.data[o + 2] = Math.min(255, 104 * k * (0.9 + id * 0.15));
        const rv = 18 + id * 36;
        ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = rv;
        const ev = 0.6 + 0.4 * hash(Math.floor(a) + 7, Math.floor(b) + 3);
        ei.data[o] = 255 * ev; ei.data[o + 1] = 170 * ev; ei.data[o + 2] = 70 * ev;
      }
      ci.data[o + 3] = ri.data[o + 3] = ei.data[o + 3] = 255;
    }
  }
  cx.putImageData(ci, 0, 0); rx.putImageData(ri, 0, 0); ex.putImageData(ei, 0, 0);
  cache.sphere = {
    map: tex(col, { aniso: 16 }),
    roughnessMap: tex(rg, { srgb: false, aniso: 16 }),
    emissiveMap: tex(em, { aniso: 16 }),
  };
  return cache.sphere;
}

// Radial glow used for lamp light pools on the ground at night.
export function glowDisc() {
  if (cache.glow) return cache.glow;
  const S = 128;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  cache.glow = tex(c);
  return cache.glow;
}

export function softDot() {
  if (cache.dot) return cache.dot;
  const S = 64;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  cache.dot = tex(c);
  return cache.dot;
}

// Diamond cable net for Khan Shatyr's ETFE skin.
export function cableNet() {
  if (cache.net) return cache.net;
  const S = 512;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#e9e1cf'; x.fillRect(0, 0, S, S);
  const n = makeNoise(3, 4);
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = 0.9 + 0.12 * n.fbm(i / S * 4, j / S * 4, 3);
    const o = (j * S + i) * 4;
    d[o] *= v; d[o + 1] *= v; d[o + 2] *= v;
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = 'rgba(120,110,95,0.9)'; x.lineWidth = 3;
  for (let i = -S; i <= S * 2; i += S / 4) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke();
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i - S, S); x.stroke();
  }
  cache.net = tex(c, { repeat: [1, 1] });
  return cache.net;
}

export function roofGravel() {
  if (cache.roof) return cache.roof;
  const S = 256;
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const r = mulberry32(17);
  x.fillStyle = '#7a7770'; x.fillRect(0, 0, S, S);
  speckle(x, S, S, r, S * S * 0.4, ['#5f5c56', '#8e8a82', '#6c6963', '#9a968e'], [1, 2.5]);
  cache.roof = tex(c, { repeat: [1, 1] });
  return cache.roof;
}
