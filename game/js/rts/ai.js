// Computer opponent for "Казаки": grows peasants, balances food/wood/stone/mines, builds by phases,
// trains officers, drummers and soldiers, forms 15/36-men formations, defends home, attacks in waves.
import { UNITS, BUILDINGS, UPGRADES, GATHER } from './data.js';
import {
  canPlace, orderBuild, train, canTrain, research, canResearch, setTask, commandMove, commandAttack, formFormation, canForm, setShape,
  moveFormation, centerOf, distToBuilding, findResource, unit, building, TREE, ROCK, canAfford
} from './sim.js';

const THINK = 1;

export function aiTick(st, side, dt) {
  st.ai ||= {};
  const A = st.ai[side] ||= { t: side * 0.25, wave: 0, nextAttack: null, attacking: false, target: 0, rally: null, startArmy: 0, buildT: 0 };
  A.t -= dt;
  if (A.t > 0) return;
  A.t = THINK;
  const S = st.sides[side];
  if (S.defeated) return;
  const th = st.buildings.find(b => b.side === side && b.kind === 'townhall');
  const home = th ? centerOf(th) : null;
  if (!home) { rebuildTownhall(st, side); return; }
  const mine = st.units.filter(u => u.side === side);
  const peasants = mine.filter(u => UNITS[u.kind].peasant);
  const my = kind => st.buildings.filter(b => b.side === side && b.kind === kind);
  const done = kind => my(kind).filter(b => b.done);
  const diff = st.difficulty;

  /* economy: peasants */
  const peasantGoal = Math.min(80, Math.round((22 + st.t / 10) * [0.75, 0.9, 1, 1.1][diff]));
  const pop = mine.length + st.buildings.filter(b => b.side === side).reduce((n, b) => n + b.queue.length, 0);
  if (peasants.length < peasantGoal && th.done && th.queue.length < 2 && S.res.food > (st.buildings.some(b => b.side === side && b.kind === 'mill' && b.done) ? 90 : 300) && pop < S.popCap) train(st, th.id, 'peasant');

  // jobs
  const job = u => u.inside ? 'mine:' + building(st, u.inside)?.res : u.task ? (u.task.kind === 'gather' ? u.task.res : u.task.kind === 'mine' ? 'mine:' + building(st, u.task.b)?.res : u.task.kind) : 'idle';
  const counts = {};
  for (const u of peasants) { const j = job(u); counts[j] = (counts[j] || 0) + 1; }
  const eat = mine.reduce((a, u) => a + UNITS[u.kind].eat, 0);
  const foodRate = GATHER.food * (S.up.scythe ? 1.25 : 1) * (S.up.threefield ? 1.35 : 1) * S.gatherMult;
  // food pays for every recruit, so farms get a big share, more when the stock is low
  const farmersWanted = Math.max(Math.ceil(eat / foodRate * 1.4) + 3, Math.round(peasants.length * (S.res.food < 300 ? 0.5 : S.res.food > 2500 ? 0.25 : 0.4)));
  const mills = done('mill');
  const farmSlots = mills.length * BUILDINGS.mill.farm;
  const mineJobs = {};
  for (const b of done('mine')) mineJobs[b.res] = (mineJobs[b.res] || 0) + Math.max(0, (S.up.deepmines ? 10 : 5) - b.workers.length - peasants.filter(u => u.task?.kind === 'mine' && u.task.b === b.id && !u.inside).length);

  // idle peasants (and builders whose building is gone) pick the job with the biggest shortage
  for (const u of peasants) {
    if (u.inside || (u.task && u.order.type === 'task')) continue;
    const farm = mills.find(b => b.farmers.length + peasants.filter(p => p.task?.kind === 'farm' && p.task.b === b.id && !b.farmers.includes(p.id)).length < BUILDINGS.mill.farm);
    const want = [
      ['farm', farmersWanted - (counts.farm || 0), !!farm],
      ...Object.entries(mineJobs).map(([res, n]) => ['mine:' + res, n, n > 0]),
      ['wood', Math.max(5, peasants.length * (S.res.wood > 2000 ? 0.08 : 0.28)) - (counts.wood || 0), true],
      ['stone', Math.max(2, peasants.length * (S.res.stone > 1500 ? 0.03 : 0.12)) - (counts.stone || 0), true]
    ].filter(w => w[2]).sort((a, b) => b[1] - a[1]);
    const pick = want[0]?.[0] || 'wood';
    if (pick === 'farm') { setTask(st, u, { kind: 'farm', b: farm.id }); }
    else if (pick.startsWith('mine:')) { const res = pick.slice(5); const b = done('mine').filter(b => b.res === res).sort((a, c) => a.workers.length - c.workers.length)[0]; if (b) { setTask(st, u, { kind: 'mine', b: b.id }); mineJobs[res]--; } }
    else {
      const cell = findResource(st, u.x, u.z, pick === 'wood' ? TREE : ROCK, 40);
      if (cell >= 0) setTask(st, u, { kind: 'gather', res: pick, cell });
    }
    counts[pick] = (counts[pick] || 0) + 1;
  }
  // rebalance a couple of workers per think: surplus jobs feed the scarcest one
  const surplus = ['wood', 'stone'].filter(r => S.res[r] > (r === 'wood' ? 1500 : 1000) && (counts[r] || 0) > 3);
  const freeFarm = mills.find(b => b.farmers.length < BUILDINGS.mill.farm);
  if ((counts.farm || 0) < farmersWanted - 1 && freeFarm && surplus.length) {
    const w = peasants.find(u => u.task?.kind === 'gather' && u.task.res === surplus[0]);
    if (w) setTask(st, w, { kind: 'farm', b: freeFarm.id });
  }
  if (S.res.food > 3500 && (counts.farm || 0) > 6) {
    const f = peasants.find(u => u.task?.kind === 'farm');
    if (f) { const cell = findResource(st, f.x, f.z, TREE, 40); if (cell >= 0) setTask(st, f, { kind: 'gather', res: 'wood', cell }); }
  }

  /* construction by phases */
  const building_ = st.buildings.filter(b => b.side === side && !b.done);
  const builders = n => peasants.filter(u => !u.inside && u.task?.kind !== 'build' && u.task?.kind !== 'mine').sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z)).slice(0, n).map(u => u.id);
  // unfinished buildings without builders get some
  for (const b of building_) {
    const n = peasants.filter(u => u.task?.kind === 'build' && u.task.b === b.id).length;
    if (n < 2) for (const id of builders(2 - n)) setTask(st, unit(st, id), { kind: 'build', b: b.id });
  }
  const tryBuild = (kind, near, n = 3, spread = 12) => {
    if (!canAfford(S, BUILDINGS[kind].cost)) return false;
    const spot = kind === 'mine' ? near : findSpot(st, side, kind, near, spread);
    if (!spot) return false;
    return orderBuild(st, side, kind, spot.x, spot.z, builders(n)) === '';
  };
  const inProgress = kind => building_.some(b => b.kind === kind);
  if (building_.length < 3) {
    if (S.popCap - pop < 8 && S.popCap < 400 && !inProgress('house')) tryBuild('house', home, 2);
    else if ((mills.length === 0 || farmersWanted > farmSlots - 2) && !inProgress('mill') && my('mill').length < 6) tryBuild('mill', home, 3, 14);
    else if (my('storehouse').length < 1 + Math.floor(st.t / 600) && st.t > 40 && !inProgress('storehouse')) {
      const cell = findResource(st, home.x, home.z, TREE, 40);
      tryBuild('storehouse', cell >= 0 ? { x: cell % st.W, z: Math.floor(cell / st.W) } : home, 2, 6);
    } else if (st.t > 90 && !inProgress('mine')) {
      // stone mine once the outcrops near home are thin
      const rocksLeft = findResource(st, home.x, home.z, ROCK, 30) >= 0;
      for (const res of rocksLeft && st.t < 900 ? ['gold', 'coal', 'iron'] : ['stone', 'gold', 'coal', 'iron']) {
        const have = my('mine').filter(b => b.res === res).length;
        if (have >= 1 + ((st.t > 900 && res !== 'stone') || (res === 'gold' && st.t > 400) ? 1 : 0)) continue;
        const d = st.map.deposits.filter(d => !d.mine && d.kind === res && canPlace(st, side, 'mine', d.x, d.z) === '').sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z))[0];
        if (d && Math.hypot(d.x - home.x, d.z - home.z) < 40 && tryBuild('mine', { x: d.x, z: d.z }, 3)) break;
      }
    }
    // the tech chain: storehouse → blacksmith → barracks → stable / towers → foundry
    if (st.t > 110 && !my('blacksmith').length && done('storehouse').length) tryBuild('blacksmith', home, 3, 12);
    else if (st.t > 150 && !my('barracks').length && done('blacksmith').length) tryBuild('barracks', home, 4, 14);
    else if (st.t > 420 && !my('stable').length && done('barracks').length) tryBuild('stable', home, 4, 16);
    else if (st.t > 500 && my('tower').length < (diff >= 2 ? 3 : 2) && done('barracks').length) tryBuild('tower', towardEnemy(st, side, home, 8), 2, 5);
    else if (st.t > 720 && !my('foundry').length && done('stable').length && diff >= 1) tryBuild('foundry', home, 4, 16);
    else if (st.t > 900 && my('barracks').length < (diff >= 2 ? 2 : 1)) tryBuild('barracks', home, 4, 18);
  }

  /* research when rich */
  const rich = r => S.res[r] > 600;
  for (const b of st.buildings.filter(b => b.side === side && b.done && !b.research)) {
    const keys = Object.keys(UPGRADES).filter(k => UPGRADES[k].at === b.kind && !S.up[k]);
    for (const k of keys) {
      const U = UPGRADES[k];
      if (Object.keys(U.cost).every(r => S.res[r] > U.cost[r] * 1.6) && canResearch(st, b.id, k) === '') { research(st, b.id, k); break; }
    }
  }

  /* military */
  const soldiers = mine.filter(u => !UNITS[u.kind].peasant && u.kind !== 'drummer' && u.kind !== 'officer');
  const free = mine.filter(u => !u.formation);
  const armyCap = Math.round((12 + st.t / 14) * [0.6, 0.85, 1, 1.15][diff]);
  const reserve = { food: 60, wood: 60 };
  const spare = r => S.res[r] - (reserve[r] || 0);
  for (const b of done('barracks')) {
    if (b.queue.length >= 3) continue;
    const offs = free.filter(u => u.kind === 'officer').length + b.queue.filter(k => k === 'officer').length;
    const drs = free.filter(u => u.kind === 'drummer').length + b.queue.filter(k => k === 'drummer').length;
    if (st.t > 240 && offs < 1 && canTrain(st, b.id, 'officer') === '') { train(st, b.id, 'officer'); continue; }
    if (st.t > 240 && drs < 1 && canTrain(st, b.id, 'drummer') === '') { train(st, b.id, 'drummer'); continue; }
    if (soldiers.length >= armyCap) continue;
    const pikes = soldiers.filter(u => u.kind === 'pikeman').length, muskets = soldiers.filter(u => u.kind === 'musketeer').length;
    // fill one formation at a time: whichever loose group is closer to a full formation gets the recruit
    const fsize = diff >= 2 && st.t > 900 ? 36 : 15;
    const loosePikes = free.filter(u => u.kind === 'pikeman').length % fsize, looseMuskets = free.filter(u => u.kind === 'musketeer').length % fsize;
    const kind = S.res.coal > 40 && (looseMuskets > loosePikes || (looseMuskets === loosePikes && muskets < pikes)) ? 'musketeer' : 'pikeman';
    if (spare('food') > 0 && canTrain(st, b.id, kind) === '') train(st, b.id, kind);
  }
  for (const b of done('stable')) {
    if (b.queue.length >= 2 || soldiers.length >= armyCap) continue;
    const kind = st.rng.next() < 0.5 ? 'cossack' : (st.rng.next() < 0.5 && canTrain(st, b.id, 'reiter') === '' ? 'reiter' : 'dragoon');
    if (spare('food') > 20 && canTrain(st, b.id, kind) === '') train(st, b.id, kind);
  }
  for (const b of done('foundry')) {
    const guns = mine.filter(u => u.kind === 'cannon').length;
    if (!b.queue.length && guns < 1 + diff && canTrain(st, b.id, 'cannon') === '' && S.res.coal > 150) train(st, b.id, 'cannon');
  }
  // formations
  const size = diff >= 2 && st.t > 900 ? 36 : 15;
  for (const kind of ['pikeman', 'musketeer']) {
    if (canForm(st, side, kind, size, home) === '') {
      const r = formFormation(st, side, kind, size, home);
      if (r.f && kind === 'pikeman' && st.rng.next() < 0.3) setShape(st, r.f.id, 'square');
    }
  }

  /* defence and attack */
  const forms = st.formations.filter(f => f.side === side);
  const loose = mine.filter(u => !u.formation && !UNITS[u.kind].peasant && u.kind !== 'drummer' && u.kind !== 'officer');
  let threat = null, td = 30;
  for (const u of st.units) {
    if (u.side === side || UNITS[u.kind].peasant || u.kind === 'drummer') continue;
    const d = Math.hypot(u.x - home.x, u.z - home.z);
    if (d < td) { td = d; threat = u; }
  }
  if (threat && !A.attacking) {
    for (const f of forms) if (f.order.type === 'idle' || f.order.auto) { f.order = { type: 'attack', target: threat.id }; f.path = null; }
    commandAttack(st, loose.filter(u => u.order.type !== 'attack').map(u => u.id), threat.id);
    return;
  }
  if (A.nextAttack == null) A.nextAttack = Math.max(st.peace, [780, 600, 450, 360][diff]);
  const power = forms.reduce((a, f) => a + f.members.length, 0) + loose.length;
  if (A.attacking) {
    const lost = power < A.startArmy * 0.35;
    const tgt = building(st, A.target);
    if (lost || !tgt || tgt.side === side) {
      // pick the next target or come home
      const next = !lost && nearestEnemyBuildingTo(st, side, tgt ? centerOf(tgt) : home);
      if (next && Math.hypot(centerOf(next).x - home.x, centerOf(next).z - home.z) < st.W * 1.2) { A.target = next.id; sendArmy(st, side, forms, loose, next); }
      else { A.attacking = false; A.nextAttack = st.t + 200 + st.rng.next() * 100; for (const f of forms) moveFormation(st, f.id, home.x + 6, home.z + 6); commandMove(st, loose.map(u => u.id), home.x + 4, home.z + 8); }
    } else if (st.t % 15 < THINK) {
      // re-send only the units that stopped
      const idle = loose.filter(u => u.order.type === 'idle');
      if (idle.length) sendArmy(st, side, forms.filter(f => f.order.type === 'idle'), idle, tgt);
    }
  } else if (st.t >= A.nextAttack && power >= 14 + A.wave * 6) {
    const tgt = nearestEnemyBuildingTo(st, side, home);
    if (tgt) {
      A.attacking = true; A.target = tgt.id; A.wave++; A.startArmy = power;
      sendArmy(st, side, forms, loose, tgt);
      if (tgt.side === 0) st.events.push({ t: 'msg', side: 0, text: `${S.name} идут в атаку!`, kind: 'bad' });
    }
  } else {
    // gather the army at a rally point in front of the town
    const rally = towardEnemy(st, side, home, 10);
    for (const f of forms) if (f.order.type === 'idle' && Math.hypot(f.x - rally.x, f.z - rally.z) > 8 && st.t - (f.aiT || -99) > 20) { moveFormation(st, f.id, rally.x + (f.id % 3 - 1) * 6, rally.z + (f.id % 2) * 5); f.aiT = st.t; }
    const idle = loose.filter(u => u.order.type === 'idle' && Math.hypot(u.x - rally.x, u.z - rally.z) > 10 && st.t - (u.aiT || -99) > 20);
    if (idle.length) { commandMove(st, idle.map(u => u.id), rally.x, rally.z - 5); idle.forEach(u => { u.aiT = st.t; }); }
  }
}

