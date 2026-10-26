// "Стенка на стенку" in the Age of War / Stick War spirit: real-time lane, bases, gold + miners,
// buy units into a training queue, whole-army commands (attack / defend / garrison), one special ability.
import { makeRng } from '../core/rng.js';

export const FIELD = 1000, DT = 0.05, BASE_HP = 600;
export const ROSTER = {
  miner:       { name: 'Рудокоп',      cost: 50,  train: 2.0, hp: 30, miner: true },
  militia:     { name: 'Ополченец',    cost: 35,  train: 1.6, hp: 45,  dmg: 6,  cd: 0.9, range: 28,  speed: 42, vsMounted: 2.2 },
  swordsman:   { name: 'Мечник',       cost: 65,  train: 2.4, hp: 100, dmg: 9,  cd: 1.0, range: 26,  speed: 34, armor: 0.35 },
  archer:      { name: 'Лучник',       cost: 55,  train: 2.0, hp: 35,  dmg: 7,  cd: 1.4, range: 230, speed: 38, ranged: true },
  knight:      { name: 'Рыцарь',       cost: 110, train: 3.2, hp: 140, dmg: 15, cd: 1.1, range: 30,  speed: 72, mounted: true, charge: 2.2, armor: 0.15 },
  apprentice:  { name: 'Ученик-маг',   cost: 85,  train: 2.6, hp: 40,  dmg: 4,  cd: 1.5, range: 170, speed: 36, ranged: true, magic: true, heal: 12 },
  battlemage:  { name: 'Боевой маг',   cost: 140, train: 3.6, hp: 45,  dmg: 18, cd: 3.2, range: 210, speed: 34, ranged: true, magic: true, splash: 55 },
  skeleton:    { name: 'Скелет',       cost: 30,  train: 1.4, hp: 40,  dmg: 6,  cd: 1.0, range: 26,  speed: 38 },
  ghoul:       { name: 'Гуль',         cost: 55,  train: 1.8, hp: 60,  dmg: 9,  cd: 0.8, range: 24,  speed: 70, vsRanged: 1.7 },
  deathknight: { name: 'Рыцарь смерти', cost: 120, train: 3.4, hp: 160, dmg: 16, cd: 1.1, range: 30, speed: 66, mounted: true, charge: 2.2, armor: 0.2 },
  acolyte:     { name: 'Послушник',    cost: 90,  train: 2.8, hp: 40,  dmg: 5,  cd: 1.6, range: 170, speed: 34, ranged: true, magic: true, raise: 0.35 },
  alden:       { name: 'Сэр Альден',   cost: 220, train: 5,   hp: 420, dmg: 22, cd: 1.0, range: 30,  speed: 42, armor: 0.3, hero: true },
  irena:       { name: 'Ирена',        cost: 220, train: 5,   hp: 220, dmg: 26, cd: 2.2, range: 230, speed: 38, ranged: true, magic: true, splash: 60, hero: true },
  corvin:      { name: 'Корвин',       cost: 220, train: 5,   hp: 260, dmg: 16, cd: 0.8, range: 260, speed: 44, ranged: true, hero: true }
};
export const ROSTERS = { human: ['militia', 'swordsman', 'archer', 'knight', 'apprentice', 'battlemage'], undead: ['skeleton', 'ghoul', 'deathknight', 'acolyte'] };
export const COMMANDS = { attack: 'Атака', defend: 'Оборона', garrison: 'Отход' };
export const MAX_MINERS = 8, MAX_QUEUE = 5, POP_CAP = 20, RAIN_CD = 25, RAIN_DMG = 30;
const INCOME = 4, MINER_INCOME = 3;

const dirOf = side => side === 'player' ? 1 : -1;
export const baseX = side => side === 'player' ? 0 : FIELD;
const mineX = side => side === 'player' ? 75 : FIELD - 75;
const lineX = (side, ranged) => side === 'player' ? (ranged ? 220 : 290) : FIELD - (ranged ? 220 : 290);
const foe = side => side === 'player' ? 'enemy' : 'player';

