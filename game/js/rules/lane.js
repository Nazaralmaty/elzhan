// "Стенка на стенку" v4: real-time battle on a field with depth (x along the lane, z across it).
// Gunpowder kingdom vs Morven's undead or the red kingdom. Miners carry gold, an upgrade tree, per-branch
// commands (infantry / shooters / cavalry / artillery), cavalry flanking, cannons with splash.
import { makeRng } from '../core/rng.js';

export const FIELD = 1400, ZW = 130, DT = 0.05, BASE_HP = 1200, POP_CAP = 30, BARRAGE_CD = 45;
export const BASE_FRONT = 70;
export const GROUPS = { inf: 'Пехота', rng: 'Стрелки', cav: 'Конница', art: 'Пушки' };
export const COMMANDS = { attack: 'В атаку', hold: 'Держать линию', retreat: 'Отход', flank: 'Обход' };

export const ROSTER = {
  miner:       { name: 'Рудокоп',       cost: 50,  train: 3,   hp: 40,  speed: 26, miner: true },
  pikeman:     { name: 'Пикинёр',       cost: 40,  train: 3,   hp: 75,  dmg: 8,  cd: 1.1, range: 34,  speed: 22, group: 'inf', vsMounted: 2.6, armor: 0.1, desc: 'Дешёвая стена из пик, рвёт конницу' },
  musketeer:   { name: 'Мушкетёр',      cost: 70,  train: 4,   hp: 50,  dmg: 24, cd: 4,   range: 260, speed: 21, group: 'rng', gun: true, desc: 'Медленная перезарядка, сильный выстрел' },
  cossack:     { name: 'Казак',         cost: 90,  train: 4.5, hp: 95,  dmg: 11, cd: 1,   range: 30,  speed: 52, group: 'cav', mounted: true, vsRanged: 1.7, armor: 0.1, desc: 'Быстрый, режет стрелков и пушки' },
  cuirassier:  { name: 'Кирасир',       cost: 160, train: 6,   hp: 190, dmg: 17, cd: 1.2, range: 32,  speed: 40, group: 'cav', mounted: true, charge: 2.2, armor: 0.3, needs: 'horses', desc: 'Тяжёлая конница, первый удар ×2.2' },
  cannon:      { name: 'Пушка',         cost: 200, train: 8,   hp: 140, dmg: 46, cd: 7,   range: 430, minRange: 70, speed: 13, group: 'art', splash: 46, vsBase: 3, needs: 'foundry', desc: 'Ядро бьёт по площади, ломает стены' },
  skeleton:    { name: 'Скелет',        cost: 40,  train: 2.5, hp: 60,  dmg: 8,  cd: 1,   range: 30,  speed: 22, group: 'inf', desc: 'Дешёвая пехота' },
  ghoul:       { name: 'Гуль',          cost: 75,  train: 3.5, hp: 85,  dmg: 12, cd: 0.85, range: 28, speed: 46, group: 'cav', vsRanged: 1.8, desc: 'Быстрый, охотится на стрелков' },
  acolyte:     { name: 'Послушник',     cost: 90,  train: 4,   hp: 50,  dmg: 10, cd: 2.5, range: 210, speed: 20, group: 'rng', magic: true, raise: 0.08, desc: 'Магия сквозь броню, поднимает павших' },
  deathknight: { name: 'Рыцарь смерти', cost: 170, train: 6,   hp: 210, dmg: 18, cd: 1.2, range: 32,  speed: 38, group: 'cav', mounted: true, charge: 2.2, armor: 0.3, needs: 'horses', desc: 'Тяжёлый всадник, первый удар ×2.2' },
  bonecaster:  { name: 'Костомёт',      cost: 200, train: 8,   hp: 150, dmg: 40, cd: 7,   range: 410, minRange: 70, speed: 12, group: 'art', splash: 46, vsBase: 3, needs: 'foundry', desc: 'Метает кости по площади' },
  alden:       { name: 'Сэр Альден',    cost: 260, train: 6,   hp: 480, dmg: 24, cd: 1,   range: 32,  speed: 24, group: 'inf', armor: 0.3, hero: true, desc: 'Герой: стойкий рыцарь' },
  irena:       { name: 'Ирена',         cost: 260, train: 6,   hp: 260, dmg: 30, cd: 2.6, range: 260, speed: 22, group: 'rng', magic: true, splash: 55, hero: true, desc: 'Герой: огненный шар по площади' },
  corvin:      { name: 'Корвин',        cost: 260, train: 6,   hp: 300, dmg: 34, cd: 1.8, range: 330, speed: 26, group: 'rng', gun: true, hero: true, desc: 'Герой: меткий стрелок' }
};
export const ROSTERS = {
  human: ['pikeman', 'musketeer', 'cossack', 'cuirassier', 'cannon'],
  undead: ['skeleton', 'ghoul', 'acolyte', 'deathknight', 'bonecaster']
};

