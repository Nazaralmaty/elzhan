import test from 'node:test';
import assert from 'node:assert/strict';
import { createLane, playRound, aiOrders, damage, makeGroup, active } from '../js/rules/lane.js';

function run(player, enemy, seed = 1, plan) {
  const st = createLane({ player, enemy, seed });
  while (!st.winner) { if (plan) plan(st); else aiOrders(st, 'player'); playRound(st); }
  return st;
}

test('lane battles end within the round cap', () => {
  for (let s = 1; s <= 10; s++) {
    const st = run(['swordsman', 'archer', 'knight', 'militia'], ['skeleton', 'ghoul', 'acolyte', 'deathknight'], s);
    assert.ok(['player', 'enemy'].includes(st.winner));
    assert.ok(st.round <= 17);
  }
});

test('militia holding spears punish a charge', () => {
  const st = createLane({ player: ['militia'], enemy: ['knight'], seed: 3 });
  st.terrain = [];
  const m = st.groups[0], k = st.groups[1];
  m.pos = 5; k.pos = 8; m.order = 'hold'; k.order = 'charge';
  playRound(st);
  const st2 = createLane({ player: ['militia'], enemy: ['knight'], seed: 3 });
  st2.terrain = [];
  st2.groups[0].pos = 5; st2.groups[1].pos = 8; st2.groups[0].order = 'advance'; st2.groups[1].order = 'charge';
  playRound(st2);
  assert.ok(k.hp < st2.groups[1].hp, 'charging into held spears hurts the knights more');
});

test('tired groups hit softer, holding shields block arrows', () => {
  const st = createLane({ player: ['swordsman'], enemy: ['archer'], seed: 1 });
  st.terrain = [];
  const s = st.groups[0], a = st.groups[1];
  const fresh = damage(st, s, a, 'melee').dmg;
  s.stamina = 10;
  assert.ok(damage(st, s, a, 'melee').dmg < fresh);
  s.order = 'advance';
  const open = damage(st, a, s, 'ranged').dmg;
  s.order = 'hold';
  assert.ok(damage(st, a, s, 'ranged').dmg < open);
});

test('losing morale makes a living group rout', () => {
  const st = createLane({ player: ['militia'], enemy: ['swordsman', 'swordsman', 'knight'], seed: 2 });
  while (!st.winner) { st.groups[0].order = 'advance'; playRound(st); }
  assert.equal(st.winner, 'enemy');
  assert.ok(['rout', 'fled', 'dead'].includes(st.groups[0].state));
});

test('falling back restores stamina, fighting drains it', () => {
  const st = createLane({ player: ['swordsman', 'swordsman'], enemy: ['skeleton', 'skeleton'], seed: 4 });
  st.terrain = [];
  const [a, b] = st.groups;
  a.pos = 5; b.pos = 4.2; st.groups[2].pos = 6; st.groups[3].pos = 6.5;
  a.order = 'advance'; b.order = 'hold';
  playRound(st);
  assert.ok(a.stamina < b.stamina);
  const tired = a.stamina;
  a.order = 'fallback';
  playRound(st);
  assert.ok(a.stamina > tired);
});
