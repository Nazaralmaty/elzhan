// Seeded 2D value noise with fbm, shared by map generation and procedural textures.
import { makeRng } from '../core/rng.js';

export function makeNoise(seed, size = 256) {
  const rng = makeRng(seed);
  const perm = new Uint16Array(size * 2), val = new Float32Array(size);
  for (let i = 0; i < size; i++) { perm[i] = i; val[i] = rng.next(); }
  for (let i = size - 1; i > 0; i--) { const j = rng.int(i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < size; i++) perm[size + i] = perm[i];
  const m = size - 1;
  const at = (x, y) => val[perm[(perm[x & m] + y) & m]];
  const fade = t => t * t * (3 - 2 * t);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = fade(x - xi), fy = fade(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, oct = 4) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += noise(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  }
  return { noise, fbm };
}
