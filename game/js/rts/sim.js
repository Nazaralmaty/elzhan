// "Казаки" simulation: pure state + fixed-step tick. Peasants gather and build, buildings train and research,
// soldiers fight alone or in formations (officer + drummer + 15/36 men) with morale, volleys and routs.
// Undefended peasants and buildings are captured, like in Cossacks. The view only reads state and events.
import { UNITS, BUILDINGS, UPGRADES, RES, CARRY, GATHER, START_RES, POP_MAX, SIDE_COLORS, SIDE_NAMES, SHAPES } from './data.js';
import { createMap, GRASS, TREE, ROCK, DEPOSIT, WATER } from './map.js';
import { makePathfinder } from './path.js';
import { makeRng } from '../core/rng.js';

export const DT = 0.1;
const BUCKET = 4;
const MILITARY = k => !UNITS[k].peasant && k !== 'drummer';

/* ---------- setup ---------- */
export function createGame({ size = 'medium', players = 2, seed = 1, difficulty = 1, peace = 0, startRes = 'normal' } = {}) {
  const map = createMap({ size, players, seed });
  const { W, H } = map;
  const st = {
    t: 0, map, W, H, occ: new Int32Array(W * H), rng: makeRng(seed * 101 + 9), nextId: 1,
    units: [], byId: new Map(), buildings: [], bById: new Map(), formations: [], fById: new Map(), shots: [], events: [],
    sides: [], peace, difficulty, over: null, mapVersion: 0, hash: null, hashW: Math.ceil(W / BUCKET), hashH: Math.ceil(H / BUCKET), fogT: 0, capT: 0, scanT: 0
  };
  // forests slow units down but do not block them; rocks, water and buildings do
  st.pf = makePathfinder(W, H, i => (map.kind[i] === GRASS || map.kind[i] === TREE) && st.occ[i] === 0);
  const rich = startRes === 'rich' ? 4 : 1;
  for (let p = 0; p < players; p++) {
    const res = Object.fromEntries(RES.map(r => [r, START_RES[r] * rich]));
    st.sides.push({
      id: p, name: SIDE_NAMES[p], color: SIDE_COLORS[p], ai: p > 0, res, popCap: 0, up: {}, defeated: false,
      starveT: 0, noCoalT: -99, visible: p === 0 ? new Uint8Array(W * H) : null, explored: p === 0 ? new Uint8Array(W * H) : null,
      stats: { killed: 0, lost: 0, gathered: 0, built: 0, captured: 0 }, gatherMult: p > 0 ? [0.8, 1, 1.2, 1.45][difficulty] : 1
    });
    const s = map.starts[p];
    const th = placeBuilding(st, p, 'townhall', s.x - 2, s.z - 2, true);
    for (let k = 0; k < 10; k++) {
      const u = spawnUnit(st, p, 'peasant', th.x - 1 + (k % 5) * 1.3, th.z + 5 + Math.floor(k / 5) * 1.3);
      u.facing = -Math.PI / 2;
    }
    if (startRes === 'army') {
      for (let k = 0; k < 15; k++) spawnUnit(st, p, k % 2 ? 'musketeer' : 'pikeman', th.x - 3 + (k % 5), th.z - 3 - Math.floor(k / 5));
      spawnUnit(st, p, 'officer', th.x + 3, th.z - 4); spawnUnit(st, p, 'drummer', th.x + 4, th.z - 4);
    }
  }
  recalcPop(st);
  updateFog(st);
  return st;
}

/* ---------- helpers ---------- */
export const unit = (st, id) => st.byId.get(id);
export const building = (st, id) => st.bById.get(id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const centerOf = b => ({ x: b.x + b.w / 2, z: b.z + b.h / 2 });
// distance from a point to a building footprint
export function distToBuilding(b, x, z) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dz = Math.max(b.z - z, 0, z - (b.z + b.h));
  return Math.hypot(dx, dz);
}
const cellIdx = (st, x, z) => Math.floor(z) * st.W + Math.floor(x);
export const isEnemy = (a, b) => a !== b;
function msg(st, side, text, kind = '') { st.events.push({ t: 'msg', side, text, kind }); }
export function canAfford(side, cost) { return Object.entries(cost).every(([r, n]) => side.res[r] >= n); }
function pay(side, cost) { for (const [r, n] of Object.entries(cost)) side.res[r] -= n; }
function refund(side, cost) { for (const [r, n] of Object.entries(cost)) side.res[r] += n; }
export const hasUp = (side, key) => !!side.up[key];

export function spawnUnit(st, side, kind, x, z) {
  const U = UNITS[kind], S = st.sides[side];
  const hpMult = U.cav && hasUp(S, 'horses') ? 1.25 : 1;
  const u = {
    id: st.nextId++, side, kind, x, z, hp: U.hp * hpMult, maxHp: U.hp * hpMult, cd: 0, reload: 0, facing: 0, order: { type: 'idle' }, path: null,
    formation: 0, slot: -1, carry: null, task: null, inside: 0, flee: 0, stance: 'free', anchor: { x, z }, scan: st.rng.next() * 0.5, stuck: 0, moved: 0, moving: false, target: 0
  };
  st.units.push(u); st.byId.set(u.id, u);
  st.events.push({ t: 'spawn', id: u.id });
  return u;
}

export function placeBuilding(st, side, kind, x, z, done = false) {
  const B = BUILDINGS[kind];
  const b = { id: st.nextId++, side, kind, x, z, w: B.w, h: B.h, hp: done ? B.hp : B.hp * 0.1, maxHp: B.hp, progress: done ? 1 : 0, done, queue: [], trainT: 0, research: null, workers: [], farmers: [], captureT: 0, cd: 0, rally: null, deposit: 0 };
  for (let j = z; j < z + B.h; j++) for (let i = x; i < x + B.w; i++) st.occ[j * st.W + i] = b.id;
  if (kind === 'mine') {
    const d = st.map.deposits.find(d => d.x === x && d.z === z);
    if (d) { d.mine = b.id; b.deposit = d.id; b.res = d.kind; }
  }
  st.buildings.push(b); st.bById.set(b.id, b);
  st.mapVersion++;
  st.events.push({ t: 'placed', id: b.id });
  if (done) recalcPop(st);
  return b;
}

function removeBuilding(st, b) {
  for (let j = b.z; j < b.z + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) if (st.occ[j * st.W + i] === b.id) st.occ[j * st.W + i] = 0;
  if (b.kind === 'mine') { const d = st.map.deposits.find(d => d.id === b.deposit); if (d) d.mine = 0; }
  // workers come out
  for (const id of b.workers) { const u = unit(st, id); if (u) { u.inside = 0; const p = exitPoint(st, b); u.x = p.x; u.z = p.z; u.task = null; u.order = { type: 'idle' }; } }
  b.workers = [];
  st.buildings = st.buildings.filter(o => o !== b); st.bById.delete(b.id);
  st.mapVersion++;
  recalcPop(st);
}

export function recalcPop(st) {
  for (const S of st.sides) S.popCap = 0;
  for (const b of st.buildings) if (b.done && BUILDINGS[b.kind].pop) st.sides[b.side].popCap += BUILDINGS[b.kind].pop;
  for (const S of st.sides) S.popCap = Math.min(POP_MAX, S.popCap);
}
export const popOf = (st, side) => { let n = 0; for (const u of st.units) if (u.side === side && u.hp > 0) n++; for (const b of st.buildings) if (b.side === side) n += b.queue.length ? 1 : 0; return n; };
export const popUsed = (st, side) => { let n = 0; for (const u of st.units) if (u.side === side && u.hp > 0) n++; return n; };

function exitPoint(st, b) {
  const c = centerOf(b);
  const p = st.pf.nearestFree(b.x + b.w / 2, b.z + b.h + 0.5, 8) || [c.x, c.z + b.h];
  return { x: p[0] + 0.5, z: p[1] + 0.5 };
}

/* ---------- placement ---------- */
// first building from the kind's requirements that the side has not finished yet
export function missingNeeds(st, side, kind) {
  for (const need of BUILDINGS[kind].needs || []) if (!st.buildings.some(b => b.side === side && b.kind === need && b.done)) return need;
  return null;
}
export function canPlace(st, side, kind, x, z) {
  const B = BUILDINGS[kind], S = st.sides[side];
  if (!B) return 'Нет такой постройки';
  const miss = missingNeeds(st, side, kind);
  if (miss) return `Сначала постройте: ${BUILDINGS[miss].name}`;
  if (x < 1 || z < 1 || x + B.w > st.W - 1 || z + B.h > st.H - 1) return 'За краем карты';
  if (kind === 'mine') {
    const d = st.map.deposits.find(d => d.x === x && d.z === z);
    if (!d) return 'Шахту ставят на месторождение';
    if (d.mine) return 'Здесь уже есть шахта';
    return '';
  }
  for (let j = z; j < z + B.h; j++) for (let i = x; i < x + B.w; i++) {
    const k = j * st.W + i;
    if (st.map.kind[k] !== GRASS || st.occ[k]) return 'Место занято';
    if (S.explored && !S.explored[k]) return 'Место не разведано';
  }
  // keep a walkable ring so buildings don't wall each other in
  for (let i = x - 1; i <= x + B.w; i++) for (const j of [z - 1, z + B.h]) { const k = j * st.W + i; if (st.occ[k]) return 'Слишком близко к другой постройке'; }
  for (let j = z; j < z + B.h; j++) for (const i of [x - 1, x + B.w]) { const k = j * st.W + i; if (st.occ[k]) return 'Слишком близко к другой постройке'; }
  return '';
}

