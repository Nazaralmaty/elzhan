// Lane battle greybox (stage 1b): armies of unit groups on a 12-position line.
// Each round: enemy intent is shown → player gives orders → 8 ticks resolve. Stamina, morale, charge, terrain, ranks.
import { UNITS } from '../data/units.js';
import { makeRng } from '../core/rng.js';

export const LANE = 12, TICKS = 8, ROUND_CAP = 15;
export const ORDERS = {
  advance: { name: 'Вперёд', icon: '⇒', hint: 'Идти на врага и рубиться' },
  hold: { name: 'Держать строй', icon: '▣', hint: '+2 защиты, отдых; ополченцы встречают натиск копьями' },
  charge: { name: 'Натиск', icon: '⚡', hint: 'Разгон и удар ×2.5, −20 морали врагу; дорого по выносливости' },
  fallback: { name: 'Отойти', icon: '◁', hint: 'Отступить назад и отдышаться; вдогонку бьют сильнее' },
  volley: { name: 'Стрелять', icon: '➶', hint: 'Стоять и стрелять по выбранной цели' },
  spell: { name: 'Заклинание', icon: '✦', hint: 'Огненный шар, лечение или подъём мёртвых' }
};
export const TARGETS = { near: 'Ближние', ranged: 'Стрелки', mage: 'Маги' };
export const TERRAIN_NAME = { hill: 'Холм', forest: 'Лес', ford: 'Брод' };

const GROUP_SIZE = { militia: 10, swordsman: 8, knight: 4, archer: 8, apprentice: 5, battlemage: 3, skeleton: 10, ghoul: 6, deathknight: 4, acolyte: 3 };
const LABEL = { militia: 'Ополченцы', swordsman: 'Мечники', knight: 'Рыцари', archer: 'Лучники', apprentice: 'Ученики', battlemage: 'Боевые маги', alden: 'Альден', irena: 'Ирена', corvin: 'Корвин', skeleton: 'Скелеты', ghoul: 'Гули', deathknight: 'Рыцари смерти', acolyte: 'Послушники' };
const ACTIVE = new Set(['ok', 'waver']);

export function makeGroup(id, kind, side) {
  const d = UNITS[kind], hero = !!d.hero, count = hero ? 1 : (GROUP_SIZE[kind] || 6), hpPer = hero ? d.hp * 3 : d.hp;
  return {
    id, kind, side, name: LABEL[kind] || d.name, count, start: count, hpPer, hp: hpPer * count, maxHp: hpPer * count,
    atk: hero ? d.atk * 2.5 : d.atk, def: d.def, range: d.range, reach: kind === 'militia' ? 2 : 1,
    magic: !!d.magic, mounted: !!d.mounted, fearless: !!d.undead, hero,
    speed: d.move * 0.22, pos: side === 'player' ? 1 : LANE - 2,
    order: d.range > 1 ? 'volley' : 'hold', target: 'near', lastOrder: 'hold',
    morale: 100, stamina: 100, state: 'ok', spellCd: 0, impact: false
  };
}

export function ordersFor(g) {
  if (g.range > 1) return g.magic ? ['volley', 'spell', 'hold', 'fallback'] : ['volley', 'hold', 'fallback'];
  return g.mounted ? ['charge', 'advance', 'hold', 'fallback'] : ['advance', 'hold', 'fallback'];
}

// zones are laid out for a hill on the player's half, then mirrored so neither side starts closer to its features
function makeTerrain(rng) {
  const f = 6.3 + rng.int(2) * 0.6;
  const zones = [{ type: 'hill', from: 2.5, to: 4.5 }, { type: 'forest', from: f, to: f + 1.2 }];
  if (rng.next() < 0.6) zones.push({ type: 'ford', from: 4.9, to: 6.1 });
  if (rng.next() < 0.5) return zones;
  return zones.map(z => ({ type: z.type, from: LANE - 1 - z.to, to: LANE - 1 - z.from }));
}

