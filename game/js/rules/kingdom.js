// Kingdom sandbox: new game, armies, battles against monsters, end of turn. Pure over K.
import { key, dist } from '../core/hex.js';
import { makeRng } from '../core/rng.js';
import { UNITS } from '../data/units.js';
import { MAP_SIZES, RECRUIT, TERRAIN, RES_NAME } from '../data/buildings.js';
const resText = o => Object.entries(o).map(([r, v]) => `+${v} ${RES_NAME[r].toLowerCase()}`).join(', ');
import { generateMap, reveal, armyAt, armyReach, reachPath, pathfind, passableMap, moveCost, ring } from './map.js';
import { foundCity, economyTurn, makeMapUnit, cityAt, autoAssign } from './economy.js';
import { createBattle, endTurn as skirmishTurn, living } from './skirmish.js';
import { aiTurn } from '../ai/skirmish-ai.js';

export const SAVE_KEY = 'aos.kingdom.save';
export const mapMove = u => UNITS[u.kind].mounted ? 3 : 2;
export const armyMove = a => a.units.length ? Math.min(...a.units.map(mapMove)) : 0;
const HEROES = ['alden', 'irena', 'corvin'];

const LAIR_UNITS = {
  undead:  [['skeleton', 'skeleton'], ['skeleton', 'skeleton', 'ghoul'], ['skeleton', 'ghoul', 'acolyte', 'skeleton'], ['deathknight', 'skeleton', 'ghoul', 'acolyte', 'skeleton']],
  bandits: [['militia', 'archer'], ['militia', 'militia', 'archer'], ['swordsman', 'militia', 'archer', 'archer'], ['knight', 'swordsman', 'archer', 'militia', 'apprentice']]
};
export const FACTION_NAME = { undead: 'Нежить', bandits: 'Разбойники' };

function monsterArmy(K, faction, tier, r, c, kind) {
  const units = LAIR_UNITS[faction][tier - 1].map(k => makeMapUnit(K, k));
  const a = { id: K.nextId++, owner: 'monster', faction, kind, tier, r, c, units, mp: 2, moved: false };
  if (kind === 'lair') a.reward = { gold: 10 + tier * 8, [['wood', 'stone', 'iron'][tier % 3]]: tier * 5 };
  return a;
}

export function newKingdom({ seed = 1, size = 'medium', hardcore = false } = {}) {
  const S = MAP_SIZES[size], g = generateMap(seed, size), rng = makeRng(seed * 31 + 7);
  const K = {
    version: 1, seed, size, w: S.w, h: S.h, tiles: g.tiles, turn: 1, hardcore,
    cities: [], buildings: {}, armies: [], wounded: [],
    res: { food: 20, wood: 15, stone: 5, gold: 10, iron: 0, mana: 0 },
    explored: {}, nextId: 1, unrest: 0, short: [], heroPool: [], heroesOwned: [], ruins: {},
    status: 'playing', lairsTotal: 0, stats: { lairs: 0, battles: 0, captured: 0, razed: 0 }
  };
  const cap = foundCity(K, g.capital[0], g.capital[1], true);
  const farmAt = ring(K, cap.r, cap.c, 1).find(([r, c]) => K.tiles[r][c] === 'grass' && !(r === cap.r && c === cap.c));
  if (farmAt) K.buildings[key(...farmAt)] = { type: 'farm', level: 1, workers: 0, city: cap.id };
  const start = rng.pick(HEROES);
  K.heroesOwned.push(start);
  K.heroPool.push(rng.pick(HEROES.filter(h => h !== start)));
  K.armies.push({ id: K.nextId++, owner: 'player', r: cap.r, c: cap.c, units: [makeMapUnit(K, start), makeMapUnit(K, 'militia'), makeMapUnit(K, 'militia')], mp: 2, moved: false });
  autoAssign(K, cap);
  // ruins loot and lairs
  const spots = [];
  K.tiles.forEach((row, r) => row.forEach((t, c) => {
    if (t === 'ruins') K.ruins[key(r, c)] = { loot: rng.pick([{ gold: 25 }, { mana: 15 }, { wood: 15, stone: 15 }, { iron: 12 }]) };
    if (passableMap(K, r, c) && t !== 'village' && dist([r, c], g.capital) >= 5) spots.push([r, c]);
  }));
  const ruinsSpots = spots.filter(([r, c]) => K.tiles[r][c] === 'ruins');
  const order = [...rng.shuffle(ruinsSpots), ...rng.shuffle(spots.filter(([r, c]) => K.tiles[r][c] !== 'ruins'))];
  for (const [r, c] of order) {
    if (K.lairsTotal >= S.lairs) break;
    if (K.armies.some(a => dist([a.r, a.c], [r, c]) < 3)) continue;
    const tier = Math.max(1, Math.min(4, Math.floor(dist([r, c], g.capital) / 4)));
    K.armies.push(monsterArmy(K, rng.next() < 0.6 ? 'undead' : 'bandits', tier, r, c, 'lair'));
    K.lairsTotal++;
  }
  reveal(K);
  return K;
}

