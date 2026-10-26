// Skirmish rules: pure state + functions, no rendering. Mutating calls return event lists for the view.
import { key, unkey, neighbor, neighbors, dist, dirTo, line, straight } from '../core/hex.js';
import { makeRng } from '../core/rng.js';
import { UNITS, ABILITIES } from '../data/units.js';

export const COLS = 8, ROWS = 6;
export const ARENA_KINDS = { field: 'Поле', forest: 'Лес', hills: 'Холмы', ruins: 'Руины' };
const COST = { grass: 1, forest: 2, hill: 2 };

/* ---------- arena ---------- */
function isConnected(cells) {
  const open = [];
  cells.forEach((row, r) => row.forEach((t, c) => { if (COST[t]) open.push(key(r, c)); }));
  if (!open.length) return false;
  const seen = new Set([open[0]]), stack = [unkey(open[0])];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(r, c)) {
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || !COST[cells[nr][nc]]) continue;
      const k = key(nr, nc);
      if (!seen.has(k)) { seen.add(k); stack.push([nr, nc]); }
    }
  }
  return seen.size === open.length;
}

export function generateArena(rng, kind) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const cells = Array.from({ length: ROWS }, () => Array(COLS).fill('grass'));
    const put = (t, n, cMin, cMax) => {
      for (let i = 0; i < n; i++) {
        const r = rng.int(ROWS), c = cMin + rng.int(cMax - cMin + 1);
        if (cells[r][c] === 'grass') cells[r][c] = t;
      }
    };
    const hard = (t, n) => put(t, n, 2, 5); // blockers stay out of deploy columns
    const soft = (t, n) => put(t, n, 0, COLS - 1);
    if (kind === 'forest') { soft('forest', 11); hard('rock', 2); }
    else if (kind === 'hills') { soft('hill', 8); hard('rock', 3); soft('forest', 2); }
    else if (kind === 'ruins') { hard('wall', 4); hard('rock', 3); soft('forest', 2); }
    else { soft('forest', 4); hard('rock', 3); soft('hill', 2); }
    if (isConnected(cells)) return cells;
  }
  return Array.from({ length: ROWS }, () => Array(COLS).fill('grass'));
}

/* ---------- setup ---------- */
function makeUnit(st, kind, side, r, c) {
  const d = UNITS[kind];
  return {
    id: st.nextId++, kind, side, r, c,
    name: d.name, hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def, move: d.move, range: d.range,
    magic: !!d.magic, mounted: !!d.mounted, hero: !!d.hero, undead: !!d.undead,
    abilities: [...d.abilities], cd: {}, status: {},
    ap: side === st.turn ? 2 : 0, retaliated: false, disengage: false
  };
}

function deploy(st, side, kinds) {
  const front = side === 'player' ? 1 : COLS - 2, back = side === 'player' ? 0 : COLS - 1;
  const rows = [2, 3, 1, 4, 0, 5];
  const melee = kinds.filter(k => UNITS[k].range === 1), ranged = kinds.filter(k => UNITS[k].range > 1);
  const slots = [...rows.map(r => [r, front]), ...rows.map(r => [r, back])];
  const backFirst = [...rows.map(r => [r, back]), ...rows.map(r => [r, front])];
  const take = (list, kind) => {
    const i = list.findIndex(([r, c]) => COST[st.cells[r][c]] && !unitAt(st, r, c));
    if (i < 0) return;
    const [r, c] = list[i];
    st.units.push(makeUnit(st, kind, side, r, c));
  };
  melee.forEach(k => take(slots, k));
  ranged.forEach(k => take(backFirst, k));
}

export function createBattle({ seed = 1, arena = 'random', player, enemy, mana = 20, autoPenalty = 0.1 }) {
  const rng = makeRng(seed);
  const kind = arena === 'random' ? rng.pick(Object.keys(ARENA_KINDS)) : arena;
  const st = {
    rows: ROWS, cols: COLS, arena: kind, cells: generateArena(rng, kind),
    units: [], turn: 'player', round: 1, mana: { player: mana, enemy: mana },
    ice: [], corpses: [], nextId: 1, auto: false, autoPenalty, winner: null, phase: 'deploy'
  };
  deploy(st, 'player', player);
  deploy(st, 'enemy', enemy);
  return st;
}