export function createLane({ player, enemy, seed = 1 }) {
  const rng = makeRng(seed);
  let id = 1;
  const st = { groups: [], round: 1, winner: null, terrain: makeTerrain(rng), ai: rng.next() < 0.5 ? 'aggressive' : 'defensive', log: [] };
  player.forEach(k => st.groups.push(makeGroup(id++, k, 'player')));
  enemy.forEach(k => st.groups.push(makeGroup(id++, k, 'enemy')));
  st.groups.forEach(g => { if (g.range > 1) g.pos += g.side === 'player' ? -1 : 1; });
  aiOrders(st, 'enemy');
  return st;
}

export const zoneAt = (st, pos) => st.terrain.find(z => pos >= z.from && pos <= z.to)?.type || null;
export const active = (st, side) => st.groups.filter(g => ACTIVE.has(g.state) && (!side || g.side === side));
export const onField = (st, side) => st.groups.filter(g => g.state !== 'dead' && g.state !== 'fled' && (!side || g.side === side));
const foeSide = s => s === 'player' ? 'enemy' : 'player';
const dirOf = g => g.side === 'player' ? 1 : -1;
export const sideShare = (st, side) => {
  const all = st.groups.filter(g => g.side === side), max = all.reduce((s, g) => s + g.maxHp, 0);
  return max ? active(st, side).reduce((s, g) => s + g.hp, 0) / max : 0;
};

function nearest(st, g, list = active(st, foeSide(g.side))) {
  let best = null, bd = Infinity;
  for (const e of list) { const d = Math.abs(e.pos - g.pos); if (d < bd) { bd = d; best = e; } }
  return best ? { e: best, d: bd } : null;
}
const front = (st, side) => {
  const gs = onField(st, side).filter(g => g.state !== 'rout');
  if (!gs.length) return null;
  return side === 'player' ? Math.max(...gs.map(g => g.pos)) : Math.min(...gs.map(g => g.pos));
};
const engaged = (st, g) => { const n = nearest(st, g); return !!n && n.d <= 1.05; };
export const fatigue = g => g.stamina > 50 ? 1 : g.stamina > 20 ? 0.75 : 0.5;
export const staminaLabel = g => g.stamina > 50 ? 'свежие' : g.stamina > 20 ? 'устали' : 'измотаны';

function rangedTarget(st, g, range) {
  const inRange = active(st, foeSide(g.side)).filter(e => Math.abs(e.pos - g.pos) <= range);
  if (!inRange.length) return null;
  const pref = g.target === 'ranged' ? inRange.filter(e => e.range > 1 && !e.magic) : g.target === 'mage' ? inRange.filter(e => e.magic) : [];
  const list = pref.length ? pref : inRange;
  return list.sort((a, b) => Math.abs(a.pos - g.pos) - Math.abs(b.pos - g.pos))[0];
}

// damage of one tick from group a to group t; returns { dmg, why[] }
export function damage(st, a, t, kind) {
  const why = [];
  let mult = fatigue(a);
  if (a.state === 'waver') mult *= 0.7;
  if (kind === 'melee' && t.range > 1) mult *= 1.5;
  if (kind === 'melee' && a.range > 1) mult *= 0.5;
  if (a.mounted && t.range > 1 && kind === 'melee') mult *= 1.3;
  if (kind === 'ranged') {
    if (zoneAt(st, a.pos) === 'hill') mult *= 1.25;
    if (zoneAt(st, t.pos) === 'forest') { mult *= 0.5; why.push('лес'); }
    if (t.kind === 'swordsman' && t.order === 'hold') { mult *= 0.5; why.push('щиты'); }
    mult *= 0.6;
  }
  if (t.order === 'fallback' && kind === 'melee') mult *= 1.3;
  let def = t.def + (t.order === 'hold' ? 2 : 0) + (t.order === 'hold' && zoneAt(st, t.pos) === 'hill' ? 1 : 0) - (zoneAt(st, t.pos) === 'ford' ? 2 : 0);
  if (a.magic) def = Math.floor(def / 2);
  // percentage armour: every point of defence soaks a share, nothing is ever fully immune
  const per = a.atk * mult * 6 / (6 + Math.max(0, def));
  const fighters = Math.min(kind === 'ranged' ? 6 : 5, Math.ceil(a.count));
  return { dmg: per * fighters * 0.4, why };
}

