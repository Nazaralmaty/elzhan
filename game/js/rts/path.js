// Grid pathfinding: A* for single units, Dijkstra flow fields for groups, straight-line walkability.
const SQ2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

class Heap {
  constructor() { this.a = []; this.p = []; }
  push(v, pr) {
    const a = this.a, p = this.p; let i = a.length;
    a.push(v); p.push(pr);
    while (i > 0) { const j = (i - 1) >> 1; if (p[j] <= pr) break; a[i] = a[j]; p[i] = p[j]; i = j; }
    a[i] = v; p[i] = pr;
  }
  pop() {
    const a = this.a, p = this.p, top = a[0], lv = a.pop(), lp = p.pop();
    if (a.length) {
      let i = 0; const n = a.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && p[c + 1] < p[c]) c++;
        if (p[c] >= lp) break;
        a[i] = a[c]; p[i] = p[c]; i = c;
      }
      a[i] = lv; p[i] = lp;
    }
    return top;
  }
  get size() { return this.a.length; }
}

// walk(i) -> true if cell index i is passable
export function makePathfinder(W, H, walk) {
  const g = new Float32Array(W * H), from = new Int32Array(W * H), stamp = new Uint32Array(W * H);
  let gen = 0;
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < H && walk(z * W + x);

  // nearest passable cell to (x, z), searching rings outward
  function nearestFree(x, z, maxR = 12) {
    x = Math.max(0, Math.min(W - 1, Math.floor(x))); z = Math.max(0, Math.min(H - 1, Math.floor(z)));
    if (ok(x, z)) return [x, z];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r || !ok(x + i, z + j)) continue;
        const d = i * i + j * j;
        if (d < bd) { bd = d; best = [x + i, z + j]; }
      }
      if (best) return best;
    }
    return null;
  }

  // straight line between cell centres crosses only passable cells (supercover walk)
  function lineFree(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) * 2.5);
    for (let k = 1; k <= n; k++) {
      const x = x0 + dx * k / n, z = z0 + dz * k / n;
      if (!ok(Math.floor(x), Math.floor(z))) return false;
      // keep a little clearance from corners
      const fx = x - Math.floor(x), fz = z - Math.floor(z);
      if (fx < 0.2 && !ok(Math.floor(x) - 1, Math.floor(z))) return false;
      if (fx > 0.8 && !ok(Math.floor(x) + 1, Math.floor(z))) return false;
      if (fz < 0.2 && !ok(Math.floor(x), Math.floor(z) - 1)) return false;
      if (fz > 0.8 && !ok(Math.floor(x), Math.floor(z) + 1)) return false;
    }
    return true;
  }

  // A* from a continuous position to a target cell; returns waypoints (cell centres) or null
  function find(sx, sz, tx, tz, maxNodes = 8000) {
    const s = nearestFree(sx, sz, 3), t = nearestFree(tx, tz, 16);
    if (!s || !t) return null;
    if (s[0] === t[0] && s[1] === t[1]) return [[t[0] + 0.5, t[1] + 0.5]];
    if (lineFree(sx, sz, t[0] + 0.5, t[1] + 0.5)) return [[t[0] + 0.5, t[1] + 0.5]];
    gen++;
    const si = s[1] * W + s[0], ti = t[1] * W + t[0];
    const heap = new Heap();
    const h = (x, z) => { const dx = Math.abs(x - t[0]), dz = Math.abs(z - t[1]); return Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz); };
    g[si] = 0; from[si] = -1; stamp[si] = gen;
    heap.push(si, h(s[0], s[1]));
    let best = si, bestH = Infinity, nodes = 0;
    while (heap.size) {
      const i = heap.pop();
      if (i === ti) { best = ti; break; }
      if (++nodes > maxNodes) break;
      const x = i % W, z = (i - x) / W, gi = g[i];
      const hi = h(x, z);
      if (hi < bestH) { bestH = hi; best = i; }
      for (const [dx, dz, c] of DIRS) {
        const X = x + dx, Z = z + dz;
        if (!ok(X, Z)) continue;
        if (dx && dz && (!ok(x + dx, z) || !ok(x, z + dz))) continue;
        const j = Z * W + X, ng = gi + c;
        if (stamp[j] === gen && g[j] <= ng) continue;
        stamp[j] = gen; g[j] = ng; from[j] = i;
        heap.push(j, ng + h(X, Z) * 1.001);
      }
    }
    // walk back, then drop waypoints that can be skipped in a straight line
    const cells = [];
    for (let i = best; i !== -1 && i !== si; i = from[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map(i => [i % W + 0.5, Math.floor(i / W) + 0.5]);
    const out = [];
    let cx = sx, cz = sz, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) if (lineFree(cx, cz, pts[m][0], pts[m][1])) { far = m; break; }
      out.push(pts[far]);
      [cx, cz] = pts[far];
      k = far + 1;
    }
    return out.length ? out : [[t[0] + 0.5, t[1] + 0.5]];
  }

  // Dijkstra from goal cells over the whole grid: cost to reach the goal from every cell
  function flowField(goals) {
    const cost = new Float32Array(W * H).fill(Infinity), heap = new Heap();
    for (const [x, z] of goals) { const c = nearestFree(x, z, 10); if (!c) continue; const i = c[1] * W + c[0]; cost[i] = 0; heap.push(i, 0); }
    while (heap.size) {
      const i = heap.pop(), x = i % W, z = (i - x) / W, ci = cost[i];
      for (const [dx, dz, c] of DIRS) {
        const X = x + dx, Z = z + dz;
        if (!ok(X, Z) || (dx && dz && (!ok(x + dx, z) || !ok(x, z + dz)))) continue;
        const j = Z * W + X, nc = ci + c;
        if (nc < cost[j]) { cost[j] = nc; heap.push(j, nc); }
      }
    }
    return cost;
  }

  // direction of steepest descent in a flow field from a continuous position
  function flowDir(cost, x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    let best = null, bc = ok(cx, cz) ? cost[cz * W + cx] : Infinity;
    for (const [dx, dz] of DIRS) {
      const X = cx + dx, Z = cz + dz;
      if (!ok(X, Z) || (dx && dz && (!ok(cx + dx, cz) || !ok(cx, cz + dz)))) continue;
      const c = cost[Z * W + X];
      if (c < bc) { bc = c; best = [X + 0.5, Z + 0.5]; }
    }
    return best;
  }

  return { find, flowField, flowDir, lineFree, nearestFree, ok };
}