// Upgrade tree: each level costs gold and research time, one research at a time.
export const UPGRADES = {
  picks:    { name: 'Стальные кирки', icon: '⛏', desc: 'Рудокопы копают на 35% быстрее', levels: [[120, 18], [220, 26], [360, 34]] },
  carts:    { name: 'Тачки',          icon: '🛒', desc: 'Рудокоп несёт +50% золота', levels: [[160, 22], [300, 32]] },
  vein:     { name: 'Новая жила',     icon: '⛰', desc: '+4 места для рудокопов', levels: [[220, 28]] },
  treasury: { name: 'Казначейство',   icon: '💰', desc: 'Казна приносит +1 золото/с', levels: [[180, 26], [320, 36]] },
  drill:    { name: 'Муштра',         icon: '🥁', desc: 'Найм на 20% быстрее, очередь +2', levels: [[150, 22], [280, 32]] },
  forge:    { name: 'Кузня',          icon: '⚒', desc: 'Урон в ближнем бою +15%', levels: [[150, 22], [260, 30], [400, 38]] },
  armor:    { name: 'Латы',           icon: '🛡', desc: 'Броня всех бойцов +7%', levels: [[150, 22], [260, 30], [400, 38]] },
  powder:   { name: 'Порох',          icon: '💥', desc: 'Стрелки и пушки: урон +20%, перезарядка −10%', levels: [[180, 24], [320, 34]] },
  horses:   { name: 'Конный завод',   icon: '🐎', desc: 'Открывает тяжёлую конницу; 2 ур.: конница +20% здоровья', levels: [[200, 26], [300, 32]] },
  foundry:  { name: 'Литейня',        icon: '🔥', desc: 'Открывает пушки; 2 ур.: ядра +30% площадь и +15% урон', levels: [[260, 32], [320, 34]] },
  walls:    { name: 'Бастионы',       icon: '🏰', desc: 'Крепость +500 прочности, её пушки +50%', levels: [[200, 26], [340, 36]] }
};
const MAX_QUEUE = 5, START_GOLD = 260, INCOME = 2, CARRY = 10, MINE_TIME = 4.2, MINERS = 6;

const dirOf = side => side === 'player' ? 1 : -1;
export const foe = side => side === 'player' ? 'enemy' : 'player';
export const baseX = side => side === 'player' ? 0 : FIELD;
export const mineAt = side => ({ x: side === 'player' ? 150 : FIELD - 150, z: -100 });
export const dropAt = side => ({ x: side === 'player' ? 55 : FIELD - 55, z: -40 });
const fromBase = (side, d) => side === 'player' ? d : FIELD - d;
const DEFAULT_LINE = { inf: 360, rng: 300, cav: 250, art: 210 };

function makeSide(roster, hero, incomeMult) {
  return {
    gold: START_GOLD, baseHp: BASE_HP, baseMax: BASE_HP, queue: [], train: 0, roster, hero, heroBought: false, incomeMult,
    cmd: { inf: 'hold', rng: 'hold', cav: 'hold', art: 'hold' }, line: { ...DEFAULT_LINE },
    up: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])), research: null,
    barrageCd: 15, turretCd: 0, mined: 0, kills: 0, losses: 0
  };
}

export function createLane({ player = 'human', enemy = 'undead', hero = null, enemyHero = null, seed = 1, enemyIncome = 1 } = {}) {
  const st = {
    t: 0, over: null, units: [], shots: [], nextId: 1, events: [], rng: makeRng(seed),
    sides: { player: makeSide(ROSTERS[player], hero, 1), enemy: makeSide(ROSTERS[enemy], enemyHero, enemyIncome) },
    faction: { player, enemy }, aiTimer: { player: 0, enemy: 0 }, slotTimer: 0
  };
  for (const side of ['player', 'enemy']) for (let i = 0; i < 2; i++) spawn(st, side, 'miner');
  return st;
}