/* ---------- armies ---------- */
export function moveArmy(K, army, path, log = []) {
  const reach = armyReach(K, army), end = path[path.length - 1], k = key(...end), step = reach.tiles.get(k);
  if (!step) return false;
  army.mp -= step.cost;
  army.r = end[0]; army.c = end[1]; army.moved = true;
  const ruin = K.ruins[k];
  if (ruin && !ruin.looted && army.owner === 'player') {
    ruin.looted = true;
    for (const r in ruin.loot) K.res[r] += ruin.loot[r];
    log.push('Руины обысканы: ' + resText(ruin.loot));
  }
  reveal(K);
  return true;
}

// Enemy armies the player army can reach this turn: [{ target, path }] with path ending next to the target.
export function attackOptions(K, army) {
  if (army.mp <= 0) return [];
  const reach = armyReach(K, army), out = [];
  for (const e of K.armies) {
    if (e.owner === army.owner) continue;
    let best = null;
    if (dist([army.r, army.c], [e.r, e.c]) === 1) best = { cost: 0, path: null };
    for (const [k, v] of reach.tiles) {
      const p = reachPath(reach, k), end = p[p.length - 1];
      if (dist(end, [e.r, e.c]) === 1 && v.cost < army.mp && (!best || v.cost < best.cost)) best = { cost: v.cost, path: p };
    }
    if (best) out.push({ target: e, path: best.path });
  }
  return out;
}

export function splitUnit(K, army, uid) {
  if (army.units.length < 2) return null;
  const spot = ring(K, army.r, army.c, 1).find(([r, c]) => (r !== army.r || c !== army.c) && passableMap(K, r, c) && !armyAt(K, r, c));
  if (!spot) return null;
  const u = army.units.find(x => x.uid === uid);
  army.units = army.units.filter(x => x !== u);
  const a = { id: K.nextId++, owner: army.owner, r: spot[0], c: spot[1], units: [u], mp: 0, moved: true };
  K.armies.push(a);
  return a;
}

export function mergeArmies(K, from, into) {
  if (from.owner !== into.owner || dist([from.r, from.c], [into.r, into.c]) > 1 || from.units.length + into.units.length > 5) return false;
  into.units.push(...from.units);
  into.mp = Math.min(into.mp, from.mp);
  K.armies = K.armies.filter(a => a !== from);
  return true;
}

/* ---------- battles ---------- */
export function arenaFor(K, r, c) {
  if (cityAt(K, r, c)) return 'ruins';
  return { forest: 'forest', hill: 'hills', ore: 'hills', gold: 'hills', ruins: 'ruins', mana: 'ruins' }[K.tiles[r][c]] || 'field';
}

export function battleFor(K, attacker, defender) {
  const mine = attacker.owner === 'player' ? attacker : defender, foe = mine === attacker ? defender : attacker;
  const entry = (u, side) => ({ kind: u.kind, hp: u.hp, level: u.level, ref: u.uid, unrest: side === 'player' && K.unrest > 0 && !mine.temp });
  const st = createBattle({
    seed: K.seed * 1000 + K.turn * 17 + K.stats.battles,
    arena: arenaFor(K, defender.r, defender.c),
    player: mine.units.map(u => entry(u, 'player')),
    enemy: foe.units.map(u => entry(u, 'enemy')),
    autoPenalty: 0.1
  });
  st.meta = { attacker: attacker.id, defender: defender.id };
  return st;
}

export function autoResolve(st) {
  st.phase = 'battle';
  st.auto = true;
  while (!st.winner && st.round < 40) {
    for (const _ of aiTurn(st, st.turn)) { /* drain */ }
    if (!st.winner) skirmishTurn(st);
  }
  if (!st.winner) st.winner = living(st, 'player').length >= living(st, 'enemy').length ? 'player' : 'enemy';
  return st;
}

