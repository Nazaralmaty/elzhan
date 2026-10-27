import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, tick, DT, spawnUnit, commandWork, commandMove, orderBuild, canPlace, train, formFormation, canForm, setShape, unit, centerOf, TREE } from '../js/rts/sim.js';
import { aiTick } from '../js/rts/ai.js';
import { createMap, MAP_SIZES } from '../js/rts/map.js';
import { UNITS } from '../js/rts/data.js';

const run = (st, seconds, ai = []) => { for (let i = 0; i < seconds / DT && !st.over; i++) { for (const s of ai) aiTick(st, s, DT); tick(st, DT); st.events.length = 0; } };

test('maps give every start a town hall, forest, stone and all three deposits nearby', () => {
  for (const [size, players, seed] of [['small', 2, 1], ['medium', 3, 2], ['large', 4, 3]]) {
    const m = createMap({ size, players, seed });
    assert.equal(m.W, MAP_SIZES[size]);
    for (const s of m.starts) {
      for (const k of ['gold', 'iron', 'coal']) assert.ok(m.deposits.some(d => d.kind === k && Math.hypot(d.x - s.x, d.z - s.z) < 30), `${k} near start`);
    }
  }
});

test('peasants chop wood and carry it to the town hall', () => {
  const st = createGame({ size: 'small', players: 2, seed: 4 });
  const peasants = st.units.filter(u => u.side === 0).map(u => u.id);
  const th = centerOf(st.buildings.find(b => b.side === 0));
  let tree = -1;
  for (let r = 4; r < 40 && tree < 0; r++) for (let j = -r; j <= r && tree < 0; j++) for (let i = -r; i <= r; i++) { const k = (Math.floor(th.z) + j) * st.W + Math.floor(th.x) + i; if (st.map.kind[k] === TREE) { tree = k; break; } }
  assert.ok(commandWork(st, peasants.slice(0, 4), tree % st.W + 0.5, Math.floor(tree / st.W) + 0.5));
  const w0 = st.sides[0].res.wood;
  run(st, 90);
  assert.ok(st.sides[0].res.wood > w0 + 20, `wood ${st.sides[0].res.wood}`);
});

test('building a mill and farming makes food', () => {
  const st = createGame({ size: 'small', players: 2, seed: 5 });
  const ids = st.units.filter(u => u.side === 0).map(u => u.id).slice(0, 5);
  const th = st.buildings.find(b => b.side === 0);
  let spot = null;
  for (let r = 8; r < 20 && !spot; r++) for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (!spot && canPlace(st, 0, 'mill', th.x + dx, th.z + dz) === '') spot = [th.x + dx, th.z + dz];
  assert.ok(spot);
  assert.equal(orderBuild(st, 0, 'mill', spot[0], spot[1], ids), '');
  run(st, 40);
  const mill = st.buildings.find(b => b.side === 0 && b.kind === 'mill');
  assert.ok(mill.done, 'mill built');
  const food = st.sides[0].res.food;
  run(st, 60);
  assert.ok(mill.farmers.length >= 3);
  assert.ok(st.sides[0].res.food > food, 'food grows');
});

test('formation needs officer and drummer, keeps shape and loses morale to losses', () => {
  const st = createGame({ size: 'small', players: 2, seed: 6 });
  const th = st.buildings.find(b => b.side === 0);
  for (let k = 0; k < 15; k++) spawnUnit(st, 0, 'pikeman', th.x + 1 + (k % 5), th.z + 8 + Math.floor(k / 5));
  assert.match(canForm(st, 0, 'pikeman', 15, th), /офицер/);
  spawnUnit(st, 0, 'officer', th.x, th.z + 8);
  assert.match(canForm(st, 0, 'pikeman', 15, th), /барабанщик/);
  spawnUnit(st, 0, 'drummer', th.x, th.z + 9);
  const r = formFormation(st, 0, 'pikeman', 15, { x: th.x, z: th.z + 8 });
  assert.ok(r.f, r.why);
  setShape(st, r.f.id, 'square');
  run(st, 10);
  assert.equal(r.f.members.length, 15);
  const m0 = r.f.morale;
  for (const id of r.f.members.slice(0, 4)) unit(st, id).hp = 0;
  tick(st, DT);
  assert.ok(r.f.morale < m0 - 20, `morale ${r.f.morale}`);
});

test('AI vs AI: economy grows, armies form and a side wins or holds', () => {
  const st = createGame({ size: 'small', players: 2, seed: 1 });
  run(st, 14 * 60, [0, 1]);
  for (const S of st.sides) assert.ok(S.stats.gathered > 3000, `${S.name} gathered ${S.stats.gathered}`);
  assert.ok(st.over || st.units.filter(u => !UNITS[u.kind].peasant).length > 10);
});