export function enemySquad(rng, faction, budget) {
  const pool = faction === 'undead'
    ? ['skeleton', 'skeleton', 'skeleton', 'ghoul', 'ghoul', 'deathknight', 'acolyte']
    : ['militia', 'militia', 'swordsman', 'swordsman', 'knight', 'archer', 'archer', 'apprentice', 'battlemage'];
  const out = [];
  if (faction !== 'undead') budget = Math.round(budget * 0.8); // same troops as the player: fewer of them
  if (faction !== 'undead' && budget >= 16) { out.push(rng.pick(['alden', 'irena', 'corvin'])); budget -= 6; }
  out.push(faction === 'undead' ? 'skeleton' : 'swordsman');
  budget -= UNITS[out[out.length - 1]].value;
  let guard = 0;
  while (budget >= 2 && out.length < 7 && guard++ < 50) {
    const k = rng.pick(pool);
    if (UNITS[k].value <= budget) { out.push(k); budget -= UNITS[k].value; }
  }
  return out;
}

/* ---------- queries ---------- */
export const inBounds = (st, r, c) => r >= 0 && r < st.rows && c >= 0 && c < st.cols;
export const iceAt = (st, r, c) => st.ice.some(i => i.r === r && i.c === c);
export const passable = (st, r, c) => inBounds(st, r, c) && COST[st.cells[r][c]] !== undefined && !iceAt(st, r, c);
export const moveCost = (st, r, c) => COST[st.cells[r][c]];
export const unitAt = (st, r, c) => st.units.find(u => u.hp > 0 && u.r === r && u.c === c);
export const unitById = (st, id) => st.units.find(u => u.id === id);
export const living = (st, side) => st.units.filter(u => u.hp > 0 && (!side || u.side === side));
export const enemiesOf = (st, u) => st.units.filter(e => e.hp > 0 && e.side !== u.side);
const pos = u => [u.r, u.c];
const exertsZoc = u => u.hp > 0 && u.range === 1;

export function zocHexes(st, side) {
  const out = new Set();
  st.units.forEach(e => {
    if (e.side === side || !exertsZoc(e)) return;
    neighbors(e.r, e.c).forEach(([r, c]) => { if (inBounds(st, r, c)) out.add(key(r, c)); });
  });
  return out;
}

// Dijkstra over move cost. ZoC hexes end movement; enemies block; allies can be passed but not ended on.
export function reachable(st, u, { budget, ignoreZoc } = {}) {
  const max = budget ?? (u.disengage ? 2 : u.move);
  const zoc = (ignoreZoc || u.disengage) ? new Set() : zocHexes(st, u.side);
  const start = key(u.r, u.c);
  const all = new Map([[start, { cost: 0, prev: null }]]);
  const open = [[0, u.r, u.c]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [cost, r, c] = open.shift();
    const k = key(r, c);
    if (all.get(k).cost < cost) continue;
    if (k !== start && zoc.has(k)) continue;
    for (const [nr, nc] of neighbors(r, c)) {
      if (!passable(st, nr, nc)) continue;
      const o = unitAt(st, nr, nc);
      if (o && o.side !== u.side) continue;
      const nCost = cost + COST[st.cells[nr][nc]];
      if (nCost > max) continue;
      const nk = key(nr, nc);
      if (!all.has(nk) || all.get(nk).cost > nCost) { all.set(nk, { cost: nCost, prev: k }); open.push([nCost, nr, nc]); }
    }
  }
  const tiles = new Map();
  for (const [k, v] of all) {
    if (k === start) continue;
    const [r, c] = unkey(k);
    if (!unitAt(st, r, c)) tiles.set(k, v);
  }
  return { tiles, all };
}