// Quick outcome estimate for the pre-battle dialog.
export function predict(K, attacker, defender) {
  const st = autoResolve(battleFor(K, attacker, defender));
  const lost = st.units.filter(u => u.side === 'player' && u.hp <= 0).length;
  return { win: st.winner === 'player', lost };
}

export function applyBattle(K, st, log = []) {
  const atk = K.armies.find(a => a.id === st.meta.attacker), def = K.armies.find(a => a.id === st.meta.defender);
  const mine = atk?.owner === 'player' ? atk : def, foe = mine === atk ? def : atk;
  const win = st.winner === 'player';
  K.stats.battles++;
  const sync = (army, side) => {
    if (!army) return;
    for (const su of st.units.filter(x => x.side === side && x.ref)) {
      const u = army.units.find(x => x.uid === su.ref);
      if (!u) continue;
      u.hp = Math.max(0, su.hp);
      if (side === 'player' && u.hp > 0 && UNITS[u.kind].hero) {
        u.xp += 1 + (su.kills || 0) + (win ? 2 : 0);
        while (u.level < 8 && u.xp >= 3 * u.level) { u.xp -= 3 * u.level; u.level++; u.maxHp += 3; u.hp += 3; log.push(`${UNITS[u.kind].name} достиг уровня ${u.level}`); }
      }
    }
    for (const u of army.units.filter(x => x.hp <= 0)) {
      if (side === 'player' && UNITS[u.kind].hero) {
        if (K.hardcore) { K.heroesOwned = K.heroesOwned.filter(h => h !== u.kind); log.push(`${UNITS[u.kind].name} пал навсегда`); }
        else { u.hp = 1; K.wounded.push({ unit: u, turns: 4 }); log.push(`${UNITS[u.kind].name} тяжело ранен и отправлен в столицу`); }
      }
    }
    army.units = army.units.filter(x => x.hp > 0);
  };
  sync(mine, 'player');
  sync(foe, 'enemy');
  if (st.retreated && mine && mine.units.length) {
    const worst = mine.units.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    mine.units = mine.units.filter(u => u !== worst);
    log.push(`При отступлении потерян ${UNITS[worst.kind].name.toLowerCase()}`);
  }
  let reward = null;
  if (win && foe && !foe.units.length && foe.reward) {
    reward = foe.reward;
    for (const r in reward) K.res[r] += reward[r];
    K.stats.lairs++;
    log.push('Логово зачищено: ' + resText(reward));
  }
  if (mine?.temp) {
    const city = K.cities.find(c => c.id === mine.city);
    if (!win && city) razeCity(K, city, log);
    else if (win) log.push(`Горожане отстояли ${city?.name || 'город'}`);
    K.armies = K.armies.filter(a => a !== mine);
  }
  K.armies = K.armies.filter(a => a.units.length);
  if (mine && mine.units.length) { mine.mp = 0; mine.moved = true; }
  reveal(K);
  checkStatus(K);
  return { win, reward };
}

function checkStatus(K) {
  if (!K.cities.some(c => c.capital && c.owner === 'player')) K.status = 'lost';
  else if (K.lairsTotal && K.stats.lairs >= K.lairsTotal) K.status = 'won';
}

/* ---------- monsters ---------- */
function spawnWanderer(K, rng, log) {
  const n = Math.min(5, 2 + Math.floor(K.turn / 12));
  const pool = K.turn >= 25 ? ['skeleton', 'skeleton', 'ghoul', 'deathknight', 'acolyte'] : ['skeleton', 'skeleton', 'ghoul', 'acolyte'];
  const spots = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < K.w; c++) if (passableMap(K, r, c) && !armyAt(K, r, c)) spots.push([r, c]);
  if (!spots.length) return;
  const [r, c] = rng.pick(spots);
  const units = Array.from({ length: n }, (_, i) => makeMapUnit(K, i === 0 ? 'skeleton' : rng.pick(pool)));
  K.armies.push({ id: K.nextId++, owner: 'monster', faction: 'undead', kind: 'wander', r, c, units, mp: 2, moved: false });
  log.push('С севера идёт отряд нежити');
}

