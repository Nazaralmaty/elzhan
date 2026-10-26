// Cities, buildings, peasants, income/upkeep, growth, market, recruitment. Pure over the kingdom state K.
import { key, unkey, neighbors } from '../core/hex.js';
import { UNITS } from '../data/units.js';
import { RES, BUILDINGS, RECRUIT, WALLS_COST, PEASANT_COST, CITY_NAMES, MAP_SIZES } from '../data/buildings.js';
import { territory, inMap, armyAt } from './map.js';

export const emptyRes = () => Object.fromEntries(RES.map(r => [r, 0]));
const add = (a, b, k = 1) => { for (const r in b) a[r] = (a[r] || 0) + b[r] * k; return a; };
// short maps make buildings cheaper (GDD length table)
export const scaled = (K, cost) => {
  const m = MAP_SIZES[K.size]?.costMult ?? 1;
  return m === 1 ? cost : Object.fromEntries(Object.entries(cost).map(([r, v]) => [r, Math.ceil(v * m)]));
};
export const canPay = (K, cost) => Object.entries(cost).every(([r, v]) => (K.res[r] || 0) >= v);
const pay = (K, cost) => add(K.res, cost, -1);

export const cityById = (K, id) => K.cities.find(c => c.id === id);
export const cityAt = (K, r, c) => K.cities.find(x => x.r === r && x.c === c);
export const levelFor = pop => pop >= 20 ? 4 : pop >= 12 ? 3 : pop >= 6 ? 2 : 1;
export const buildingsOf = (K, cityId) => Object.entries(K.buildings).filter(([, b]) => b.city === cityId);
export const slotsOf = b => BUILDINGS[b.type].slots ? BUILDINGS[b.type].slots[b.level - 1] : 0;
const adjCount = (K, k, pred) => { const [r, c] = unkey(k); return neighbors(r, c).filter(([a, b]) => inMap(K, a, b) && pred(a, b)).length; };
const adjBuilding = (K, k, type) => adjCount(K, k, (a, b) => K.buildings[key(a, b)]?.type === type);

export function foundCity(K, r, c, capital = false) {
  const used = new Set(K.cities.map(x => x.name));
  const name = CITY_NAMES.find(n => !used.has(n)) || `Город ${K.cities.length + 1}`;
  const city = { id: K.nextId++, name, r, c, owner: 'player', pop: capital ? 3 : 2, growth: 0, level: 1, capital, walls: false, auto: true };
  K.cities.push(city);
  K.buildings[key(r, c)] = { type: 'townhall', level: 1, workers: 0, city: city.id };
  return city;
}

export function housing(K, city) {
  let h = 0;
  for (const [, b] of buildingsOf(K, city.id)) {
    const hs = BUILDINGS[b.type].housing;
    if (hs) h += hs[Math.min(b.level, hs.length) - 1];
  }
  return h;
}

export const workersUsed = (K, city) => buildingsOf(K, city.id).reduce((s, [, b]) => s + b.workers, 0);
export const idleOf = (K, city) => Math.max(0, city.pop - workersUsed(K, city));

// Per-building output, adjacency included. Production buildings need at least one worker for their bonus.
export function buildingYield(K, k, b) {
  const out = {}, w = b.workers;
  switch (b.type) {
    case 'townhall': out.food = 2; out.gold = 1; break;
    case 'farm': out.food = w * 2 + (w ? adjBuilding(K, k, 'mill') : 0); break;
    case 'sawmill': out.wood = w * 2 + (w && adjCount(K, k, (a, c) => K.tiles[a][c] === 'forest') >= 2 ? 1 : 0); break;
    case 'quarry': out.stone = w * 2; break;
    case 'iron': out.iron = w * 2 + (w && adjBuilding(K, k, 'forge') ? 1 : 0); break;
    case 'goldmine': out.gold = w; break;
    case 'tower': out.mana = 3 + w * 2 + adjCount(K, k, (a, c) => K.tiles[a][c] === 'mana'); break;
    case 'market': out.gold = adjBuilding(K, k, 'house'); break;
  }
  return out;
}

