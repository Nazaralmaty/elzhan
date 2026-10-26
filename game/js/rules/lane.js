// Lane battle greybox (stage 1b): armies of unit groups on a 12-position line, rounds of orders + 8 auto ticks.
import { UNITS } from '../data/units.js';
import { makeRng } from '../core/rng.js';

export const LANE = 12, TICKS = 8, ROUND_CAP = 12, BREAK = 0.3;
export const ORDERS = { advance: 'Наступать', hold: 'Держать строй', retreat: 'Отступить', volley: 'Залп', spell: 'Заклинание' };
const GROUP_SIZE = { militia: 10, swordsman: 8, knight: 4, archer: 8, apprentice: 5, battlemage: 3, skeleton: 10, ghoul: 6, deathknight: 4, acolyte: 3 };
const FRONTAGE = 5;
const LABEL = { militia: 'Ополченцы', swordsman: 'Мечники', knight: 'Рыцари', archer: 'Лучники', apprentice: 'Ученики', battlemage: 'Боевые маги', alden: 'Альден', irena: 'Ирена', corvin: 'Корвин', skeleton: 'Скелеты', ghoul: 'Гули', deathknight: 'Рыцари смерти', acolyte: 'Послушники' }; // melee fighters per group that can strike in one tick

export function makeGroup(id, kind, side) {
  const d = UNITS[kind], hero = !!d.hero;
  const count = hero ? 1 : (GROUP_SIZE[kind] || 6);
  const hpPer = hero ? d.hp * 3 : d.hp;
  return {
    id, kind, side, name: LABEL[kind] || d.name, count, start: count, hpPer, hp: hpPer * count, maxHp: hpPer * count,
    atk: hero ? d.atk * 2.5 : d.atk, def: d.def, range: d.range, magic: !!d.magic, mounted: !!d.mounted,
    speed: d.move * 0.22, pos: side === 'player' ? 1 : LANE - 2, order: d.range > 1 ? 'volley' : 'advance', spellCd: 0, hero
  };
}

export function ordersFor(g) {
  const o = ['advance', 'hold', 'retreat'];
  if (g.range > 1) o.push('volley');
  if (g.magic) o.push('spell');
  return o;
}

export function createLane({ player, enemy }) {
  let id = 1;
  const st = { groups: [], round: 1, log: [], winner: null };
  player.forEach(k => st.groups.push(makeGroup(id++, k, 'player')));
  enemy.forEach(k => st.groups.push(makeGroup(id++, k, 'enemy')));
  // ranged start one step behind the line
  st.groups.forEach(g => { if (g.range > 1) g.pos += g.side === 'player' ? -1 : 1; g.pos = Math.max(0, Math.min(LANE - 1, g.pos)); });
  st.start = { player: sideHp(st, 'player'), enemy: sideHp(st, 'enemy') };
  return st;
}

export const alive = (st, side) => st.groups.filter(g => g.hp > 0 && (!side || g.side === side));
export const sideHp = (st, side) => alive(st, side).reduce((s, g) => s + g.hp, 0);
export const sideShare = (st, side) => sideHp(st, side) / st.start[side];
const dirOf = g => g.side === 'player' ? 1 : -1;