export const alive = (st, side) => st.units.filter(u => u.hp > 0 && (!side || u.side === side));
export const miners = (st, side) => alive(st, side).filter(u => ROSTER[u.kind].miner);
export const fighters = (st, side) => alive(st, side).filter(u => !ROSTER[u.kind].miner);
export const maxMiners = S => MINERS + 4 * S.up.vein;
export const maxQueue = S => MAX_QUEUE + 2 * S.up.drill;
export const income = (st, side) => (INCOME + st.sides[side].up.treasury) * st.sides[side].incomeMult;
export const carryOf = S => Math.round(CARRY * (1 + 0.5 * S.up.carts));
export const mineTime = S => MINE_TIME / (1 + 0.35 * S.up.picks);
export const trainTime = (S, kind) => ROSTER[kind].train * (1 - 0.2 * S.up.drill);
export const unlocked = (S, kind) => !ROSTER[kind].needs || S.up[ROSTER[kind].needs] > 0;
// estimated gold per second: passive + miners (trip = walk there and back + digging)
export function goldRate(st, side) {
  const S = st.sides[side], m = mineAt(side), d = dropAt(side);
  const trip = 2 * Math.hypot(m.x - d.x, m.z - d.z) / ROSTER.miner.speed + mineTime(S);
  return income(st, side) + miners(st, side).length * carryOf(S) * S.incomeMult / trip;
}

