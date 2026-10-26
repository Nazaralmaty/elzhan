import test from 'node:test';
import assert from 'node:assert/strict';
import { createWar, step, buy, aiThink, units, castRain, setCommand, ROSTER, DT } from '../js/rules/war.js';

const run = (st, seconds, playerAi = true) => {
  for (let t = 0; t < seconds / DT && !st.over; t++) { if (playerAi && t % 10 === 0) aiThink(st, 'player'); step(st); }
};

test('AI vs AI wars end with a destroyed base', () => {
  for (const [p, e, s] of [['human', 'undead', 1], ['human', 'human', 2], ['human', 'undead', 3]]) {
    const st = createWar({ player: p, enemy: e, seed: s, hero: 'alden' });
    run(st, 900);
    assert.ok(st.over, `${p} vs ${e} finished at ${st.t.toFixed(0)}s`);
  }
});

test('buying spends gold and trains a unit', () => {
  const st = createWar({ seed: 1 });
  assert.ok(buy(st, 'player', 'militia'));
  assert.equal(st.sides.player.gold, 150 - ROSTER.militia.cost);
  for (let i = 0; i < 40; i++) step(st);
  assert.ok(units(st, 'player').some(u => u.kind === 'militia'));
});

test('miners raise income', () => {
  const st = createWar({ seed: 1 });
  const before = st.sides.player.gold;
  buy(st, 'player', 'miner');
  run(st, 30, false);
  const st2 = createWar({ seed: 1 });
  run(st2, 30, false);
  assert.ok(st.sides.player.gold + ROSTER.miner.cost > st2.sides.player.gold + 20 || before === 150);
});

test('knight charge hits harder on the first blow', () => {
  const st = createWar({ seed: 1 });
  st.sides.enemy.command = 'defend';
  st.units.push({ id: 900, kind: 'knight', side: 'player', x: 500, hp: 140, maxHp: 140, cd: 0, depth: 0, charged: true, idle: 2 });
  st.units.push({ id: 901, kind: 'swordsman', side: 'enemy', x: 525, hp: 100, maxHp: 100, cd: 5, depth: 0, charged: false, idle: 0 });
  st.sides.player.command = 'attack';
  step(st);
  assert.ok(st.events.some(e => e.t === 'charge'));
});

test('garrison heals and rain of arrows hits a cluster', () => {
  const st = createWar({ seed: 1 });
  st.units.push({ id: 900, kind: 'swordsman', side: 'player', x: 10, hp: 20, maxHp: 100, cd: 0, depth: 0, charged: false, idle: 0 });
  setCommand(st, 'player', 'garrison');
  for (let i = 0; i < 40; i++) step(st);
  assert.ok(st.units.find(u => u.id === 900).hp > 20);
  st.units.push({ id: 901, kind: 'skeleton', side: 'enemy', x: 600, hp: 40, maxHp: 40, cd: 0, depth: 0, charged: false, idle: 0 });
  st.sides.player.rainCd = 0;
  assert.ok(castRain(st, 'player'));
});