function nearestFoe(st, g) {
  let best = null, bd = Infinity;
  for (const e of alive(st)) {
    if (e.side === g.side) continue;
    const d = Math.abs(e.pos - g.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best ? { e: best, d: bd } : null;
}

function frontLine(st, side) {
  const foes = alive(st, side);
  if (!foes.length) return null;
  return side === 'player' ? Math.max(...foes.map(g => g.pos)) : Math.min(...foes.map(g => g.pos));
}

export function damage(a, t, ranged) {
  let mult = 1;
  if (a.mounted && t.range > 1) mult *= 1.5;
  if (a.mounted && t.order === 'hold' && (t.kind === 'swordsman' || t.kind === 'militia')) mult *= t.kind === 'militia' ? 0.6 : 0.5;
  if (t.mounted && a.kind === 'militia' && a.order === 'hold') mult *= 2;
  if (t.order === 'retreat' && !ranged) mult *= 1.3;
  let def = t.def + (t.order === 'hold' ? 2 : 0);
  if (a.magic) def = Math.floor(def / 2);
  const per = Math.max(0.5, a.atk * mult - def) * (ranged ? 0.6 : 1);
  const fighters = Math.min(ranged ? 6 : FRONTAGE, Math.ceil(a.count));
  return per * fighters * 0.25;
}

function hurt(st, t, amount, ev) {
  if (amount <= 0 || t.hp <= 0) return;
  t.hp = Math.max(0, t.hp - amount);
  t.count = Math.ceil(t.hp / t.hpPer);
  ev.push({ t: 'dmg', id: t.id, amount: Math.round(amount) });
}

// One tick: movement then simultaneous attacks. Returns events.
export function tick(st) {
  const ev = [], hits = [];
  // movement is simultaneous: plan from old positions, then settle any overlap at the midpoint
  const fronts = { player: frontLine(st, 'player'), enemy: frontLine(st, 'enemy') }, next = new Map();
  for (const g of alive(st)) {
    const dir = dirOf(g), near = nearestFoe(st, g);
    if (g.order === 'retreat') { next.set(g, Math.max(0, Math.min(LANE - 1, g.pos - dir * g.speed))); continue; }
    if (!near) continue;
    const reach = g.range > 1 ? g.range : 1;
    const wantsMove = g.order === 'advance' || ((g.order === 'volley' || g.order === 'spell') && near.d > reach);
    if (!wantsMove || near.d <= reach) continue;
    const foeFront = fronts[g.side === 'player' ? 'enemy' : 'player'];
    let p = g.pos + dir * g.speed;
    p = dir > 0 ? Math.min(p, foeFront - 1) : Math.max(p, foeFront + 1);
    if ((p - g.pos) * dir > 0) next.set(g, Math.max(0, Math.min(LANE - 1, p)));
  }
  next.forEach((p, g) => { g.pos = p; });
  const pf = frontLine(st, 'player'), ef = frontLine(st, 'enemy');
  if (pf !== null && ef !== null && ef - pf < 1) {
    const m = (pf + ef) / 2;
    alive(st).forEach(g => { g.pos = g.side === 'player' ? Math.min(g.pos, m - 0.5) : Math.max(g.pos, m + 0.5); });
  }
  for (const g of alive(st)) {
    if (g.order === 'retreat') continue;
    const near = nearestFoe(st, g);
    if (!near) continue;
    if (g.range > 1) {
      if (near.d > g.range) continue;
      if (g.order === 'spell' && g.spellCd <= 0) {
        if (g.kind === 'apprentice' || g.kind === 'acolyte') {
          // apprentice heals, acolyte raises the dead: both restore the most damaged allied group nearby
          const ally = alive(st, g.side).filter(x => Math.abs(x.pos - g.pos) <= 2 && x.hp < x.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          if (ally) {
            const amount = Math.min(ally.maxHp - ally.hp, (g.kind === 'acolyte' ? 15 : 6) * Math.min(g.count, 3));
            ally.hp += amount; ally.count = Math.ceil(ally.hp / ally.hpPer);
            ev.push({ t: 'heal', id: ally.id, by: g.id, amount: Math.round(amount) });
          }
        } else {
          // fireball: hits every enemy group within 1 position of the target
          alive(st).filter(x => x.side !== g.side && Math.abs(x.pos - near.e.pos) <= 1)
            .forEach(x => hits.push([x, Math.max(1, 7 - Math.floor(x.def / 2)) * Math.min(g.count, 3)]));
          ev.push({ t: 'spell', id: g.id, at: near.e.id });
        }
        g.spellCd = TICKS * 2;
      } else if (g.order !== 'hold' || near.d <= 1) {
        hits.push([near.e, damage(g, near.e, true)]);
        ev.push({ t: 'shoot', id: g.id, at: near.e.id });
      }
    } else if (near.d <= 1.05) {
      hits.push([near.e, damage(g, near.e, false)]);
      ev.push({ t: 'melee', id: g.id, at: near.e.id });
    }
    if (g.spellCd > 0) g.spellCd--;
  }
  hits.forEach(([t, a]) => hurt(st, t, a, ev));
  for (const g of st.groups) if (g.hp <= 0 && !g.dead) { g.dead = true; ev.push({ t: 'rout', id: g.id }); }
  // retreated off the field
  for (const g of alive(st)) if (g.order === 'retreat' && (g.side === 'player' ? g.pos <= 0 : g.pos >= LANE - 1)) { g.fled = true; g.hp = 0; ev.push({ t: 'fled', id: g.id }); }
  return ev;
}

export function checkLaneWinner(st) {
  if (st.winner) return st.winner;
  const p = sideShare(st, 'player'), e = sideShare(st, 'enemy');
  if (p <= BREAK || e <= BREAK) st.winner = p > e ? 'player' : 'enemy';
  else if (st.round > ROUND_CAP) st.winner = p >= e ? 'player' : 'enemy';
  return st.winner;
}

// Plays a full round (TICKS ticks); returns per-tick event lists.
export function playRound(st) {
  const frames = [];
  for (let i = 0; i < TICKS && !st.winner; i++) {
    frames.push(tick(st));
    if (sideShare(st, 'player') <= BREAK || sideShare(st, 'enemy') <= BREAK) checkLaneWinner(st);
  }
  st.round++;
  checkLaneWinner(st);
  return frames;
}

export function aiOrders(st, side) {
  const share = sideShare(st, side), foeShare = sideShare(st, side === 'player' ? 'enemy' : 'player');
  for (const g of alive(st, side)) {
    if (g.range > 1) g.order = g.magic && g.spellCd <= 0 ? 'spell' : 'volley';
    else if (share < 0.45 && foeShare > share + 0.15) g.order = 'hold';
    else if (g.kind === 'swordsman' && alive(st).some(x => x.side !== side && x.mounted && Math.abs(x.pos - g.pos) <= 3)) g.order = 'hold';
    else g.order = 'advance';
  }
}

export function laneEnemy(seed, kinds) { return makeRng(seed).shuffle([...kinds]); }