export function canBuy(st, side, kind) {
  const S = st.sides[side], R = ROSTER[kind];
  if (!R || st.over) return 'Бой окончен';
  if (kind !== 'miner' && !S.roster.includes(kind) && kind !== S.hero) return 'Недоступно';
  if (!unlocked(S, kind)) return `Нужно улучшение «${UPGRADES[R.needs].name}»`;
  if (kind === S.hero && (S.heroBought || S.queue.includes(kind))) return 'Герой уже в бою';
  if (kind === 'miner' && miners(st, side).length + S.queue.filter(k => k === 'miner').length >= maxMiners(S)) return 'Рудник полон';
  if (S.queue.length >= maxQueue(S)) return 'Очередь полна';
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

export function upgradeCost(S, key) {
  const lv = UPGRADES[key].levels[S.up[key]];
  return lv ? { gold: lv[0], time: lv[1] } : null;
}

export function canResearch(st, side, key) {
  const S = st.sides[side], c = UPGRADES[key] && upgradeCost(S, key);
  if (st.over) return 'Бой окончен';
  if (!c) return 'Изучено полностью';
  if (S.research) return 'Уже идёт исследование';
  if (S.gold < c.gold) return 'Мало золота';
  return '';
}

export function research(st, side, key) {
  if (canResearch(st, side, key)) return false;
  const S = st.sides[side], c = upgradeCost(S, key);
  S.gold -= c.gold;
  S.research = { key, t: 0, T: c.time };
  return true;
}

export function setCommand(st, side, group, cmd) {
  const S = st.sides[side];
  if (!COMMANDS[cmd] || (cmd === 'flank' && group !== 'cav')) return false;
  for (const g of group === 'all' ? Object.keys(GROUPS) : [group]) S.cmd[g] = cmd === 'flank' && g !== 'cav' ? 'attack' : cmd;
  return true;
}

// x in field coordinates; the line is kept between the own fortress and the middle of the field
export function setLine(st, side, group, x) {
  const S = st.sides[side], d = side === 'player' ? x : FIELD - x;
  for (const g of group === 'all' ? Object.keys(GROUPS) : [group]) {
    S.line[g] = Math.max(140, Math.min(FIELD * 0.62, d - (group === 'all' ? DEFAULT_LINE.inf - DEFAULT_LINE[g] : 0)));
    S.cmd[g] = 'hold';
  }
}

function maxHpOf(S, kind) {
  const R = ROSTER[kind];
  return Math.round(R.hp * (R.mounted && S.up.horses >= 2 ? 1.2 : 1));
}

function spawn(st, side, kind) {
  const R = ROSTER[kind], S = st.sides[side];
  const x = fromBase(side, R.miner ? 60 : 80 + st.rng.next() * 20), z = R.miner ? -50 + st.rng.next() * 20 : -40 + st.rng.next() * 80;
  const hp = maxHpOf(S, kind);
  const u = { id: st.nextId++, kind, side, x, z, hp, maxHp: hp, cd: 0, facing: dirOf(side) > 0 ? 0 : Math.PI, moving: false, charged: true, idle: 0, slotZ: z, rank: 0, carry: 0, work: 0, state: R.miner ? 'toMine' : 'fight' };
  st.units.push(u);
  st.events.push({ t: 'spawn', id: u.id });
  return u;
}

/* ---------- combat ---------- */
function armorOf(S, R) { return Math.min(0.75, (R.armor || 0) + 0.07 * S.up.armor); }

function hurt(st, u, dmg, attacker) {
  const R = ROSTER[u.kind], S = st.sides[u.side];
  let d = dmg;
  if (!(attacker && (attacker.magic || ROSTER[attacker.kind]?.magic))) d *= 1 - armorOf(S, R);
  u.hp -= d;
  if (attacker) u.lastHitBy = attacker.side;
  st.events.push({ t: 'hit', id: u.id, dmg: Math.round(d) });
}

function damageOf(st, u, target) {
  const R = ROSTER[u.kind], S = st.sides[u.side];
  let dmg = R.dmg;
  const ranged = R.gun || R.magic || R.splash;
  dmg *= ranged ? 1 + 0.2 * S.up.powder : 1 + 0.15 * S.up.forge;
  if (R.splash && !R.hero && S.up.foundry >= 2) dmg *= 1.15;
  if (target && !target.base) {
    const T = ROSTER[target.kind];
    if (R.vsMounted && T.mounted) dmg *= R.vsMounted;
    if (R.vsRanged && (T.group === 'rng' || T.group === 'art')) dmg *= R.vsRanged;
  }
  return dmg;
}

function cooldownOf(S, R) { return R.cd * (R.gun || R.magic || R.splash ? 1 - 0.1 * S.up.powder : 1); }

function strike(st, u, target, dist) {
  const R = ROSTER[u.kind], S = st.sides[u.side];
  u.cd = cooldownOf(S, R) * (0.9 + st.rng.next() * 0.2);
  u.facing = Math.atan2(-(target.z - u.z), target.x - u.x);
  u.fired = st.t;
  if (R.splash) {
    // projectile: lands after a flight, scatter grows with distance
    const spread = R.hero ? 6 : 10 + dist * 0.05;
    const tx = target.x + (st.rng.next() - 0.5) * spread * 2, tz = target.z + (st.rng.next() - 0.5) * spread * 2;
    const T = R.hero ? dist / 380 : 0.45 + dist / 340;
    st.shots.push({ id: st.nextId++, from: u.id, side: u.side, kind: u.kind, x0: u.x, z0: u.z, x: tx, z: tz, t: 0, T, dmg: damageOf(st, u, null), r: R.splash * (!R.hero && S.up.foundry >= 2 ? 1.3 : 1), vsBase: R.vsBase || 1, magic: !!R.magic });
    st.events.push({ t: 'shoot', id: u.id, kind: u.kind, x: tx, z: tz, T });
    return;
  }
  if (target.base) {
    st.sides[target.side].baseHp -= damageOf(st, u, target) * (R.vsBase || 1) * (R.gun || R.magic ? 0.6 : 0.5);
    st.events.push({ t: 'baseHit', side: target.side, by: u.id, ranged: !!(R.gun || R.magic), magic: !!R.magic });
    return;
  }
  if (R.gun) {
    const hit = st.rng.next() < 0.93 - 0.45 * Math.min(1, dist / R.range);
    st.events.push({ t: 'fire', id: u.id, to: target.id, hit });
    if (hit) hurt(st, target, damageOf(st, u, target), u);
    return;
  }
  let dmg = damageOf(st, u, target);
  if (R.charge && u.charged) { dmg *= R.charge; st.events.push({ t: 'charge', id: u.id }); }
  u.charged = false;
  st.events.push({ t: R.magic ? 'bolt' : 'melee', id: u.id, to: target.id });
  hurt(st, target, dmg, u);
}

function landShot(st, s) {
  const enemies = alive(st, foe(s.side));
  st.events.push({ t: 'boom', x: s.x, z: s.z, r: s.r, kind: s.kind, magic: s.magic });
  for (const o of enemies) {
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d <= s.r) hurt(st, o, s.dmg * (1 - 0.5 * d / s.r), { kind: s.kind, side: s.side, magic: s.magic });
  }
  const bx = baseX(foe(s.side));
  if (Math.abs(s.x - bx) < BASE_FRONT + s.r * 0.5 && Math.abs(s.z) < 90) {
    st.sides[foe(s.side)].baseHp -= s.dmg * s.vsBase * 0.6;
    st.events.push({ t: 'baseHit', side: foe(s.side), ranged: true });
  }
}

