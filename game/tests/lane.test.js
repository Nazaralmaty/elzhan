import test from 'node:test';
import assert from 'node:assert/strict';
import { createLane, step, aiThink, buy, canBuy, build, canBuild, research, canResearch, setCommand, setLine, fighters, miners, goldRate, mineTime, veinSafe, ROSTER, UPGRADES, BUILDINGS, FACTIONS, VEINS, DT } from '../js/rules/lane.js';

const run = (st, seconds, ai = true) => {
  for (let t = 0; t < seconds / DT && !st.over; t++) {
    if (ai) { if (t % 2) { aiThink(st, 'player'); aiThink(st, 'enemy'); } else { aiThink(st, 'enemy'); aiThink(st, 'player'); } }
    step(st);
    st.events.length = 0;
  }
};
const soldier = (st, kind, side, x, z = 0, o = {}) => {
  const hp = ROSTER[kind].hp;
  const u = { id: 900 + st.units.length, kind, side, x, z, hp, maxHp: hp, cd: 0, facing: side === 'player' ? 0 : Math.PI, charged: false, idle: 0, slotZ: z, rank: 0, state: 'fight', ...o };
  st.units.push(u);
  return u;
};

test('AI vs AI battles end, last minutes, both sides build academies and research', () => {
  let researched = 0;
  for (const [p, e, s] of [['human', 'undead', 1], ['undead', 'human', 2], ['human', 'human', 3]]) {
    const st = createLane({ player: p, enemy: e, seed: s, playerLevel: 1, enemyLevel: 1, hero: FACTIONS[p].heroes[0], enemyHero: FACTIONS[e].heroes[1] });
    run(st, 2400);
    assert.ok(st.over, `${p} vs ${e} seed ${s} finished`);
    assert.ok(st.t > 360, `lasted ${st.t.toFixed(0)}s`);
    researched += Object.keys(st.sides.player.up).length + Object.keys(st.sides.enemy.up).length;
    for (const side of ['player', 'enemy']) assert.ok(Object.values(st.sides[side].bld).filter(b => b?.done).length >= 4, `${side} built academies`);
  }
  assert.ok(researched >= 30, `researched ${researched} over three battles`);
});

test('every state lists its own units, heroes, buildings and research', () => {
  for (const F of Object.values(FACTIONS)) {
    for (const k of [...F.roster, ...F.heroes]) assert.ok(ROSTER[k], k);
    for (const k of F.roster) assert.ok(F.buildings.includes(ROSTER[k].b), `${k} academy`);
    for (const b of F.buildings) for (const u of BUILDINGS[b].ups) assert.equal(UPGRADES[u].at, b);
  }
});

test('miners carry gold from the safe mine, then fill veins the army covers', () => {
  const st = createLane({ seed: 1 });
  const g0 = st.sides.player.gold;
  run(st, 40, false);
  assert.ok(st.sides.player.mined >= 20, `mined ${st.sides.player.mined}`);
  assert.ok(st.sides.player.gold > g0 + st.sides.player.mined - 1);
  // the near vein is covered by the default line; extra miners go there and dig on the spot
  const S = st.sides.player;
  assert.ok(veinSafe(st, 'player', VEINS[0]));
  S.gold = 2000;
  for (let i = 0; i < 6; i++) buy(st, 'player', 'miner');
  run(st, 90, false);
  const onVein = miners(st, 'player').filter(u => u.vein === 0 && u.state === 'vdig');
  assert.ok(onVein.length >= 1, `on vein ${onVein.length}`);
  // an enemy soldier at the vein chases them off
  const p = VEINS[0];
  soldier(st, 'skeleton', 'enemy', p.x, p.z);
  assert.equal(veinSafe(st, 'player', VEINS[0]), false);
});