export function pathTo(reach, k) {
  const out = [];
  let cur = k;
  while (cur) { out.unshift(unkey(cur)); cur = reach.all.get(cur)?.prev; }
  return out;
}

export function shieldBonus(st, u, at = pos(u)) {
  if (u.status.shieldWall) return 2;
  return st.units.some(a => a.hp > 0 && a.side === u.side && a.id !== u.id && a.status.shieldWall && dist(pos(a), at) === 1) ? 2 : 0;
}

export function oppDamage(st, e, u, at = pos(u)) {
  const mult = e.status.spears ? (u.mounted ? 2 : 1.5) : 1;
  return Math.max(1, Math.round(e.atk * 0.5 * mult) - (u.def + shieldBonus(st, u, at)));
}

// Opportunity strikes when walking `path` (first element = start).
export function opportunityStrikes(st, u, path) {
  if (u.disengage) return [];
  const out = [], hit = new Set();
  for (let i = 0; i + 1 < path.length; i++) {
    const from = path[i], to = path[i + 1];
    enemiesOf(st, u).forEach(e => {
      if (!exertsZoc(e) || hit.has(e.id)) return;
      if (dist(pos(e), from) === 1 && dist(pos(e), to) > 1) { hit.add(e.id); out.push({ by: e, step: i, dmg: oppDamage(st, e, u, from) }); }
    });
  }
  return out;
}

export function los(st, a, b) {
  const L = line(a, b);
  for (let i = 1; i < L.length - 1; i++) {
    const [r, c] = L[i];
    if (st.cells[r][c] === 'wall' || iceAt(st, r, c)) return { clear: false, cover: 0 };
  }
  let cover = 0;
  if (L.length >= 3) { const [r, c] = L[L.length - 2]; if (st.cells[r][c] === 'rock') cover = 0.5; }
  return { clear: true, cover };
}

export const attackRange = (st, u, at = pos(u), bonus = 0) =>
  u.range + bonus + (u.range > 1 && st.cells[at[0]][at[1]] === 'hill' ? 1 : 0);

export function canAttack(st, u, at, t, bonus = 0) {
  if (!t || t.hp <= 0 || t.side === u.side) return false;
  const d = dist(at, pos(t));
  if (u.range === 1) return d === 1;
  if (d > attackRange(st, u, at, bonus)) return false;
  return los(st, at, pos(t)).clear;
}

export function computeDamage(st, a, at, t, o = {}) {
  const tp = pos(t), ranged = a.range > 1, bonuses = [];
  let sum = 0;
  const adj = st.units.filter(x => x.hp > 0 && x.side === a.side && x.id !== a.id && dist(pos(x), tp) === 1);
  const n = Math.min(adj.length, 2);
  if (n) { sum += 0.25 * n; bonuses.push(['Фланг', 25 * n]); }
  const dirs = new Set(adj.map(x => dirTo(tp, pos(x))));
  if (dist(at, tp) === 1) dirs.add(dirTo(tp, at));
  if ([...dirs].some(d => dirs.has((d + 3) % 6))) { sum += 0.25; bonuses.push(['Клещи', 25]); }
  if (st.cells[at[0]][at[1]] === 'hill' && st.cells[tp[0]][tp[1]] !== 'hill') { sum += 0.25; bonuses.push(['Высота', 25]); }
  if (t.status.marked) { sum += 0.25; bonuses.push(['Метка', 25]); }
  let cover = 0;
  if ((ranged || a.magic) && !o.ignoreCover) {
    if (st.cells[tp[0]][tp[1]] === 'forest') cover = 0.25;
    if (ranged) cover = Math.max(cover, los(st, at, tp).cover);
    if (cover) bonuses.push(['Укрытие', -cover * 100]);
  }
  let mult = o.mult ?? 1;
  if (mult !== 1) bonuses.push([o.multLabel || 'Умение', Math.round((mult - 1) * 100)]);
  if (a.mounted && t.status.shieldWall) { mult *= 0.5; bonuses.push(['Стена щитов', -50]); }
  if (st.auto && a.side === 'player' && st.autoPenalty) { mult *= 1 - st.autoPenalty; bonuses.push(['Автобой', -Math.round(st.autoPenalty * 100)]); }
  let def = t.def + shieldBonus(st, t);
  if (a.magic) def = Math.floor(def / 2);
  const dmg = Math.max(1, Math.round((o.base ?? a.atk) * (1 + sum) * (1 - cover) * mult) - def);
  let ret = 0;
  if (!ranged && t.range === 1 && !t.retaliated && dmg < t.hp && !o.noRetaliation)
    ret = Math.max(1, Math.round(t.atk * 0.5) - (a.def + shieldBonus(st, a, at)));
  return { dmg, ret, bonuses, kills: dmg >= t.hp };
}