// Hits that enemies within reach and line take: closest first, flanking cavalry prefers shooters and guns.
function pickTarget(st, u, reach) {
  const R = ROSTER[u.kind], S = st.sides[u.side], hunt = S.cmd.cav === 'flank' && R.group === 'cav' || R.vsRanged;
  let best = null, bs = Infinity;
  for (const o of st.units) {
    if (o.hp <= 0 || o.side === u.side || o.state === 'garrison') continue;
    const d = Math.hypot(o.x - u.x, o.z - u.z);
    if (d > reach) continue;
    const O = ROSTER[o.kind];
    let score = d;
    if (hunt && (O.group === 'rng' || O.group === 'art')) score -= 120;
    if (R.minRange && d < R.minRange) continue;
    if (score < bs) { bs = score; best = o; }
  }
  return best;
}

function baseTarget(st, u) {
  const bx = baseX(foe(u.side)), d = Math.max(0, Math.abs(u.x - bx) - BASE_FRONT) + Math.max(0, Math.abs(u.z) - 80) * 0.5;
  return { base: true, side: foe(u.side), x: bx - dirOf(u.side) * BASE_FRONT, z: Math.max(-60, Math.min(60, u.z)), d };
}

function moveToward(st, u, tx, tz, speedMul = 1) {
  const R = ROSTER[u.kind], dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
  if (d < 2) return false;
  const v = R.speed * speedMul * DT;
  const k = Math.min(1, v / d);
  u.x += dx * k; u.z += dz * k;
  u.facing = Math.atan2(-dz, dx);
  u.moving = true;
  return true;
}

function separate(st) {
  const list = st.units.filter(u => u.hp > 0 && u.state !== 'garrison' && u.state !== 'inMine');
  for (let i = 0; i < list.length; i++) {
    const a = list[i], ra = ROSTER[a.kind].mounted || ROSTER[a.kind].group === 'art' ? 13 : 9;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], rb = ROSTER[b.kind].mounted || ROSTER[b.kind].group === 'art' ? 13 : 9;
      const dx = b.x - a.x, dz = b.z - a.z, min = ra + rb;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d >= min) continue;
      const push = (min - d) * 0.25, nx = dx / d, nz = dz / d;
      const wa = ROSTER[a.kind].miner ? 0.2 : 1, wb = ROSTER[b.kind].miner ? 0.2 : 1;
      a.x -= nx * push * wb; a.z -= nz * push * wb; b.x += nx * push * wa; b.z += nz * push * wa;
    }
  }
  for (const u of list) { u.z = Math.max(-ZW, Math.min(ZW, u.z)); u.x = Math.max(10, Math.min(FIELD - 10, u.x)); }
}

// Spread each branch into ranks across the depth of the field.
function assignSlots(st) {
  for (const side of ['player', 'enemy']) for (const g of Object.keys(GROUPS)) {
    const list = fighters(st, side).filter(u => ROSTER[u.kind].group === g).sort((a, b) => a.z - b.z || a.id - b.id);
    const perRank = g === 'cav' ? 8 : g === 'art' ? 6 : 11;
    list.forEach((u, i) => {
      const rank = Math.floor(i / perRank), inRank = Math.min(perRank, list.length - rank * perRank), k = i % perRank;
      const gap = g === 'cav' || g === 'art' ? 28 : 21;
      u.slotZ = (k - (inRank - 1) / 2) * gap + (rank % 2 ? gap / 2 : 0);
      u.rank = rank;
    });
  }
}

function stepMiner(st, u) {
  const S = st.sides[u.side], m = mineAt(u.side), d = dropAt(u.side);
  const threat = alive(st, foe(u.side)).some(o => !ROSTER[o.kind].miner && Math.hypot(o.x - u.x, o.z - u.z) < 90);
  if (threat && u.state !== 'inMine') { u.state = 'flee'; }
  if (u.state === 'flee') {
    if (!moveToward(st, u, fromBase(u.side, 25), -20, 1.2)) { u.hidden = true; if (!threat) { u.state = 'toMine'; u.hidden = false; } }
    return;
  }
  if (u.state === 'toMine') {
    if (!moveToward(st, u, m.x + (u.id % 5 - 2) * 8, m.z + 18)) { u.state = 'dig'; u.work = 0; }
  } else if (u.state === 'dig') {
    u.work += DT;
    u.digging = true;
    if (u.work >= mineTime(S)) { u.carry = carryOf(S); u.state = 'toBase'; u.digging = false; }
  } else if (u.state === 'toBase') {
    if (!moveToward(st, u, d.x, d.z + (u.id % 3 - 1) * 8)) {
      const g = u.carry * S.incomeMult;
      S.gold += g; S.mined += g; u.carry = 0; u.state = 'toMine';
      st.events.push({ t: 'gold', id: u.id, side: u.side, n: Math.round(g) });
    }
  }
}