test('picks speed up digging and raise the gold rate', () => {
  const st = createLane({ seed: 1 });
  const S = st.sides.player, rate0 = goldRate(st, 'player'), t0 = mineTime(S);
  S.gold = 2000;
  assert.match(canResearch(st, 'player', 'picks'), /Рудничная контора/);
  assert.ok(build(st, 'player', 'office'));
  run(st, BUILDINGS.office.time + 1, false);
  assert.ok(research(st, 'player', 'picks'));
  assert.ok(research(st, 'player', 'longpikes'), 'another building researches at the same time');
  assert.match(canResearch(st, 'player', 'carts'), /занято/);
  run(st, UPGRADES.picks.time + 1, false);
  assert.ok(S.up.picks);
  assert.ok(mineTime(S) < t0);
  assert.ok(goldRate(st, 'player') > rate0);
});

test('academies unlock their units; undead elite costs souls', () => {
  const st = createLane({ player: 'undead', enemy: 'human', seed: 1 });
  const S = st.sides.player;
  S.gold = 3000;
  assert.match(canBuy(st, 'player', 'deathknight'), /Чёрная конюшня/);
  assert.ok(build(st, 'player', 'blackstable'));
  assert.equal(canBuild(st, 'player', 'blackstable'), 'Строится');
  run(st, BUILDINGS.blackstable.time + 1, false);
  assert.equal(canBuy(st, 'player', 'deathknight'), 'Мало душ');
  S.souls = 10;
  assert.ok(buy(st, 'player', 'deathknight'));
  assert.equal(S.souls, 10 - ROSTER.deathknight.souls);
});

test('a death on the field gives souls to the undead', () => {
  const st = createLane({ player: 'human', enemy: 'undead', seed: 2 });
  soldier(st, 'pikeman', 'player', 700, 0, { hp: 0 });
  step(st);
  assert.equal(st.sides.enemy.souls, 1);
  assert.equal(st.sides.player.souls, 0);
});

test('research makes a unit hit harder', () => {
  const hitWith = up => {
    const st = createLane({ seed: 5 });
    if (up) st.sides.player.up.longpikes = 1;
    soldier(st, 'pikeman', 'player', 600);
    const sk = soldier(st, 'skeleton', 'enemy', 625, 0, { cd: 9 });
    setCommand(st, 'player', 'all', 'attack');
    step(st);
    return ROSTER.skeleton.hp - sk.hp;
  };
  assert.ok(hitWith(true) > hitWith(false) * 1.1);
});

test('hedgehog: braced pikemen stand and double their damage against riders', () => {
  const st = createLane({ seed: 3 });
  st.sides.player.skills.add('hedgehog');
  const pk = soldier(st, 'pikeman', 'player', 600);
  const dk = soldier(st, 'deathknight', 'enemy', 690, 0, { cd: 9 });
  setCommand(st, 'player', 'all', 'attack');
  step(st);
  assert.ok(pk.brace, 'braced');
  assert.ok(Math.abs(pk.x - 600) < 1, 'stands');
  dk.x = 625;
  step(st);
  assert.ok(ROSTER.deathknight.hp - dk.hp > ROSTER.pikeman.dmg * ROSTER.pikeman.vsMounted * (1 - ROSTER.deathknight.armor) * 1.5);
});

test('branch commands: hold line, flank only for cavalry, the kingdom heals in the fortress, the undead do not', () => {
  const st = createLane({ player: 'human', enemy: 'undead', seed: 1 });
  setLine(st, 'player', 'inf', 500);
  assert.equal(st.sides.player.line.inf, 500);
  assert.equal(setCommand(st, 'player', 'inf', 'flank'), false);
  assert.ok(setCommand(st, 'player', 'cav', 'flank'));
  const m = soldier(st, 'musketeer', 'player', 40, 0, { hp: 10 });
  const sk = soldier(st, 'skeleton', 'enemy', 1360, 0, { hp: 10 });
  setCommand(st, 'player', 'rng', 'retreat');
  setCommand(st, 'enemy', 'inf', 'retreat');
  run(st, 3, false);
  assert.ok(m.hp > 10);
  assert.equal(sk.hp, 10);
});