/* ---------- abilities: readiness and targets ---------- */
export function abilityReady(st, u, id) {
  const A = ABILITIES[id];
  return u.hp > 0 && u.ap > 0 && !u.disengage && !(u.cd[id] > 0) && (!A.mana || st.mana[u.side] >= A.mana);
}

export function chargeLanding(st, u, t) {
  const s = straight(pos(u), pos(t), 4);
  if (!s || s.n < 2) return null;
  let p = pos(u);
  for (let i = 1; i < s.n; i++) {
    p = neighbor(p[0], p[1], s.d);
    if (!passable(st, p[0], p[1]) || unitAt(st, p[0], p[1])) return null;
  }
  return { landing: p, d: s.d, n: s.n };
}

export function chainTargets(st, u, first) {
  const out = [first];
  while (out.length < 3) {
    const prev = out[out.length - 1];
    const next = enemiesOf(st, u).filter(e => !out.includes(e) && dist(pos(e), pos(prev)) <= 2)
      .sort((a, b) => dist(pos(a), pos(prev)) - dist(pos(b), pos(prev)))[0];
    if (!next) break;
    out.push(next);
  }
  return out;
}

export function abilityTargets(st, u, id) {
  const here = pos(u);
  switch (id) {
    case 'spears': case 'shieldWall': case 'challenge': return [here];
    case 'charge': return enemiesOf(st, u).filter(e => chargeLanding(st, u, e)).map(pos);
    case 'aimed': return enemiesOf(st, u).filter(e => canAttack(st, u, here, e, 1)).map(pos);
    case 'cleave': return enemiesOf(st, u).filter(e => dist(here, pos(e)) === 1).map(pos);
    case 'chain': case 'disengage': case 'mark': return enemiesOf(st, u).filter(e => canAttack(st, u, here, e)).map(pos);
    case 'heal': return living(st, u.side).filter(a => dist(here, pos(a)) <= 2 && a.hp < a.maxHp).map(pos);
    case 'fireball': case 'iceWall': {
      const R = id === 'fireball' ? 4 : 3, out = [];
      for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
        if (dist(here, [r, c]) > R) continue;
        if (id === 'iceWall' && (!passable(st, r, c) || unitAt(st, r, c))) continue;
        out.push([r, c]);
      }
      return out;
    }
    case 'raise': return st.corpses.filter(k => dist(here, [k.r, k.c]) <= 2 && passable(st, k.r, k.c) && !unitAt(st, k.r, k.c)).map(k => [k.r, k.c]);
  }
  return [];
}

export function iceWallHexes(st, at) {
  return [at, neighbor(at[0], at[1], 2), neighbor(at[0], at[1], 5)].filter(([r, c]) => passable(st, r, c) && !unitAt(st, r, c));
}
export function fireballArea(st, at) {
  return [at, ...neighbors(at[0], at[1])].filter(([r, c]) => inBounds(st, r, c));
}
export const fireballDamage = (st, t) => Math.max(1, 7 - Math.floor((t.def + shieldBonus(st, t)) / 2));