function stepFighter(st, u) {
  const R = ROSTER[u.kind], S = st.sides[u.side], g = R.group, cmd = S.cmd[g], dir = dirOf(u.side);
  u.cd -= DT;
  if (cmd === 'retreat') {
    const gx = fromBase(u.side, 30), gz = Math.max(-50, Math.min(50, u.slotZ * 0.4));
    if (u.state === 'garrison' || !moveToward(st, u, gx, gz, 1.1)) {
      u.state = 'garrison';
      u.hp = Math.min(u.maxHp, u.hp + 7 * DT);
    }
    u.idle += DT;
    if (u.idle > 1.5) u.charged = true;
    return;
  }
  u.state = 'fight';
  const lineX = fromBase(u.side, S.line[g] - u.rank * (g === 'cav' ? 26 : 20));
  const aggro = cmd === 'hold' ? R.range + 110 : cmd === 'flank' ? 200 : Math.max(260, R.range + 60);
  let target = pickTarget(st, u, Math.max(aggro, R.range + 12));
  // holding troops don't chase far past their line
  if (target && cmd === 'hold' && (target.x - lineX) * dir > 160 + R.range) target = null;
  const bt = baseTarget(st, u);
  let dist = target ? Math.hypot(target.x - u.x, target.z - u.z) : Infinity;
  if (bt.d < dist && (cmd !== 'hold' || bt.d <= R.range)) { target = bt; dist = bt.d; }
  const reach = R.range + (target && !target.base && ROSTER[target.kind].mounted ? 6 : 0);
  if (target && dist <= reach && !(R.minRange && !target.base && dist < R.minRange)) {
    u.moving = false;
    u.idle = 0;
    u.facing = Math.atan2(-(target.z - u.z), target.x - u.x);
    if (u.cd <= 0) strike(st, u, target, dist);
    return;
  }
  u.moving = false;
  if (target && !target.base) {
    if (R.minRange && dist < R.minRange) moveToward(st, u, u.x - dir * 30, u.z);
    else moveToward(st, u, target.x, target.z);
  } else if (cmd === 'hold') {
    moveToward(st, u, lineX, u.slotZ, 0.8);
  } else if (cmd === 'flank') {
    // ride along the edge of the field past the enemy line, then turn into their rear
    const edge = (u.slotZ >= 0 ? 1 : -1) * (ZW - 15), behind = enemyRearX(st, u.side);
    if ((behind - u.x) * dir > 40) moveToward(st, u, behind, edge);
    else moveToward(st, u, bt.x, bt.z);
  } else {
    moveToward(st, u, bt.x - dir * u.rank * 18, bt.z * 0.3 + u.slotZ * 0.7);
  }
  if (u.moving) { u.idle += DT; if (u.idle > 1.5) u.charged = true; }
}

function enemyRearX(st, side) {
  const xs = fighters(st, foe(side)).filter(o => ['rng', 'art'].includes(ROSTER[o.kind].group)).map(o => o.x);
  const dir = dirOf(side);
  if (!xs.length) return baseX(foe(side)) - dir * 260;
  return dir > 0 ? Math.max(...xs) + 40 : Math.min(...xs) - 40;
}

// Fortress guns and the barrage ability.
export function castBarrage(st, side) {
  const S = st.sides[side];
  if (S.barrageCd > 0 || st.over) return false;
  const foes = fighters(st, foe(side)).filter(o => o.state !== 'garrison');
  if (!foes.length) return false;
  // aim at the densest enemy cluster
  let best = foes[0], bn = -1;
  for (const a of foes) { const n = foes.filter(b => Math.hypot(a.x - b.x, a.z - b.z) < 70).length; if (n > bn) { bn = n; best = a; } }
  for (let i = 0; i < 7; i++) {
    const tx = best.x + (st.rng.next() - 0.5) * 120, tz = best.z + (st.rng.next() - 0.5) * 120;
    const x0 = fromBase(side, 20);
    st.shots.push({ id: st.nextId++, side, kind: 'barrage', x0, z0: 0, x: tx, z: tz, t: -i * 0.18, T: 0.6 + Math.abs(tx - x0) / 600, dmg: 34, r: 40, vsBase: 1, magic: false });
  }
  S.barrageCd = BARRAGE_CD;
  st.events.push({ t: 'barrage', side, x: best.x, z: best.z });
  return true;
}

