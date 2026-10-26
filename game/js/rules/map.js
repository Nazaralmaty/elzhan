// Kingdom map: seeded generation, territory, fog of war, army movement.
import { key, unkey, neighbors, dist, line } from '../core/hex.js';
import { makeRng } from '../core/rng.js';
import { TERRAIN, MAP_SIZES } from '../data/buildings.js';

export const inMap = (K, r, c) => r >= 0 && r < K.h && c >= 0 && c < K.w;
export const terr = (K, r, c) => K.tiles[r][c];
export const moveCost = (K, r, c) => TERRAIN[K.tiles[r][c]].move;
export const passableMap = (K, r, c) => inMap(K, r, c) && moveCost(K, r, c) < Infinity;
export const ring = (K, r, c, R) => {
  const out = [];
  for (let rr = r - R; rr <= r + R; rr++) for (let cc = c - R - 1; cc <= c + R + 1; cc++)
    if (inMap(K, rr, cc) && dist([r, c], [rr, cc]) <= R) out.push([rr, cc]);
  return out;
};

function blob(rng, tiles, w, h, t, r, c, size, allowed) {
  let p = [r, c];
  for (let i = 0; i < size; i++) {
    const [pr, pc] = p;
    if (pr >= 0 && pr < h && pc >= 0 && pc < w && allowed.includes(tiles[pr][pc])) tiles[pr][pc] = t;
    const n = neighbors(pr, pc).filter(([a, b]) => a >= 0 && a < h && b >= 0 && b < w);
    p = n[rng.int(n.length)];
  }
}

function reachableFrom(tiles, w, h, start) {
  const seen = new Set([key(...start)]), stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(r, c)) {
      if (nr < 0 || nr >= h || nc < 0 || nc >= w || TERRAIN[tiles[nr][nc]].move === Infinity) continue;
      const k = key(nr, nc);
      if (!seen.has(k)) { seen.add(k); stack.push([nr, nc]); }
    }
  }
  return seen;
}

export function generateMap(seed, sizeId) {
  const S = MAP_SIZES[sizeId], { w, h } = S, rng = makeRng(seed);
  const tiles = Array.from({ length: h }, () => Array(w).fill('grass'));
  const area = w * h;
  for (let i = 0; i < Math.round(area / 90); i++) blob(rng, tiles, w, h, 'water', rng.int(h), rng.int(w), 6 + rng.int(10), ['grass']);
  for (let i = 0; i < Math.round(area / 70); i++) blob(rng, tiles, w, h, 'mountain', rng.int(h), rng.int(w), 3 + rng.int(5), ['grass']);
  for (let i = 0; i < Math.round(area / 30); i++) blob(rng, tiles, w, h, 'forest', rng.int(h), rng.int(w), 4 + rng.int(8), ['grass']);
  for (let i = 0; i < Math.round(area / 45); i++) blob(rng, tiles, w, h, 'hill', rng.int(h), rng.int(w), 3 + rng.int(4), ['grass', 'forest']);
  // capital in the south, Morven's north edge stays wild
  const cap = [h - 3, Math.floor(w / 2)];
  ring({ w, h }, cap[0], cap[1], 1).forEach(([r, c]) => { tiles[r][c] = 'grass'; });
  tiles[cap[0]][cap[1]] = 'village';
  const ensure = (t, R, from) => {
    const near = ring({ w, h }, cap[0], cap[1], R).filter(([r, c]) => dist([r, c], cap) >= 2);
    if (near.some(([r, c]) => tiles[r][c] === t)) return;
    const cand = near.filter(([r, c]) => from.includes(tiles[r][c]));
    const [r, c] = cand.length ? cand[rng.int(cand.length)] : near[rng.int(near.length)];
    tiles[r][c] = t;
  };
  ensure('forest', 2, ['grass']); ensure('hill', 2, ['grass', 'forest']); ensure('mana', 2, ['grass']); ensure('ore', 3, ['hill', 'grass']);
  const hills = [];
  tiles.forEach((row, r) => row.forEach((t, c) => { if (t === 'hill') hills.push([r, c]); }));
  rng.shuffle(hills).slice(0, Math.max(2, Math.round(hills.length * 0.12))).forEach(([r, c], i) => { tiles[r][c] = i % 3 === 2 ? 'gold' : 'ore'; });
  const free = () => {
    for (let tries = 0; tries < 400; tries++) {
      const r = rng.int(h), c = rng.int(w);
      if (tiles[r][c] === 'grass' || tiles[r][c] === 'forest') return [r, c];
    }
    return null;
  };
  let placed = 1;
  for (let tries = 0; placed < S.mana && tries < 500; tries++) {
    const p = free();
    if (p && dist(p, cap) >= 3) { tiles[p[0]][p[1]] = 'mana'; placed++; }
  }
  const villages = [cap];
  for (let tries = 0; villages.length <= S.villages && tries < 2000; tries++) {
    const p = free();
    if (p && villages.every(v => dist(v, p) >= 3)) { tiles[p[0]][p[1]] = 'village'; villages.push(p); }
  }
  for (let i = 0, tries = 0; i < Math.max(2, Math.round(S.lairs / 3)) && tries < 300; tries++) {
    const p = free();
    if (p && dist(p, cap) >= 4) { tiles[p[0]][p[1]] = 'ruins'; i++; }
  }
  // carve paths so every village is reachable from the capital
  for (let pass = 0; pass < 20; pass++) {
    const seen = reachableFrom(tiles, w, h, cap);
    const lost = villages.find(v => !seen.has(key(...v)));
    if (!lost) break;
    line(cap, lost).forEach(([r, c]) => { if (TERRAIN[tiles[r][c]].move === Infinity) tiles[r][c] = 'grass'; });
  }
  return { tiles, capital: cap, villages };
}