/* ---------- mutations ---------- */
function hurt(st, u, amount, ev) {
  u.hp = Math.max(0, u.hp - amount);
  ev.push({ t: 'dmg', id: u.id, amount, hp: u.hp });
  if (u.hp <= 0) {
    ev.push({ t: 'death', id: u.id });
    st.corpses.push({ r: u.r, c: u.c, kind: u.kind, side: u.side });
  }
}

function knock(st, t, d, ev) {
  if (t.status.shieldWall) { ev.push({ t: 'resist', id: t.id }); return false; }
  const [nr, nc] = neighbor(t.r, t.c, d);
  const o = inBounds(st, nr, nc) ? unitAt(st, nr, nc) : null;
  if (!passable(st, nr, nc) || o) {
    ev.push({ t: 'bump', id: t.id, d });
    hurt(st, t, 4, ev);
    if (o) hurt(st, o, 2, ev);
    return false;
  }
  t.r = nr; t.c = nc;
  ev.push({ t: 'push', id: t.id, to: [nr, nc] });
  return true;
}

function strike(st, u, t, o, ev) {
  const f = computeDamage(st, u, pos(u), t, o);
  ev.push({ t: 'attack', id: u.id, target: t.id, ranged: u.range > 1, magic: u.magic });
  hurt(st, t, f.dmg, ev);
  let pushed = false;
  if (t.hp > 0 && o.knock !== undefined) pushed = knock(st, t, o.knock, ev);
  if (t.hp > 0 && u.hp > 0 && f.ret > 0 && !pushed) {
    t.retaliated = true;
    ev.push({ t: 'attack', id: t.id, target: u.id, ret: true });
    hurt(st, u, f.ret, ev);
  }
}

export function performMove(st, u, path) {
  const ev = [], strikes = opportunityStrikes(st, u, path);
  for (let i = 0; i + 1 < path.length; i++) {
    for (const s of strikes.filter(s => s.step === i)) {
      if (s.by.hp <= 0) continue;
      ev.push({ t: 'attack', id: s.by.id, target: u.id, opp: true });
      hurt(st, u, s.dmg, ev);
    }
    if (u.hp <= 0) break;
    u.r = path[i + 1][0]; u.c = path[i + 1][1];
    ev.push({ t: 'step', id: u.id, to: path[i + 1] });
  }
  if (u.disengage) { u.disengage = false; u.ap = 0; } else u.ap = Math.max(0, u.ap - 1);
  checkWinner(st);
  return ev;
}

export function performAttack(st, u, t) {
  const ev = [];
  strike(st, u, t, {}, ev);
  u.ap = 0;
  checkWinner(st);
  return ev;
}

