import test from 'node:test';
import assert from 'node:assert/strict';
import { createLane, playRound, aiOrders, damage, makeGroup } from '../js/rules/lane.js';

test('lane battles end within the round cap', () => {
  const st = createLane({ player: ['swordsman', 'archer', 'knight'], enemy: ['skeleton', 'ghoul', 'acolyte'] });
  while (!st.winner) { aiOrders(st, 'player'); aiOrders(st, 'enemy'); playRound(st); }
  assert.ok(['player', 'enemy'].includes(st.winner));
  assert.ok(st.round <= 14);
});

test('holding swordsmen take half from knights', () => {
  const k = makeGroup(1, 'knight', 'enemy'), s = makeGroup(2, 'swordsman', 'player');
  const open = damage(k, s, false);
  s.order = 'hold';
  assert.ok(damage(k, s, false) < open / 2 + 0.01);
});

test('knights hit ranged harder', () => {
  const k = makeGroup(1, 'knight', 'player'), a = makeGroup(2, 'archer', 'enemy'), m = makeGroup(3, 'militia', 'enemy');
  assert.ok(damage(k, a, false) > damage(k, m, false));
});