export function step(st, dt = DT) {
  if (st.over) return;
  st.t += dt;
  for (const side of ['player', 'enemy']) {
    const S = st.sides[side];
    S.gold += income(st, side) * dt;
    S.barrageCd = Math.max(0, S.barrageCd - dt);
    if (S.queue.length) {
      S.train += dt;
      if (S.train >= trainTime(S, S.queue[0])) { spawn(st, side, S.queue.shift()); S.train = 0; }
    }
    if (S.research) {
      S.research.t += dt;
      if (S.research.t >= S.research.T) {
        const key = S.research.key;
        S.up[key]++;
        S.research = null;
        if (key === 'walls') { S.baseMax += 500; S.baseHp += 500; }
        if (key === 'horses' && S.up.horses === 2) fighters(st, side).filter(u => ROSTER[u.kind].mounted).forEach(u => { u.maxHp = Math.round(u.maxHp * 1.2); u.hp = Math.round(u.hp * 1.2); });
        st.events.push({ t: 'upgrade', side, key, level: S.up[key] });
      }
    }
  }
  st.slotTimer -= dt;
  if (st.slotTimer <= 0) { assignSlots(st); st.slotTimer = 1; }
  for (const u of st.units) {
    if (u.hp <= 0) continue;
    u.moving = false;
    if (ROSTER[u.kind].miner) stepMiner(st, u); else stepFighter(st, u);
  }
  separate(st);
  // projectiles
  for (const s of st.shots) { s.t += dt; if (s.t >= s.T && !s.done) { s.done = true; landShot(st, s); } }
  st.shots = st.shots.filter(s => !s.done);
  // fortress guns, stronger with bastions and garrisoned shooters
  for (const side of ['player', 'enemy']) {
    const S = st.sides[side];
    S.turretCd -= dt;
    if (S.turretCd > 0) continue;
    const bx = baseX(side);
    const t = alive(st, foe(side)).filter(u => Math.abs(u.x - bx) <= 300).sort((a, b) => Math.abs(a.x - bx) - Math.abs(b.x - bx))[0];
    if (!t) continue;
    const garrison = fighters(st, side).filter(u => u.state === 'garrison' && ['rng', 'art'].includes(ROSTER[u.kind].group)).length;
    hurt(st, t, (15 + 5 * garrison) * (1 + 0.5 * S.up.walls), null);
    st.events.push({ t: 'turret', side, to: t.id });
    S.turretCd = 1.5;
  }
  // deaths and raising
  for (const u of st.units) {
    if (u.hp > 0 || u.dead) continue;
    u.dead = true; u.deadAt = st.t;
    st.sides[u.side].losses++;
    if (u.lastHitBy) st.sides[u.lastHitBy].kills++;
    st.events.push({ t: 'death', id: u.id });
    if (ROSTER[u.kind].miner) continue;
    for (const a of alive(st)) {
      const raise = ROSTER[a.kind].raise;
      if (raise && Math.hypot(a.x - u.x, a.z - u.z) <= 220 && st.rng.next() < raise && fighters(st, a.side).length < POP_CAP) {
        const s = spawn(st, a.side, 'skeleton');
        s.x = u.x; s.z = u.z;
        st.events.push({ t: 'raise', id: s.id });
        break;
      }
    }
  }
  st.units = st.units.filter(u => !u.dead || st.t - u.deadAt < 8);
  for (const side of ['player', 'enemy']) if (st.sides[side].baseHp <= 0) st.over = foe(side);
}

/* ---------- AI ---------- */
const value = list => list.reduce((s, u) => s + ROSTER[u.kind].cost * (u.hp / u.maxHp), 0);
const RESEARCH_PLAN = ['picks', 'treasury', 'horses', 'forge', 'carts', 'armor', 'foundry', 'powder', 'drill', 'picks', 'vein', 'walls', 'forge', 'armor', 'treasury', 'powder', 'horses', 'carts', 'foundry', 'drill', 'picks', 'forge', 'armor', 'walls'];

