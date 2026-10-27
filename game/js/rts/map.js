// Map generation for "Казаки": hills, lakes, forests, stone outcrops and gold/iron/coal deposits,
// fair starting spots with resources nearby. Grid cells: 0 grass, 1 water, 2 tree, 3 rock, 4 deposit.
import { makeRng } from '../core/rng.js';
import { makeNoise } from './noise.js';
import { TREE_WOOD, ROCK_STONE } from './data.js';

export const GRASS = 0, WATER = 1, TREE = 2, ROCK = 3, DEPOSIT = 4;
export const MAP_SIZES = { small: 112, medium: 144, large: 184 };

export function createMap({ size = 'medium', players = 2, seed = 1 } = {}) {
  const N = MAP_SIZES[size] || size, W = N, H = N;
  const rng = makeRng(seed), n = makeNoise(seed * 31 + 7, 256), n2 = makeNoise(seed * 17 + 3, 256);
  const kind = new Uint8Array(W * H), amount = new Float32Array(W * H);
  const height = new Float32Array((W + 1) * (H + 1));
  const idx = (x, z) => z * W + x;
  const inside = (x, z) => x >= 0 && z >= 0 && x < W && z < H;

  // starting spots: around a circle so every player has the same room
  const starts = [];
  const r0 = N * 0.36, a0 = rng.next() * Math.PI * 2;
  for (let p = 0; p < players; p++) {
    const a = a0 + p / players * Math.PI * 2 + (players === 2 ? 0 : 0);
    starts.push({ x: Math.round(N / 2 + Math.cos(a) * r0), z: Math.round(N / 2 + Math.sin(a) * r0) });
  }
  const nearStart = (x, z, r) => starts.some(s => Math.hypot(s.x - x, s.z - z) < r);

  // heights: rolling hills, flattened around the starts
  for (let z = 0; z <= H; z++) for (let x = 0; x <= W; x++) {
    let h = (n.fbm(x * 0.03, z * 0.03, 4) - 0.45) * 9 + (n2.fbm(x * 0.09, z * 0.09, 2) - 0.5) * 1.2;
    const d = Math.min(...starts.map(s => Math.hypot(s.x - x, s.z - z)));
    if (d < 16) h *= Math.max(0.15, d / 16);
    height[z * (W + 1) + x] = h;
  }
  const cellH = (x, z) => (height[z * (W + 1) + x] + height[z * (W + 1) + x + 1] + height[(z + 1) * (W + 1) + x] + height[(z + 1) * (W + 1) + x + 1]) / 4;

  // lakes in the lowest places, away from the starts
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (nearStart(x, z, 18)) continue;
    if (cellH(x, z) < -2.6) kind[idx(x, z)] = WATER;
  }
  // forests
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = idx(x, z);
    if (kind[i] || nearStart(x, z, 9)) continue;
    const f = n2.fbm(x * 0.05 + 40, z * 0.05 - 17, 4);
    if (f > 0.56 && rng.next() < 0.55 + (f - 0.56) * 3) { kind[i] = TREE; amount[i] = TREE_WOOD; }
    else if (rng.next() < 0.004) { kind[i] = TREE; amount[i] = TREE_WOOD; }
  }
  const deposits = [];
  const free = (x, z, w, h, pad = 0) => {
    for (let j = z - pad; j < z + h + pad; j++) for (let i = x - pad; i < x + w + pad; i++) if (!inside(i, j) || kind[idx(i, j)] === WATER || kind[idx(i, j)] === DEPOSIT || kind[idx(i, j)] === ROCK) return false;
    return true;
  };
  const clearArea = (x, z, w, h) => { for (let j = z; j < z + h; j++) for (let i = x; i < x + w; i++) if (inside(i, j)) { kind[idx(i, j)] = GRASS; amount[idx(i, j)] = 0; } };
  // place something within a ring around (cx, cz)
  function ringSpot(cx, cz, rMin, rMax, w, h, pad, tries = 200) {
    for (let t = 0; t < tries; t++) {
      const a = rng.next() * Math.PI * 2, r = rMin + rng.next() * (rMax - rMin);
      const x = Math.round(cx + Math.cos(a) * r - w / 2), z = Math.round(cz + Math.sin(a) * r - h / 2);
      if (x < 2 || z < 2 || x + w > W - 2 || z + h > H - 2) continue;
      if (starts.some(s => Math.hypot(s.x - (x + w / 2), s.z - (z + h / 2)) < Math.min(rMin, 10))) continue;
      if (free(x, z, w, h, pad)) return { x, z };
    }
    return null;
  }
  function addDeposit(kindName, cx, cz, rMin, rMax) {
    const s = ringSpot(cx, cz, rMin, rMax, 3, 3, 2);
    if (!s) return;
    clearArea(s.x - 2, s.z - 2, 7, 7);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) kind[idx(s.x + i, s.z + j)] = DEPOSIT;
    deposits.push({ id: deposits.length + 1, kind: kindName, x: s.x, z: s.z, mine: 0 });
  }
  function addRocks(cx, cz, rMin, rMax, count) {
    const s = ringSpot(cx, cz, rMin, rMax, 3, 3, 1);
    if (!s) return;
    let x = s.x + 1, z = s.z + 1;
    for (let k = 0; k < count; k++) {
      if (inside(x, z) && !nearStart(x, z, 8) && kind[idx(x, z)] !== DEPOSIT && kind[idx(x, z)] !== WATER) { kind[idx(x, z)] = ROCK; amount[idx(x, z)] = ROCK_STONE; }
      x += rng.int(3) - 1; z += rng.int(3) - 1;
    }
  }
  function addForest(cx, cz, rMin, rMax, count) {
    const s = ringSpot(cx, cz, rMin, rMax, 2, 2, 0);
    if (!s) return;
    for (let k = 0; k < count; k++) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * Math.sqrt(count) * 0.75;
      const x = Math.round(s.x + Math.cos(a) * r), z = Math.round(s.z + Math.sin(a) * r);
      if (inside(x, z) && !nearStart(x, z, 9) && kind[idx(x, z)] === GRASS) { kind[idx(x, z)] = TREE; amount[idx(x, z)] = TREE_WOOD; }
    }
  }
  for (const s of starts) {
    clearArea(s.x - 9, s.z - 9, 18, 18);
    addForest(s.x, s.z, 12, 16, 70);
    addForest(s.x, s.z, 14, 20, 50);
    addRocks(s.x, s.z, 11, 15, 14);
    addRocks(s.x, s.z, 15, 22, 12);
    addDeposit('stone', s.x, s.z, 16, 24);
    addDeposit('gold', s.x, s.z, 13, 18);
    addDeposit('iron', s.x, s.z, 14, 20);
    addDeposit('coal', s.x, s.z, 14, 20);
    addDeposit('coal', s.x, s.z, 18, 26);
  }
  // contested middle
  for (let k = 0; k < 3 + players; k++) addDeposit(['gold', 'iron', 'coal', 'stone'][k % 4], N / 2, N / 2, 0, N * 0.22);
  for (let k = 0; k < players + 1; k++) addRocks(N / 2, N / 2, 4, N * 0.3, 10);

  // everything reachable from the first start: carve corridors where lakes or forests cut the map
  const passable = i => kind[i] === GRASS;
  for (let tries = 0; tries < 6; tries++) {
    const seen = flood(starts[0]);
    const cut = starts.find(s => !seen[idx(s.x, s.z)]) || deposits.map(d => ({ x: d.x - 1, z: d.z + 1 })).find(d => inside(d.x, d.z) && !seen[idx(d.x, d.z)]);
    if (!cut) break;
    const a = starts[0];
    const steps = Math.ceil(Math.hypot(cut.x - a.x, cut.z - a.z));
    for (let k = 0; k <= steps; k++) {
      const x = Math.round(a.x + (cut.x - a.x) * k / steps), z = Math.round(a.z + (cut.z - a.z) * k / steps);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inside(x + i, z + j) && kind[idx(x + i, z + j)] !== DEPOSIT) { kind[idx(x + i, z + j)] = GRASS; amount[idx(x + i, z + j)] = 0; }
    }
  }
  function flood(s) {
    const seen = new Uint8Array(W * H), q = [idx(s.x, s.z)];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop(), x = i % W, z = (i - x) / W;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Z = z + dz;
        if (!inside(X, Z)) continue;
        const j = idx(X, Z);
        if (!seen[j] && passable(j)) { seen[j] = 1; q.push(j); }
      }
    }
    return seen;
  }
  // water cells sit a little lower so lakes read as basins
  for (let z = 0; z <= H; z++) for (let x = 0; x <= W; x++) {
    let wet = false;
    for (const [i, j] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) if (inside(i, j) && kind[idx(i, j)] === WATER) wet = true;
    if (wet) height[z * (W + 1) + x] = Math.min(height[z * (W + 1) + x], -3.2);
  }
  return { W, H, kind, amount, height, deposits, starts, seed };
}

// height at a continuous cell position (x, z in cells)
export function heightAt(map, x, z) {
  const W = map.W, fx = Math.max(0, Math.min(map.W - 0.0001, x)), fz = Math.max(0, Math.min(map.H - 0.0001, z));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = map.height;
  const a = h[j * (W + 1) + i], b = h[j * (W + 1) + i + 1], c = h[(j + 1) * (W + 1) + i], d = h[(j + 1) * (W + 1) + i + 1];
  if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
  return d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
