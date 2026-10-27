// 3D view for "Стенка на стенку" v5: Three.js scene, instanced soldiers, smoke and cannon fire,
// per-branch commands, academy buildings with research, veins on the field, minimap strip and portraits.
import * as THREE from 'three';
import {
  createLane, step, aiThink, buy, canBuy, research, canResearch, build, canBuild, setCommand, setLine, castBarrage,
  fighters, miners, maxMiners, goldRate, trainTime, ROSTER, UPGRADES, BUILDINGS, FACTIONS, VEINS, GROUPS, COMMANDS, FIELD, ZW, DT, POP_CAP, BARRAGE_CD, mineAt, veinSafe
} from '../rules/lane.js';
import { createEngine } from '../gfx/engine.js';
import { createCrowd } from '../gfx/crowd.js';
import { buildModels } from '../gfx/models.js';
import { createFx } from '../gfx/fx.js';
import { buildTerrain, buildProps, backdrop } from '../gfx/scenery.js';
import { fortress, necropolis, crystal, goldMine, boneMine, windmill, windmillSails, haystack, fence, halfTimber, staticMesh } from '../gfx/structures.js';
import { makeNoise } from '../rts/noise.js';
import { makeRng } from '../core/rng.js';

const $ = id => document.getElementById(id);
const WX = x => x / 10 - FIELD / 20, WZ = z => z / 10;
const SIDE_COLOR = { player: '#2F6FDB', red: '#C93A3A', undead: '#3f7f63' };
const CMD_KEY = { attack: 'A', hold: 'D', retreat: 'R', flank: 'G' };
const CMD_ICON = { attack: '⚔', hold: '🛡', retreat: '🏰', flank: '↪' };
const GROUP_TABS = { all: 'Все', ...GROUPS };
const MODEL = { pikeman: 'pikeman', musketeer: 'musketeer', cossack: 'cossack', cuirassier: 'cuirassier', cannon: 'cannon', skeleton: 'skeleton', ghoul: 'ghoul', acolyte: 'acolyte', deathknight: 'deathknight', bonecaster: 'bonecaster', alden: 'alden', irena: 'irena', corvin: 'corvin', morven: 'morven', tarn: 'tarn', bonelord: 'bonelord' };
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function startLane(opts) {
  const { faction = 'human', hero = FACTIONS[faction].heroes[0], foe = 'undead', dif = 1, seed = 1, onExit } = opts;
  const canvas = $('lnCanvas'), overlay = $('lnOverlay'), octx = overlay.getContext('2d');
  const eng = createEngine(canvas, { dist: 32, pitch: 0.56, minDist: 14, maxDist: 90, bounds: [-62, -2, 62, 4], fogNear: 140, fogFar: 330 });
  const { scene, rig } = eng;
  const models = buildModels();
  const crowd = createCrowd(scene, models, { capacity: 128 });
  const fx = createFx(scene);
  fx.setFog(eng.fogColor, 140, 330);
  const heroes = FACTIONS[foe].heroes.filter(h => h !== hero);
  const st = createLane({ player: faction, enemy: foe, hero, enemyHero: heroes[seed % heroes.length], seed, enemyLevel: dif });
  const F = FACTIONS[faction], undeadSide = side => st.sides[side].faction === 'undead';
  const colors = { player: new THREE.Color(SIDE_COLOR.player), enemy: new THREE.Color(foe === 'undead' ? SIDE_COLOR.undead : SIDE_COLOR.red) };
  let world_crystal, world_sails;
  const world = buildWorld();
  rig.groundY = (x, z) => world.heightAt(x, z);
  rig.tx = WX(320); rig.tz = 0;
  eng.updateCamera();

  const view = new Map(); // id -> render state
  const texts = [];
  let group = 'all', paused = false, speed = 1, acc = 0, last = 0, raf = 0, hud = 0, follow = true, closed = false, toastT = 0;
  const keys = new Set();

  /* ---------- world ---------- */
  function buildWorld() {
    const n = makeNoise(seed * 7 + 3, 128), rng = makeRng(seed * 13 + 5);
    const fieldH = (x, z) => {
      const edge = Math.max(0, Math.abs(z + 1) - 15) + Math.max(0, Math.abs(x) - 80) * 0.6;
      const hill = (n.fbm(x * 0.018, z * 0.018, 4) - 0.35) * 18;
      return Math.max(0, edge * 0.35) * Math.max(0.2, hill * 0.25 + 0.6) + (edge > 0 ? Math.max(0, hill) * Math.min(1, edge / 18) : 0) + n.noise(x * 0.3, z * 0.3) * 0.12;
    };
    const colorAt = (x, z, y, slope) => {
      const g = n.fbm(x * 0.05 + 10, z * 0.05, 3), path = Math.max(0, 1 - Math.abs(z + 1 + (n.noise(x * 0.04, 3) - 0.5) * 8) / 7) * (Math.abs(x) < 66 ? 1 : 0.4);
      let c = [0.36 + g * 0.12, 0.52 + g * 0.14, 0.24 + g * 0.06];
      const dry = n.fbm(x * 0.02, z * 0.02 + 40, 2);
      c = mix(c, [0.62, 0.6, 0.33], Math.max(0, dry - 0.55) * 1.6);
      const trample = path * (0.55 + n.noise(x * 0.4, z * 0.4) * 0.45);
      c = mix(c, [0.55, 0.45, 0.31], Math.min(0.85, trample));
      const nearBase = Math.max(0, 1 - (70 - Math.abs(x)) / 12) * (Math.abs(z) < 16 ? 1 : 0);
      const deadSide = (x > 0 && foe === 'undead') || (x < 0 && faction === 'undead');
      c = mix(c, deadSide ? [0.33, 0.33, 0.29] : [0.5, 0.43, 0.32], nearBase * 0.7);
      if (deadSide && Math.abs(x) > 20) c = mix(c, [0.4, 0.42, 0.33], Math.min(0.6, (Math.abs(x) - 20) / 60));
      c = mix(c, [0.48, 0.46, 0.42], Math.min(1, slope * 3.5));
      return c;
    };
    const t = buildTerrain({ x0: -150, z0: -110, w: 300, d: 180, step: 1.5, height: fieldH, colorAt });
    scene.add(t.mesh);
    backdrop(scene, 0, -20, 260, seed);
    // bases: fortress for the kingdom, necropolis with the crystal for the undead
    for (const side of ['player', 'enemy']) {
      const k = side === 'player' ? -1 : 1, color = side === 'player' ? SIDE_COLOR.player : foe === 'undead' ? SIDE_COLOR.undead : SIDE_COLOR.red;
      const b = staticMesh(undeadSide(side) ? necropolis() : fortress(), color);
      b.position.set(69.9 * k, 0, 0);
      if (undeadSide(side) === (side === 'player')) b.rotation.y = Math.PI;
      scene.add(b);
      if (undeadSide(side)) { const cr = crystal(); cr.position.set(75.9 * k, 21.5, 0); scene.add(cr); world_crystal = cr; }
      const m = mineAt(side), g = staticMesh(undeadSide(side) ? boneMine() : goldMine());
      g.position.set(WX(m.x), 0, WZ(m.z) - 2.6);
      scene.add(g);
    }
    // veins on the far side of the field: whoever holds the ground mines them
    for (const v of VEINS) {
      const g = staticMesh(goldMine());
      g.position.set(WX(v.x), 0, WZ(v.z) + 2.4); g.rotation.y = Math.PI; g.scale.setScalar(v.rate > 1 ? 0.95 : 0.75);
      scene.add(g);
    }
    // countryside: village and mill behind our fortress, graveyard behind theirs
    const deco = [...windmill(-96, -34), ...haystack(-88, -26), ...haystack(-90, -22), ...fence(-100, -18, -80, -18), ...fence(-80, -18, -80, -30),
      ...halfTimber({ x: -84, z: -40, w: 5, d: 3.6, roof: '#a65537' }), ...halfTimber({ x: -104, z: -24, w: 4, d: 3.2, roof: '#c7a35a', ry: 0.4 }), ...halfTimber({ x: -92, z: -48, w: 4.4, d: 3.4, roof: '#8f4a32', ry: -0.3 })];
    const decoMesh = staticMesh(deco);
    decoMesh.position.y = 0;
    scene.add(decoMesh);
    const sails = new THREE.Mesh(windmillSails(), decoMesh.material);
    sails.position.set(-94.4, 6.4, -34); sails.castShadow = true;
    scene.add(sails);
    world_sails = sails;
    // trees, rocks, bushes, grass
    const props = [];
    const blocked = (x, z) => (Math.abs(z + 1) < 17 && Math.abs(x) < 86) || VEINS.some(v => Math.hypot(x - WX(v.x), z - WZ(v.z) - 2.4) < 6) || Math.hypot(x + 70, z) < 18 || Math.hypot(x - 70, z) < 18 || (x < -78 && x > -110 && z < -14 && z > -56);
    for (let i = 0; i < 1400; i++) {
      const x = -140 + rng.next() * 280, z = -100 + rng.next() * 150;
      if (blocked(x, z) || (z > 12 && Math.abs(x) < 110)) continue;
      const forest = n.fbm(x * 0.03 + 7, z * 0.03 - 3, 3);
      if (forest < 0.45 && rng.next() > 0.12) continue;
      const dead = (foe === 'undead' && x > 30) || (faction === 'undead' && x < -30);
      const kind = dead ? (rng.next() < 0.7 ? 'pine' : 'birch') : rng.pick(['pine', 'pine', 'oak', 'oak', 'birch']);
      const hue = dead ? ['#5d5a4a', '#4f5245', '#6a6352'] : kind === 'pine' ? ['#2f5f3a', '#3a6b40', '#2c5536'] : kind === 'birch' ? ['#7aa04a', '#8bb15a'] : ['#4f7f38', '#5f8f40', '#6b9440'];
      props.push({ kind, x, z, y: t.heightAt(x, z) - 0.1, s: 0.8 + rng.next() * 0.7, r: rng.next() * 6, color: rng.pick(hue) });
    }
    for (let i = 0; i < 160; i++) {
      const x = -120 + rng.next() * 240, z = -60 + rng.next() * 95;
      if (Math.abs(z + 1) < 12 && Math.abs(x) < 70) continue;
      if (z > 16 && rng.next() < 0.7) continue;
      if (Math.hypot(x + 70, z) < 16 || Math.hypot(x - 70, z) < 16) continue;
      props.push({ kind: rng.next() < 0.5 ? 'rock' : 'bush', x, z, y: t.heightAt(x, z), s: 0.6 + rng.next() * 1.1, r: rng.next() * 6, color: rng.next() < 0.5 ? '#8f8b82' : '#4f7a3a' });
    }
    for (let i = 0; i < 6000; i++) {
      const x = -110 + rng.next() * 220, z = -50 + rng.next() * 64;
      const path = Math.abs(z + 1 + (n.noise(x * 0.04, 3) - 0.5) * 8) < 5 && Math.abs(x) < 66;
      if (path && rng.next() < 0.85) continue;
      if (Math.hypot(x + 70, z) < 14 || Math.hypot(x - 70, z) < 14) continue;
      const g = n.fbm(x * 0.05 + 10, z * 0.05, 3);
      props.push({ kind: 'tuft', x, z, y: t.heightAt(x, z), s: 0.45 + rng.next() * 0.6, r: rng.next() * 6, color: (foe === 'undead' && x > 30) || (faction === 'undead' && x < -30) ? '#7b7a5c' : `rgb(${Math.round(80 + g * 50)},${Math.round(120 + g * 45)},${Math.round(50 + g * 20)})` });
    }
    buildProps(scene, props);
    return { heightAt: t.heightAt, terrain: t.mesh };
  }

  /* ---------- per-unit render state ---------- */
  function vs(u) {
    let s = view.get(u.id);
    if (!s) {
      s = { x: u.x, z: u.z, px: u.x, pz: u.z, yaw: u.facing, walk: Math.random() * 6, act: 'idle', actT: 99, aim: 0, dead: -1, roll: 0, seed: Math.random(), lastFight: -99 };
      view.set(u.id, s);
    }
    return s;
  }
  const prev = new Map();

  function playEvents() {
    for (const e of st.events) {
      const u = e.id && st.units.find(o => o.id === e.id);
      if (e.t === 'fire' && u) {
        const s = vs(u); s.act = 'fire'; s.actT = 0; s.lastFight = st.t;
        const sc = models[MODEL[u.kind]].scale, dx = Math.cos(u.facing), dz = -Math.sin(u.facing);
        fx.musket(WX(u.x) + dx * 1.6 * sc, world.heightAt(WX(u.x), WZ(u.z)) + 1.45 * sc, WZ(u.z) + dz * 1.6 * sc, dx, dz);
        const tg = st.units.find(o => o.id === e.to);
        if (tg) { const gy = world.heightAt(WX(tg.x), WZ(tg.z)); if (e.hit) fx.hit(WX(tg.x), gy + 1.2, WZ(tg.z)); else fx.dust(WX(tg.x) + (Math.random() - 0.5) * 2, gy, WZ(tg.z) + (Math.random() - 0.5) * 2, 0.5); }
      } else if (e.t === 'shoot' && u) {
        const s = vs(u); s.act = R(u).splash && R(u).hero ? 'cast' : 'fire'; s.actT = 0; s.lastFight = st.t;
        const dx = Math.cos(u.facing), dz = -Math.sin(u.facing), gy = world.heightAt(WX(u.x), WZ(u.z));
        if (u.kind === 'cannon') fx.cannon(WX(u.x) + dx * 1.6, gy + 0.95, WZ(u.z) + dz * 1.6, dx, dz);
        else if (u.kind === 'irena') fx.magic(WX(u.x) + dx * 0.6, gy + 2.6, WZ(u.z) + dz * 0.6, '#FFB347', 10);
        else if (u.kind === 'morven') fx.magic(WX(u.x) + dx * 0.6, gy + 2.6, WZ(u.z) + dz * 0.6, '#7CFFB2', 12);
      } else if (e.t === 'boom') {
        const x = WX(e.x), z = WZ(e.z), y = world.heightAt(x, z);
        if (e.kind === 'irena') fx.blast(x, y, z, '#FF9A3C', 1.1);
        else if (e.kind === 'morven') fx.blast(x, y, z, '#7CFFB2', 1);
        else if (e.kind === 'bonecaster') { fx.boom(x, y, z, 0.8); fx.magic(x, y + 0.5, z, '#7CFFB2', 8); }
        else fx.boom(x, y, z, e.kind === 'barrage' ? 1.1 : 1);
      } else if ((e.t === 'melee' || e.t === 'bolt') && u) {
        const s = vs(u); s.act = e.t === 'bolt' ? 'cast' : 'melee'; s.actT = 0; s.lastFight = st.t;
        const tg = st.units.find(o => o.id === e.to);
        if (tg) {
          const tx = WX(tg.x), tz = WZ(tg.z), ty = world.heightAt(tx, tz);
          const bolt = u.kind === 'tarn' ? '#9FE3FF' : '#7CFFB2';
          if (e.t === 'bolt') fx.shoot(WX(u.x), world.heightAt(WX(u.x), WZ(u.z)) + 2.3, WZ(u.z), tx, ty + 1.2, tz, 0.35, 0.8, (x, y, z) => fx.magic(x, y, z, bolt, 8), 'magic');
          else setTimeout(() => fx.hit(tx, ty + 1.1, tz), 200);
        }
      } else if (e.t === 'charge' && u) text(u, '⚡ натиск', '#F2C14E', 15);
      else if (e.t === 'raise' && u) { const x = WX(u.x), z = WZ(u.z); fx.magic(x, world.heightAt(x, z) + 0.4, z, '#7CFFB2', 18); text(u, '☠ восстал', '#7CFFB2', 14); }
      else if (e.t === 'gold' && e.side === 'player' && u) { text(u, '+' + e.n, '#F2C14E', 14); const x = WX(u.x), z = WZ(u.z); fx.sparkle(x, world.heightAt(x, z) + 1, z); }
      else if (e.t === 'turret') {
        const tg = st.units.find(o => o.id === e.to);
        if (tg) {
          const bx = e.side === 'player' ? -63 : 63, tz = (Math.random() - 0.5) * 12, tx = WX(tg.x), tzz = WZ(tg.z), ty = world.heightAt(tx, tzz);
          fx.cannon(bx, 5.2, tz, e.side === 'player' ? 1 : -1, 0);
          fx.shoot(bx, 5.2, tz, tx, ty, tzz, 0.45, 2.5, (x, y, z) => fx.boom(x, y, z, 0.5));
        }
      } else if (e.t === 'death' && u) { const s = vs(u); s.dead = 0; fx.dust(WX(u.x), world.heightAt(WX(u.x), WZ(u.z)), WZ(u.z), R(u).mounted ? 1.6 : 1); }
      else if (e.t === 'spawn' && u) { const s = vs(u); fx.dust(WX(s.x), 0.1, WZ(s.z), 1.2); }
      else if (e.t === 'upgrade') {
        const up = UPGRADES[e.key];
        toast(e.side === 'player' ? `Изучено: ${up.icon} ${up.name}` : `Враг изучил: ${up.icon} ${up.name}`, e.side === 'player' ? 'good' : 'bad');
        renderBuildings();
      } else if (e.t === 'built') {
        const B = BUILDINGS[e.key];
        toast(e.side === 'player' ? `Построено: ${B.icon} ${B.name}` : `Враг построил: ${B.icon} ${B.name}`, e.side === 'player' ? 'good' : 'bad');
        renderBuildings(); renderShop();
      } else if (e.t === 'volley' && u) text(u, '💥 залп', '#F2C14E', 13);
      else if (e.t === 'devour' && u) text(u, '🍖', '#ff8a8a', 15);
      else if (e.t === 'grape' && u) {
        const dx = Math.cos(u.facing), dz = -Math.sin(u.facing), gy = world.heightAt(WX(u.x), WZ(u.z));
        fx.cannon(WX(u.x) + dx * 1.6, gy + 0.95, WZ(u.z) + dz * 1.6, dx, dz);
        for (let i = 0; i < 5; i++) fx.dust(WX(e.x) + (Math.random() - 0.5) * 8, world.heightAt(WX(e.x), WZ(e.z)), WZ(e.z) + (Math.random() - 0.5) * 10, 0.6);
        text(u, 'картечь', '#F2C14E', 13);
      } else if (e.t === 'barrage') {
        toast(e.side === 'player' ? `${F.barrage}!` : `Враг: ${FACTIONS[foe].barrage.toLowerCase()}!`, e.side === 'player' ? 'good' : 'bad');
      } else if (e.t === 'baseHit' && Math.random() < 0.3) {
        const x = e.side === 'player' ? -63 : 63, z = (Math.random() - 0.5) * 16;
        fx.dust(x, 1 + Math.random() * 3, z, 1.4);
      }
    }
    st.events = [];
  }
  const R = u => ROSTER[u.kind];

  /* ---------- drawing units ---------- */
  const tmpColor = new THREE.Color();
  function drawUnits(alpha, dt) {
    crowd.begin();
    for (const u of st.units) {
      const s = vs(u), p = prev.get(u.id);
      const ix = p ? p[0] + (u.x - p[0]) * alpha : u.x, iz = p ? p[1] + (u.z - p[1]) * alpha : u.z;
      const x = WX(ix), z = WZ(iz);
      const moved = Math.hypot(x - WX(s.x), z - WZ(s.z));
      s.x = ix; s.z = iz;
      const RR = R(u), rider = RR.mounted, gun = RR.group === 'art';
      if (s.dead >= 0) s.dead += dt;
      const moving = u.hp > 0 && moved > 0.002 && (u.moving || moved > 0.02);
      if (moving) { s.walk += moved * (rider ? 2.3 : 4.4); s.roll += moved; if (rider && Math.random() < dt * 5) fx.dust(x, 0, z, 0.6); }
      s.actT += dt;
      // body turns smoothly toward the sim facing
      let dy = u.facing - s.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      s.yaw += dy * Math.min(1, dt * 8);
      // musket & pike stances
      if (RR.gun) {
        const cd = RR.cd;
        if (s.act === 'fire' && s.actT > 0.35) { s.act = 'reload'; s.actT = 0; }
        if (s.act === 'reload' && s.actT > cd * 0.75) { s.act = 'aim'; s.actT = 0; }
        const want = !moving && (s.act === 'aim' || s.act === 'fire') && st.t - s.lastFight < cd + 2 ? 1 : 0;
        s.aim += (want - s.aim) * Math.min(1, dt * 6);
      } else if (RR.vsMounted) {
        const near = st.t - s.lastFight < 2.5 || st.units.some(o => o.side !== u.side && o.hp > 0 && Math.abs(o.x - u.x) < 70 && Math.abs(o.z - u.z) < 50);
        s.aim += ((near ? 1 : 0) - s.aim) * Math.min(1, dt * 4);
      }
      if (gun && s.act === 'fire' && s.actT > RR.cd) s.act = 'idle';
      let model = MODEL[u.kind];
      let act = s.act;
      if (RR.miner) {
        const undead = undeadSide(u.side);
        model = u.carry > 0 ? (undead ? 'skeletonSack' : 'minerSack') : (undead ? 'skeletonMiner' : 'miner');
        act = u.digging ? 'dig' : 'idle';
        if (u.digging && Math.random() < dt * 1.2) fx.dust(x + Math.cos(s.yaw), 0.2, z, 0.4);
      }
      const y = world.heightAt(x, z);
      if (u.state === 'garrison' && u.hp > 0) continue;
      if (u.hidden && u.hp > 0) continue;
      tmpColor.copy(colors[u.side]);
      crowd.draw({ model, x, y, z, yaw: s.yaw, color: tmpColor, walk: s.walk, moving, act, actT: s.actT, aim: s.aim, dead: s.dead, roll: s.roll, t: st.t, seed: s.seed });
      // cannon crew: a gunner beside the gun
      if (gun && u.kind === 'cannon') {
        const bx = Math.cos(s.yaw), bz = -Math.sin(s.yaw);
        crowd.draw({ model: 'gunner', x: x - bx * 1.9 + bz * 0.9, y, z: z - bz * 1.9 - bx * 0.9, yaw: s.yaw, color: tmpColor, walk: s.walk, moving, act: s.act === 'fire' && s.actT < 3 ? 'reload' : 'idle', actT: s.actT, dead: s.dead, t: st.t, seed: s.seed });
      }
      if (u.kind === 'acolyte' && u.hp > 0 && Math.random() < dt * 3) { const sx = x + Math.cos(s.yaw) * 0.3 - Math.sin(s.yaw) * 0.0, sz = z + 0.3; fx.magic(sx, y + 2.35, sz, '#7CFFB2', 1); }
      if (u.kind === 'irena' && u.hp > 0 && Math.random() < dt * 3) fx.magic(x, y + 2.6, z + 0.3, '#FFB347', 1);
      if ((u.kind === 'morven' || u.kind === 'tarn') && u.hp > 0 && Math.random() < dt * 3) fx.magic(x, y + 2.6, z + 0.3, u.kind === 'tarn' ? '#9FE3FF' : '#7CFFB2', 1);
      if (u.slowT > 0 && u.hp > 0 && Math.random() < dt * 4) fx.magic(x, y + 1, z, '#9FE3FF', 1);
    }
    crowd.end();
    for (const [id] of view) if (!st.units.some(u => u.id === id)) view.delete(id);
  }

  function drawShots() {
    // sim projectiles in flight (cannonballs, bones, fireballs, fortress barrage)
    for (const s of st.shots) {
      if (s.t < 0) continue;
      const k = Math.min(1, s.t / s.T), x = WX(s.x0 + (s.x - s.x0) * k), z = WZ(s.z0 + (s.z - s.z0) * k);
      const h = s.kind === 'irena' || s.kind === 'morven' ? 1.5 : 3 + Math.abs(s.x - s.x0) / 120;
      const y = 1.2 + Math.sin(k * Math.PI) * h;
      if (s.kind === 'irena') fx.magic(x, y, z, '#FF9A3C', 2);
      else if (s.kind === 'bonecaster') fx.magic(x, y, z, '#cfe8d8', 1);
      else if (s.kind === 'morven') fx.magic(x, y, z, '#7CFFB2', 2);
      else fx.dust(x, y - 0.15, z, 0.25);
    }
  }

  /* ---------- overlay: hp bars, floating text, hero rings ---------- */
  function text(u, str, color, size = 14) { texts.push({ x: WX(u.x), y: world.heightAt(WX(u.x), WZ(u.z)) + 2.6, z: WZ(u.z), str, color, size, t: 0 }); }
  function drawOverlay(dt) {
    const w = overlay.clientWidth, h = overlay.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) { overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr); }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, w, h);
    const scale = 52 / rig.dist;
    // hold lines of the selected branch: dashed line across the field with a label
    const S = st.sides.player;
    for (const g of group === 'all' ? Object.keys(GROUPS) : [group]) {
      if (S.cmd[g] !== 'hold' || (group === 'all' && g !== 'inf')) continue;
      const lx = WX(S.line[g]);
      octx.setLineDash([8, 6]); octx.lineWidth = 2.5; octx.strokeStyle = 'rgba(255,215,106,.85)';
      octx.beginPath();
      for (let z = -13; z <= 13; z += 1) { const p = eng.project(lx, world.heightAt(lx, z) + 0.05, z); z === -13 ? octx.moveTo(p.x, p.y) : octx.lineTo(p.x, p.y); }
      octx.stroke(); octx.setLineDash([]);
      const p = eng.project(lx, 0.1, 13.5);
      octx.font = '800 12px Nunito, system-ui, sans-serif'; octx.textAlign = 'center'; octx.lineWidth = 3; octx.strokeStyle = 'rgba(15,22,28,.85)';
      const label = group === 'all' ? 'линия армии' : 'линия: ' + GROUPS[g].toLowerCase();
      octx.strokeText(label, p.x, p.y + 14); octx.fillStyle = '#ffd76a'; octx.fillText(label, p.x, p.y + 14);
    }
    for (const u of st.units) {
      if (u.hp <= 0 || u.state === 'garrison' || u.hidden) continue;
      const RR = R(u), x = WX(u.x), z = WZ(u.z), y = world.heightAt(x, z);
      const top = (RR.mounted ? 3.1 : RR.group === 'art' ? 2.2 : 2.25) * (models[MODEL[u.kind]]?.scale || 1);
      const p = eng.project(x, y + top, z);
      if (p.behind || p.x < -20 || p.x > w + 20) continue;
      const inGroup = group !== 'all' && RR.group === group && u.side === 'player';
      if (RR.hero) {
        const g = eng.project(x, y, z);
        octx.strokeStyle = '#F2C14E'; octx.lineWidth = 2;
        octx.beginPath(); octx.ellipse(g.x, g.y, 16 * scale, 6 * scale, 0, 0, Math.PI * 2); octx.stroke();
      }
      if (inGroup) {
        octx.fillStyle = '#ffd76a';
        octx.beginPath(); octx.moveTo(p.x - 5, p.y - 12); octx.lineTo(p.x + 5, p.y - 12); octx.lineTo(p.x, p.y - 5); octx.fill();
      }
      if (u.hp < u.maxHp || RR.hero) {
        const bw = Math.max(16, (RR.hero ? 34 : 22) * scale), k = Math.max(0, u.hp / u.maxHp);
        octx.fillStyle = 'rgba(15,22,28,.7)'; octx.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, 5);
        octx.fillStyle = u.side === 'player' ? '#5BC97A' : '#FF6B6B'; octx.fillRect(p.x - bw / 2, p.y, bw * k, 3);
      }
    }
    for (const t of texts) {
      t.t += dt;
      const p = eng.project(t.x, t.y + t.t * 1.2, t.z);
      octx.globalAlpha = Math.max(0, 1 - t.t / 1.3);
      octx.font = `800 ${t.size}px Nunito, system-ui, sans-serif`;
      octx.textAlign = 'center'; octx.lineWidth = 3; octx.strokeStyle = 'rgba(15,22,28,.85)'; octx.strokeText(t.str, p.x, p.y); octx.fillStyle = t.color; octx.fillText(t.str, p.x, p.y);
      octx.globalAlpha = 1;
    }
    for (let i = texts.length - 1; i >= 0; i--) if (texts[i].t > 1.3) texts.splice(i, 1);
    // base health over each fortress
    for (const side of ['player', 'enemy']) {
      const S = st.sides[side], p = eng.project(side === 'player' ? -66 : 66, 14, 0);
      if (p.behind || p.x < -60 || p.x > w + 60) continue;
      p.x = Math.max(60, Math.min(w - 60, p.x)); p.y = Math.max(24, p.y);
      const bw = 110, k = Math.max(0, S.baseHp / S.baseMax);
      octx.fillStyle = 'rgba(15,22,28,.75)'; octx.fillRect(p.x - bw / 2 - 2, p.y - 2, bw + 4, 12);
      octx.fillStyle = side === 'player' ? '#5BC97A' : '#FF6B6B'; octx.fillRect(p.x - bw / 2, p.y, bw * k, 8);
      octx.font = '800 12px Nunito, system-ui, sans-serif'; octx.fillStyle = '#EAF1F4'; octx.textAlign = 'center';
      octx.fillText(`${Math.max(0, Math.ceil(S.baseHp))} / ${S.baseMax}`, p.x, p.y - 6);
    }
  }

  /* ---------- minimap strip ---------- */
  const mm = $('lnMini'), mctx = mm.getContext('2d');
  function drawMini() {
    const w = mm.clientWidth, h = mm.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mm.width !== Math.round(w * dpr)) { mm.width = Math.round(w * dpr); mm.height = Math.round(h * dpr); }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.fillStyle = '#4f6b3c'; mctx.fillRect(0, 0, w, h);
    mctx.fillStyle = '#6d5f45'; mctx.fillRect(0, h * 0.42, w, h * 0.16);
    const mx = x => x / FIELD * w, mz = z => (z + ZW) / (2 * ZW) * h;
    mctx.fillStyle = '#2F6FDB'; mctx.fillRect(0, 0, mx(60), h);
    mctx.fillStyle = foe === 'undead' ? '#3f7f63' : '#C93A3A'; mctx.fillRect(w - mx(60), 0, mx(60), h);
    // hold lines of the selected branch
    const S = st.sides.player;
    for (const g of group === 'all' ? Object.keys(GROUPS) : [group]) if (S.cmd[g] === 'hold') { mctx.fillStyle = 'rgba(255,215,106,.7)'; mctx.fillRect(mx(S.line[g]) - 1, 0, 2, h); }
    // veins: gold when we can mine them, red when the enemy holds them
    for (const v of VEINS) {
      const ours = veinSafe(st, 'player', v), theirs = veinSafe(st, 'enemy', { ...v, x: FIELD - v.x });
      mctx.fillStyle = ours ? '#F2C14E' : theirs ? '#ff8a8a' : '#8a8a8a';
      mctx.beginPath(); mctx.arc(mx(v.x), mz(v.z), 4, 0, Math.PI * 2); mctx.fill();
    }
    for (const u of st.units) {
      if (u.hp <= 0) continue;
      mctx.fillStyle = u.side === 'player' ? '#9cc3ff' : '#ff8a8a';
      const r = R(u).miner ? 1 : R(u).hero ? 3 : 2;
      mctx.fillRect(mx(u.x) - r, mz(u.z) - r, r * 2, r * 2);
    }
    // camera window
    const half = rig.dist * 0.75 * (canvas.clientWidth / Math.max(1, canvas.clientHeight)) * 0.55;
    const cx = (rig.tx + FIELD / 20) * 10;
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.strokeRect(mx(cx - half * 10), 1, mx(half * 20), h - 2);
  }
  let mmDrag = false;
  const mmJump = e => { const r = mm.getBoundingClientRect(); rig.tx = WX((e.clientX - r.left) / r.width * FIELD); follow = false; };
  mm.onpointerdown = e => { mmDrag = true; mm.setPointerCapture(e.pointerId); mmJump(e); };
  mm.onpointermove = e => { if (mmDrag) mmJump(e); };
  mm.onpointerup = () => { mmDrag = false; };

  /* ---------- portraits from the 3D models ---------- */
  const portraits = {};
  function makePortraits(kinds) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    let r;
    try { r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return; }
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    for (const k of kinds) {
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight('#ffffff', '#6b5a3c', 1.6));
      const d = new THREE.DirectionalLight('#fff3dc', 2.4); d.position.set(3, 5, 4); sc.add(d);
      const cr = createCrowd(sc, models, { capacity: 2, shadows: false });
      const m = k === 'miner' ? (faction === 'undead' ? 'skeletonMiner' : 'miner') : MODEL[k];
      const big = models[m].type !== 'human';
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      cam.position.set(big ? 3.2 : 2.2, big ? 2.6 : 1.9, big ? 5.4 : 3.6);
      cam.lookAt(big ? 0.1 : 0.1, big ? 1.3 : 1.05, 0);
      cr.begin();
      cr.draw({ model: m, x: 0, y: 0, z: 0, yaw: 0.65, color: colors.player, walk: 0, moving: false, act: 'idle', actT: 99, aim: k === 'musketeer' || k === 'corvin' ? 0 : 0, dead: -1, t: 0 });
      cr.end();
      r.render(sc, cam);
      portraits[k] = c.toDataURL();
    }
    r.dispose();
  }

  /* ---------- HUD ---------- */
  const shopKinds = () => ['miner', ...st.sides.player.roster, ...(hero ? [hero] : [])];
  const nameOf = k => k === 'miner' ? F.miner : ROSTER[k].name;
  function renderShop() {
    $('lnShop').innerHTML = shopKinds().map((k, i) => `<button type="button" class="lbuy" data-kind="${k}">
      <span class="lbuy-img">${portraits[k] ? `<img src="${portraits[k]}" alt="">` : ''}</span><b>${nameOf(k)}</b><span class="lbuy-cost">${ROSTER[k].cost}${ROSTER[k].souls ? ` <i class="soul">👻${ROSTER[k].souls}</i>` : ''}</span><kbd>${i + 1}</kbd><span class="lbuy-q"></span><i class="lbuy-prog"></i><span class="lbuy-lock">🔒</span></button>`).join('');
  }
  function renderCommands() {
    $('lnGroups').innerHTML = Object.entries(GROUP_TABS).map(([g, name]) => `<button type="button" class="ltab${g === group ? ' on' : ''}" data-group="${g}">${name}<small>${g === 'all' ? fighters(st, 'player').length : fighters(st, 'player').filter(u => R(u).group === g).length}</small></button>`).join('');
    const S = st.sides.player, cur = group === 'all' ? null : S.cmd[group];
    $('lnCmds').innerHTML = Object.entries(COMMANDS).map(([c, name]) => {
      const dis = c === 'flank' && group !== 'cav';
      const on = group === 'all' ? Object.values(S.cmd).every(x => x === c) : cur === c;
      return `<button type="button" class="lcmd${on ? ' on' : ''}" data-cmd="${c}" ${dis ? 'disabled title="Обход — только для конницы"' : ''}><b>${CMD_ICON[c]}</b><span>${name}</span><kbd>${CMD_KEY[c]}</kbd></button>`;
    }).join('');
  }
  // academies: one cell per building — the building button and its research next to it
  function renderBuildings() {
    const S = st.sides.player;
    $('lnUps').innerHTML = `<div class="lbld-grid">${F.buildings.map(k => {
      const B = BUILDINGS[k], b = S.bld[k];
      const head = `<button type="button" class="lbld-b${b?.done ? ' done' : b ? ' cur' : ''}" data-build="${k}"><span>${B.icon}</span>${b?.done ? '' : `<small>${b ? '…' : B.cost}</small>`}<i class="lup-prog"></i></button>`;
      const ups = B.ups.map(u => `<button type="button" class="lres${S.up[u] ? ' max' : ''}" data-up="${u}"><span>${UPGRADES[u].icon}</span>${UPGRADES[u].skill ? '<em>✦</em>' : ''}<i class="lup-prog"></i></button>`).join('');
      return `<div class="lbld${b?.done ? '' : ' off'}">${head}${ups}</div>`;
    }).join('')}</div><p class="lbld-info" id="lnInfo">Наведи на здание или исследование · ✦ — умение, которое войска применяют сами</p>`;
  }
  function infoFor(el) {
    const S = st.sides.player;
    if (el.dataset.build) {
      const k = el.dataset.build, B = BUILDINGS[k], b = S.bld[k], why = canBuild(st, 'player', k);
      const unlocks = Object.entries(ROSTER).filter(([, R]) => R.b === k).map(([, R]) => R.name).join(', ');
      return `<b>${B.icon} ${B.name}</b>${unlocks ? ' · открывает: ' + unlocks : ''}${b?.done ? ' · построено' : b ? ` · строится ${Math.ceil(b.T - b.t)} с` : ` · ${B.cost} зол, ${B.time} с${why && why !== 'Мало золота' ? '' : ''}`}`;
    }
    const k = el.dataset.up, U = UPGRADES[k], r = S.research[U.at];
    return `<b>${U.icon} ${U.name}</b>${U.skill ? ' ✦' : ''} — ${U.desc}. ${S.up[k] ? '<span class="ok">Изучено</span>' : r?.key === k ? `Изучается: ${Math.ceil(r.T - r.t)} с` : `${U.cost} зол · ${U.time} с`}`;
  }
  function renderHud() {
    const S = st.sides.player;
    $('lnGold').textContent = Math.floor(S.gold);
    $('lnRate').textContent = `+${goldRate(st, 'player').toFixed(1)}/с`;
    const vm = miners(st, 'player').filter(u => u.vein != null).length;
    $('lnMiners').textContent = `${miners(st, 'player').length}/${maxMiners(S)}${vm ? ` · на жилах ${vm}` : ''}`;
    $('lnSouls').hidden = !FACTIONS[S.faction].souls;
    $('lnSoulsN').textContent = S.souls;
    $('lnArmy').textContent = `${fighters(st, 'player').length}/${POP_CAP}`;
    $('lnTime').textContent = fmtTime(st.t);
    $('lnBaseP').style.setProperty('--v', (Math.max(0, S.baseHp) / S.baseMax * 100).toFixed(0) + '%');
    $('lnBaseE').style.setProperty('--v', (Math.max(0, st.sides.enemy.baseHp) / st.sides.enemy.baseMax * 100).toFixed(0) + '%');
    $('lnShop').querySelectorAll('.lbuy').forEach(b => {
      const k = b.dataset.kind, why = canBuy(st, 'player', k), q = S.queue.filter(x => x === k).length;
      const locked = why.startsWith('Нужно');
      b.disabled = !!why && why !== 'Мало золота';
      b.classList.toggle('poor', why === 'Мало золота');
      b.classList.toggle('locked', locked);
      b.querySelector('.lbuy-q').textContent = q ? '×' + q : '';
      b.querySelector('.lbuy-prog').style.width = S.queue[0] === k ? (S.train / trainTime(S, k) * 100).toFixed(0) + '%' : '0%';
      b.classList.toggle('poor', why === 'Мало золота' || why === 'Мало душ');
      b.title = `${nameOf(k)} · ${ROSTER[k].cost} золота${ROSTER[k].souls ? ` и ${ROSTER[k].souls} душ` : ''}${ROSTER[k].desc ? ' · ' + ROSTER[k].desc : ''}${why ? ' · ' + why : ''}`;
    });
    $('lnUps').querySelectorAll('[data-up]').forEach(b => {
      const k = b.dataset.up, U = UPGRADES[k], r = S.research[U.at], cur = r?.key === k, why = canResearch(st, 'player', k);
      b.classList.toggle('poor', why === 'Мало золота');
      b.classList.toggle('cur', cur);
      b.classList.toggle('lock', !built(k));
      b.querySelector('.lup-prog').style.width = cur ? (r.t / r.T * 100).toFixed(0) + '%' : '0%';
    });
    $('lnUps').querySelectorAll('[data-build]').forEach(b => {
      const k = b.dataset.build, B = S.bld[k];
      b.classList.toggle('poor', canBuild(st, 'player', k) === 'Мало золота');
      b.querySelector('.lup-prog').style.width = B && !B.done ? (B.t / B.T * 100).toFixed(0) + '%' : '0%';
    });
    if (infoEl && $('lnInfo')) $('lnInfo').innerHTML = infoFor(infoEl);
    const rs = Object.values(S.research).filter(Boolean);
    $('lnResearch').textContent = rs.length ? rs.map(r => `${UPGRADES[r.key].icon} ${Math.ceil(r.T - r.t)} с`).join(' · ') : 'Исследований нет';
    const b = $('lnBarrage');
    b.disabled = S.barrageCd > 0;
    b.style.setProperty('--cd', ((1 - S.barrageCd / BARRAGE_CD) * 100).toFixed(0) + '%');
    b.querySelector('small').textContent = S.barrageCd > 0 ? Math.ceil(S.barrageCd) + ' с' : 'готов';
    $('lnPause').textContent = paused ? '▶' : '⏸';
    $('lnSpeed').textContent = '×' + speed;
    $('lnGroups').querySelectorAll('.ltab small').forEach((s, i) => {
      const g = Object.keys(GROUP_TABS)[i];
      s.textContent = g === 'all' ? fighters(st, 'player').length : fighters(st, 'player').filter(u => R(u).group === g).length;
    });
  }
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'ltoast ' + kind;
    el.textContent = msg;
    $('lnToasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  /* ---------- input ---------- */
  function selectGroup(g) { group = g; renderCommands(); }
  function command(c) {
    if (c === 'flank' && group !== 'cav') return;
    setCommand(st, 'player', group, c);
    renderCommands();
    toast(`${GROUP_TABS[group]}: ${COMMANDS[c].toLowerCase()}`);
  }
  function buyKind(k) {
    const why = canBuy(st, 'player', k);
    if (why) { toast(why, 'bad'); return; }
    buy(st, 'player', k); renderHud();
  }
  $('lnShop').onclick = e => { const b = e.target.closest('[data-kind]'); if (b) buyKind(b.dataset.kind); };
  const built = k => !!st.sides.player.bld[UPGRADES[k].at]?.done;
  let infoEl = null;
  $('lnUps').onclick = e => {
    const bb = e.target.closest('[data-build]');
    if (bb) {
      const why = canBuild(st, 'player', bb.dataset.build);
      if (why && why !== 'Уже построено') toast(why, 'bad'); else if (!why) { build(st, 'player', bb.dataset.build); toast(`Строим: ${BUILDINGS[bb.dataset.build].name}`); renderBuildings(); }
      renderHud(); return;
    }
    const b = e.target.closest('[data-up]');
    if (!b) return;
    const why = canResearch(st, 'player', b.dataset.up);
    if (why) toast(why, 'bad'); else { research(st, 'player', b.dataset.up); renderBuildings(); }
    renderHud();
  };
  $('lnUps').onmouseover = e => { const el = e.target.closest('[data-up],[data-build]'); if (el) { infoEl = el; $('lnInfo').innerHTML = infoFor(el); } };
  $('lnGroups').onclick = e => { const b = e.target.closest('[data-group]'); if (b) selectGroup(b.dataset.group); };
  $('lnCmds').onclick = e => { const b = e.target.closest('[data-cmd]'); if (b) command(b.dataset.cmd); };
  $('lnBarrage').querySelector('span').textContent = F.barrage;
  document.querySelector('.ln-base:not(.enemy) b').textContent = F.fortress;
  document.querySelector('.ln-base.enemy b').textContent = FACTIONS[foe].fortress === F.fortress ? 'Враг' : FACTIONS[foe].fortress;
  $('lnBarrage').onclick = () => { if (!castBarrage(st, 'player')) toast('Ещё не готово', 'bad'); renderHud(); };
  $('lnPause').onclick = () => { paused = !paused; renderHud(); };
  $('lnSpeed').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1; renderHud(); };
  $('lnHelpBtn').onclick = () => { paused = true; $('lnHelp').hidden = false; renderHud(); };
  $('lnHelpClose').onclick = () => { $('lnHelp').hidden = true; paused = false; renderHud(); };
  $('lnExit').onclick = () => close();

  // click on the field: set the hold line for the selected branch
  let down = null;
  canvas.onpointerdown = e => { down = { x: e.clientX, y: e.clientY, tx: rig.tx, drag: false }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = e => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 6) down.drag = true;
    if (down.drag) { rig.tx = down.tx - dx * rig.dist / canvas.clientWidth * 1.1; follow = false; }
  };
  canvas.onpointerup = e => {
    if (down && !down.drag) {
      const p = eng.pick(e.clientX, e.clientY, world.terrain);
      if (p && Math.abs(p.z) < 16) {
        const sx = (p.x + FIELD / 20) * 10;
        setLine(st, 'player', group, sx);
        renderCommands();
        toast(`${GROUP_TABS[group]}: держать линию здесь`);
      }
    }
    down = null;
  };
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey) rig.dist *= Math.exp(e.deltaY * 0.01);
    else { rig.tx += (e.deltaX + e.deltaY * (e.shiftKey ? 1 : 0.6)) * rig.dist * 0.0016; follow = false; }
  }, { passive: false });

  function onKey(e) {
    if (closed || e.target.closest('input')) return;
    if (!$('lnHelp').hidden) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); $('lnHelpClose').click(); } return; }
    if (!$('lnEnd').hidden) return;
    const k = e.key.toLowerCase();
    if (e.type === 'keyup') { keys.delete(k); return; }
    keys.add(k);
    if (k === ' ') { e.preventDefault(); paused = !paused; renderHud(); }
    else if (/^[1-9]$/.test(k)) { const kind = shopKinds()[+k - 1]; if (kind) buyKind(kind); }
    else if (k === 'tab') { e.preventDefault(); const gs = Object.keys(GROUP_TABS); selectGroup(gs[(gs.indexOf(group) + (e.shiftKey ? gs.length - 1 : 1)) % gs.length]); }
    else if (k === '`' || k === 'ё' || k === '0') selectGroup('all');
    else if (k === 'a' || k === 'ф') command('attack');
    else if (k === 'd' || k === 'в') command('hold');
    else if (k === 'r' || k === 'к') command('retreat');
    else if (k === 'g' || k === 'п') command('flank');
    else if (k === 'f' || k === 'а') $('lnBarrage').click();
    else if (k === 'c' || k === 'с') follow = true;
    else if (k === 'escape') selectGroup('all');
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const onResize = () => eng.resize();
  window.addEventListener('resize', onResize);

  /* ---------- loop ---------- */
  function frontX() {
    const mine = fighters(st, 'player').filter(u => u.state !== 'garrison');
    if (!mine.length) return 300;
    return Math.max(...mine.map(u => u.x)) - 120;
  }
  function loop(ts) {
    if (closed) return;
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    const real = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    // camera keys
    const pan = rig.dist * 0.9 * real;
    if (keys.has('arrowleft')) { rig.tx -= pan; follow = false; }
    if (keys.has('arrowright')) { rig.tx += pan; follow = false; }
    if (keys.has('q') || keys.has('й') || keys.has('arrowup')) rig.dist *= Math.exp(-real * 1.2);
    if (keys.has('e') || keys.has('у') || keys.has('arrowdown')) rig.dist *= Math.exp(real * 1.2);
    if (follow && !window.__noFollow) rig.tx += (WX(Math.max(320, frontX())) - rig.tx) * Math.min(1, real * 1.5);
    let dt = 0;
    if (!paused && !st.over) {
      acc += real * speed;
      while (acc >= DT) {
        prev.clear();
        for (const u of st.units) prev.set(u.id, [u.x, u.z]);
        aiThink(st, 'enemy'); step(st, DT); acc -= DT;
        playEvents();
      }
      dt = real * speed;
    }
    const alpha = paused || st.over ? 1 : acc / DT;
    drawUnits(alpha, dt);
    if (!paused) drawShots();
    fx.update(paused ? 0 : real * speed);
    if (world_sails) world_sails.rotation.x += real * 0.6;
    if (world_crystal) { world_crystal.rotation.y += real * 0.8; world_crystal.position.y = 21.5 + Math.sin(ts / 700) * 0.4; if (Math.random() < real * 6) fx.magic(75.9, 21.5, 0, '#7CFFB2', 2); }
    eng.updateCamera();
    eng.render();
    drawOverlay(paused ? 0 : real);
    hud += real;
    if (hud > 0.15) { hud = 0; renderHud(); drawMini(); }
    if (st.over && $('lnEnd').hidden) showEnd();
  }

  function showEnd() {
    renderHud();
    const win = st.over === 'player', P = st.sides.player, E = st.sides.enemy;
    const ups = Object.keys(P.up).length;
    $('lnEndBody').innerHTML = `<h2 class="${win ? 'win' : 'loss'}">${win ? 'Победа' : 'Поражение'}</h2>
      <p>${win ? `Вражеская ${FACTIONS[foe].fortress.toLowerCase()} пала` : `Наша ${F.fortress.toLowerCase()} пала`} за ${fmtTime(st.t)}.</p>
      <div class="lstats"><span>Убито врагов <b>${P.kills}</b></span><span>Потеряно <b>${P.losses}</b></span><span>Добыто золота <b>${Math.round(P.mined)}</b></span><span>Улучшений <b>${ups}</b></span></div>
      <div class="row"><button class="gbtn primary" type="button" id="lnAgain">Ещё раз</button><button class="gbtn" type="button" id="lnBack">В меню</button></div>`;
    $('lnEnd').hidden = false;
    $('lnAgain').onclick = () => { close(); startLane({ ...opts, seed: seed + 1 }); };
    $('lnBack').onclick = () => close();
  }

  function close() {
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('resize', onResize);
    $('lnEnd').hidden = true; $('lnHelp').hidden = true;
    eng.renderer.dispose();
    scene.traverse(o => { o.geometry?.dispose?.(); });
    onExit?.();
  }

  makePortraits(shopKinds());
  renderShop(); renderCommands(); renderBuildings(); renderHud();
  raf = requestAnimationFrame(loop);
  try { if (!localStorage.getItem('aos.lane5.help')) { $('lnHelp').hidden = false; paused = true; localStorage.setItem('aos.lane5.help', '1'); renderHud(); } } catch { /* storage unavailable */ }
  window.__lane = { st, eng, rig, view };
  return { close };
}

function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