export function aiThink(st, side, dt = DT) {
  st.aiTimer[side] += dt;
  if (st.aiTimer[side] < 0.5) return;
  st.aiTimer[side] = 0;
  const S = st.sides[side], other = foe(side);
  const mine = fighters(st, side), theirs = fighters(st, other);
  const near = theirs.filter(u => Math.abs(u.x - baseX(side)) < 520);
  const has = k => S.roster.includes(k) && unlocked(S, k);
  // economy: miners up to the cap, then research when calm
  const minerGoal = Math.min(maxMiners(S), 3 + Math.floor(st.t / 35));
  const minerCount = miners(st, side).length + S.queue.filter(k => k === 'miner').length;
  if (minerCount < minerGoal && S.queue.length < 2 && near.length < 3) buy(st, side, 'miner');
  const mvNow = value(mine), tvNow = value(theirs);
  let wantResearch = false;
  if (!S.research) {
    const key = RESEARCH_PLAN.find(k => upgradeCost(S, k) && !(k === 'vein' && minerCount < maxMiners(S)));
    const c = key && upgradeCost(S, key);
    // research when the army is not outmatched; otherwise keep buying soldiers
    wantResearch = !!c && near.length < 3 && mvNow >= tvNow * 0.7 && mine.length >= Math.min(6, 2 + st.t / 30);
    if (c && S.gold >= c.gold && (wantResearch || S.gold > c.gold + 300)) { research(st, side, key); wantResearch = false; }
  }
  const saving = (minerCount < minerGoal && S.gold < ROSTER.miner.cost || wantResearch) && near.length < 2;
  if (S.queue.length < 3 && !saving) {
    const count = f => theirs.filter(f).length;
    const mounted = count(u => ROSTER[u.kind].mounted), ranged = count(u => ['rng', 'art'].includes(ROSTER[u.kind].group));
    const by = g => S.roster.filter(k => ROSTER[k].group === g && has(k));
    let pick = null;
    if (S.hero && !S.heroBought && S.gold >= ROSTER[S.hero].cost && st.t > 120) pick = S.hero;
    else if (mounted >= 3 && mine.filter(u => ROSTER[u.kind].vsMounted).length < mounted * 1.5 && by('inf').some(k => ROSTER[k].vsMounted)) pick = by('inf').find(k => ROSTER[k].vsMounted);
    else if (ranged >= 4 && by('cav').length) pick = st.rng.pick(by('cav'));
    else {
      const mix = { inf: 0.38, rng: 0.32, cav: 0.18, art: 0.12 };
      const have = g => mine.filter(u => ROSTER[u.kind].group === g).length / Math.max(1, mine.length);
      const g = Object.keys(mix).filter(g => by(g).length).sort((a, b) => (have(a) - mix[a]) - (have(b) - mix[b]))[0];
      const opts = g ? by(g).filter(k => ROSTER[k].cost <= S.gold) : [];
      pick = opts.length ? opts[opts.length - 1] : null;
      if (!pick && g && S.gold > 150) pick = by(g)[0];
    }
    if (pick) buy(st, side, pick);
  }
  // army orders
  const mv = mvNow, tv = tvNow;
  const attacking = S.cmd.inf === 'attack';
  if (attacking && mv < tv * 0.45) setCommand(st, side, 'all', 'retreat');
  if (S.cmd.inf === 'attack') { /* keep going */ }
  else if (S.cmd.inf === 'retreat' && (mine.every(u => u.hp > u.maxHp * 0.75) || !theirs.length)) setCommand(st, side, 'all', 'hold');
  // a full army that waits too long attacks anyway, so mirror matches don't stall
  S.fullT = mine.length >= POP_CAP - 4 && !attacking ? (S.fullT || 0) + 0.5 : 0;
  if (!attacking && S.cmd.inf !== 'retreat' && mine.length >= 8 && (S.fullT > 45 || mv > tv * 1.3 + 150 || (st.t > 420 && mv >= tv * 0.9) || (st.t > 720 && mv >= tv * 0.7))) {
    setCommand(st, side, 'all', 'attack');
    if (theirs.filter(u => ['rng', 'art'].includes(ROSTER[u.kind].group)).length >= 3) setCommand(st, side, 'cav', 'flank');
  }
  if (S.barrageCd <= 0 && near.length >= 5) castBarrage(st, side);
}