function hurt(st, t, amount, morale = 0) {
  if (amount <= 0 || (!ACTIVE.has(t.state) && t.state !== 'rout')) return 0;
  t.hp = Math.max(0, t.hp - amount);
  t.count = Math.ceil(t.hp / t.hpPer);
  if (!t.fearless) t.morale -= amount / t.maxHp * 150 + morale;
  t.tickDmg = (t.tickDmg || 0) + amount;
  return amount;
}

function speedAt(st, g) {
  const z = zoneAt(st, g.pos);
  return g.speed * (z === 'forest' ? 0.6 : z === 'ford' ? 0.5 : 1);
}

export function tick(st, log) {
  const ev = [];
  st.groups.forEach(g => { g.tickDmg = 0; });
  // 1. movement (simultaneous), routing groups flee
  const fronts = { player: front(st, 'player'), enemy: front(st, 'enemy') }, next = new Map();
  for (const g of onField(st)) {
    const dir = dirOf(g);
    if (g.state === 'rout' || g.order === 'fallback') {
      next.set(g, g.pos - dir * speedAt(st, g) * (g.state === 'rout' ? 1.5 : 1));
      continue;
    }
    const n = nearest(st, g);
    if (!n) continue;
    let move = false, sp = speedAt(st, g);
    if (g.order === 'advance') move = n.d > g.reach;
    if (g.order === 'charge') { move = n.d > 1; if (zoneAt(st, g.pos) !== 'forest') sp *= 2; }
    if (g.order === 'volley' || g.order === 'spell') move = n.d > g.range + (zoneAt(st, g.pos) === 'hill' ? 1 : 0);
    if (!move || fronts[foeSide(g.side)] === null) continue;
    const foeFront = fronts[foeSide(g.side)];
    let p = g.pos + dir * sp;
    p = dir > 0 ? Math.min(p, foeFront - 1) : Math.max(p, foeFront + 1);
    if ((p - g.pos) * dir > 0) next.set(g, p);
  }
  next.forEach((p, g) => { g.pos = Math.max(0, Math.min(LANE - 1, p)); });
  const pf = front(st, 'player'), ef = front(st, 'enemy');
  if (pf !== null && ef !== null && ef - pf < 1) {
    const m = (pf + ef) / 2;
    onField(st).filter(g => g.state !== 'rout').forEach(g => { g.pos = g.side === 'player' ? Math.min(g.pos, m - 0.5) : Math.max(g.pos, m + 0.5); });
  }
  for (const g of onField(st)) {
    if (g.state === 'rout' && (g.side === 'player' ? g.pos <= 0.05 : g.pos >= LANE - 1.05)) { g.state = 'fled'; log.push(`${g.name} бежали с поля`); ev.push({ t: 'fled', id: g.id }); }
  }
  // 2. charge impact on first contact
  for (const g of active(st)) {
    if (g.order !== 'charge' || g.impact) continue;
    const n = nearest(st, g);
    if (!n || n.d > 1.05) continue;
    g.impact = true;
    const t = n.e;
    if (zoneAt(st, t.pos) === 'forest' || zoneAt(st, g.pos) === 'forest') { log.push(`${g.name}: натиск увяз в лесу`); continue; }
    if (t.kind === 'militia' && t.order === 'hold') {
      hurt(st, g, damage(st, t, g, 'melee').dmg * 4, 20);
      log.push(`${t.name} встретили натиск: ${g.name.toLowerCase()} напоролись на копья`);
      ev.push({ t: 'counter', id: t.id, at: g.id });
      continue;
    }
    const shields = t.kind === 'swordsman' && t.order === 'hold';
    hurt(st, t, damage(st, g, t, 'melee').dmg * (shields ? 1.25 : 2.5), shields ? 8 : 20);
    log.push(shields ? `${g.name} ударили в щиты — ${t.name.toLowerCase()} выстояли` : `${g.name} ударили с разгона — ${t.name.toLowerCase()} получают ×2.5`);
    ev.push({ t: 'impact', id: g.id, at: t.id });
  }
  // 3. fighting (simultaneous)
  const hits = [];
  for (const g of active(st)) {
    if (g.spellCd > 0) g.spellCd--;
    if (g.order === 'fallback') continue;
    const n = nearest(st, g);
    if (!n) continue;
    if (g.range > 1 && n.d > 1.05) {
      const rng = g.range + (zoneAt(st, g.pos) === 'hill' ? 1 : 0);
      if (g.order === 'spell' && g.spellCd <= 0) {
        if (g.kind === 'apprentice' || g.kind === 'acolyte') {
          const ally = onField(st, g.side).filter(x => x.state !== 'rout' && Math.abs(x.pos - g.pos) <= 3 && x.hp < x.maxHp && (g.kind !== 'acolyte' || x.fearless))
            .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          if (ally) {
            const amount = Math.min(ally.maxHp - ally.hp, (g.kind === 'acolyte' ? 14 : 8) * Math.min(g.count, 3));
            ally.hp += amount; ally.count = Math.ceil(ally.hp / ally.hpPer);
            if (!ally.fearless) ally.morale = Math.min(100, ally.morale + 10);
            log.push(g.kind === 'acolyte' ? `${g.name} подняли павших в ряды: ${ally.name.toLowerCase()}` : `${g.name} лечат: ${ally.name.toLowerCase()}`);
            ev.push({ t: 'heal', id: ally.id, by: g.id, amount: Math.round(amount) });
            g.spellCd = 12;
          }
        } else {
          const t = rangedTarget(st, g, rng + 1);
          if (t) {
            const hit = active(st, foeSide(g.side)).filter(x => Math.abs(x.pos - t.pos) <= 1);
            hit.forEach(x => hits.push([x, 7 * 6 / (6 + Math.floor(x.def / 2)) * Math.min(g.count, 3) * 1.2, 10]));
            log.push(`${g.name}: огненный шар — ${hit.map(x => x.name.toLowerCase()).join(', ')}`);
            ev.push({ t: 'spell', id: g.id, at: t.id });
            g.spellCd = 16;
          }
        }
      } else if (g.order !== 'hold' || n.d <= g.range) {
        const t = rangedTarget(st, g, rng);
        if (t) { hits.push([t, damage(st, g, t, 'ranged').dmg, 0]); ev.push({ t: 'shoot', id: g.id, at: t.id }); }
      }
    } else if (n.d <= g.reach + 0.05) {
      // ranks: melee strikes only from the front rank; militia spears also reach from the second
      const ahead = active(st, g.side).filter(x => x !== g && (x.pos - g.pos) * dirOf(g) > 0.3 && x.range === 1).length;
      if (ahead >= (g.reach > 1 ? 2 : 1)) continue;
      hits.push([n.e, damage(st, g, n.e, 'melee').dmg, 0]);
      ev.push({ t: 'melee', id: g.id, at: n.e.id });
    }
  }
  hits.forEach(([t, a, m]) => hurt(st, t, a, m));
  // 4. stamina, morale, states
  for (const g of onField(st)) {
    const fight = engaged(st, g) && g.order !== 'fallback';
    const moving = g.order === 'advance' || g.order === 'charge';
    let ds = fight ? -7 : g.order === 'fallback' ? 9 : g.order === 'hold' ? 6 : moving ? -1.5 : 3;
    if (g.order === 'charge' && !g.chargePaid) { ds -= 25; g.chargePaid = true; }
    if (g.mounted && fight) ds -= 4;
    g.stamina = Math.max(0, Math.min(100, g.stamina + ds));
    if (g.hp <= 0) { if (g.state !== 'dead') { g.state = 'dead'; log.push(`${g.name} уничтожены`); ev.push({ t: 'dead', id: g.id }); } continue; }
    if (g.fearless || g.state === 'rout' || g.state === 'fled') continue;
    if (!fight && !g.tickDmg) g.morale += 3;
    if (active(st, g.side).some(h => h.hero && h !== g && Math.abs(h.pos - g.pos) <= 1.5)) g.morale = Math.max(g.morale + 1.5, Math.min(g.morale + 6, 22));
    g.morale = Math.min(100, g.morale);
    if (g.morale <= 0) {
      g.state = 'rout';
      log.push(`${g.name} дрогнули и бегут`);
      ev.push({ t: 'rout', id: g.id });
      active(st, g.side).filter(x => x !== g && !x.fearless && Math.abs(x.pos - g.pos) <= 1.5).forEach(x => { x.morale -= 10; });
    } else if (g.morale <= 25 && g.state === 'ok') { g.state = 'waver'; log.push(`${g.name} колеблются`); }
    else if (g.morale > 35 && g.state === 'waver') g.state = 'ok';
  }
  st.groups.filter(g => g.tickDmg).forEach(g => ev.push({ t: 'dmg', id: g.id, amount: Math.round(g.tickDmg) }));
  return ev;
}