export function cityYield(K, city) {
  const out = emptyRes();
  for (const [k, b] of buildingsOf(K, city.id)) add(out, buildingYield(K, k, b));
  out.food += idleOf(K, city);
  return out;
}

export const unitUpkeep = kind => RECRUIT[kind]?.upkeep || {};
export function totalUpkeep(K) {
  const out = emptyRes();
  K.armies.filter(a => a.owner === 'player' && !a.temp).forEach(a => a.units.forEach(u => add(out, unitUpkeep(u.kind))));
  return out;
}

// Income forecast for the HUD: production − food eaten − upkeep.
export function forecast(K) {
  const net = emptyRes();
  K.cities.filter(c => c.owner === 'player').forEach(c => { add(net, cityYield(K, c)); net.food -= c.pop; });
  add(net, totalUpkeep(K), -1);
  return net;
}

/* ---------- building ---------- */
export function buildOptions(K, r, c) {
  const k = key(r, c), terr = territory(K);
  let own = terr.get(k);
  if (K.buildings[k] || cityAt(K, r, c) || K.tiles[r][c] === 'village' || !K.explored[k]) return { city: null, list: [] };
  // just outside the border only an outpost can be built; it belongs to the neighbouring city
  const outside = !own;
  if (outside) own = neighbors(r, c).map(([a, b]) => terr.get(key(a, b))).find(id => id && cityById(K, id)?.owner === 'player');
  if (!own) return { city: null, list: [] };
  const city = cityById(K, own);
  if (city.owner !== 'player') return { city: null, list: [] };
  const t = K.tiles[r][c];
  const list = Object.entries(BUILDINGS).filter(([id, d]) => d.tiles.includes(t) && !!d.outside === outside).map(([id, d]) => {
    let why = '';
    if (d.perCity && buildingsOf(K, city.id).some(([, b]) => b.type === id)) why = 'Уже есть в этом городе';
    if (d.perKingdom && Object.values(K.buildings).some(b => b.type === id)) why = 'Уже есть в королевстве';
    if (d.needsAdj && !adjBuilding(K, k, d.needsAdj)) why = `Нужна соседняя ${BUILDINGS[d.needsAdj].name.toLowerCase()}`;
    const cost = scaled(K, d.cost);
    if (!why && !canPay(K, cost)) why = 'Не хватает ресурсов';
    return { id, name: d.name, cost, note: d.note, why };
  });
  return { city, list };
}

export function build(K, r, c, id) {
  const opt = buildOptions(K, r, c).list.find(o => o.id === id);
  if (!opt || opt.why) return false;
  pay(K, opt.cost);
  K.buildings[key(r, c)] = { type: id, level: 1, workers: 0, city: buildOptions(K, r, c).city?.id ?? territory(K).get(key(r, c)) };
  const city = cityById(K, K.buildings[key(r, c)].city);
  if (city.auto) autoAssign(K, city);
  return true;
}

export function upgradeCost(b, K) {
  const up = BUILDINGS[b.type].up, cost = up && up[b.level - 1];
  return cost && K ? scaled(K, cost) : cost;
}
export function upgrade(K, k) {
  const b = K.buildings[k], cost = b && upgradeCost(b, K);
  if (!cost || !canPay(K, cost)) return false;
  pay(K, cost);
  b.level++;
  const city = cityById(K, b.city);
  if (city.auto) autoAssign(K, city);
  return true;
}
export function buildWalls(K, city) {
  const cost = scaled(K, WALLS_COST);
  if (city.walls || !canPay(K, cost)) return false;
  pay(K, cost);
  city.walls = true;
  return true;
}

/* ---------- peasants ---------- */
// Town hall trains a peasant for food (Cossacks-style), as long as there is housing.
export function peasantCheck(K, city) {
  const cost = scaled(K, PEASANT_COST);
  if (city.pop >= housing(K, city)) return { cost, why: 'Нет жилья — построй дом' };
  if (!canPay(K, cost)) return { cost, why: 'Не хватает еды' };
  return { cost, why: '' };
}
export function hirePeasant(K, city) {
  const { cost, why } = peasantCheck(K, city);
  if (why) return false;
  pay(K, cost);
  city.pop++;
  if (city.auto) autoAssign(K, city);
  return true;
}
export const growthNeed = (K, city) => Math.ceil((6 + city.pop) / (MAP_SIZES[K.size]?.growthMult ?? 1));


