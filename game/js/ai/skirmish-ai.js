// Greedy one-unit-at-a-time planner: score every (reachable hex × action) and take the best.
import { unkey, dist } from '../core/hex.js';
import {
  reachable, pathTo, opportunityStrikes, canAttack, computeDamage, enemiesOf, living, unitAt, unitById,
  abilityReady, abilityTargets, chargeLanding, chainTargets, fireballArea, fireballDamage,
  performMove, performAttack, useAbility
} from '../rules/skirmish.js';

const P = u => [u.r, u.c];
const threat = t => 1 + (t.range > 1 ? 0.5 : 0) + (t.hero ? 0.6 : 0) + (t.kind === 'acolyte' ? 0.6 : 0);

function attackValue(st, u, at, t, o = {}) {
  const f = computeDamage(st, u, at, t, o);
  let v = Math.min(f.dmg, t.hp) * threat(t);
  if (f.kills) v += 6 * threat(t);
  v -= f.ret * 1.1;
  if (f.ret >= u.hp) v -= 30;
  return v;
}

function danger(st, u, at) {
  let d = 0;
  for (const e of enemiesOf(st, u)) if (dist(P(e), at) <= e.move + e.range) d += Math.max(1, e.atk - u.def);
  return d;
}

function positional(st, u, at) {
  const foes = enemiesOf(st, u);
  if (!foes.length) return 0;
  const nearest = Math.min(...foes.map(e => dist(P(e), at)));
  let v = 0;
  if (u.range === 1) v -= nearest * 1.6;
  else { v -= Math.abs(nearest - u.range) * 1.0; if (nearest <= 1) v -= 4; }
  v -= danger(st, u, at) * (u.range > 1 ? 0.25 : 0.08);
  v += 0.4 * living(st, u.side).filter(a => a.id !== u.id && dist(P(a), at) === 1).length;
  const t = st.cells[at[0]][at[1]];
  if (u.range > 1 && t === 'hill') v += 1.5;
  if (u.range > 1 && t === 'forest') v += 0.5;
  return v;
}

function abilityValue(st, u, id, at) {
  const t = unitAt(st, at[0], at[1]), foes = enemiesOf(st, u);
  switch (id) {
    case 'shieldWall': {
      const near = foes.filter(e => e.range === 1 && dist(P(e), P(u)) <= 3).length;
      return near ? 2 + 1.5 * living(st, u.side).filter(a => a.id !== u.id && dist(P(a), P(u)) === 1).length : -1;
    }
    case 'spears': return foes.some(e => e.mounted && dist(P(e), P(u)) <= 6) ? 3 : foes.some(e => e.range === 1 && dist(P(e), P(u)) <= 2) ? 2 : -1;
    case 'challenge': {
      const n = foes.filter(e => dist(P(e), P(u)) <= 2).length;
      return n >= 2 && u.hp > u.maxHp / 2 ? n * 2.5 : -1;
    }
    case 'charge': { const c = chargeLanding(st, u, t); return c ? attackValue(st, u, c.landing, t, { mult: 1.5 }) + 2 : -Infinity; }
    case 'aimed': return attackValue(st, u, P(u), t, { ignoreCover: true }) + 0.5;
    case 'disengage': return attackValue(st, u, P(u), t) + 2;
    case 'cleave': return attackValue(st, u, P(u), t, { noRetaliation: true }) * 1.2;
    case 'chain': return chainTargets(st, u, t).reduce((s, x, i) => s + Math.min(x.hp, u.atk * [1, .75, .5][i]) * threat(x), 0);
    case 'mark': return living(st, u.side).filter(a => a.id !== u.id && a.ap > 0 && dist(P(a), at) <= a.move + a.range).length * 2 - 1;
    case 'heal': { const amt = Math.min(6, t.maxHp - t.hp); return amt >= 3 ? amt * 1.3 : -1; }
    case 'fireball': {
      let v = 0, hitsFoe = false;
      for (const [r, c] of fireballArea(st, at)) {
        const x = unitAt(st, r, c);
        if (!x) continue;
        const d = Math.min(x.hp, fireballDamage(st, x));
        if (x.side === u.side) v -= d * 2;
        else { hitsFoe = true; v += d * threat(x) + (d >= x.hp ? 5 : 0); }
      }
      return hitsFoe && v >= 8 ? v : -Infinity;
    }
    case 'raise': return 9;
  }
  return -Infinity;
}

export function planUnit(st, u) {
  if (u.ap <= 0 || u.hp <= 0) return null;
  const options = [{ at: P(u), path: null, opp: 0 }];
  const reach = reachable(st, u);
  for (const k of reach.tiles.keys()) {
    const path = pathTo(reach, k);
    options.push({ at: unkey(k), path, opp: opportunityStrikes(st, u, path).reduce((s, x) => s + x.dmg, 0) });
  }
  const taunter = u.status.taunt ? unitById(st, u.status.taunt) : null;
  let best = { score: positional(st, u, P(u)), path: null, action: null };
  const consider = (score, plan) => { if (score > best.score) best = { score, ...plan }; };
  const home = P(u);
  for (const o of options) {
    if (o.opp >= u.hp) continue;
    const cost = o.opp * 1.2;
    if (o.path) consider(positional(st, u, o.at) - cost, { path: o.path, action: null });
    if (u.ap - (o.path ? 1 : 0) < 1) continue;
    u.r = o.at[0]; u.c = o.at[1];
    try {
      const base = positional(st, u, o.at) * 0.3 - cost + 2;
      for (const e of enemiesOf(st, u)) {
        if (!canAttack(st, u, o.at, e)) continue;
        const forced = taunter && taunter.hp > 0 && e.id === taunter.id ? 40 : 0;
        consider(base + attackValue(st, u, o.at, e) + forced, { path: o.path, action: { type: 'attack', target: e.id } });
      }
      for (const id of u.abilities) {
        if (id === 'iceWall' || !abilityReady(st, u, id)) continue;
        for (const at of abilityTargets(st, u, id)) {
          const v = abilityValue(st, u, id, at);
          if (v > 0) consider(base + v, { path: o.path, action: { type: 'ability', id, at } });
        }
      }
    } finally { u.r = home[0]; u.c = home[1]; }
  }
  return best.path || best.action ? best : null;
}

export function executePlan(st, u, plan) {
  const ev = [];
  if (plan.path) ev.push(...performMove(st, u, plan.path));
  if (st.winner || u.hp <= 0 || !plan.action || u.ap <= 0) return ev;
  const a = plan.action;
  if (a.type === 'attack') {
    const t = unitById(st, a.target);
    if (canAttack(st, u, P(u), t)) ev.push(...performAttack(st, u, t));
  } else if (abilityReady(st, u, a.id) && abilityTargets(st, u, a.id).some(h => h[0] === a.at[0] && h[1] === a.at[1])) {
    ev.push(...useAbility(st, u, a.id, a.at));
  }
  return ev;
}

// Yields one { unit, ev } batch per executed plan so the view can animate between them.
export function* aiTurn(st, side) {
  const nearest = u => Math.min(99, ...enemiesOf(st, u).map(e => dist(P(e), P(u))));
  const order = living(st, side).sort((a, b) => nearest(a) - nearest(b));
  for (const u of order) {
    let guard = 0;
    while (u.hp > 0 && u.ap > 0 && !st.winner && guard++ < 3) {
      const plan = planUnit(st, u);
      if (!plan) break;
      const ev = executePlan(st, u, plan);
      yield { unit: u, ev };
      if (plan.action && !u.disengage) break;
    }
    if (st.winner) return;
  }
}