// snap a mine to the deposit under the cursor
export function snapPlacement(st, kind, x, z) {
  const B = BUILDINGS[kind];
  if (kind === 'mine') {
    const d = st.map.deposits.find(d => x >= d.x - 1.5 && x < d.x + 4.5 && z >= d.z - 1.5 && z < d.z + 4.5);
    if (d) return { x: d.x, z: d.z };
  }
  return { x: Math.round(x - B.w / 2), z: Math.round(z - B.h / 2) };
}

export function orderBuild(st, side, kind, x, z, ids) {
  const S = st.sides[side], B = BUILDINGS[kind];
  const why = canPlace(st, side, kind, x, z);
  if (why) return why;
  if (!canAfford(S, B.cost)) return 'Не хватает ресурсов';
  pay(S, B.cost);
  const b = placeBuilding(st, side, kind, x, z, false);
  for (const id of ids) { const u = unit(st, id); if (u && u.side === side && UNITS[u.kind].peasant) setTask(st, u, { kind: 'build', b: b.id }); }
  return '';
}

/* ---------- training & research ---------- */
export function canTrain(st, bid, kind) {
  const b = building(st, bid), S = b && st.sides[b.side], U = UNITS[kind];
  if (!b || !b.done) return 'Здание не достроено';
  if (!BUILDINGS[b.kind].trains?.includes(kind)) return 'Здесь не обучают';
  if (b.queue.length >= 12) return 'Очередь полна';
  if (popUsed(st, b.side) + queued(st, b.side) >= S.popCap) return 'Нужны дома: население на пределе';
  if (!canAfford(S, U.cost)) return 'Не хватает ресурсов';
  return '';
}
const queued = (st, side) => st.buildings.reduce((n, b) => n + (b.side === side ? b.queue.length : 0), 0);
export function train(st, bid, kind, n = 1) {
  let done = 0, why = '';
  for (let k = 0; k < n; k++) {
    why = canTrain(st, bid, kind);
    if (why) break;
    const b = building(st, bid);
    pay(st.sides[b.side], UNITS[kind].cost);
    b.queue.push(kind);
    b.lastKind = kind;
    done++;
  }
  return done ? '' : why;
}
// remove one queued unit (by position, or the last of a kind) and give its cost back
export function cancelTrainAt(st, bid, index) {
  const b = building(st, bid);
  if (!b || index < 0 || index >= b.queue.length) return;
  const [k] = b.queue.splice(index, 1);
  refund(st.sides[b.side], UNITS[k].cost);
  if (index === 0) b.trainT = 0;
}
export function cancelKind(st, bid, kind) {
  const b = building(st, bid);
  if (b) cancelTrainAt(st, bid, b.queue.lastIndexOf(kind));
}
// endless training: the building keeps ordering its last kind while resources and houses allow
export function setRepeat(st, bid, on) {
  const b = building(st, bid);
  if (b) { b.repeat = on; if (on && !b.lastKind) b.lastKind = BUILDINGS[b.kind].trains?.[0]; }
}
export function cancelTrain(st, bid) {
  const b = building(st, bid);
  if (!b || !b.queue.length) return;
  const k = b.queue.pop();
  refund(st.sides[b.side], UNITS[k].cost);
  if (!b.queue.length) b.trainT = 0;
}
export function canResearch(st, bid, key) {
  const b = building(st, bid), U = UPGRADES[key];
  if (!b || !U || U.at !== b.kind) return 'Недоступно';
  const S = st.sides[b.side];
  if (!b.done) return 'Здание не достроено';
  if (S.up[key]) return 'Уже изучено';
  if (st.buildings.some(o => o.side === b.side && o.research?.key === key)) return 'Уже изучается';
  if (b.research) return 'Здание занято исследованием';
  if (U.needs && !S.up[U.needs]) return `Сначала «${UPGRADES[U.needs].name}»`;
  if (!canAfford(S, U.cost)) return 'Не хватает ресурсов';
  return '';
}
export function research(st, bid, key) {
  const why = canResearch(st, bid, key);
  if (why) return why;
  const b = building(st, bid);
  pay(st.sides[b.side], UPGRADES[key].cost);
  b.research = { key, t: 0, T: UPGRADES[key].time };
  return '';
}

/* ---------- unit orders ---------- */
function setPath(st, u, x, z) {
  u.path = st.pf.find(u.x, u.z, x, z) || [[x, z]];
  u.stuck = 0;
}
export function setTask(st, u, task) {
  leaveInside(st, u);
  u.task = task; u.order = { type: 'task' }; u.path = null; u.target = 0;
}
function leaveInside(st, u) {
  if (!u.inside) return;
  const b = building(st, u.inside);
  if (b) { b.workers = b.workers.filter(id => id !== u.id); const p = exitPoint(st, b); u.x = p.x; u.z = p.z; }
  u.inside = 0;
}
function leaveFarm(st, u) {
  if (u.task?.kind !== 'farm') return;
  const b = building(st, u.task.b);
  if (b) b.farmers = b.farmers.filter(id => id !== u.id);
}

// Move a group: formations keep their shape, loose units spread around the point.
export function commandMove(st, ids, x, z, { attackMove = false } = {}) {
  const list = ids.map(id => unit(st, id)).filter(u => u && u.hp > 0);
  const forms = new Set(list.filter(u => u.formation).map(u => u.formation));
  for (const fid of forms) moveFormation(st, fid, x, z);
  const loose = list.filter(u => !u.formation);
  const n = loose.length, cols = Math.ceil(Math.sqrt(n));
  // one path for the group from its centre; stragglers far from the centre plan their own
  const cx = loose.reduce((a, u) => a + u.x, 0) / Math.max(1, n), cz = loose.reduce((a, u) => a + u.z, 0) / Math.max(1, n);
  const shared = n > 3 ? st.pf.find(cx, cz, x, z) : null;
  loose.forEach((u, k) => {
    leaveInside(st, u); leaveFarm(st, u);
    const ox = (k % cols - (cols - 1) / 2) * 1.2, oz = (Math.floor(k / cols) - (Math.ceil(n / cols) - 1) / 2) * 1.2;
    const tx = Math.max(0.5, Math.min(st.W - 0.5, x + ox)), tz = Math.max(0.5, Math.min(st.H - 0.5, z + oz));
    u.task = null; u.target = 0; u.flee = 0;
    u.order = { type: 'move', x: tx, z: tz, attackMove };
    u.anchor = { x: tx, z: tz };
    if (shared && Math.hypot(u.x - cx, u.z - cz) < 8) { u.path = [...shared.slice(0, -1).map(p => [p[0], p[1]]), [tx, tz]]; u.stuck = 0; }
    else setPath(st, u, tx, tz);
  });
}
export function commandAttack(st, ids, targetId, isBuilding = false) {
  for (const id of ids) {
    const u = unit(st, id);
    if (!u || u.hp <= 0) continue;
    if (u.formation) { const f = st.fById.get(u.formation); if (f) { f.order = { type: 'attack', target: targetId, building: isBuilding }; f.path = null; } continue; }
    leaveInside(st, u); leaveFarm(st, u);
    if (UNITS[u.kind].peasant || u.kind === 'drummer') continue;
    u.task = null;
    u.order = { type: 'attack', target: targetId, building: isBuilding };
    u.path = null;
  }
}
export function commandStop(st, ids) {
  for (const id of ids) {
    const u = unit(st, id);
    if (!u) continue;
    if (u.formation) { const f = st.fById.get(u.formation); if (f) { f.order = { type: 'idle' }; f.path = null; } continue; }
    leaveFarm(st, u);
    u.order = { type: 'idle' }; u.path = null; u.task = null; u.anchor = { x: u.x, z: u.z };
  }
}
export function setStance(st, ids, stance) {
  for (const id of ids) {
    const u = unit(st, id);
    if (!u) continue;
    u.stance = stance;
    if (u.formation) { const f = st.fById.get(u.formation); if (f) f.stance = stance; }
  }
}