export function setWorkers(K, k, delta) {
  const b = K.buildings[k], city = b && cityById(K, b.city);
  if (!b || !slotsOf(b)) return false;
  const next = b.workers + delta;
  if (next < 0 || next > slotsOf(b) || (delta > 0 && idleOf(K, city) < delta)) return false;
  b.workers = next;
  city.auto = false;
  return true;
}

const RES_BUILDING = { food: 'farm', wood: 'sawmill', stone: 'quarry', iron: 'iron', gold: 'goldmine', mana: 'tower' };

// Priority: feed the city (and its share of army food) → resources short last turn → spread evenly.
export function autoAssign(K, city) {
  const list = buildingsOf(K, city.id).filter(([, b]) => slotsOf(b) > 0);
  list.forEach(([, b]) => { b.workers = 0; });
  let free = city.pop;
  const place = b => { if (free > 0 && b.workers < slotsOf(b)) { b.workers++; free--; return true; } return false; };
  const cities = Math.max(1, K.cities.filter(c => c.owner === 'player').length);
  const foodNeed = city.pop + Math.ceil(totalUpkeep(K).food / cities);
  const farms = list.filter(([, b]) => b.type === 'farm');
  let guard = 0;
  while (free > 0 && guard++ < 50 && cityYield(K, city).food < foodNeed && farms.some(([, b]) => place(b))) { /* fill farms */ }
  for (const r of K.short || []) {
    const bs = list.filter(([, b]) => b.type === RES_BUILDING[r]);
    for (let i = 0; i < 3; i++) bs.forEach(([, b]) => place(b));
  }
  guard = 0;
  while (free > 0 && guard++ < 60) {
    const before = free;
    list.slice().sort(([, a], [, b]) => a.workers - b.workers).forEach(([, b]) => { if (free > 0) place(b); });
    if (free === before) break;
  }
}

/* ---------- market ---------- */
export function marketRate(K) {
  const markets = Object.values(K.buildings).filter(b => b.type === 'market' && cityById(K, b.city)?.owner === 'player');
  if (!markets.length) return 0;
  return markets.some(b => b.level >= 2) ? 2 : 3;
}
export function trade(K, give, get, amount) {
  const rate = marketRate(K);
  if (!rate || give === get || give === 'mana' || get === 'mana' || amount <= 0) return false;
  const cost = amount * rate;
  if ((K.res[give] || 0) < cost) return false;
  K.res[give] -= cost;
  K.res[get] += amount;
  return true;
}

/* ---------- recruitment ---------- */
const hasBuilding = (K, type, pred = () => true) => Object.values(K.buildings).some(b => b.type === type && cityById(K, b.city)?.owner === 'player' && pred(b));
export function recruitCost(K, kind) {
  const R = RECRUIT[kind], cost = { ...R.cost };
  const forgeDeal = Object.entries(K.buildings).some(([k, b]) => b.type === 'forge' && adjBuilding(K, k, 'iron'));
  if (cost.iron && forgeDeal) cost.iron = Math.ceil(cost.iron * 0.75);
  return cost;
}
export function recruitOptions(K, city) {
  const here = buildingsOf(K, city.id).map(([, b]) => b);
  return Object.keys(RECRUIT).map(kind => {
    const R = RECRUIT[kind], cost = recruitCost(K, kind);
    let why = '';
    const need = here.find(b => b.type === R.needs);
    if (!need) why = `Нужно здание: ${R.needs === 'townhall' ? 'ратуша' : (R.needs === 'tower' ? 'башня магов' : BUILDINGS[R.needs].name.toLowerCase())}`;
    else if (R.level && need.level < R.level) why = 'Нужна башня магов ур. 2';
    else if (R.forge && !hasBuilding(K, 'forge')) why = 'Нужна кузница в королевстве';
    else if (R.hero && (K.heroesOwned.includes(kind))) why = 'Уже в королевстве';
    else if (R.hero && !K.heroPool.includes(kind)) why = 'Пока не пришёл в таверну';
    const stack = armyAt(K, city.r, city.c);
    if (!why && stack && (stack.owner !== 'player' || stack.units.length >= 5)) why = 'Гарнизон полон (5)';
    if (!why && !canPay(K, cost)) why = 'Не хватает ресурсов';
    return { kind, name: UNITS[kind].name, cost, upkeep: R.upkeep, why, hero: !!R.hero };
  }).filter(o => !o.hero || K.heroPool.includes(o.kind) || K.heroesOwned.includes(o.kind))
    .sort((a, b) => !!a.why - !!b.why);
}