function sendArmy(st, side, forms, loose, tgt) {
  const c = centerOf(tgt);
  for (const f of forms) { f.order = { type: 'attack', target: tgt.id, building: true }; f.path = null; }
  const guns = loose.filter(u => UNITS[u.kind].art), rest = loose.filter(u => !UNITS[u.kind].art);
  commandAttack(st, guns.map(u => u.id), tgt.id, true);
  // cavalry and loose infantry attack-move toward the target
  commandMove(st, rest.map(u => u.id), c.x, c.z, { attackMove: true });
}

function nearestEnemyBuildingTo(st, side, p) {
  let best = null, bd = Infinity;
  for (const b of st.buildings) {
    if (b.side === side || st.sides[b.side].defeated) continue;
    const d = distToBuilding(b, p.x, p.z) + (b.kind === 'tower' ? 15 : 0);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function towardEnemy(st, side, home, d) {
  const others = st.buildings.filter(b => b.side !== side && b.kind === 'townhall');
  const t = others.length ? centerOf(others[0]) : { x: st.W / 2, z: st.H / 2 };
  const len = Math.hypot(t.x - home.x, t.z - home.z) || 1;
  return { x: home.x + (t.x - home.x) / len * d, z: home.z + (t.z - home.z) / len * d };
}

function findSpot(st, side, kind, near, spread) {
  const B = BUILDINGS[kind];
  for (let r = 4; r < spread + 14; r += 2) {
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2 + st.rng.next() * 0.4;
      const x = Math.round(near.x + Math.cos(a) * r - B.w / 2), z = Math.round(near.z + Math.sin(a) * r - B.h / 2);
      if (canPlace(st, side, kind, x, z) === '') return { x, z };
    }
  }
  return null;
}

function rebuildTownhall(st, side) {
  const S = st.sides[side];
  const p = st.units.find(u => u.side === side && UNITS[u.kind].peasant);
  if (!p || !canAfford(S, BUILDINGS.townhall.cost)) return;
  const spot = findSpot(st, side, 'townhall', p, 12);
  if (spot) orderBuild(st, side, 'townhall', spot.x, spot.z, st.units.filter(u => u.side === side && UNITS[u.kind].peasant).slice(0, 6).map(u => u.id));
}