export function useAbility(st, u, id, at) {
  const A = ABILITIES[id], ev = [], t = at ? unitAt(st, at[0], at[1]) : null;
  if (A.mana) st.mana[u.side] -= A.mana;
  u.cd[id] = A.cd;
  ev.push({ t: 'ability', id: u.id, ability: id, at });
  switch (id) {
    case 'spears': case 'shieldWall': u.status[id] = true; break;
    case 'challenge':
      enemiesOf(st, u).forEach(e => { if (dist(pos(e), pos(u)) <= 2) { e.status.taunt = u.id; ev.push({ t: 'taunt', id: e.id }); } });
      break;
    case 'charge': {
      const c = chargeLanding(st, u, t);
      const path = [pos(u)];
      let p = pos(u);
      for (let i = 1; i < c.n; i++) { p = neighbor(p[0], p[1], c.d); path.push(p); }
      path.slice(1).forEach(step => ev.push({ t: 'step', id: u.id, to: step, fast: true }));
      u.r = c.landing[0]; u.c = c.landing[1];
      strike(st, u, t, { mult: 1.5, multLabel: 'Таран', knock: c.d }, ev);
      break;
    }
    case 'aimed': strike(st, u, t, { ignoreCover: true }, ev); break;
    case 'cleave': {
      const d = dirTo(pos(u), pos(t));
      const side = [neighbor(u.r, u.c, (d + 1) % 6), neighbor(u.r, u.c, (d + 5) % 6)]
        .map(([r, c]) => inBounds(st, r, c) ? unitAt(st, r, c) : null).filter(x => x && x.side !== u.side);
      ev.push({ t: 'attack', id: u.id, target: t.id });
      [t, ...side].forEach(x => hurt(st, x, computeDamage(st, u, pos(u), x, { noRetaliation: true }).dmg, ev));
      break;
    }
    case 'iceWall': {
      const hexes = iceWallHexes(st, at);
      hexes.forEach(([r, c]) => st.ice.push({ r, c, ttl: 2, side: u.side }));
      ev.push({ t: 'ice', hexes });
      break;
    }
    case 'chain': {
      const list = chainTargets(st, u, t);
      ev.push({ t: 'chain', from: u.id, ids: list.map(x => x.id) });
      list.forEach((x, i) => {
        const def = Math.floor((x.def + shieldBonus(st, x)) / 2);
        hurt(st, x, Math.max(1, Math.round(u.atk * [1, 0.75, 0.5][i]) - def), ev);
      });
      break;
    }
    case 'disengage': strike(st, u, t, {}, ev); break;
    case 'mark': t.status.marked = true; ev.push({ t: 'mark', id: t.id }); break;
    case 'heal': {
      const amount = Math.min(6, t.maxHp - t.hp);
      t.hp += amount;
      ev.push({ t: 'heal', id: t.id, amount, hp: t.hp });
      break;
    }
    case 'fireball': {
      ev.push({ t: 'fireball', at });
      fireballArea(st, at).forEach(([r, c]) => { const x = unitAt(st, r, c); if (x) hurt(st, x, fireballDamage(st, x), ev); });
      break;
    }
    case 'raise': {
      const i = st.corpses.findIndex(k => k.r === at[0] && k.c === at[1]);
      st.corpses.splice(i, 1);
      const s = makeUnit(st, 'skeleton', u.side, at[0], at[1]);
      s.ap = 0;
      st.units.push(s);
      ev.push({ t: 'spawn', unit: s });
      break;
    }
  }
  if (id === 'disengage' && u.hp > 0) { u.ap = 1; u.disengage = true; } else u.ap = 0;
  checkWinner(st);
  return ev;
}

export function endTurn(st) {
  const prev = st.turn, next = prev === 'player' ? 'enemy' : 'player', ev = [];
  st.units.forEach(u => {
    u.status.marked = false;
    u.retaliated = false;
    if (u.side === prev) { u.ap = 0; u.disengage = false; delete u.status.taunt; }
  });
  st.turn = next;
  if (next === 'player') st.round++;
  living(st, next).forEach(u => {
    u.ap = 2;
    for (const id in u.cd) if (u.cd[id] > 0) u.cd[id]--;
    u.status.shieldWall = false;
    u.status.spears = false;
  });
  const before = st.ice.length;
  st.ice.forEach(i => { if (i.side === next) i.ttl--; });
  st.ice = st.ice.filter(i => i.ttl > 0);
  if (st.ice.length !== before) ev.push({ t: 'iceMelt' });
  ev.push({ t: 'turn', side: next, round: st.round });
  return ev;
}

export function checkWinner(st) {
  if (st.winner) return st.winner;
  if (!living(st, 'enemy').length) st.winner = 'player';
  else if (!living(st, 'player').length) st.winner = 'enemy';
  return st.winner;
}

export function swapDeploy(st, u, r, c) {
  const cols = u.side === 'player' ? [0, 1] : [COLS - 2, COLS - 1];
  if (!cols.includes(c) || !passable(st, r, c)) return false;
  const o = unitAt(st, r, c);
  if (o && o.side !== u.side) return false;
  if (o) { o.r = u.r; o.c = u.c; }
  u.r = r; u.c = c;
  return true;
}
