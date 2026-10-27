// 3D world for "Казаки": terrain from the sim map, water, forests and rocks that disappear when harvested,
// deposits, buildings (with scaffolding while under construction, rubble after), mill fields, fog of war,
// soldiers through the instanced crowd, corpses and battle effects.
import * as THREE from 'three';
import { buildTerrain, buildProps, backdrop } from '../../gfx/scenery.js';
import { createCrowd } from '../../gfx/crowd.js';
import { buildModels } from '../../gfx/models.js';
import { createFx } from '../../gfx/fx.js';
import { staticMesh, worldFog, merge, box } from '../../gfx/kit.js';
import {
  rtsTownhall, rtsHouse, rtsMillBody, rtsStorehouse, rtsBarracks, rtsStable, rtsBlacksmith, rtsFoundry, rtsMine, rtsDeposit, rtsTower, scaffold, rubble, windmillSails
} from '../../gfx/structures.js';
import { heightAt as mapHeight, GRASS, WATER, TREE, ROCK, DEPOSIT } from '../map.js';
import { UNITS, BUILDINGS } from '../data.js';
import { centerOf, farmSpot } from '../sim.js';
import { makeRng } from '../../core/rng.js';
import { makeNoise } from '../noise.js';

export const CELL = 2;
const BUILDERS = { townhall: rtsTownhall, house: rtsHouse, mill: rtsMillBody, storehouse: rtsStorehouse, barracks: rtsBarracks, stable: rtsStable, blacksmith: rtsBlacksmith, foundry: rtsFoundry, tower: rtsTower };
const UNIT_MODEL = { pikeman: 'pikeman', musketeer: 'musketeer', officer: 'officer', drummer: 'drummer', cossack: 'cossack', dragoon: 'dragoon', reiter: 'reiter', cannon: 'cannon' };