export function checkLaneWinner(st) {
  if (st.winner) return st.winner;
  const p = active(st, 'player').length, e = active(st, 'enemy').length;
  const left = side => st.groups.filter(g => g.side === side && g.state !== 'dead').reduce((s, g) => s + g.hp, 0);
  if (!p && !e) st.winner = left('player') >= left('enemy') ? 'player' : 'enemy';
  else if (!p || !e) st.winner = p ? 'player' : 'enemy';
  else if (st.round > ROUND_CAP) st.winner = sideShare(st, 'player') >= sideShare(st, 'enemy') ? 'player' : 'enemy';
  return st.winner;
}

// Resolves a full round with the current orders; returns { frames, log }.
export function playRound(st) {
  const frames = [], log = [];
  st.groups.forEach(g => { g.impact = false; g.chargePaid = false; });
  for (let i = 0; i < TICKS && !st.winner; i++) { frames.push(tick(st, log)); checkLaneWinner(st); }
  st.groups.forEach(g => { g.lastOrder = g.order; if (g.order === 'charge') g.order = 'advance'; });
  st.round++;
  checkLaneWinner(st);
  if (!st.winner) aiOrders(st, 'enemy');
  st.log = log;
  return { frames, log };
}

// AI orders; for the enemy they are set before the player's turn and shown as intent.
export function aiOrders(st, side) {
  const foes = active(st, foeSide(side));
  for (const g of active(st, side)) {
    const n = nearest(st, g), eng = n && n.d <= 1.05;
    if (!n) { g.order = 'hold'; continue; }
    if (g.range > 1) {
      g.order = g.magic && g.spellCd <= 0 ? 'spell' : 'volley';
      g.target = foes.some(e => e.range > 1 && !e.magic && Math.abs(e.pos - g.pos) <= g.range + 1) ? 'ranged' : 'near';
      continue;
    }
    if (g.mounted) {
      const spears = n.e.kind === 'militia' && n.e.lastOrder === 'hold';
      if (g.stamina >= 40 && n.d > 1.05 && n.d <= 4.5 && zoneAt(st, n.e.pos) !== 'forest' && !spears) g.order = 'charge';
      else if (eng && g.stamina < 35) g.order = 'fallback';
      else if (eng) g.order = 'advance';
      else g.order = 'hold';
      continue;
    }
    const fresh = active(st, side).some(x => x !== g && x.range === 1 && x.stamina > 60 && (g.pos - x.pos) * dirOf(g) > 0.3);
    if (eng && g.stamina < 25 && fresh) g.order = 'fallback';
    else if (g.kind === 'militia' && foes.some(e => e.mounted && Math.abs(e.pos - g.pos) <= 5)) g.order = 'hold';
    else if (st.ai === 'defensive' && st.round <= 3 && !eng) g.order = 'hold';
    else g.order = 'advance';
  }
}

export function laneEnemy(seed, kinds) { return makeRng(seed).shuffle([...kinds]); }