/* ---------- territory ---------- */
export const cityRadius = city => city.capital || city.level >= 3 ? 2 : 1;

// tile key → city id; closer city wins, ties go to the older city
export function territory(K) {
  const own = new Map(), d = new Map();
  for (const city of K.cities) {
    for (const [r, c] of ring(K, city.r, city.c, cityRadius(city))) {
      const k = key(r, c), dd = dist([r, c], [city.r, city.c]);
      if (!own.has(k) || dd < d.get(k)) { own.set(k, city.id); d.set(k, dd); }
    }
  }
  return own;
}

/* ---------- fog ---------- */
export function visibleSet(K) {
  const vis = new Set();
  const see = (r, c, R) => ring(K, r, c, R + (K.tiles[r][c] === 'hill' ? 1 : 0)).forEach(([a, b]) => vis.add(key(a, b)));
  K.cities.filter(x => x.owner === 'player').forEach(x => see(x.r, x.c, cityRadius(x) + 1));
  K.armies.filter(a => a.owner === 'player').forEach(a => see(a.r, a.c, 2));
  return vis;
}

export function reveal(K) {
  const vis = visibleSet(K);
  vis.forEach(k => { K.explored[k] = 1; });
  return vis;
}

/* ---------- movement ---------- */
export const armyAt = (K, r, c) => K.armies.find(a => a.r === r && a.c === c);

// Dijkstra over terrain cost within army.mp; other armies block (own ones are passable but not end tiles).
export function armyReach(K, army) {
  const start = key(army.r, army.c), all = new Map([[start, { cost: 0, prev: null }]]), open = [[0, army.r, army.c]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [cost, r, c] = open.shift();
    if (all.get(key(r, c)).cost < cost) continue;
    for (const [nr, nc] of neighbors(r, c)) {
      if (!passableMap(K, nr, nc)) continue;
      const o = armyAt(K, nr, nc);
      if (o && o.owner !== army.owner) continue;
      const nCost = cost + moveCost(K, nr, nc);
      if (nCost > army.mp) continue;
      const nk = key(nr, nc);
      if (!all.has(nk) || all.get(nk).cost > nCost) { all.set(nk, { cost: nCost, prev: key(r, c) }); open.push([nCost, nr, nc]); }
    }
  }
  const tiles = new Map();
  for (const [k, v] of all) { if (k === start) continue; const [r, c] = unkey(k); if (!armyAt(K, r, c)) tiles.set(k, v); }
  return { tiles, all };
}

export function reachPath(reach, k) {
  const out = [];
  let cur = k;
  while (cur) { out.unshift(unkey(cur)); cur = reach.all.get(cur)?.prev; }
  return out;
}

// Shortest path ignoring move points (for monsters), avoiding impassable and foreign armies except the goal.
export function pathfind(K, from, to, owner) {
  const goal = key(...to), start = key(...from), prev = new Map([[start, null]]), cost = new Map([[start, 0]]), open = [[0, ...from]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [cst, r, c] = open.shift();
    const k = key(r, c);
    if (k === goal) break;
    if (cost.get(k) < cst) continue;
    for (const [nr, nc] of neighbors(r, c)) {
      if (!passableMap(K, nr, nc)) continue;
      const nk = key(nr, nc), o = armyAt(K, nr, nc);
      if (o && o.owner === owner && nk !== goal) continue;
      const n = cst + moveCost(K, nr, nc);
      if (!cost.has(nk) || cost.get(nk) > n) { cost.set(nk, n); prev.set(nk, k); open.push([n, nr, nc]); }
    }
  }
  if (!prev.has(goal)) return null;
  const out = [];
  let cur = goal;
  while (cur) { out.unshift(unkey(cur)); cur = prev.get(cur); }
  return out;
}