export function createWorld(eng, st) {
  const { scene } = eng, map = st.map, W = map.W, H = map.H;
  const gy = (x, z) => mapHeight(map, x, z); // cell coords -> metres
  const rng = makeRng(map.seed * 7 + 1), n = makeNoise(map.seed * 3 + 11, 128);

  /* terrain */
  const colorAt = (wx, wz, y, slope) => {
    const x = wx / CELL, z = wz / CELL;
    const g = n.fbm(x * 0.06, z * 0.06, 3), dry = n.fbm(x * 0.02 + 30, z * 0.02, 2);
    let c = [0.37 + g * 0.12, 0.53 + g * 0.13, 0.25 + g * 0.06];
    c = mix(c, [0.6, 0.58, 0.32], Math.max(0, dry - 0.55) * 1.8);
    // forest floor, sand by water, rock on slopes
    const near = (k, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const X = Math.floor(x) + i, Z = Math.floor(z) + j; if (X >= 0 && Z >= 0 && X < W && Z < H && map.kind[Z * W + X] === k) return true; } return false; };
    if (near(TREE, 0)) c = mix(c, [0.26, 0.36, 0.18], 0.6);
    if (y < -1.6) c = mix(c, [0.62, 0.57, 0.42], Math.min(1, (-1.6 - y) * 0.9));
    if (near(DEPOSIT, 1) || near(ROCK, 0)) c = mix(c, [0.5, 0.46, 0.38], 0.55);
    c = mix(c, [0.5, 0.47, 0.42], Math.min(1, slope * 4));
    return c;
  };
  const terrain = buildTerrain({ x0: 0, z0: 0, w: W * CELL, d: H * CELL, step: CELL, height: (wx, wz) => gy(wx / CELL, wz / CELL), colorAt, uvScale: 0.25 });
  scene.add(terrain.mesh);
  // skirt beyond the map edge
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL * 4, H * CELL * 4), new THREE.MeshStandardMaterial({ color: '#202a22', roughness: 1 }));
  skirt.rotation.x = -Math.PI / 2; skirt.position.set(W * CELL / 2, -0.6, H * CELL / 2); skirt.receiveShadow = true;
  scene.add(skirt);
  backdrop(scene, W * CELL / 2, H * CELL / 2, W * CELL * 1.1, map.seed);
  // water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshStandardMaterial({ color: '#3d7aa0', roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.86 }));
  water.material.onBeforeCompile = sh => { worldFogHook(sh); };
  water.rotation.x = -Math.PI / 2; water.position.set(W * CELL / 2, -1.55, H * CELL / 2);
  scene.add(water);

  /* trees, rocks */
  const props = [], cellProp = new Map();
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x, k = map.kind[i];
    if (k !== TREE && k !== ROCK) continue;
    const wx = (x + 0.5 + (rng.next() - 0.5) * 0.5) * CELL, wz = (z + 0.5 + (rng.next() - 0.5) * 0.5) * CELL;
    if (k === TREE) {
      const f = n.noise(x * 0.08, z * 0.08);
      const kind = f > 0.6 ? 'pine' : f > 0.35 ? rng.pick(['oak', 'pine', 'birch']) : rng.pick(['oak', 'oak', 'birch']);
      const hue = kind === 'pine' ? ['#2f5f3a', '#3a6b40', '#2c5536'] : kind === 'birch' ? ['#7aa04a', '#8bb15a'] : ['#4f7f38', '#5f8f40', '#6b9440'];
      const it = { kind, x: wx, z: wz, y: gy(wx / CELL, wz / CELL) - 0.1, s: 1.0 + rng.next() * 0.6, r: rng.next() * 6, color: rng.pick(hue) };
      props.push(it); cellProp.set(i, it);
    } else {
      const it = { kind: 'rock', x: wx, z: wz, y: gy(wx / CELL, wz / CELL), s: 1.1 + rng.next() * 0.5, r: rng.next() * 6, color: rng.pick(['#8f8b82', '#9a958c', '#86827a']), sy: 0.9 };
      props.push(it); cellProp.set(i, it);
    }
  }
  for (let k = 0; k < W * H * 0.25; k++) {
    const x = rng.next() * W, z = rng.next() * H, i = Math.floor(z) * W + Math.floor(x);
    if (map.kind[i] !== GRASS || gy(x, z) < -1.4) continue;
    const g = n.fbm(x * 0.06, z * 0.06, 3);
    props.push({ kind: k % 9 ? 'tuft' : 'bush', x: x * CELL, z: z * CELL, y: gy(x, z), s: k % 9 ? 0.5 + rng.next() * 0.5 : 0.5 + rng.next() * 0.5, r: rng.next() * 6, color: k % 9 ? `rgb(${Math.round(80 + g * 50)},${Math.round(118 + g * 45)},${Math.round(50 + g * 20)})` : '#4f7a3a' });
  }
  const propH = buildProps(scene, props);
  function removeProp(i) {
    const it = cellProp.get(i);
    if (!it) return;
    propH.setScale(it, 0);
    cellProp.delete(i);
  }

  /* deposits */
  const depositMeshes = new Map();
  for (const d of map.deposits) {
    const m = staticMesh(rtsDeposit(d.kind));
    m.position.set((d.x + 2) * CELL, gy(d.x + 2, d.z + 2), (d.z + 2) * CELL);
    scene.add(m);
    depositMeshes.set(d.id, m);
  }

  /* buildings */
  const bview = new Map(); // id -> { group, key, sails }
  const rubbleList = [];
  const sideColor = s => st.sides[s].color;
  function buildingKey(b) { return `${b.kind}:${b.side}:${b.done ? 1 : 0}`; }
  function makeBuilding(b) {
    const group = new THREE.Group();
    const B = BUILDINGS[b.kind], c = centerOf(b);
    const base = gy(c.x, c.z);
    group.position.set(c.x * CELL, base, c.z * CELL);
    let body;
    if (b.kind === 'mine') body = staticMesh(rtsMine(b.res), sideColor(b.side));
    else body = staticMesh(BUILDERS[b.kind](b.id % 4), sideColor(b.side));
    group.add(body);
    let sails = null;
    if (b.kind === 'mill') {
      // sails spin about their own hub axis, which faces +z
      const hub = new THREE.Group();
      hub.position.set(0, 6.8, 2.55); hub.rotation.y = Math.PI / 2;
      sails = new THREE.Mesh(windmillSails(), body.material); sails.castShadow = true; sails.scale.setScalar(1.15);
      hub.add(sails); group.add(hub);
    }
    let scaf = null;
    if (!b.done) { scaf = staticMesh(scaffold(B.w * CELL * 0.92, B.h * CELL * 0.92, 6)); group.add(scaf); }
    // farm plots around a finished mill
    let fields = null;
    if (b.kind === 'mill' && b.done) {
      const parts = [];
      for (let k = 0; k < BUILDINGS.mill.farm; k++) {
        const p = farmSpot(st, b, k), a = Math.atan2(p.z - c.z, p.x - c.x);
        const fx = (p.x - c.x) * CELL, fz = (p.z - c.z) * CELL;
        parts.push(box(2.6, 0.12, 2.0, k % 2 ? '#c9a64e' : '#b99a42', { at: [fx, gy(p.x, p.z) - base + 0.05, fz], rot: [0, -a, 0] }));
        for (let r = 0; r < 4; r++) parts.push(box(2.4, 0.22, 0.12, k % 3 ? '#d9b85a' : '#9fb04a', { at: [fx + Math.cos(-a + Math.PI / 2) * (r - 1.5) * 0.45, gy(p.x, p.z) - base + 0.2, fz - Math.sin(-a + Math.PI / 2) * (r - 1.5) * 0.45], rot: [0, -a, 0] }));
      }
      fields = staticMesh(parts);
      fields.castShadow = false;
      group.add(fields);
    }
    scene.add(group);
    return { group, body, sails, scaf, fields, key: buildingKey(b), kind: b.kind };
  }
  function syncBuildings() {
    const seen = new Set();
    for (const b of st.buildings) {
      seen.add(b.id);
      let v = bview.get(b.id);
      if (!v || v.key !== buildingKey(b)) { if (v) disposeGroup(v.group); v = makeBuilding(b); bview.set(b.id, v); }
      // rise while under construction
      if (!b.done) v.body.scale.y = 0.12 + 0.88 * b.progress;
      else v.body.scale.y = 1;
      if (b.kind === 'mine') { const d = map.deposits.find(d => d.id === b.deposit); const m = d && depositMeshes.get(d.id); if (m) m.visible = false; }
    }
    for (const [id, v] of bview) if (!seen.has(id)) { disposeGroup(v.group); bview.delete(id); }
    for (const d of map.deposits) { const m = depositMeshes.get(d.id); if (m) m.visible = !d.mine; }
  }
  function disposeGroup(g) { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  function addRubble(e) {
    const m = staticMesh(rubble(e.w * CELL, e.h * CELL));
    m.position.set((e.x + e.w / 2) * CELL, gy(e.x + e.w / 2, e.z + e.h / 2), (e.z + e.h / 2) * CELL);
    scene.add(m);
    rubbleList.push({ m, t: 0 });
  }

  /* fog of war texture */
  const fogData = new Uint8Array(W * H * 4);
  const fogTex = new THREE.DataTexture(fogData, W, H);
  fogTex.magFilter = THREE.LinearFilter; fogTex.minFilter = THREE.LinearFilter;
  worldFog.map.value = fogTex;
  worldFog.rect.value.set(0, 0, W * CELL, H * CELL);
  worldFog.on.value = 1;
  function syncFog() {
    const S = st.sides[0];
    for (let i = 0; i < W * H; i++) { fogData[i * 4] = S.explored[i] ? 255 : 0; fogData[i * 4 + 1] = S.visible[i] ? 255 : 0; fogData[i * 4 + 3] = 255; }
    fogTex.needsUpdate = true;
  }
  function worldFogHook(sh) {
    sh.uniforms.wFogMap = worldFog.map; sh.uniforms.wFogRect = worldFog.rect; sh.uniforms.wFogOn = worldFog.on;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWFog;\nuniform vec4 wFogRect;').replace('#include <project_vertex>', '#include <project_vertex>\nvec4 wfp = modelMatrix * vec4(transformed, 1.0);\nvWFog = (wfp.xz - wFogRect.xy) / wFogRect.zw;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWFog;\nuniform sampler2D wFogMap;\nuniform float wFogOn;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\nif (wFogOn > 0.5) { vec2 fv = texture2D(wFogMap, vWFog).rg; gl_FragColor.rgb *= mix(0.0, mix(0.45, 1.0, fv.g), fv.r); }');
  }

  /* units */
  const models = buildModels();
  const crowd = createCrowd(scene, models, { capacity: 256 });
  const fx = createFx(scene, { max: 6000 });
  fx.setFog(eng.fogColor, 150, 420);
  const view = new Map(); // id -> render state
  const corpses = [];
  const colors = st.sides.map(S => new THREE.Color(S.color));
  const ringGeo = new THREE.RingGeometry(0.55, 0.72, 20); ringGeo.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: 0.85, depthWrite: false }), 600);
  rings.frustumCulled = false; rings.count = 0; rings.renderOrder = 1;
  scene.add(rings);
  const m4 = new THREE.Matrix4(), tmpC = new THREE.Color();

  function vs(u) {
    let s = view.get(u.id);
    if (!s) { s = { x: u.x, z: u.z, px: u.x, pz: u.z, yaw: -u.facing, walk: Math.random() * 6, act: 'idle', actT: 99, aim: 0, seed: Math.random(), lastFight: -99, roll: 0 }; view.set(u.id, s); }
    return s;
  }
  function modelOf(u, s) {
    if (UNITS[u.kind].peasant) {
      const T = u.task;
      if (u.carry && u.carry.n > 0 && (T?.back || u.carry.n >= 10)) return u.carry.res === 'wood' ? 'peasantLogs' : 'peasantStone';
      if (T?.kind === 'gather') return u.working ? (T.res === 'wood' ? 'peasantAxe' : 'peasantHammer') : (u.carry?.n ? (u.carry.res === 'wood' ? 'peasantLogs' : 'peasantStone') : 'peasantAxe');
      if (T?.kind === 'farm') return 'peasantHoe';
      if (T?.kind === 'build' || T?.kind === 'repair') return 'peasantHammer';
      return 'peasant';
    }
    return UNIT_MODEL[u.kind];
  }

  function drawUnits(alpha, dt, t, selected, prev) {
    crowd.begin();
    let rn = 0;
    const vis = st.sides[0].visible;
    for (const u of st.units) {
      if (u.inside) continue;
      const s = vs(u), p = prev.get(u.id);
      const ix = p ? p[0] + (u.x - p[0]) * alpha : u.x, iz = p ? p[1] + (u.z - p[1]) * alpha : u.z;
      const moved = Math.hypot(ix - s.x, iz - s.z) * CELL;
      s.x = ix; s.z = iz;
      const U = UNITS[u.kind];
      if (u.side !== 0 && !vis[Math.floor(iz) * W + Math.floor(ix)]) continue;
      const moving = moved > 0.004 && dt > 0;
      if (moving) { s.walk += moved * (U.cav ? 1.15 : 2.2); s.roll += moved; if (U.cav && Math.random() < dt * 4) fx.dust(ix * CELL, gy(ix, iz), iz * CELL, 0.7); }
      s.actT += dt;
      let dy = -u.facing - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      s.yaw += dy * Math.min(1, dt * 8);
      if (U.shot && !U.art) {
        if (s.act === 'fire' && s.actT > 0.35) { s.act = 'reload'; s.actT = 0; }
        if (s.act === 'reload' && u.reload <= 0.6) { s.act = 'aim'; s.actT = 0; }
        const want = !moving && (s.act === 'aim' || s.act === 'fire') && t - s.lastFight < 6 ? 1 : 0;
        s.aim += (want - s.aim) * Math.min(1, dt * 6);
      } else if (u.kind === 'pikeman') {
        const want = t - s.lastFight < 3 || (u.formation && st.fById.get(u.formation)?.enemy && st.fById.get(u.formation).enemyD < 7) ? 1 : 0;
        s.aim += (want - s.aim) * Math.min(1, dt * 4);
      }
      if (U.art && s.act === 'fire' && s.actT > 3) s.act = 'idle';
      let act = s.act;
      if (U.peasant) act = u.working ? 'dig' : 'idle';
      const model = modelOf(u, s);
      const x = ix * CELL, z = iz * CELL, y = gy(ix, iz);
      tmpC.copy(colors[u.side]);
      crowd.draw({ model, x, y, z, yaw: s.yaw, color: tmpC, walk: s.walk, moving, act, actT: s.actT, aim: s.aim, dead: -1, roll: s.roll, t, seed: s.seed });
      if (u.kind === 'cannon') {
        const bx = Math.cos(s.yaw), bz = -Math.sin(s.yaw);
        crowd.draw({ model: 'gunner', x: x - bx * 1.9 + bz * 0.9, y, z: z - bz * 1.9 - bx * 0.9, yaw: s.yaw, color: tmpC, walk: s.walk, moving, act: s.act === 'fire' ? 'reload' : 'idle', actT: s.actT, dead: -1, t, seed: s.seed });
      }
      if (u.working && U.peasant && Math.random() < dt * 0.8) fx.dust(x + Math.cos(s.yaw) * 0.8, y + 0.1, z - Math.sin(s.yaw) * 0.8, 0.35);
      if (selected.has(u.id) && rn < 600) {
        const r = U.cav || U.art ? 1.6 : 1;
        m4.makeScale(r, 1, r); m4.setPosition(x, y + 0.06, z);
        rings.setMatrixAt(rn++, m4);
      }
    }
    for (const c of corpses) {
      c.dead += dt;
      if (c.dead > 9) continue;
      crowd.draw(c);
    }
    for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].dead > 9) corpses.splice(i, 1);
    crowd.end();
    rings.count = rn; rings.instanceMatrix.needsUpdate = true;
  }

  function drawShots() {
    for (const s of st.shots) {
      const k = Math.min(1, s.t / s.T), x = s.x0 + (s.x - s.x0) * k, z = s.z0 + (s.z - s.z0) * k;
      const h = 2 + Math.hypot(s.x - s.x0, s.z - s.z0) * 0.35;
      fx.dust(x * CELL, gy(x, z) + 1 + Math.sin(k * Math.PI) * h, z * CELL, 0.25);
    }
  }

  function playEvents(events, t) {
    const vis = st.sides[0].visible;
    const seen = (x, z) => vis[Math.floor(z) * W + Math.floor(x)];
    for (const e of events) {
      if (e.t === 'shot') {
        if (!seen(e.x, e.z) && !seen(e.tx, e.tz)) continue;
        const dx = e.tx - e.x, dz = e.tz - e.z, d = Math.hypot(dx, dz) || 1;
        const sx = e.x * CELL, sz = e.z * CELL;
        if (e.tower) fx.musket(sx, gy(e.x, e.z) + 9, sz, dx / d, dz / d);
        else {
          const u = st.byId.get(e.id);
          if (u) { const s = vs(u); s.act = 'fire'; s.actT = 0; s.lastFight = t; }
          const mounted = u && UNITS[u.kind].cav;
          fx.musket(sx + dx / d * 1.5, gy(e.x, e.z) + (mounted ? 2.3 : 1.45), sz + dz / d * 1.5, dx / d, dz / d);
        }
        if (e.hit && !e.b) fx.hit(e.tx * CELL, gy(e.tx, e.tz) + 1.2, e.tz * CELL);
        else if (!e.b) fx.dust(e.tx * CELL + (Math.random() - 0.5) * 2, gy(e.tx, e.tz), e.tz * CELL + (Math.random() - 0.5) * 2, 0.5);
        else fx.dust(e.tx * CELL, gy(e.tx, e.tz) + 2, e.tz * CELL, 0.8);
      } else if (e.t === 'cannon') {
        const u = st.byId.get(e.id);
        if (u) { const s = vs(u); s.act = 'fire'; s.actT = 0; s.lastFight = t; }
        if (!seen(e.x, e.z)) continue;
        const dx = e.tx - e.x, dz = e.tz - e.z, d = Math.hypot(dx, dz) || 1;
        fx.cannon(e.x * CELL + dx / d * 1.6, gy(e.x, e.z) + 0.95, e.z * CELL + dz / d * 1.6, dx / d, dz / d);
      } else if (e.t === 'boom') {
        if (seen(e.x, e.z)) fx.boom(e.x * CELL, gy(e.x, e.z), e.z * CELL, 1.1);
      } else if (e.t === 'melee') {
        const u = st.byId.get(e.id);
        if (u) { const s = vs(u); s.act = 'melee'; s.actT = 0; s.lastFight = t; }
        const tg = st.byId.get(e.to);
        if (tg && seen(tg.x, tg.z)) setTimeout(() => fx.hit(tg.x * CELL, gy(tg.x, tg.z) + 1.1, tg.z * CELL), 200);
      } else if (e.t === 'death') {
        const s = view.get(e.id);
        view.delete(e.id);
        if (!seen(e.x, e.z) && e.side !== 0) continue;
        const U = UNITS[e.kind];
        const model = U.peasant ? 'peasant' : UNIT_MODEL[e.kind];
        corpses.push({ model, x: e.x * CELL, y: gy(e.x, e.z), z: e.z * CELL, yaw: s ? s.yaw : -e.facing, color: colors[e.side].clone(), walk: 0, moving: false, act: 'idle', actT: 99, aim: 0, dead: 0, t: 0, seed: 0 });
        fx.dust(e.x * CELL, gy(e.x, e.z), e.z * CELL, U.cav ? 1.5 : 0.9);
      } else if (e.t === 'treeGone' || e.t === 'rockGone') {
        const x = e.i % W + 0.5, z = Math.floor(e.i / W) + 0.5;
        removeProp(e.i);
        if (seen(x, z)) fx.dust(x * CELL, gy(x, z), z * CELL, 1.6);
      } else if (e.t === 'destroyed') {
        addRubble(e);
        const cx = e.x + e.w / 2, cz = e.z + e.h / 2;
        for (let k = 0; k < 4; k++) fx.boom((cx + (Math.random() - 0.5) * e.w) * CELL, gy(cx, cz), (cz + (Math.random() - 0.5) * e.h) * CELL, 1.4);
      } else if (e.t === 'built' || e.t === 'placed') {
        const b = st.bById.get(e.id);
        if (b) { const c = centerOf(b); fx.dust(c.x * CELL, gy(c.x, c.z), c.z * CELL, 2.5); }
      } else if (e.t === 'bhit') {
        const b = st.bById.get(e.id);
        if (b && Math.random() < 0.3) { const c = centerOf(b); fx.dust((b.x + Math.random() * b.w) * CELL, gy(c.x, c.z) + 1 + Math.random() * 3, (b.z + Math.random() * b.h) * CELL, 1); }
      }
    }
  }

  function update(dt, t) {
    for (const v of bview.values()) if (v.sails) v.sails.rotation.x += dt * 0.7;
    // chimney smoke on working smithies and foundries
    for (const b of st.buildings) {
      if (!b.done || (b.kind !== 'blacksmith' && b.kind !== 'foundry' && b.kind !== 'townhall')) continue;
      if (b.side !== 0 && !st.sides[0].explored[Math.floor(b.z) * W + Math.floor(b.x)]) continue;
      if (Math.random() < dt * (b.kind === 'townhall' ? 0.8 : 2)) {
        const c = centerOf(b), base = gy(c.x, c.z);
        const pts = b.kind === 'blacksmith' ? [[2.2, 6.2, -2.2]] : b.kind === 'foundry' ? [[-3, 9.4, -3], [3, 9.4, -3]] : [[2.6, 8.5, -2.6]];
        for (const [ox, oy, oz] of pts) fx.dust(c.x * CELL + ox, base + oy, c.z * CELL + oz, 1.2);
      }
    }
    for (let i = rubbleList.length - 1; i >= 0; i--) { const r = rubbleList[i]; r.t += dt; if (r.t > 60) { scene.remove(r.m); r.m.geometry.dispose(); rubbleList.splice(i, 1); } }
    fx.update(dt);
  }

  syncBuildings();
  syncFog();
  return { terrain: terrain.mesh, heightAt: gy, syncBuildings, syncFog, drawUnits, drawShots, playEvents, update, models, crowd, fx, bview, view };
}

function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