function moveWanderers(K, log, battles) {
  for (const w of K.armies.filter(a => a.owner === 'monster' && a.kind === 'wander')) {
    const goals = [
      ...K.armies.filter(a => a.owner === 'player' && dist([a.r, a.c], [w.r, w.c]) <= 3).map(a => [a.r, a.c]),
      ...K.cities.filter(c => c.owner === 'player').map(c => [c.r, c.c])
    ];
    let best = null;
    for (const g of goals) { const p = pathfind(K, [w.r, w.c], g, 'monster'); if (p && (!best || p.length < best.length)) best = p; }
    if (!best) continue;
    let mp = 2;
    for (const step of best.slice(1)) {
      const foe = armyAt(K, ...step);
      if (foe && foe.owner === 'player') { battles.push({ attacker: w.id, defender: foe.id }); break; }
      const city = cityAt(K, ...step);
      if (city && city.owner === 'player') {
        // an empty city raises a temporary militia; losing that fight razes the city
        const n = 2 + Math.floor(city.pop / 4);
        const units = Array.from({ length: Math.min(4, n) }, () => makeMapUnit(K, 'militia'));
        if (city.walls || city.capital) units.push(makeMapUnit(K, 'swordsman'));
        const g = { id: K.nextId++, owner: 'player', temp: true, city: city.id, r: city.r, c: city.c, units, mp: 0, moved: true };
        K.armies.push(g);
        log.push(`Нежить у стен города ${city.name}: горожане взялись за оружие`);
        battles.push({ attacker: w.id, defender: g.id });
        break;
      }
      const cost = moveCost(K, ...step);
      if (cost > mp) break;
      mp -= cost;
      w.r = step[0]; w.c = step[1];
    }
  }
}

export function razeCity(K, city, log) {
  for (const k in K.buildings) if (K.buildings[k].city === city.id) delete K.buildings[k];
  K.cities = K.cities.filter(c => c !== city);
  K.stats.razed++;
  log.push(city.capital ? `Столица ${city.name} пала` : `Нежить разорила город ${city.name}`);
  checkStatus(K);
}

/* ---------- end of turn ---------- */
export function endKingdomTurn(K) {
  const log = [], battles = [], rng = makeRng(K.seed * 97 + K.turn);
  // villages: an army ending its turn on one founds a city
  for (const a of K.armies.filter(x => x.owner === 'player')) {
    if (K.tiles[a.r][a.c] === 'village' && !cityAt(K, a.r, a.c)) {
      const city = foundCity(K, a.r, a.c);
      autoAssign(K, city);
      K.stats.captured++;
      log.push(`Деревня присоединилась: город ${city.name}`);
    }
  }
  economyTurn(K, log);
  // healing
  for (const a of K.armies.filter(x => x.owner === 'player')) {
    const inCity = cityAt(K, a.r, a.c)?.owner === 'player';
    const heal = inCity ? 6 : a.moved ? 0 : 3;
    a.units.forEach(u => { u.hp = Math.min(u.maxHp, u.hp + heal); });
  }
  // wounded heroes return to the capital
  const cap = K.cities.find(c => c.capital);
  for (const w of K.wounded) {
    w.turns--;
    if (w.turns <= 0 && cap) {
      let stack = armyAt(K, cap.r, cap.c);
      if (stack && stack.owner !== 'player') continue;
      if (!stack) { stack = { id: K.nextId++, owner: 'player', r: cap.r, c: cap.c, units: [], mp: 0, moved: true }; K.armies.push(stack); }
      if (stack.units.length < 5) { w.unit.hp = w.unit.maxHp; stack.units.push(w.unit); w.done = true; log.push(`${UNITS[w.unit.kind].name} вернулся в строй`); }
    }
  }
  K.wounded = K.wounded.filter(w => !w.done);
  // tavern
  if (K.turn % 8 === 0) {
    const left = HEROES.filter(h => !K.heroesOwned.includes(h) && !K.heroPool.includes(h) && !K.wounded.some(w => w.unit.kind === h));
    if (left.length) { const h = rng.pick(left); K.heroPool.push(h); log.push(`В таверну пришёл герой: ${UNITS[h].name}`); }
  }
  // monsters
  const S = MAP_SIZES[K.size];
  if (K.turn >= 8 && (K.turn - 8) % S.wanderEvery === 0) spawnWanderer(K, rng, log);
  moveWanderers(K, log, battles);
  K.turn++;
  for (const a of K.armies) { a.mp = armyMove(a); a.moved = false; }
  reveal(K);
  checkStatus(K);
  return { log, battles };
}

/* ---------- save ---------- */
export const serialize = K => JSON.stringify(K);
export const deserialize = s => { const K = JSON.parse(s); return K && K.version === 1 ? K : null; };
export { TERRAIN, RECRUIT };