function makeSide(roster, hero, incomeMult) {
  return { gold: 150, baseHp: BASE_HP, baseMax: BASE_HP, queue: [], train: 0, command: 'defend', rainCd: 8, roster, hero, heroBought: false, incomeMult, turretCd: 0 };
}

export function createWar({ player = 'human', enemy = 'undead', hero = null, enemyHero = null, seed = 1, enemyIncome = 1 } = {}) {
  return {
    t: 0, over: null, units: [], nextId: 1, events: [], rng: makeRng(seed),
    sides: { player: makeSide(ROSTERS[player], hero, 1), enemy: makeSide(ROSTERS[enemy], enemyHero, enemyIncome) },
    faction: { player, enemy }, aiTimer: 0
  };
}

export const units = (st, side) => st.units.filter(u => u.hp > 0 && (!side || u.side === side));
export const miners = (st, side) => units(st, side).filter(u => ROSTER[u.kind].miner);
export const fighters = (st, side) => units(st, side).filter(u => !ROSTER[u.kind].miner);
// passive income grows over time so long wars still end
export const income = (st, side) => (INCOME + Math.min(8, st.t / 40) + MINER_INCOME * miners(st, side).length) * st.sides[side].incomeMult;
export const minerKind = 'miner';

export function canBuy(st, side, kind) {
  const S = st.sides[side], R = ROSTER[kind];
  if (!R || st.over) return 'Бой окончен';
  if (kind !== 'miner' && !S.roster.includes(kind) && kind !== S.hero) return 'Недоступно';
  if (kind === S.hero && (S.heroBought || S.queue.includes(kind))) return 'Герой уже в бою';
  if (kind === 'miner' && miners(st, side).length + S.queue.filter(k => k === 'miner').length >= MAX_MINERS) return 'Рудокопов достаточно';
  if (S.queue.length >= MAX_QUEUE) return 'Очередь полна';
  if (kind !== 'miner' && fighters(st, side).length + S.queue.filter(k => k !== 'miner').length >= POP_CAP) return 'Армия на пределе';
  if (S.gold < R.cost) return 'Мало золота';
  return '';
}

export function buy(st, side, kind) {
  if (canBuy(st, side, kind)) return false;
  const S = st.sides[side];
  S.gold -= ROSTER[kind].cost;
  S.queue.push(kind);
  if (kind === S.hero) S.heroBought = true;
  return true;
}

export function setCommand(st, side, cmd) { if (COMMANDS[cmd]) st.sides[side].command = cmd; }

function spawn(st, side, kind) {
  const R = ROSTER[kind];
  const x = R.miner ? mineX(side) + (st.rng.next() - 0.5) * 30 : baseX(side) + dirOf(side) * 20;
  const u = { id: st.nextId++, kind, side, x, hp: R.hp, maxHp: R.hp, cd: 0, depth: st.rng.int(4), moving: false, charged: true, idle: 0 };
  st.units.push(u);
  st.events.push({ t: 'spawn', id: u.id });
  return u;
}

// Rain of arrows: hits every enemy fighter near the enemy unit closest to our base.
export function castRain(st, side) {
  const S = st.sides[side];
  if (S.rainCd > 0 || st.over) return false;
  const foes = units(st, foe(side));
  if (!foes.length) return false;
  const front = foes.reduce((a, b) => Math.abs(a.x - baseX(side)) < Math.abs(b.x - baseX(side)) ? a : b);
  const x1 = front.x - 130, x2 = front.x + 130;
  foes.filter(u => u.x >= x1 && u.x <= x2).forEach(u => hurt(st, u, RAIN_DMG, null));
  S.rainCd = RAIN_CD;
  st.events.push({ t: 'rain', side, x1, x2 });
  return true;
}

function hurt(st, u, dmg, attacker) {
  const R = ROSTER[u.kind];
  let d = dmg;
  if (R.armor && !(attacker && ROSTER[attacker.kind].magic)) d *= 1 - R.armor;
  u.hp -= d;
  st.events.push({ t: 'hit', id: u.id, dmg: Math.round(d) });
}