// What a right/left click on a cell means for selected peasants: gather, farm, mine, build.
export function commandWork(st, ids, x, z) {
  const i = cellIdx(st, x, z), k = st.map.kind[i], bid = st.occ[i];
  const peasants = ids.map(id => unit(st, id)).filter(u => u && u.hp > 0 && UNITS[u.kind].peasant);
  if (!peasants.length) return false;
  const side = peasants[0].side;
  if (bid) {
    const b = building(st, bid);
    if (b.side !== side) return false;
    if (!b.done) { peasants.forEach(u => setTask(st, u, { kind: 'build', b: b.id })); return true; }
    if (b.kind === 'mine') { peasants.forEach(u => setTask(st, u, { kind: 'mine', b: b.id })); return true; }
    if (b.kind === 'mill') { peasants.forEach(u => { leaveFarm(st, u); setTask(st, u, { kind: 'farm', b: b.id }); }); return true; }
    if (b.hp < b.maxHp) { peasants.forEach(u => setTask(st, u, { kind: 'repair', b: b.id })); return true; }
    return false;
  }
  if (k === TREE || k === ROCK) {
    const res = k === TREE ? 'wood' : 'stone';
    peasants.forEach(u => { leaveFarm(st, u); setTask(st, u, { kind: 'gather', res, cell: i }); });
    return true;
  }
  return false;
}

// Send peasants to the nearest job of a kind: 'wood', 'stone', 'farm' or 'mine'. Returns how many found work.
export function autoWork(st, ids, job) {
  let n = 0;
  for (const id of ids) {
    const u = unit(st, id);
    if (!u || u.hp <= 0 || !UNITS[u.kind].peasant) continue;
    if (job === 'wood' || job === 'stone') {
      const cell = findResource(st, u.x, u.z, job === 'wood' ? TREE : ROCK, 45);
      if (cell < 0) continue;
      leaveFarm(st, u); setTask(st, u, { kind: 'gather', res: job, cell }); n++;
    } else {
      const want = job === 'farm' ? 'mill' : 'mine', S = st.sides[u.side];
      const cap = b => job === 'farm' ? BUILDINGS.mill.farm : (hasUp(S, 'deepmines') ? 10 : BUILDINGS.mine.mine);
      const used = b => job === 'farm' ? b.farmers.length + st.units.filter(o => o !== u && o.task?.kind === 'farm' && o.task.b === b.id && !b.farmers.includes(o.id)).length
        : b.workers.length + st.units.filter(o => o !== u && o.task?.kind === 'mine' && o.task.b === b.id && !o.inside).length;
      const b = st.buildings.filter(b => b.side === u.side && b.kind === want && b.done && used(b) < cap(b)).sort((a, c) => distToBuilding(a, u.x, u.z) - distToBuilding(c, u.x, u.z))[0];
      if (!b) continue;
      leaveFarm(st, u); setTask(st, u, { kind: job, b: b.id }); n++;
    }
  }
  return n;
}

/* ---------- formations ---------- */
function slotOffsets(shape, n) {
  const out = [];
  if (shape === 'square') {
    // hollow square: four faces, pikes outward
    const side = Math.max(2, Math.ceil(n / 4) + 1), half = (side - 1) * 0.85 / 2;
    for (let k = 0; k < n; k++) {
      const face = k % 4, pos = Math.floor(k / 4), t = -half + (pos + 0.5) * (side - 1) * 0.85 / Math.ceil(n / 4);
      const p = [[half, t], [t, half], [-half, -t], [-t, -half]][face];
      out.push({ f: p[0], s: p[1], face });
    }
  } else {
    const cols = shape === 'column' ? (n > 20 ? 4 : 3) : Math.ceil(n / 3), rows = Math.ceil(n / cols);
    for (let k = 0; k < n; k++) {
      const c = k % cols, r = Math.floor(k / cols);
      out.push({ f: -(r - (rows - 1) / 2) * 0.95, s: (c - (cols - 1) / 2) * 0.85 });
    }
  }
  return out;
}

function layout(f) {
  const offs = slotOffsets(f.shape, f.members.length), depth = f.shape === 'square' ? 0 : Math.max(...offs.map(o => Math.abs(o.f))) + 0.9;
  f.offsets = offs;
  f.officerOff = f.shape === 'square' ? { f: 0.4, s: 0 } : { f: depth + 0.4, s: 0 };
  f.drummerOff = f.shape === 'square' ? { f: -0.4, s: 0 } : { f: -depth - 0.4, s: 0.6 };
}
export function slotPos(f, off) {
  const c = Math.cos(f.dir), s = Math.sin(f.dir);
  return { x: f.x + c * off.f - s * off.s, z: f.z + s * off.f + c * off.s };
}

export function canForm(st, side, kind, size, near) {
  const free = st.units.filter(u => u.side === side && u.hp > 0 && !u.formation && !u.flee);
  const off = free.filter(u => u.kind === 'officer'), dr = free.filter(u => u.kind === 'drummer'), men = free.filter(u => u.kind === kind);
  if (!off.length) return 'Нужен свободный офицер (казарма)';
  if (!dr.length) return 'Нужен свободный барабанщик (казарма)';
  if (men.length < size) return `Нужно ${size} свободных: есть ${men.length}`;
  return '';
}
export function formFormation(st, side, kind, size, near) {
  const why = canForm(st, side, kind, size, near);
  if (why) return { why };
  const free = st.units.filter(u => u.side === side && u.hp > 0 && !u.formation && !u.flee);
  const byNear = list => list.sort((a, b) => dist(a, near) - dist(b, near));
  const officer = byNear(free.filter(u => u.kind === 'officer'))[0];
  const drummer = byNear(free.filter(u => u.kind === 'drummer'))[0];
  const men = byNear(free.filter(u => u.kind === kind)).slice(0, size);
  const cx = men.reduce((a, u) => a + u.x, 0) / men.length, cz = men.reduce((a, u) => a + u.z, 0) / men.length;
  const f = { id: st.nextId++, side, kind, size, members: men.map(u => u.id), officer: officer.id, drummer: drummer.id, x: cx, z: cz, dir: 0, shape: 'line', morale: 100, lossT: 99, order: { type: 'idle' }, path: null, stance: 'free', volleyT: 0, scanT: 0 };
  // face the nearest enemy building or the map centre
  const enemy = nearestEnemyBuilding(st, side, cx, cz);
  const tgt = enemy ? centerOf(enemy) : { x: st.W / 2, z: st.H / 2 };
  f.dir = Math.atan2(tgt.z - cz, tgt.x - cx);
  const p = st.pf.nearestFree(cx, cz, 10); if (p) { f.x = p[0] + 0.5; f.z = p[1] + 0.5; }
  layout(f);
  for (const u of [...men, officer, drummer]) { leaveInside(st, u); leaveFarm(st, u); u.formation = f.id; u.task = null; u.order = { type: 'form' }; u.path = null; }
  men.forEach((u, k) => { u.slot = k; });
  officer.slot = -2; drummer.slot = -3;
  st.formations.push(f); st.fById.set(f.id, f);
  st.events.push({ t: 'formed', id: f.id, side });
  return { f };
}
export function setShape(st, fid, shape) {
  const f = st.fById.get(fid);
  if (!f || !SHAPES[shape]) return;
  f.shape = shape;
  layout(f);
}
// dir: optional facing (radians) to take after arriving
export function moveFormation(st, fid, x, z, dir = null) {
  const f = st.fById.get(fid);
  if (!f) return;
  const p = st.pf.find(f.x, f.z, x, z);
  f.path = p || [[x, z]];
  f.order = { type: 'move', x, z };
  f.faceDir = dir;
}
export function faceFormation(st, fid, dir) { const f = st.fById.get(fid); if (f) f.faceDir = dir; }
export function releaseWorkers(st, bid) {
  const b = building(st, bid);
  if (!b) return;
  for (const id of [...b.workers]) { const u = unit(st, id); if (u) { leaveInside(st, u); u.task = null; u.order = { type: 'idle' }; u.anchor = { x: u.x, z: u.z }; } }
}
export function volley(st, fid) {
  const f = st.fById.get(fid);
  if (f) f.volleyNow = true;
}
export function disband(st, fid, rout = false) {
  const f = st.fById.get(fid);
  if (!f) return;
  for (const id of [...f.members, f.officer, f.drummer]) {
    const u = unit(st, id);
    if (!u) continue;
    u.formation = 0; u.slot = -1; u.order = { type: 'idle' }; u.anchor = { x: u.x, z: u.z };
    if (rout) { u.flee = 10; u.path = null; }
  }
  st.formations = st.formations.filter(o => o !== f); st.fById.delete(fid);
  if (rout) st.events.push({ t: 'rout', side: f.side, x: f.x, z: f.z });
}

