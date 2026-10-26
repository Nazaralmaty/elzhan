// Pointy-top hexes, odd-r offset coords [r, c]. Directions: 0 SE, 1 SW, 2 W, 3 NW, 4 NE, 5 E; opposite = (d + 3) % 6.
export const SQ = 0.8;
export const R3 = Math.sqrt(3);

const DIRS_EVEN = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]];
const DIRS_ODD = [[1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const key = (r, c) => r + ',' + c;
export const unkey = k => k.split(',').map(Number);

export function neighbor(r, c, d) {
  const t = (r & 1) ? DIRS_ODD : DIRS_EVEN;
  return [r + t[d][0], c + t[d][1]];
}
export const neighbors = (r, c) => [0, 1, 2, 3, 4, 5].map(d => neighbor(r, c, d));

export function toCube(r, c) { const x = c - (r - (r & 1)) / 2; return [x, -x - r, r]; }
export function fromCube(x, y, z) { return [z, x + (z - (z & 1)) / 2]; }

export function dist(a, b) {
  const p = toCube(a[0], a[1]), q = toCube(b[0], b[1]);
  return Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
}

export function dirTo(a, b) {
  for (let d = 0; d < 6; d++) { const n = neighbor(a[0], a[1], d); if (n[0] === b[0] && n[1] === b[1]) return d; }
  return -1;
}

function cubeRound(x, y, z) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return [rx, ry, rz];
}

// Hexes on the straight line a→b, endpoints included.
export function line(a, b) {
  const n = dist(a, b);
  if (n === 0) return [a];
  const A = toCube(a[0], a[1]), B = toCube(b[0], b[1]), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = cubeRound(A[0] + (B[0] - A[0]) * t + 1e-6, A[1] + (B[1] - A[1]) * t + 1e-6, A[2] + (B[2] - A[2]) * t - 2e-6);
    out.push(fromCube(c[0], c[1], c[2]));
  }
  return out;
}

// If b lies on one of the six straight rays from a, returns { d, n }.
export function straight(a, b, max = 10) {
  for (let d = 0; d < 6; d++) {
    let p = a;
    for (let n = 1; n <= max; n++) {
      p = neighbor(p[0], p[1], d);
      if (p[0] === b[0] && p[1] === b[1]) return { d, n };
    }
  }
  return null;
}

export const center = (r, c, s) => [c * R3 * s + (r & 1 ? R3 * s / 2 : 0), r * 1.5 * s * SQ];

export function corners(cx, cy, s, sq = SQ) {
  let out = '';
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i + 30);
    out += (cx + s * Math.cos(a)).toFixed(1) + ',' + (cy + s * Math.sin(a) * sq).toFixed(1) + ' ';
  }
  return out.trim();
}