function strike(st, u, target) {
  const R = ROSTER[u.kind];
  if (R.heal) {
    const hurtAlly = units(st, u.side).filter(a => a !== u && !ROSTER[a.kind].miner && a.hp < a.maxHp * 0.85 && Math.abs(a.x - u.x) <= R.range)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (hurtAlly) { hurtAlly.hp = Math.min(hurtAlly.maxHp, hurtAlly.hp + R.heal); st.events.push({ t: 'heal', id: hurtAlly.id, by: u.id }); u.cd = R.cd; return; }
  }
  if (!target) return;
  let dmg = R.dmg;
  if (target.base) {
    st.sides[target.side].baseHp -= dmg;
    st.events.push({ t: 'baseHit', side: target.side, by: u.id, ranged: !!R.ranged, magic: !!R.magic });
    u.cd = R.cd;
    return;
  }
  const T = ROSTER[target.kind];
  if (R.vsMounted && T.mounted) dmg *= R.vsMounted;
  if (R.vsRanged && T.ranged) dmg *= R.vsRanged;
  if (R.charge && u.charged) { dmg *= R.charge; u.charged = false; st.events.push({ t: 'charge', id: u.id }); }
  st.events.push({ t: 'attack', id: u.id, to: target.id, ranged: !!R.ranged, magic: !!R.magic, splash: !!R.splash });
  if (R.splash) units(st, foe(u.side)).filter(o => Math.abs(o.x - target.x) <= R.splash).forEach(o => hurt(st, o, dmg, u));
  else hurt(st, target, dmg, u);
  u.cd = R.cd;
}

function targetFor(st, u) {
  const R = ROSTER[u.kind];
  let best = null, bd = Infinity;
  for (const o of st.units) {
    if (o.hp <= 0 || o.side === u.side) continue;
    const d = Math.abs(o.x - u.x);
    if (d < bd) { bd = d; best = o; }
  }
  const bd2 = Math.abs(baseX(foe(u.side)) - u.x);
  if (bd2 <= R.range + 10 && bd2 < bd) return { t: { base: true, side: foe(u.side) }, d: bd2 };
  return best ? { t: best, d: bd } : null;
}

export function step(st, dt = DT) {
  if (st.over) return;
  st.t += dt;
  for (const side of ['player', 'enemy']) {
    const S = st.sides[side];
    S.gold += income(st, side) * dt;
    S.rainCd = Math.max(0, S.rainCd - dt);
    if (S.queue.length) {
      S.train += dt;
      if (S.train >= ROSTER[S.queue[0]].train) { spawn(st, side, S.queue.shift()); S.train = 0; }
    }
  }
  // units
  for (const u of st.units) {
    if (u.hp <= 0) continue;
    const R = ROSTER[u.kind];
    if (R.miner) continue;
    u.cd -= dt;
    const S = st.sides[u.side], dir = dirOf(u.side), home = baseX(u.side);
    u.moving = false;
    if (S.command === 'garrison') {
      const inside = Math.abs(u.x - home) <= 30;
      if (!inside) { u.x -= dir * R.speed * 1.1 * dt; u.moving = true; u.facing = -dir; }
      else { u.hp = Math.min(u.maxHp, u.hp + 6 * dt); u.garrison = true; }
      u.idle += dt;
      continue;
    }
    u.garrison = false;
    u.facing = dir;
    const tg = targetFor(st, u);
    if (tg && tg.d <= R.range) {
      u.idle = 0;
      if (u.cd <= 0) strike(st, u, tg.t);
      continue;
    }
    if (R.heal && u.cd <= 0) strike(st, u, null);
    let goal = S.command === 'attack' ? baseX(foe(u.side)) : lineX(u.side, R.ranged);
    if (S.command === 'defend' && tg && Math.abs(tg.t.x - home) < Math.abs(goal - home) + 40) goal = tg.t.x; // meet raiders past the line
    const delta = goal - u.x;
    if (Math.abs(delta) > 3) {
      u.x += Math.sign(delta) * Math.min(Math.abs(delta), R.speed * dt);
      u.moving = true;
      u.facing = Math.sign(delta) || dir;
      u.idle += dt;
      if (u.idle > 1.2) u.charged = true;
    }
  }
  // turrets
  for (const side of ['player', 'enemy']) {
    const S = st.sides[side];
    S.turretCd -= dt;
    if (S.turretCd > 0) continue;
    const garrisonRanged = units(st, side).filter(u => u.garrison && ROSTER[u.kind].ranged).length;
    const t = units(st, foe(side)).filter(u => Math.abs(u.x - baseX(side)) <= 200).sort((a, b) => Math.abs(a.x - baseX(side)) - Math.abs(b.x - baseX(side)))[0];
    if (t) { hurt(st, t, 9 + 4 * garrisonRanged, null); st.events.push({ t: 'turret', side, to: t.id }); S.turretCd = 1; }
  }
  // deaths and raising
  for (const u of st.units) {
    if (u.hp > 0 || u.dead) continue;
    u.dead = true;
    st.events.push({ t: 'death', id: u.id });
    for (const a of units(st)) {
      const raise = ROSTER[a.kind].raise;
      if (raise && !ROSTER[u.kind].miner && Math.abs(a.x - u.x) <= 160 && st.rng.next() < raise) {
        const s = spawn(st, a.side, 'skeleton');
        s.x = u.x;
        st.events.push({ t: 'raise', id: s.id });
        break;
      }
    }
  }
  st.units = st.units.filter(u => !u.dead || st.t - (u.deadAt ??= st.t) < 1);
  for (const side of ['player', 'enemy']) if (st.sides[side].baseHp <= 0) st.over = foe(side);
  aiThink(st, 'enemy', dt);
}