/* ---------- spatial hash ---------- */
function rebuildHash(st) {
  const n = st.hashW * st.hashH;
  if (!st.hash) st.hash = Array.from({ length: n }, () => []);
  for (const b of st.hash) b.length = 0;
  for (const u of st.units) {
    if (u.hp <= 0 || u.inside) continue;
    const bx = Math.min(st.hashW - 1, Math.max(0, Math.floor(u.x / BUCKET))), bz = Math.min(st.hashH - 1, Math.max(0, Math.floor(u.z / BUCKET)));
    st.hash[bz * st.hashW + bx].push(u);
  }
}
export function unitsNear(st, x, z, r, fn) {
  const b0x = Math.max(0, Math.floor((x - r) / BUCKET)), b1x = Math.min(st.hashW - 1, Math.floor((x + r) / BUCKET));
  const b0z = Math.max(0, Math.floor((z - r) / BUCKET)), b1z = Math.min(st.hashH - 1, Math.floor((z + r) / BUCKET));
  const r2 = r * r;
  for (let bz = b0z; bz <= b1z; bz++) for (let bx = b0x; bx <= b1x; bx++) for (const u of st.hash[bz * st.hashW + bx]) {
    const dx = u.x - x, dz = u.z - z;
    if (dx * dx + dz * dz <= r2 && fn(u) === false) return;
  }
}
function nearestEnemyUnit(st, u, r, filter) {
  let best = null, bd = Infinity;
  unitsNear(st, u.x, u.z, r, o => {
    if (o.side === u.side || o.hp <= 0 || o.flee > 0 && false) return;
    if (filter && !filter(o)) return;
    const d = dist(o, u);
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}
function nearestEnemyBuilding(st, side, x, z, r = Infinity) {
  let best = null, bd = r;
  for (const b of st.buildings) {
    if (b.side === side) continue;
    const d = distToBuilding(b, x, z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/* ---------- movement ---------- */
function stepToward(st, u, tx, tz, speed, dt) {
  const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const inForest = st.map.kind[cellIdx(st, u.x, u.z)] === TREE;
  const v = Math.min(d, speed * (inForest ? 0.7 : 1) * dt);
  const nx = u.x + dx / d * v, nz = u.z + dz / d * v;
  const ok = (x, z) => st.pf.ok(Math.floor(x), Math.floor(z));
  if (ok(nx, nz)) { u.x = nx; u.z = nz; }
  else if (ok(nx, u.z)) u.x = nx;
  else if (ok(u.x, nz)) u.z = nz;
  else { u.stuck += dt; }
  u.facing = Math.atan2(dz, dx);
  u.moving = true;
  u.moved += v;
  return d <= v + 0.05;
}
function speedOf(st, u) {
  const U = UNITS[u.kind], S = st.sides[u.side];
  return U.speed * (U.cav && hasUp(S, 'horses') ? 1.1 : 1) * (u.flee > 0 ? 1.2 : 1);
}
// follow the unit's path; returns true on arrival
function followPath(st, u, dt, speedMul = 1) {
  if (!u.path || !u.path.length) return true;
  const [px, pz] = u.path[0];
  const arrived = stepToward(st, u, px, pz, speedOf(st, u) * speedMul, dt);
  if (arrived || Math.hypot(px - u.x, pz - u.z) < 0.35) u.path.shift();
  if (u.stuck > 1) {
    const last = u.path[u.path.length - 1];
    if (last) setPath(st, u, last[0], last[1]);
    u.stuck = 0;
  }
  return !u.path.length;
}
function goNear(st, u, x, z, reach, dt, speedMul = 1) {
  if (Math.hypot(x - u.x, z - u.z) <= reach) { u.path = null; return true; }
  const end = u.path && u.path[u.path.length - 1];
  if (!end || Math.hypot(end[0] - x, end[1] - z) > reach + 1.5 || u.pathV !== st.mapVersion && u.stuck > 0.5) { setPath(st, u, x, z); u.pathV = st.mapVersion; }
  followPath(st, u, dt, speedMul);
  return Math.hypot(x - u.x, z - u.z) <= reach;
}
function goNearBuilding(st, u, b, reach, dt) {
  if (distToBuilding(b, u.x, u.z) <= reach) { u.path = null; return true; }
  if (!u.path || !u.path.length || u.goalB !== b.id) {
    // aim at the free cell next to the footprint closest to the unit
    const tx = Math.max(b.x - 0.5, Math.min(b.x + b.w + 0.5, u.x)), tz = Math.max(b.z - 0.5, Math.min(b.z + b.h + 0.5, u.z));
    const p = st.pf.nearestFree(tx, tz, 6) || [tx, tz];
    setPath(st, u, p[0] + 0.5, p[1] + 0.5);
    u.goalB = b.id;
  }
  followPath(st, u, dt);
  if (!u.path?.length && distToBuilding(b, u.x, u.z) > reach) u.goalB = 0;
  return distToBuilding(b, u.x, u.z) <= reach;
}

/* ---------- combat ---------- */
function armorOf(st, u) { return (UNITS[u.kind].armor || 0) + (hasUp(st.sides[u.side], 'armor') && !UNITS[u.kind].peasant ? 2 : 0) + (u.formation ? 1 : 0); }
function meleeDamage(st, a, t) {
  const A = UNITS[a.kind], S = st.sides[a.side];
  let d = A.melee.dmg;
  if ((a.kind === 'pikeman' || a.kind === 'officer') && hasUp(S, 'pikes')) d *= 1.3;
  if (a.kind === 'musketeer' && hasUp(S, 'bayonets')) d *= 2;
  if (A.cav && hasUp(S, 'sabres')) d *= 1.25;
  if (t.w == null) {
    const T = UNITS[t.kind];
    if (A.vsCav && T.cav) d *= A.vsCav;
    if (A.vsLight && (T.shot || T.peasant || T.art)) d *= A.vsLight;
    if (A.charge && a.charged) { d *= A.charge; a.charged = false; }
    let arm = armorOf(st, t);
    if (A.cav && t.formation) { const f = st.fById.get(t.formation); if (f?.shape === 'square') arm += 3; }
    return Math.max(1, d - arm);
  }
  return d;
}
function hurtUnit(st, t, dmg, by) {
  if (t.hp <= 0) return;
  t.hp -= dmg;
  t.lastHit = st.t;
  if (by != null) t.hitBy = by;
  if (t.formation) { const f = st.fById.get(t.formation); if (f) f.lossT = 0; }
}
function hurtBuilding(st, b, dmg, bySide) {
  if (b.hp <= 0) return;
  b.hp -= dmg;
  b.hitBy = bySide;
  st.events.push({ t: 'bhit', id: b.id });
}
function canShoot(st, side, cost) { return canAfford(st.sides[side], cost); }

function fire(st, u, target, volleyBonus = 0) {
  const U = UNITS[u.kind], S = st.sides[u.side], sh = U.shot;
  if (!canShoot(st, u.side, sh.cost)) {
    if (st.t - S.noCoalT > 20) { S.noCoalT = st.t; msg(st, u.side, 'Нет угля — стрелки и пушки молчат!', 'bad'); }
    return false;
  }
  pay(S, sh.cost);
  const reloadMul = (u.kind === 'musketeer' && hasUp(S, 'volley') ? 0.75 : 1) * (U.art && hasUp(S, 'gunnery') ? 0.75 : 1);
  u.reload = sh.reload * reloadMul * (0.9 + st.rng.next() * 0.2);
  u.cd = 0.6;
  const isB = target.w != null;
  const tx = isB ? centerOf(target).x : target.x, tz = isB ? centerOf(target).z : target.z;
  u.facing = Math.atan2(tz - u.z, tx - u.x);
  const d = Math.hypot(tx - u.x, tz - u.z);
  if (U.art) {
    const spread = 0.4 + d * 0.06;
    const x = tx + (st.rng.next() - 0.5) * spread * 2, z = tz + (st.rng.next() - 0.5) * spread * 2;
    const T = 0.5 + d / 22;
    st.shots.push({ side: u.side, x0: u.x, z0: u.z, x, z, t: 0, T, dmg: sh.dmg, r: sh.splash * (hasUp(S, 'grape') ? 1.4 : 1), vsB: sh.building });
    st.events.push({ t: 'cannon', id: u.id, x: u.x, z: u.z, tx: x, tz: z, T });
    return true;
  }
  let dmg = sh.dmg * (hasUp(S, 'barrels') && (u.kind === 'musketeer' || u.kind === 'dragoon') ? 1.25 : 1);
  if (isB) {
    hurtBuilding(st, target, dmg * 0.08, u.side);
    st.events.push({ t: 'shot', id: u.id, x: u.x, z: u.z, tx, tz, hit: true, b: target.id });
    return true;
  }
  const acc = (hasUp(S, 'barrels') ? 0.88 : 0.8) + (u.formation ? 0.08 : 0) + volleyBonus;
  const hit = st.rng.next() < acc * (1 - 0.5 * Math.min(1, d / sh.range));
  if (hit) {
    hurtUnit(st, target, Math.max(2, dmg - armorOf(st, target)), u.side);
    if (target.formation) { const f = st.fById.get(target.formation); if (f) f.morale -= 0.8 + volleyBonus * 4; }
  }
  st.events.push({ t: 'shot', id: u.id, to: target.id, x: u.x, z: u.z, tx, tz, hit });
  return true;
}

function strike(st, u, target) {
  const U = UNITS[u.kind];
  u.cd = U.melee.cd * (0.9 + st.rng.next() * 0.2);
  u.facing = Math.atan2(target.z - u.z, target.x - u.x);
  hurtUnit(st, target, meleeDamage(st, u, target), u.side);
  st.events.push({ t: 'melee', id: u.id, to: target.id });
}

// engage a unit target: shoot if able, else close in and strike; returns false if target gone
function engage(st, u, t, dt, leash = Infinity) {
  if (!t || t.hp <= 0 || t.inside) return false;
  const U = UNITS[u.kind], d = dist(u, t), reach = U.melee ? U.melee.reach + (UNITS[t.kind].r || 0.3) : 0;
  if (U.shot && d <= U.shot.range && (!U.shot.min || d >= U.shot.min) && d > reach * 1.2) {
    u.path = null;
    if (u.reload <= 0 && u.cd <= 0) fire(st, u, t);
    else u.facing = Math.atan2(t.z - u.z, t.x - u.x);
    return true;
  }
  if (U.melee && d <= reach) {
    u.path = null;
    if (u.cd <= 0) strike(st, u, t);
    return true;
  }
  if (!U.melee && U.shot && U.shot.min && d < U.shot.min) { stepToward(st, u, u.x - (t.x - u.x), u.z - (t.z - u.z), speedOf(st, u), dt); return true; }
  if (dist(u.anchor, t) > leash) return false;
  // close and in plain sight: run straight at it; otherwise re-plan now and then
  if (d < 14 && st.pf.lineFree(u.x, u.z, t.x, t.z)) { u.path = null; stepToward(st, u, t.x, t.z, speedOf(st, u), dt); return true; }
  if (!u.path || !u.path.length || u.chaseT == null || st.t - u.chaseT > 1.5) { u.path = st.pf.find(u.x, u.z, t.x, t.z, 4000) || [[t.x, t.z]]; u.stuck = 0; u.chaseT = st.t; }
  followPath(st, u, dt);
  return true;
}
function engageBuilding(st, u, b, dt) {
  if (!b || b.hp <= 0 || b.side === u.side) return false;
  const U = UNITS[u.kind], d = distToBuilding(b, u.x, u.z);
  if (U.shot && d <= U.shot.range && (!U.shot.min || d >= U.shot.min)) {
    u.path = null;
    if (u.reload <= 0 && u.cd <= 0) fire(st, u, b);
    return true;
  }
  // melee units walk up and capture it (see capture pass)
  goNearBuilding(st, u, b, U.shot ? U.shot.range - 1 : 1.0, dt);
  return true;
}

/* ---------- per-unit update ---------- */
function updateUnit(st, u, dt) {
  const U = UNITS[u.kind], S = st.sides[u.side];
  u.cd -= dt; u.reload -= dt;
  u.moving = false;
  if (u.inside) return;
  if (u.flee > 0) {
    u.flee -= dt;
    const home = st.buildings.find(b => b.side === u.side && b.kind === 'townhall');
    if (home) goNearBuilding(st, u, home, 2, dt);
    return;
  }
  if (u.formation) { updateFormationMember(st, u, dt); return; }
  if (U.peasant && u.order.type === 'task') { updatePeasant(st, u, dt); return; }
  const o = u.order;
  if (o.type === 'move') {
    if (o.attackMove && MILITARY(u.kind)) {
      const e = nearestEnemyUnit(st, u, U.sight);
      if (e) { u.order = { type: 'attack', target: e.id, resume: o }; return; }
    }
    if (followPath(st, u, dt)) { u.order = { type: 'idle' }; u.anchor = { x: u.x, z: u.z }; }
    return;
  }
  if (o.type === 'attack') {
    const ok = o.building ? engageBuilding(st, u, building(st, o.target), dt) : engage(st, u, unit(st, o.target), dt);
    if (!ok) { u.order = o.resume || { type: 'idle' }; if (!o.resume) u.anchor = { x: u.x, z: u.z }; }
    return;
  }
  // idle: soldiers defend themselves and their spot; free stance chases a bit
  if (MILITARY(u.kind) || (U.peasant && false)) {
    u.scan -= dt;
    if (u.scan <= 0) {
      u.scan = 0.5;
      const range = u.stance === 'hold' ? (U.shot ? U.shot.range : U.melee.reach + 0.6) : U.sight;
      const e = nearestEnemyUnit(st, u, range);
      if (e) u.target = e.id;
      else if (U.art || U.shot) {
        const b = nearestEnemyBuilding(st, u.side, u.x, u.z, U.shot.range);
        u.target = b ? -b.id : 0;
      } else u.target = 0;
    }
    if (u.target > 0) {
      const t = unit(st, u.target);
      if (!engage(st, u, t, dt, u.stance === 'hold' ? 0.5 : 14)) u.target = 0;
    } else if (u.target < 0) {
      const b = building(st, -u.target);
      if (!b || b.hp <= 0 || u.stance === 'hold' && distToBuilding(b, u.x, u.z) > U.shot.range) u.target = 0; else engageBuilding(st, u, b, dt);
    } else if (dist(u, u.anchor) > 1.2 && u.stance !== 'hold') goNear(st, u, u.anchor.x, u.anchor.z, 0.6, dt);
  }
}

function updatePeasant(st, u, dt) {
  const S = st.sides[u.side], T = u.task;
  if (!T) { u.order = { type: 'idle' }; return; }
  if (T.kind === 'build' || T.kind === 'repair') {
    const b = building(st, T.b);
    if (!b || b.side !== u.side) { u.task = null; u.order = { type: 'idle' }; return; }
    if (T.kind === 'build' && b.done || T.kind === 'repair' && b.hp >= b.maxHp) { afterBuild(st, u, b); return; }
    if (goNearBuilding(st, u, b, 0.9, dt)) {
      u.working = true;
      const B = BUILDINGS[b.kind], c = centerOf(b);
      u.facing = Math.atan2(c.z - u.z, c.x - u.x);
      if (T.kind === 'repair') { b.hp = Math.min(b.maxHp, b.hp + b.maxHp / B.time * dt * 0.5); return; }
      const before = b.progress;
      b.progress = Math.min(1, b.progress + dt / B.time);
      b.hp = Math.min(b.maxHp, b.hp + (b.progress - before) * b.maxHp * 0.9);
      if (b.progress >= 1 && !b.done) {
        b.done = true; b.hp = Math.max(b.hp, b.maxHp * 0.95);
        recalcPop(st);
        S.stats.built++;
        st.events.push({ t: 'built', id: b.id });
        if (b.side === 0) msg(st, 0, `Построено: ${BUILDINGS[b.kind].name}`, 'good');
      }
    } else u.working = false;
    return;
  }
  if (T.kind === 'farm') {
    const b = building(st, T.b);
    if (!b || !b.done || b.side !== u.side) { leaveFarm(st, u); u.task = null; u.order = { type: 'idle' }; return; }
    if (!b.farmers.includes(u.id)) {
      if (b.farmers.length >= BUILDINGS.mill.farm) { u.task = null; u.order = { type: 'idle' }; msg(st, u.side, 'На полях мельницы нет мест', ''); return; }
      b.farmers.push(u.id);
    }
    const k = b.farmers.indexOf(u.id), spot = farmSpot(st, b, k);
    if (goNear(st, u, spot.x, spot.z, 0.6, dt)) {
      u.working = true;
      const mult = (hasUp(S, 'scythe') ? 1.25 : 1) * (hasUp(S, 'threefield') ? 1.35 : 1) * S.gatherMult;
      const n = GATHER.food * mult * dt;
      S.res.food += n; S.stats.gathered += n;
      u.facing = Math.sin(st.t * 0.3 + u.id) * 3;
    } else u.working = false;
    return;
  }
  if (T.kind === 'mine') {
    const b = building(st, T.b);
    if (!b || !b.done || b.side !== u.side) { u.task = null; u.order = { type: 'idle' }; return; }
    if (goNearBuilding(st, u, b, 0.9, dt)) {
      const cap = hasUp(S, 'deepmines') ? 10 : BUILDINGS.mine.mine;
      if (b.workers.length >= cap) { u.task = null; u.order = { type: 'idle' }; if (u.side === 0) msg(st, 0, 'Шахта полна', ''); return; }
      b.workers.push(u.id); u.inside = b.id; u.path = null;
    }
    return;
  }
  if (T.kind === 'gather') {
    const mult = (T.res === 'wood' ? (hasUp(S, 'axes') ? 1.3 : 1) : (hasUp(S, 'stonecut') ? 1.3 : 1)) * S.gatherMult;
    const cap = Math.round(CARRY * (hasUp(S, 'carts') ? 1.5 : 1));
    if (u.carry && u.carry.res !== T.res) u.carry = null;
    if (u.carry && u.carry.n >= cap || T.back) {
      const drop = nearestDrop(st, u, T.res);
      if (!drop) { u.working = false; if (st.t - (u.noDropT || -99) > 30 && u.side === 0) { u.noDropT = st.t; msg(st, 0, 'Некуда нести: постройте склад или ратушу', 'bad'); } return; }
      if (goNearBuilding(st, u, drop, 0.9, dt)) {
        const n = u.carry ? u.carry.n : 0;
        S.res[T.res] += n; S.stats.gathered += n;
        if (n && u.side === 0) st.events.push({ t: 'drop', id: u.id, res: T.res, n });
        u.carry = null; T.back = false; u.path = null; u.goalB = 0;
        if (T.cell < 0) { u.task = null; u.order = { type: 'idle' }; }
      }
      return;
    }
    const want = T.res === 'wood' ? TREE : ROCK;
    if (T.cell < 0 || st.map.kind[T.cell] !== want) {
      T.cell = findResource(st, u.x, u.z, want, 12);
      if (T.cell < 0) { if (u.carry?.n) T.back = true; else { u.task = null; u.order = { type: 'idle' }; } return; }
    }
    const cx = T.cell % st.W + 0.5, cz = Math.floor(T.cell / st.W) + 0.5;
    if (goNear(st, u, cx, cz, 1.25, dt)) {
      u.working = true;
      u.facing = Math.atan2(cz - u.z, cx - u.x);
      const rate = GATHER[T.res] * mult * dt;
      u.carry = u.carry || { res: T.res, n: 0 };
      const take = Math.min(rate, st.map.amount[T.cell]);
      u.carry.n += take;
      st.map.amount[T.cell] -= take;
      if (st.map.amount[T.cell] <= 0.001) {
        st.map.kind[T.cell] = GRASS; st.map.amount[T.cell] = 0; st.mapVersion++;
        st.events.push({ t: want === TREE ? 'treeGone' : 'rockGone', i: T.cell });
        T.cell = findResource(st, cx, cz, want, 8);
        if (T.cell < 0) T.back = true;
      }
      if (u.carry.n >= cap) T.back = true;
    } else u.working = false;
  }
}
function afterBuild(st, u, b) {
  u.working = false;
  if (b.kind === 'mill') { setTask(st, u, { kind: 'farm', b: b.id }); return; }
  if (b.kind === 'mine') { setTask(st, u, { kind: 'mine', b: b.id }); return; }
  // help with another unfinished building nearby
  const next = st.buildings.find(o => o.side === u.side && !o.done && distToBuilding(o, u.x, u.z) < 12);
  if (next) { setTask(st, u, { kind: 'build', b: next.id }); return; }
  u.task = null; u.order = { type: 'idle' }; u.anchor = { x: u.x, z: u.z };
}
export function farmSpot(st, b, k) {
  // farm plots in a ring around the mill, moved off trees and buildings
  const ring = 12, a = k / ring * Math.PI * 2 + 0.3, r = 3.4 + (k % 2) * 1.1, c = centerOf(b);
  const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
  if (!st || st.pf.ok(Math.floor(x), Math.floor(z))) return { x, z };
  const p = st.pf.nearestFree(x, z, 4);
  return p ? { x: p[0] + 0.5, z: p[1] + 0.5 } : { x, z };
}
function nearestDrop(st, u, res) {
  let best = null, bd = Infinity;
  for (const b of st.buildings) {
    if (b.side !== u.side || !b.done || !BUILDINGS[b.kind].drop?.includes(res)) continue;
    const d = distToBuilding(b, u.x, u.z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
export function findResource(st, x, z, want, r) {
  let best = -1, bd = Infinity;
  const x0 = Math.floor(x), z0 = Math.floor(z);
  for (let j = Math.max(0, z0 - r); j <= Math.min(st.H - 1, z0 + r); j++) for (let i = Math.max(0, x0 - r); i <= Math.min(st.W - 1, x0 + r); i++) {
    const k = j * st.W + i;
    if (st.map.kind[k] !== want) continue;
    // needs a free neighbour to stand on
    if (!(st.pf.ok(i + 1, j) || st.pf.ok(i - 1, j) || st.pf.ok(i, j + 1) || st.pf.ok(i, j - 1))) continue;
    const d = (i - x) ** 2 + (j - z) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/* ---------- formations update ---------- */
function updateFormation(st, f, dt) {
  const members = f.members.map(id => unit(st, id)).filter(u => u && u.hp > 0);
  // every fallen man shakes the rest; small formations break sooner
  const fallen = f.members.length - members.length;
  if (fallen > 0) f.morale -= fallen * 100 / f.size * 1.6;
  f.members = members.map(u => u.id);
  const officer = unit(st, f.officer), drummer = unit(st, f.drummer);
  if (!officer || officer.hp <= 0) { if (f.officer) { f.morale -= 30; f.officer = 0; } }
  if (!drummer || drummer.hp <= 0) { if (f.drummer) { f.morale -= 15; f.drummer = 0; } }
  if (members.length < 3) { disband(st, f.id, f.morale < 40); return; }
  f.lossT += dt;
  if (f.drummer && f.lossT > 6) f.morale = Math.min(100, f.morale + 1 * dt);
  if (f.morale < 20) {
    if (f.side === 0) msg(st, 0, 'Отряд дрогнул и бежит!', 'bad');
    disband(st, f.id, true);
    return;
  }
  if (members.length !== f.offsets.length) { layout(f); members.forEach((u, k) => { u.slot = k; }); }
  const U = UNITS[f.kind];
  const speed = Math.min(U.speed, 1.1) * (f.shape === 'column' ? 1.15 : f.shape === 'square' ? 0.55 : 0.9);
  // engagement: find enemies near the formation
  f.scanT -= dt;
  if (f.scanT <= 0) {
    f.scanT = 0.5;
    let best = null, bd = Infinity;
    const reach = f.stance === 'hold' ? (U.shot ? U.shot.range + 1 : 3) : (U.shot ? U.shot.range + 1 : 9);
    unitsNear(st, f.x, f.z, reach + 4, o => { if (o.side !== f.side && o.hp > 0 && !o.inside) { const d = Math.hypot(o.x - f.x, o.z - f.z); if (d < bd) { bd = d; best = o; } } });
    f.enemy = best ? best.id : 0; f.enemyD = bd;
  }
  let o = f.order;
  // free pikes charge enemies that come near; shooters hold and fire
  if (o.type === 'idle' && f.enemy && f.stance !== 'hold' && !U.shot && f.enemyD < 9) o = f.order = { type: 'attack', target: f.enemy, auto: true, home: { x: f.x, z: f.z } };
  if (o.type === 'move' && f.path?.length) {
    const [px, pz] = f.path[0];
    const want = Math.atan2(pz - f.z, px - f.x);
    turnToward(f, want, dt * (f.shape === 'line' ? 0.9 : 1.6));
    const lag = members.reduce((a, u) => { const p = slotPos(f, f.offsets[u.slot] || f.offsets[0]); return a + Math.hypot(p.x - u.x, p.z - u.z); }, 0) / members.length;
    const turning = Math.abs(angDiff(want, f.dir)) > 0.6;
    const v = speed * (lag > 1.6 ? 0.25 : lag > 0.9 ? 0.6 : 1) * (turning ? 0.25 : 1) * dt;
    const d = Math.hypot(px - f.x, pz - f.z);
    if (d <= v) { f.x = px; f.z = pz; f.path.shift(); } else { f.x += (px - f.x) / d * v; f.z += (pz - f.z) / d * v; }
    if (!f.path.length) f.order = { type: 'idle' };
  } else if (o.type === 'move') f.order = { type: 'idle' };
  if (f.order.type === 'idle' && f.faceDir != null) {
    turnToward(f, f.faceDir, dt * (f.shape === 'line' ? 0.9 : 1.6));
    if (Math.abs(angDiff(f.faceDir, f.dir)) < 0.02) f.faceDir = null;
  }
  if (o.type === 'attack') {
    const t = o.building ? building(st, o.target) : unit(st, o.target);
    const tx = t ? (o.building ? centerOf(t).x : t.x) : 0, tz = t ? (o.building ? centerOf(t).z : t.z) : 0;
    if (!t || t.hp <= 0 || t.side === f.side || (o.auto && Math.hypot(tx - o.home.x, tz - o.home.z) > 16)) {
      f.order = o.auto ? { type: 'move', x: o.home.x, z: o.home.z } : { type: 'idle' };
      if (o.auto) f.path = st.pf.find(f.x, f.z, o.home.x, o.home.z) || [[o.home.x, o.home.z]];
    } else {
      const want = Math.atan2(tz - f.z, tx - f.x);
      turnToward(f, want, dt * 1.4);
      const d = Math.hypot(tx - f.x, tz - f.z), stop = U.shot ? U.shot.range - 1.5 : 0.5;
      if (d > stop) {
        const v = speed * dt * (Math.abs(angDiff(want, f.dir)) > 0.6 ? 0.3 : 1);
        const nx = f.x + (tx - f.x) / d * v, nz = f.z + (tz - f.z) / d * v;
        if (!f.path?.length && st.pf.ok(Math.floor(nx), Math.floor(nz))) { f.x = nx; f.z = nz; }
        else {
          // blocked: plan around, but not more than every two seconds
          if (!f.path?.length || st.t - (f.planT || -99) > 2) { f.path = st.pf.find(f.x, f.z, tx, tz, 5000) || []; f.planT = st.t; }
          if (f.path.length) { const [px, pz] = f.path[0]; const dd = Math.hypot(px - f.x, pz - f.z) || 1; if (dd < 0.4) f.path.shift(); else { f.x += (px - f.x) / dd * Math.min(v, dd); f.z += (pz - f.z) / dd * Math.min(v, dd); } }
        }
      }
    }
  }
  // volley: most muskets loaded, enemy in range, standing still
  if (U.shot && f.morale >= 20) {
    f.volleyT -= dt;
    const moving = f.order.type === 'move';
    if (f.enemy && f.enemyD <= U.shot.range + 1 && !moving && f.volleyT <= 0 || f.volleyNow) {
      const loaded = members.filter(u => u.reload <= 0);
      if (loaded.length >= members.length * 0.5 || f.volleyNow) {
        let fired = 0;
        for (const u of loaded) {
          const t = nearestEnemyUnit(st, u, U.shot.range);
          if (t && fire(st, u, t, 0.1)) fired++;
        }
        if (fired) { st.events.push({ t: 'volley', id: f.id, n: fired }); f.volleyT = 1.5; }
      }
      f.volleyNow = false;
    }
  }
}
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function turnToward(f, want, step) {
  const d = angDiff(want, f.dir);
  f.dir += Math.max(-step, Math.min(step, d));
}

function updateFormationMember(st, u, dt) {
  const f = st.fById.get(u.formation);
  if (!f) { u.formation = 0; return; }
  const U = UNITS[u.kind];
  let off = u.slot === -2 ? f.officerOff : u.slot === -3 ? f.drummerOff : f.offsets[u.slot];
  if (!off) off = f.offsets[0];
  const p = slotPos(f, off);
  // melee: strike enemies that come close, without leaving the ranks far
  if (U.melee && u.kind !== 'drummer') {
    const leash = f.order.type === 'attack' ? 3 : 1.4;
    const e = nearestEnemyUnit(st, u, U.melee.reach + 0.9 + (f.order.type === 'attack' ? 1.5 : 0));
    if (e && Math.hypot(e.x - p.x, e.z - p.z) < leash + U.melee.reach) {
      const reach = U.melee.reach + (UNITS[e.kind].r || 0.3);
      if (dist(u, e) <= reach) { if (u.cd <= 0 && (!U.shot || u.reload > 0 || dist(u, e) < 1.3)) strike(st, u, e); u.facing = Math.atan2(e.z - u.z, e.x - u.x); return; }
      stepToward(st, u, e.x, e.z, speedOf(st, u), dt);
      return;
    }
  }
  const d = Math.hypot(p.x - u.x, p.z - u.z);
  if (d > 0.12) {
    if (u.stuck > 1.2 && d > 2) { setPath(st, u, p.x, p.z); u.stuck = 0; }
    if (u.path?.length && d > 2) followPath(st, u, dt, 1.3);
    else { u.path = null; stepToward(st, u, p.x, p.z, speedOf(st, u) * (d > 1 ? 1.3 : 0.8), dt); }
    if (d < 0.6) u.facing = f.shape === 'square' && off.face != null ? f.dir + [0, Math.PI / 2, Math.PI, -Math.PI / 2][off.face] : f.dir;
  } else {
    u.facing = f.shape === 'square' && off.face != null ? f.dir + [0, Math.PI / 2, Math.PI, -Math.PI / 2][off.face] : f.dir;
  }
}

/* ---------- buildings ---------- */
function updateBuilding(st, b, dt) {
  const S = st.sides[b.side], B = BUILDINGS[b.kind];
  if (!b.done) return;
  if (b.repeat && !b.queue.length && b.lastKind && canTrain(st, b.id, b.lastKind) === '') { pay(S, UNITS[b.lastKind].cost); b.queue.push(b.lastKind); }
  if (b.queue.length) {
    const kind = b.queue[0];
    if (popUsed(st, b.side) >= S.popCap) { b.blocked = true; }
    else {
      b.blocked = false;
      const mult = (b.kind === 'barracks' || b.kind === 'stable') && hasUp(S, 'drill') ? 1 / 0.7 : 1;
      b.trainT += dt * mult;
      if (b.trainT >= UNITS[kind].time) {
        b.trainT = 0; b.queue.shift();
        const p = exitPoint(st, b);
        const u = spawnUnit(st, b.side, kind, p.x, p.z);
        u.facing = Math.PI / 2;
        if (b.rally) {
          if (UNITS[kind].peasant && commandWork(st, [u.id], b.rally.x, b.rally.z)) { /* goes to work */ }
          else commandMove(st, [u.id], b.rally.x + (st.rng.next() - 0.5) * 2, b.rally.z + (st.rng.next() - 0.5) * 2);
        }
      }
    }
  }
  if (b.research) {
    b.research.t += dt;
    if (b.research.t >= b.research.T) {
      S.up[b.research.key] = true;
      st.events.push({ t: 'researched', side: b.side, key: b.research.key });
      if (b.side === 0) msg(st, 0, `Изучено: ${UPGRADES[b.research.key].name}`, 'good');
      if (b.research.key === 'horses') for (const u of st.units) if (u.side === b.side && UNITS[u.kind].cav) { u.maxHp *= 1.25; u.hp *= 1.25; }
      b.research = null;
    }
  }
  if (b.kind === 'mine' && b.workers.length) {
    const n = b.workers.length * GATHER.mine * (hasUp(S, 'picks') ? 1.3 : 1) * S.gatherMult * dt;
    S.res[b.res] += n; S.stats.gathered += n;
  }
  if (B.shot) {
    b.cd -= dt;
    if (b.cd <= 0) {
      const c = centerOf(b);
      const e = nearestEnemyUnit(st, { x: c.x, z: c.z, side: b.side }, B.shot.range);
      if (e && canShoot(st, b.side, B.shot.cost)) {
        pay(S, B.shot.cost);
        b.cd = B.shot.reload;
        const hit = st.rng.next() < 0.75;
        if (hit) hurtUnit(st, e, Math.max(2, B.shot.dmg - armorOf(st, e)), b.side);
        st.events.push({ t: 'shot', b: b.id, x: c.x, z: c.z, tx: e.x, tz: e.z, hit, tower: true, to: e.id });
      } else b.cd = 0.5;
    }
  }
}

/* ---------- capture ---------- */
function updateCapture(st, dt) {
  // peasants next to enemy soldiers with no friendly soldier nearby change sides
  for (const u of st.units) {
    if (u.hp <= 0 || u.inside || !UNITS[u.kind].peasant) continue;
    let captor = null;
    unitsNear(st, u.x, u.z, 1.6, o => { if (o.side !== u.side && o.hp > 0 && MILITARY(o.kind) && !o.flee) { captor = o; return false; } });
    if (!captor) { u.capT = 0; continue; }
    let guarded = false;
    unitsNear(st, u.x, u.z, 6, o => { if (o.side === u.side && o.hp > 0 && MILITARY(o.kind)) { guarded = true; return false; } });
    if (guarded) { u.capT = 0; continue; }
    u.capT = (u.capT || 0) + dt;
    if (u.capT >= 1) convertUnit(st, u, captor.side);
  }
  for (const b of st.buildings) {
    if (b.kind === 'tower' || b.hp <= 0) { b.captureT = 0; continue; }
    const c = centerOf(b), R = Math.max(b.w, b.h) / 2 + 1.6;
    let captor = null;
    unitsNear(st, c.x, c.z, R + 1, o => { if (o.side !== b.side && o.hp > 0 && MILITARY(o.kind) && !UNITS[o.kind].art && !o.flee && distToBuilding(b, o.x, o.z) < 1.6) { captor = o; return false; } });
    if (!captor) { b.captureT = 0; continue; }
    let guarded = false;
    unitsNear(st, c.x, c.z, R + 7, o => { if (o.side === b.side && o.hp > 0 && MILITARY(o.kind)) { guarded = true; return false; } });
    if (guarded) { b.captureT = 0; continue; }
    b.captureT += dt;
    if (b.captureT >= 3) {
      const from = b.side;
      b.side = captor.side; b.captureT = 0; b.queue = []; b.trainT = 0; b.research = null; b.rally = null;
      for (const id of [...b.workers, ...b.farmers]) { const w = unit(st, id); if (w) convertUnit(st, w, captor.side); }
      if (b.kind === 'mill') { b.farmers = []; }
      st.sides[captor.side].stats.captured++;
      recalcPop(st);
      st.events.push({ t: 'captured', id: b.id, from, side: captor.side });
      if (from === 0) msg(st, 0, `Враг захватил: ${BUILDINGS[b.kind].name}`, 'bad');
      if (captor.side === 0) msg(st, 0, `Захвачено: ${BUILDINGS[b.kind].name}`, 'good');
    }
  }
}
function convertUnit(st, u, side) {
  const from = u.side;
  if (u.formation) { const f = st.fById.get(u.formation); if (f) f.members = f.members.filter(id => id !== u.id); u.formation = 0; }
  leaveFarm(st, u);
  if (u.inside) { /* stays in the (captured) mine */ } else { u.task = null; u.order = { type: 'idle' }; u.path = null; }
  u.side = side; u.capT = 0; u.carry = null;
  st.events.push({ t: 'convert', id: u.id, from, side });
  if (from === 0) msg(st, 0, 'Враг уводит наших крестьян!', 'bad');
}

/* ---------- projectiles ---------- */
function updateShots(st, dt) {
  for (const s of st.shots) {
    s.t += dt;
    if (s.t < s.T || s.done) continue;
    s.done = true;
    st.events.push({ t: 'boom', x: s.x, z: s.z, r: s.r });
    unitsNear(st, s.x, s.z, s.r, o => {
      if (o.side === s.side || o.hp <= 0) return;
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      hurtUnit(st, o, s.dmg * (1 - 0.6 * d / s.r) * (UNITS[o.kind].art ? 0.6 : 1), s.side);
      if (o.formation) { const f = st.fById.get(o.formation); if (f) f.morale -= 2.5; }
    });
    const bid = st.occ[cellIdx(st, Math.max(0, Math.min(st.W - 1, s.x)), Math.max(0, Math.min(st.H - 1, s.z)))];
    const b = bid && building(st, bid);
    if (b && b.side !== s.side) hurtBuilding(st, b, s.dmg * s.vsB * 0.5, s.side);
  }
  st.shots = st.shots.filter(s => !s.done);
}

/* ---------- separation ---------- */
function separate(st) {
  for (const u of st.units) {
    if (u.hp <= 0 || u.inside) continue;
    const ru = UNITS[u.kind].r;
    unitsNear(st, u.x, u.z, ru + 0.75, o => {
      if (o === u || o.hp <= 0 || o.id < u.id) return;
      const ro = UNITS[o.kind].r, min = (ru + ro) * 0.85;
      const dx = o.x - u.x, dz = o.z - u.z, d = Math.hypot(dx, dz) || 0.01;
      if (d >= min) return;
      const push = (min - d) * 0.35, nx = dx / d, nz = dz / d;
      // working peasants and formation members hold their spot harder
      const wu = u.working || u.formation && !u.moving ? 0.3 : 1, wo = o.working || o.formation && !o.moving ? 0.3 : 1;
      const k = 1 / (wu + wo);
      const ux = u.x - nx * push * wu * k, uz = u.z - nz * push * wu * k, ox = o.x + nx * push * wo * k, oz = o.z + nz * push * wo * k;
      if (st.pf.ok(Math.floor(ux), Math.floor(uz))) { u.x = ux; u.z = uz; }
      if (st.pf.ok(Math.floor(ox), Math.floor(oz))) { o.x = ox; o.z = oz; }
    });
  }
}

/* ---------- fog of war ---------- */
export function updateFog(st) {
  const S = st.sides[0], vis = S.visible, exp = S.explored, W = st.W, H = st.H;
  vis.fill(0);
  const stamp = (x, z, r) => {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r)), z0 = Math.max(0, Math.floor(z - r)), z1 = Math.min(H - 1, Math.ceil(z + r)), r2 = r * r;
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) if ((i + 0.5 - x) ** 2 + (j + 0.5 - z) ** 2 <= r2) { vis[j * W + i] = 1; exp[j * W + i] = 1; }
  };
  for (const u of st.units) if (u.side === 0 && u.hp > 0 && !u.inside) stamp(u.x, u.z, UNITS[u.kind].sight);
  for (const b of st.buildings) if (b.side === 0) { const c = centerOf(b); stamp(c.x, c.z, BUILDINGS[b.kind].sight + b.w / 2); }
}
export const visibleTo = (st, x, z) => !!st.sides[0].visible[Math.floor(z) * st.W + Math.floor(x)];

/* ---------- main tick ---------- */
export function tick(st, dt = DT) {
  if (st.over) return;
  st.t += dt;
  rebuildHash(st);
  for (const f of [...st.formations]) updateFormation(st, f, dt);
  for (const u of st.units) if (u.hp > 0) updateUnit(st, u, dt);
  separate(st);
  for (const b of [...st.buildings]) updateBuilding(st, b, dt);
  updateShots(st, dt);
  st.capT -= dt;
  if (st.capT <= 0) { st.capT = 0.5; rebuildHash(st); updateCapture(st, 0.5); }
  // food: everyone eats; hunger kills
  for (const S of st.sides) {
    if (S.defeated) continue;
    let eat = 0;
    for (const u of st.units) if (u.side === S.id && u.hp > 0) eat += UNITS[u.kind].eat;
    S.res.food -= eat * dt;
    if (S.res.food < 0) {
      S.res.food = 0;
      S.starveT += dt;
      if (S.starveT > 4) {
        S.starveT = 0;
        const mine = st.units.filter(u => u.side === S.id && u.hp > 0);
        if (mine.length) { const v = mine[st.rng.int(mine.length)]; v.hp = 0; v.starved = true; }
        if (S.id === 0) msg(st, 0, 'Голод! Люди умирают — нужна еда (мельница и поля)', 'bad');
      }
    } else S.starveT = 0;
  }
  // deaths
  const dead = st.units.filter(u => u.hp <= 0);
  if (dead.length) {
    for (const u of dead) {
      if (u.inside) { const b = building(st, u.inside); if (b) b.workers = b.workers.filter(id => id !== u.id); }
      leaveFarm(st, u);
      if (u.formation) {
        const f = st.fById.get(u.formation);
        if (f) { if (f.members.includes(u.id)) f.morale -= 100 / f.size * 1.6; f.members = f.members.filter(id => id !== u.id); }
      }
      st.sides[u.side].stats.lost++;
      if (u.hitBy != null && st.sides[u.hitBy]) st.sides[u.hitBy].stats.killed++;
      st.events.push({ t: 'death', id: u.id, kind: u.kind, side: u.side, x: u.x, z: u.z, facing: u.facing, starved: !!u.starved });
      st.byId.delete(u.id);
    }
    st.units = st.units.filter(u => u.hp > 0);
  }
  for (const b of [...st.buildings]) if (b.hp <= 0) {
    st.events.push({ t: 'destroyed', id: b.id, kind: b.kind, side: b.side, x: b.x, z: b.z, w: b.w, h: b.h });
    if (b.side === 0) msg(st, 0, `Разрушено: ${BUILDINGS[b.kind].name}`, 'bad');
    removeBuilding(st, b);
  }
  st.fogT -= dt;
  if (st.fogT <= 0) { st.fogT = 0.3; updateFog(st); }
  // defeat: no town hall and no peasants
  for (const S of st.sides) {
    if (S.defeated) continue;
    const th = st.buildings.some(b => b.side === S.id && b.kind === 'townhall');
    const pz = st.units.some(u => u.side === S.id && UNITS[u.kind].peasant);
    const any = st.buildings.some(b => b.side === S.id) || st.units.some(u => u.side === S.id);
    if (!any || (!th && !pz)) {
      S.defeated = true;
      st.events.push({ t: 'defeated', side: S.id });
      // remaining soldiers lay down arms
      for (const u of st.units) if (u.side === S.id) u.hp = 0;
      if (S.id !== 0) msg(st, 0, `${S.name} разбиты!`, 'good');
    }
  }
  if (st.sides[0].defeated) st.over = 'defeat';
  else if (st.sides.every(S => S.id === 0 || S.defeated)) st.over = 'victory';
}

export function selectable(st, ids) { return ids.map(id => unit(st, id)).filter(Boolean); }
export { GRASS, TREE, ROCK, DEPOSIT, WATER };
