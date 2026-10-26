import test from 'node:test';
import assert from 'node:assert/strict';
import { key, dist } from '../js/core/hex.js';
import { newKingdom, moveArmy, attackOptions, battleFor, autoResolve, applyBattle, endKingdomTurn, serialize, deserialize } from '../js/rules/kingdom.js';
import { armyReach, reachPath, territory, ring } from '../js/rules/map.js';
import { buildOptions, build, recruit, recruitOptions, forecast, cityYield, setWorkers, trade, marketRate, buildingsOf } from '../js/rules/economy.js';

const capital = K => K.cities.find(c => c.capital);
const myArmy = K => K.armies.find(a => a.owner === 'player');

test('new kingdom: capital, hero army, lairs, fog', () => {
  for (const size of ['short', 'medium', 'long']) {
    const K = newKingdom({ seed: 5, size });
    assert.equal(K.cities.length, 1);
    assert.equal(myArmy(K).units.length, 3);
    assert.ok(K.lairsTotal >= 3, size + ' lairs');
    assert.ok(Object.keys(K.explored).length > 0);
    assert.ok(Object.keys(K.explored).length < K.w * K.h);
  }
});

test('farm with mill neighbour gets the bonus', () => {
  const K = newKingdom({ seed: 11, size: 'short' });
  const cap = capital(K);
  const [fk, farm] = buildingsOf(K, cap.id).find(([, b]) => b.type === 'farm');
  farm.workers = 2;
  const base = cityYield(K, cap).food;
  const spot = ring(K, cap.r, cap.c, 1).find(([r, c]) => K.tiles[r][c] === 'grass' && !K.buildings[key(r, c)] && dist([r, c], fk.split(',').map(Number)) === 1);
  if (!spot) return; // map without a free grass neighbour: nothing to check
  K.res.wood = 50; K.res.stone = 50;
  assert.ok(build(K, spot[0], spot[1], 'mill'));
  farm.workers = 2;
  assert.equal(cityYield(K, cap).food, base + 1);
});

test('build options respect tile and territory', () => {
  const K = newKingdom({ seed: 3, size: 'short' });
  const own = territory(K);
  const outside = [...Array(K.h).keys()].flatMap(r => [...Array(K.w).keys()].map(c => [r, c])).find(([r, c]) => !own.has(key(r, c)));
  assert.equal(buildOptions(K, ...outside).list.length, 0);
});

test('recruit militia into the capital stack', () => {
  const K = newKingdom({ seed: 2, size: 'short' });
  const cap = capital(K);
  K.res.food = 100; K.res.wood = 100;
  const a = myArmy(K);
  const before = a.r === cap.r && a.c === cap.c ? a.units.length : 0;
  assert.ok(recruit(K, cap, 'militia'));
  const stack = K.armies.find(x => x.r === cap.r && x.c === cap.c);
  assert.equal(stack.units.length, before + 1);
  assert.ok(recruitOptions(K, cap).find(o => o.kind === 'swordsman').why);
});

test('market needs a market building', () => {
  const K = newKingdom({ seed: 2, size: 'short' });
  assert.equal(marketRate(K), 0);
  assert.equal(trade(K, 'wood', 'gold', 1), false);
});

test('save round trip', () => {
  const K = newKingdom({ seed: 9, size: 'short' });
  const K2 = deserialize(serialize(K));
  assert.deepEqual(K2.tiles, K.tiles);
  assert.equal(K2.armies.length, K.armies.length);
});

test('bot plays 60 turns without breaking', () => {
  for (const seed of [1, 2, 3]) {
    const K = newKingdom({ seed, size: 'medium' });
    for (let t = 0; t < 60 && K.status === 'playing'; t++) {
      // build whatever is affordable on free territory, recruit militia, attack reachable lairs
      for (const city of K.cities) {
        for (const [r, c] of ring(K, city.r, city.c, 2)) {
          const opt = buildOptions(K, r, c).list.find(o => !o.why && ['farm', 'sawmill', 'quarry', 'house', 'mill'].includes(o.id));
          if (opt) build(K, r, c, opt.id);
        }
        recruit(K, city, 'militia');
      }
      for (const a of K.armies.filter(x => x.owner === 'player')) {
        const opts = attackOptions(K, a).filter(o => o.target.owner === 'monster');
        if (opts.length && a.units.length >= 3) {
          if (opts[0].path) moveArmy(K, a, opts[0].path);
          const st = autoResolve(battleFor(K, a, opts[0].target));
          applyBattle(K, st);
        } else if (a.mp > 0) {
          const reach = armyReach(K, a);
          const ks = [...reach.tiles.keys()];
          if (ks.length) moveArmy(K, a, reachPath(reach, ks[(seed * 7 + t) % ks.length]));
        }
      }
      const { battles } = endKingdomTurn(K);
      for (const b of battles) {
        const atk = K.armies.find(x => x.id === b.attacker), def = K.armies.find(x => x.id === b.defender);
        if (atk && def) applyBattle(K, autoResolve(battleFor(K, atk, def)));
      }
      for (const r in K.res) assert.ok(K.res[r] >= 0, `${r} non-negative`);
      K.cities.forEach(c => assert.ok(c.pop >= 1));
    }
    assert.ok(K.turn > 10);
    assert.ok(forecast(K));
  }
});