export function makeMapUnit(K, kind) {
  const d = UNITS[kind];
  return { uid: K.nextId++, kind, hp: d.hp, maxHp: d.hp, level: 1, xp: 0 };
}

export function recruit(K, city, kind) {
  const opt = recruitOptions(K, city).find(o => o.kind === kind);
  if (!opt || opt.why) return null;
  pay(K, opt.cost);
  let stack = armyAt(K, city.r, city.c);
  if (!stack) { stack = { id: K.nextId++, owner: 'player', r: city.r, c: city.c, units: [], mp: 0, moved: true }; K.armies.push(stack); }
  const u = makeMapUnit(K, kind);
  stack.units.push(u);
  if (opt.hero) { K.heroesOwned.push(kind); K.heroPool = K.heroPool.filter(h => h !== kind); }
  return u;
}

/* ---------- end of turn economy ---------- */
export function economyTurn(K, log) {
  const mine = K.cities.filter(c => c.owner === 'player');
  const yields = new Map(mine.map(c => [c.id, cityYield(K, c)]));
  yields.forEach(y => add(K.res, y));
  const pop = mine.reduce((s, c) => s + c.pop, 0);
  K.res.food -= pop;
  let starving = false;
  if (K.res.food < 0) {
    starving = true;
    K.res.food = 0;
    const big = mine.slice().sort((a, b) => b.pop - a.pop)[0];
    if (big && big.pop > 1) { big.pop--; log.push(`Голод: в городе ${big.name} умер житель`); }
  }
  // upkeep
  const need = totalUpkeep(K), short = [];
  for (const r in need) {
    if (!need[r]) continue;
    if (K.res[r] >= need[r]) K.res[r] -= need[r];
    else { short.push(r); K.res[r] = 0; }
  }
  K.short = short;
  if (short.length) {
    K.unrest++;
    if (K.unrest === 1) log.push('Армии не хватает припасов: ропот, −25% к атаке');
    else {
      const unpaid = K.armies.filter(a => a.owner === 'player').flatMap(a => a.units.map(u => ({ a, u })))
        .filter(({ u }) => short.some(r => unitUpkeep(u.kind)[r]))
        .sort((x, y) => (UNITS[y.u.kind].value || 0) - (UNITS[x.u.kind].value || 0))[0];
      if (unpaid) {
        unpaid.a.units = unpaid.a.units.filter(u => u !== unpaid.u);
        if (unpaid.u.kind in RECRUIT && RECRUIT[unpaid.u.kind].hero) K.heroesOwned = K.heroesOwned.filter(h => h !== unpaid.u.kind);
        log.push(`Дезертирство: ушёл ${UNITS[unpaid.u.kind].name.toLowerCase()}`);
      }
    }
  } else K.unrest = 0;
  K.armies = K.armies.filter(a => a.units.length);
  // growth
  for (const c of mine) {
    if (starving) continue;
    const surplus = yields.get(c.id).food - c.pop;
    if (surplus > 0 && c.pop < housing(K, c)) {
      c.growth += surplus;
      const need = growthNeed(K, c);
      if (c.growth >= need) { c.growth -= need; c.pop++; log.push(`${c.name}: родился житель (${c.pop})`); }
    }
    const lvl = levelFor(c.pop);
    if (lvl > c.level) { c.level = lvl; log.push(`${c.name} вырос до уровня ${lvl}: территория расширилась`); }
    if (c.auto) autoAssign(K, c);
    else if (workersUsed(K, c) > c.pop) autoAssign(K, c);
  }
}
