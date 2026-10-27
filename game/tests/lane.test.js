import test from 'node:test';
import assert from 'node:assert/strict';
import { createLane, step, aiThink, buy, canBuy, research, canResearch, setCommand, setLine, castBarrage, fighters, miners, goldRate, mineTime, ROSTER, UPGRADES, DT } from '../js/rules/lane.js';

const run = (st, seconds, ai = true) => {
  for (let t = 0; t < seconds / DT && !st.over; t++) {
    if (ai) { if (t % 2) { aiThink(st, 'player'); aiThink(st, 'enemy'); } else { aiThink(st, 'enemy'); aiThink(st, 'player'); } }
    step(st);
  }
};

test('AI vs AI battles end, last minutes not seconds, and both sides research', () => {
  const ends = [];
  for (const [p, e, s] of [['human', 'undead', 1], ['undead', 'human', 2], ['human', 'human', 3], ['human', 'undead', 4]]) {
    const st = createLane({ player: p, enemy: e, seed: s });
    run(st, 1800);
    assert.ok(st.over, `${p} vs ${e} seed ${s} finished`);
    assert.ok(st.t > 240, `lasted ${st.t.toFixed(0)}s`);
    for (const side of ['player', 'enemy']) assert.ok(Object.values(st.sides[side].up).reduce((a, b) => a + b, 0) >= 3, `${side} researched`);
    ends.push(st.t);
  }
  assert.ok(ends.reduce((a, b) => a + b) / ends.length > 360, 'average battle longer than 6 minutes');
});

test('miners walk to the mine, dig and carry gold home', () => {
  const st = createLane({ seed: 1 });
  const g0 = st.sides.player.gold;
  run(st, 40, false);
  assert.ok(st.sides.player.mined >= 20, `mined ${st.sides.player.mined}`);
  assert.ok(st.sides.player.gold > g0 + st.sides.player.mined - 1);
  assert.equal(miners(st, 'player').length, 2);
});

test('pick upgrade speeds up digging and raises the gold rate', () => {
  const st = createLane({ seed: 1 });
  const rate0 = goldRate(st, 'player'), t0 = mineTime(st.sides.player);
  st.sides.player.gold = 1000;
  assert.ok(research(st, 'player', 'picks'));
  assert.equal(canResearch(st, 'player', 'carts'), 'Уже идёт исследование');
  run(st, UPGRADES.picks.levels[0][1] + 1, false);
  assert.equal(st.sides.player.up.picks, 1);
  assert.ok(mineTime(st.sides.player) < t0);
  assert.ok(goldRate(st, 'player') > rate0);
});

test('heavy cavalry and cannons need their upgrades', () => {
  const st = createLane({ seed: 1 });
  st.sides.player.gold = 2000;
  assert.match(canBuy(st, 'player', 'cuirassier'), /Конный завод/);
  assert.match(canBuy(st, 'player', 'cannon'), /Литейня/);
  st.sides.player.up.horses = 1; st.sides.player.up.foundry = 1;
  assert.equal(canBuy(st, 'player', 'cuirassier'), '');
  assert.ok(buy(st, 'player', 'cannon'));
});

test('forge upgrade makes melee hit harder', () => {
  const hitWith = forge => {
    const st = createLane({ seed: 5 });
    st.sides.player.up.forge = forge;
    st.units.push({ id: 900, kind: 'pikeman', side: 'player', x: 600, z: 0, hp: 75, maxHp: 75, cd: 0, facing: 0, charged: false, idle: 0, slotZ: 0, rank: 0, state: 'fight' });
    st.units.push({ id: 901, kind: 'skeleton', side: 'enemy', x: 625, z: 0, hp: 60, maxHp: 60, cd: 9, facing: Math.PI, charged: false, idle: 0, slotZ: 0, rank: 0, state: 'fight' });
    setCommand(st, 'player', 'all', 'attack');
    step(st);
    return 60 - st.units.find(u => u.id === 901).hp;
  };
  assert.ok(hitWith(2) > hitWith(0) * 1.25);
});

test('branch commands: hold line, flank only for cavalry, retreat heals in the fortress', () => {
  const st = createLane({ seed: 1 });
  setLine(st, 'player', 'inf', 500);
  assert.equal(st.sides.player.line.inf, 500);
  assert.equal(setCommand(st, 'player', 'inf', 'flank'), false);
  assert.ok(setCommand(st, 'player', 'cav', 'flank'));
  st.units.push({ id: 900, kind: 'musketeer', side: 'player', x: 40, z: 0, hp: 10, maxHp: 50, cd: 0, facing: 0, charged: false, idle: 0, slotZ: 0, rank: 0, state: 'fight' });
  setCommand(st, 'player', 'rng', 'retreat');
  run(st, 3, false);
  assert.ok(st.units.find(u => u.id === 900).hp > 10);
});

test('cannon shot flies, lands and splashes a group', () => {
  const st = createLane({ seed: 2 });
  st.sides.player.up.foundry = 1;
  st.units.push({ id: 900, kind: 'cannon', side: 'player', x: 300, z: 0, hp: 140, maxHp: 140, cd: 0, facing: 0, charged: false, idle: 0, slotZ: 0, rank: 0, state: 'fight' });
  for (let i = 0; i < 4; i++) st.units.push({ id: 910 + i, kind: 'skeleton', side: 'enemy', x: 620 + i * 6, z: i * 6 - 9, hp: 60, maxHp: 60, cd: 99, facing: Math.PI, charged: false, idle: 0, slotZ: 0, rank: 0, state: 'fight' });
  setCommand(st, 'player', 'all', 'hold');
  setCommand(st, 'enemy', 'all', 'hold');
  st.sides.player.line.art = 300;
  run(st, 3, false);
  const hurt = st.units.filter(u => u.id >= 910 && u.hp < 60).length;
  assert.ok(hurt >= 2, `splash hit ${hurt}`);
});

test('fortress barrage needs a target and goes on cooldown', () => {
  const st = createLane({ seed: 1 });
  st.sides.player.barrageCd = 0;
  assert.equal(castBarrage(st, 'player'), false);
  st.units.push({ id: 901, kind: 'skeleton', side: 'enemy', x: 600, z: 0, hp: 60, maxHp: 60, cd: 0, facing: Math.PI, charged: false, idle: 0, slotZ: 0, rank: 0, state: 'fight' });
  assert.ok(castBarrage(st, 'player'));
  assert.ok(st.sides.player.barrageCd > 0);
  assert.ok(fighters(st, 'enemy').length === 1 && ROSTER.skeleton);
});