/* ---------- AI ---------- */
const value = list => list.reduce((s, u) => s + ROSTER[u.kind].cost * (u.hp / u.maxHp), 0);

export function aiThink(st, side, dt = DT) {
  st.aiTimer = (st.aiTimer || 0) + (side === 'enemy' ? dt : 0);
  if (side === 'enemy' && st.aiTimer < 0.5) return;
  if (side === 'enemy') st.aiTimer = 0;
  const S = st.sides[side], other = foe(side);
  const mine = fighters(st, side), theirs = fighters(st, other);
  // economy first, then counters
  const wantMiner = miners(st, side).length + S.queue.filter(k => k === 'miner').length < Math.min(6, 4 + Math.floor(st.t / 90));
  if (wantMiner && S.queue.length < 2) buy(st, side, 'miner');
  const saving = wantMiner && S.gold < ROSTER.miner.cost && !theirs.some(u => Math.abs(u.x - baseX(side)) < 330);
  if (S.queue.length < 3 && !saving) {
    const mounted = theirs.filter(u => ROSTER[u.kind].mounted).length, ranged = theirs.filter(u => ROSTER[u.kind].ranged).length;
    let pick;
    const has = k => S.roster.includes(k);
    if (S.hero && !S.heroBought && S.gold >= ROSTER[S.hero].cost && st.t > 40) pick = S.hero;
    else if (mounted >= 2) pick = has('militia') ? 'militia' : 'skeleton';
    else if (ranged >= 3) pick = has('knight') ? 'knight' : 'ghoul';
    else {
      const affordable = S.roster.filter(k => ROSTER[k].cost <= S.gold);
      pick = affordable.length ? st.rng.pick(affordable) : null;
    }
    if (pick) buy(st, side, pick);
  }
  const mv = value(mine), tv = value(theirs);
  const raid = theirs.some(u => Math.abs(u.x - baseX(side)) < 330);
  const full = mine.length >= POP_CAP - 2;
  if (S.command === 'attack' && mv < tv * 0.5) S.command = 'garrison';
  else if (S.command === 'garrison' && (mine.every(u => u.hp > u.maxHp * 0.8) || !theirs.length)) S.command = 'defend';
  else if (S.command !== 'attack' && raid && mv < tv) S.command = 'defend';
  else if (S.command !== 'garrison' && mine.length >= 6 && (full || mv > tv * 1.15 || (st.t > 240 && mv >= tv * 0.8))) S.command = 'attack';
  if (S.rainCd <= 0 && theirs.filter(u => Math.abs(u.x - baseX(side)) < 500).length >= 4) castRain(st, side);
}
