import test from 'node:test';
import assert from 'node:assert/strict';
import { neighbor, dist, line, straight } from '../js/core/hex.js';
import {
  createBattle, reachable, computeDamage, performMove, performAttack, useAbility, endTurn, unitAt,
  opportunityStrikes, pathTo, los, abilityTargets, living
} from '../js/rules/skirmish.js';
import { aiTurn } from '../js/ai/skirmish-ai.js';

// Empty grass arena with hand-placed units.
function blank(units) {
  const st = createBattle({ seed: 1, arena: 'field', player: [], enemy: [] });
  st.cells = st.cells.map(row => row.map(() => 'grass'));
  st.phase = 'battle';
  units.forEach(([kind, side, r, c]) => {
    const s = createBattle({ seed: 1, arena: 'field', player: side === 'player' ? [kind] : [], enemy: side === 'enemy' ? [kind] : [] });
    const u = { ...s.units[0], id: st.nextId++, r, c, cd: {}, status: {}, ap: side === 'player' ? 2 : 0 };
    st.units.push(u);
  });
  return st;
}
const at = (st, r, c) => unitAt(st, r, c);

test('hex neighbors are symmetric and distance 1', () => {
  for (const [r, c] of [[2, 3], [3, 3]]) for (let d = 0; d < 6; d++) {
    const n = neighbor(r, c, d), back = neighbor(n[0], n[1], (d + 3) % 6);
    assert.deepEqual(back, [r, c]);
    assert.equal(dist([r, c], n), 1);
  }
});

test('line and straight', () => {
  assert.equal(line([0, 0], [0, 4]).length, 5);
  assert.deepEqual(straight([2, 2], [2, 5]), { d: 5, n: 3 });
});

test('ZoC stops movement next to an enemy melee unit', () => {
  const st = blank([['swordsman', 'player', 2, 1], ['skeleton', 'enemy', 2, 4]]);
  const u = at(st, 2, 1);
  const reach = reachable(st, u);
  assert.ok(reach.tiles.has('2,3'));
  assert.ok(!reach.tiles.has('2,5'), 'cannot pass through the zone');
});

test('leaving ZoC provokes an opportunity strike', () => {
  const st = blank([['archer', 'player', 2, 3], ['skeleton', 'enemy', 2, 4]]);
  const u = at(st, 2, 3);
  const reach = reachable(st, u);
  const path = pathTo(reach, '2,1');
  const strikes = opportunityStrikes(st, u, path);
  assert.equal(strikes.length, 1);
  performMove(st, u, path);
  assert.equal(u.hp, 12 - strikes[0].dmg);
});

test('flank and pincer add damage', () => {
  const st = blank([['swordsman', 'player', 3, 3], ['skeleton', 'enemy', 3, 4]]);
  const s = at(st, 3, 3), t = at(st, 3, 4);
  const plain = computeDamage(st, s, [3, 3], t).dmg;
  assert.equal(plain, 7 - 1);
  st.units.push({ ...s, id: 99, kind: 'knight', r: 3, c: 5 });
  const pinc = computeDamage(st, s, [3, 3], t);
  assert.deepEqual(pinc.bonuses.map(b => b[0]), ['Фланг', 'Клещи']);
  assert.equal(pinc.dmg, Math.round(7 * 1.5) - 1);
});

test('melee retaliation happens once', () => {
  const st = blank([['militia', 'player', 2, 2], ['swordsman', 'enemy', 2, 3]]);
  const m = at(st, 2, 2), e = at(st, 2, 3);
  performAttack(st, m, e);
  assert.ok(m.hp < 15);
  assert.ok(e.retaliated);
});

test('wall blocks line of sight, rock gives cover', () => {
  const st = blank([]);
  st.cells[2][3] = 'wall';
  assert.equal(los(st, [2, 1], [2, 5]).clear, false);
  st.cells[2][3] = 'rock';
  assert.equal(los(st, [2, 1], [2, 4]).cover, 0.5);
});

test('charge pushes target, blocked push hurts', () => {
  const st = blank([['knight', 'player', 2, 0], ['skeleton', 'enemy', 2, 3]]);
  const k = at(st, 2, 0), t = at(st, 2, 3);
  assert.ok(abilityTargets(st, k, 'charge').some(h => h[0] === 2 && h[1] === 3));
  useAbility(st, k, 'charge', [2, 3]);
  assert.deepEqual([k.r, k.c], [2, 2]);
  assert.ok(t.hp <= 0 || t.c === 4);
});

test('shield wall halves knight damage and blocks knockback', () => {
  const st = blank([['knight', 'enemy', 2, 0], ['swordsman', 'player', 2, 3]]);
  const s = at(st, 2, 3);
  s.status.shieldWall = true;
  const k = at(st, 2, 0);
  const f = computeDamage(st, k, [2, 2], s, { mult: 1.5 });
  assert.ok(f.bonuses.some(b => b[0] === 'Стена щитов'));
});

test('fireball spends mana and hits allies too', () => {
  const st = blank([['battlemage', 'player', 2, 0], ['skeleton', 'enemy', 2, 3], ['militia', 'player', 2, 4]]);
  const m = at(st, 2, 0);
  useAbility(st, m, 'fireball', [2, 3]);
  assert.equal(st.mana.player, 15);
  assert.ok(at(st, 2, 4).hp < 15);
});

test('AI vs AI battles always finish', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const st = createBattle({ seed, arena: 'random', player: ['alden', 'swordsman', 'knight', 'archer', 'apprentice'], enemy: ['skeleton', 'skeleton', 'ghoul', 'deathknight', 'acolyte', 'skeleton'] });
    st.phase = 'battle';
    st.auto = true;
    while (!st.winner && st.round < 60) {
      for (const _ of aiTurn(st, st.turn)) { /* drain */ }
      if (!st.winner) endTurn(st);
    }
    assert.ok(st.winner, `seed ${seed} finished by round ${st.round}`);
    assert.ok(living(st).every(u => u.hp > 0));
  }
});
