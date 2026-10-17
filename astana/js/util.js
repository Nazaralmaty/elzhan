// Small shared helpers: seeded random, value noise, canvas plumbing.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// Hash-based 2D value noise. With `period` the lattice wraps, so textures tile.
export function makeNoise(seed = 1, period = 0) {
  const r = mulberry32(seed);
  const N = 512;
  const table = new Float32Array(N * N);
  for (let i = 0; i < table.length; i++) table[i] = r();
  const P = period || N;
  const at = (x, y) => {
    x = ((x % P) + P) % P; y = ((y % P) + P) % P;
    return table[(y % N) * N + (x % N)];
  };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  noise.fbm = (x, y, oct = 4, lac = 2, gain = 0.5) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * noise(x * f, y * f);
      norm += amp; amp *= gain; f *= lac;
    }
    return s / norm;
  };
  noise.period = P;
  return noise;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function ctx2d(c) {
  return c.getContext('2d', { willReadFrequently: false });
}

// Turn a grayscale height canvas into a tangent-space normal map canvas.
export function heightToNormal(src, strength = 2, wrap = true) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1); }
    return sd[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export function tex(canvas, { srgb = true, repeat = null, nearest = false, aniso = 8, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  if (nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = mips ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
  }
  t.generateMipmaps = mips;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

export function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r * 255, c.g * 255, c.b * 255];
}

export function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.r = clamp(c.r * k, 0, 1); c.g = clamp(c.g * k, 0, 1); c.b = clamp(c.b * k, 0, 1);
  return '#' + c.getHexString();
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Minimal event hub shared across modules.
export class Hub {
  constructor() { this.m = new Map(); }
  on(n, f) { if (!this.m.has(n)) this.m.set(n, new Set()); this.m.get(n).add(f); return () => this.m.get(n).delete(f); }
  emit(n, ...a) { const s = this.m.get(n); if (s) for (const f of s) f(...a); }
}

// Build a BufferGeometry from a list of { geo, matrix } entries, merging attributes.
export function bakeGeometry(parts) {
  const geos = parts.map(({ geo, matrix }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  return mergeSimple(geos);
}

function mergeSimple(geos) {
  const keys = ['position', 'normal', 'uv', 'color'].filter((k) => geos.every((g) => g.attributes[k]));
  const out = new THREE.BufferGeometry();
  for (const k of keys) {
    const size = geos[0].attributes[k].itemSize;
    let total = 0;
    for (const g of geos) total += g.attributes[k].count * size;
    const arr = new Float32Array(total);
    let off = 0;
    for (const g of geos) { arr.set(g.attributes[k].array, off); off += g.attributes[k].count * size; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export function setVertexColor(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

export function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
