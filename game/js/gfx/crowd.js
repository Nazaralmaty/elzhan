// Instanced crowd renderer: one InstancedMesh per (model, part); every frame each unit is posed
// (walk cycle, aiming, reloading, pike thrusts, sword swings, digging, falling) on the CPU.
import * as THREE from 'three';
import { tintMaterial } from './kit.js';

const base = new THREE.Matrix4(), local = new THREE.Matrix4(), world = new THREE.Matrix4();
const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = x => Math.max(0, Math.min(1, x));

export function createCrowd(scene, models, { capacity = 256, shadows = true } = {}) {
  const material = tintMaterial();
  const meshes = new Map(); // key -> { mesh, count }
  for (const [mk, m] of Object.entries(models)) for (const [pk, p] of Object.entries(m.parts)) meshes.set(mk + ':' + pk, make(p.geo, capacity));

  function make(geo, cap) {
    const mesh = new THREE.InstancedMesh(geo, material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    mesh.count = 0;
    scene.add(mesh);
    return { mesh, count: 0, cap };
  }

  function grow(key, slot) {
    const old = slot.mesh, geo = old.geometry, cap = slot.cap * 2;
    const n = make(geo, cap);
    n.mesh.instanceMatrix.array.set(old.instanceMatrix.array);
    n.mesh.instanceColor.array.set(old.instanceColor.array);
    n.count = slot.count;
    scene.remove(old); old.dispose();
    meshes.set(key, n);
    return n;
  }

  function put(mk, pk, px, py, pz, rx, ry, rz, color) {
    const key = mk + ':' + pk;
    let slot = meshes.get(key);
    if (!slot) return;
    if (slot.count >= slot.cap) slot = grow(key, slot);
    e.set(rx, ry, rz);
    local.makeRotationFromEuler(e);
    local.setPosition(px, py, pz);
    world.multiplyMatrices(base, local);
    slot.mesh.setMatrixAt(slot.count, world);
    slot.mesh.setColorAt(slot.count, color);
    slot.count++;
  }

  function begin() { for (const slot of meshes.values()) slot.count = 0; }
  function end() {
    for (const slot of meshes.values()) {
      slot.mesh.count = slot.count;
      if (slot.count) { slot.mesh.instanceMatrix.needsUpdate = true; slot.mesh.instanceColor.needsUpdate = true; }
    }
  }

  // u: { model, x, y, z, yaw, color: THREE.Color, walk (phase rad), moving, act, actT, aim (0..1), dead (s or -1), roll, carry, scale }
  function draw(u) {
    const m = models[u.model];
    if (!m) return;
    const sc = (u.scale || 1) * m.scale;
    let y = u.y;
    // death: fall over, then sink into the ground
    let fall = 0, side = 0;
    if (u.dead >= 0) {
      fall = clamp01(u.dead / (m.type === 'human' ? 0.45 : 0.7));
      fall = 1 - (1 - fall) * (1 - fall);
      if (u.dead > 5) y -= (u.dead - 5) * 0.35 * sc;
      if (u.dead > 9) return;
    }
    q.setFromAxisAngle(up, u.yaw);
    if (fall) {
      const tilt = new THREE.Quaternion().setFromEuler(e.set(m.type === 'human' ? 0 : fall * 1.35, 0, m.type === 'human' ? fall * 1.5 : 0));
      q.multiply(tilt);
      if (m.type === 'human') y += fall * 0.12 * sc;
      side = fall;
    }
    base.compose(v.set(u.x, y, u.z), q, s.set(sc, sc, sc));
    const P = m.parts, mk = u.model, c = u.color;
    if (m.type === 'human') poseHuman(m, mk, P, u, c, side);
    else if (m.type === 'rider') poseRider(mk, P, u, c, side);
    else poseGun(m, mk, P, u, c);
  }

  function poseHuman(m, mk, P, u, c, dead) {
    const walking = u.moving && !dead;
    const ph = u.walk || 0, sw = walking ? Math.sin(ph) * 0.6 : 0;
    const bob = walking ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin((u.t || 0) * 1.7 + (u.seed || 0)) * 0.008;
    const st = m.style, t = u.actT ?? 99;
    let lean = m.hunch + (walking ? 0.07 : 0);
    // arm angles: rotation about the shoulder axis (z), positive swings a hanging arm forward and up
    let aL = [0, 0, -sw * 0.7], aR = [0, 0, sw * 0.7];
    let gun = null; // [px, py, pz, rx, ry, rz]
    if (st === 'musket' || st === 'rifle') {
      const k = u.aim || 0, rel = u.act === 'reload' && !walking;
      if (rel) {
        const ram = Math.sin(t * 9) * 0.35;
        aR = [0.3, 0, 1.0 + ram]; aL = [-0.35, 0, 0.75];
        gun = [0.28, 0.98, 0.1, 0.25, 0, -0.18];
      } else {
        const rec = u.act === 'fire' && t < 0.25 ? (1 - t / 0.25) * 0.12 : 0;
        aR = [lerp(0, -0.25, k), 0, lerp(walking ? 0.35 : 0.3, 1.25, k)];
        aL = [lerp(0, 0.45, k), 0, lerp(-sw * 0.7, 1.45, k)];
        gun = [lerp(0.12, 0.14 - rec, k), lerp(0.95, 1.43, k), lerp(0.3, 0.17, k), 0, 0, lerp(0.1, -Math.PI / 2 + 0.06, k)];
        lean += rec * 0.6 - k * 0.05;
      }
    } else if (st === 'pike') {
      const k = u.aim || 0, thrust = u.act === 'melee' && t < 0.35 ? Math.sin(t / 0.35 * Math.PI) * 0.5 : 0;
      aR = [lerp(0, -0.2, k), 0, lerp(0.3, 0.85 + thrust * 0.6, k)];
      aL = [lerp(0, 0.4, k), 0, lerp(-sw * 0.7, 1.0 + thrust * 0.5, k)];
      gun = [lerp(0.08, 0.1 + thrust, k), lerp(0.95, 1.18, k), lerp(0.3, 0.2, k), 0, 0, lerp(0.04, -Math.PI / 2 + 0.12, k)];
      lean += k * 0.12;
    } else if (st === 'sword' || st === 'claws' || st === 'rammer') {
      if (u.act === 'melee' && t < 0.5) {
        const a = t < 0.18 ? lerp(0.3, 2.7, t / 0.18) : lerp(2.7, 0.5, clamp01((t - 0.18) / 0.22));
        aR = [-0.25, 0, a];
        if (st === 'claws') aL = [0.25, 0, a * 0.8 + 0.3];
        lean += 0.1;
      } else if (st === 'rammer' && u.act === 'reload') aR = [-0.2, 0, 1.2 + Math.sin(t * 7) * 0.4];
      else if (st === 'claws') { aR = [-0.1, 0, 0.7 + sw * 0.5]; aL = [0.1, 0, 0.7 - sw * 0.5]; }
      else aR = [-0.05, 0, 0.35 + sw * 0.3];
    } else if (st === 'staff') {
      const cast = u.act === 'cast' && t < 0.9 ? Math.sin(clamp01(t / 0.9) * Math.PI) : 0;
      aR = [-0.05, 0, lerp(0.25, 1.9, cast)];
      aL = [0, 0, lerp(-sw * 0.7, 1.3, cast)];
    } else if (st === 'pick') {
      if (u.act === 'dig' && !walking) {
        const cy = ((u.t || 0) * 1.3 + (u.seed || 0)) % 1;
        const a = cy < 0.6 ? lerp(0.5, 2.8, cy / 0.6) : lerp(2.8, 0.5, (cy - 0.6) / 0.4);
        aR = [-0.3, 0, a]; aL = [0.3, 0, a]; lean += 0.15;
      } else aR = [0, 0, 0.25 + sw * 0.4];
    } else if (st === 'drum') {
      const beat = (u.t || 0) * 7 + (u.seed || 0) * 6;
      aR = [-0.35, 0, 0.9 + Math.max(0, Math.sin(beat)) * 0.6]; aL = [0.35, 0, 0.9 + Math.max(0, -Math.sin(beat)) * 0.6];
    } else if (st === 'carry') { aR = [-0.3, 0, -0.35]; aL = [0.3, 0, -0.35]; lean += 0.08; }
    const by = bob;
    put(mk, 'legL', P.legL.pivot[0], P.legL.pivot[1] + by, P.legL.pivot[2], 0, 0, dead ? 0 : sw, c);
    put(mk, 'legR', P.legR.pivot[0], P.legR.pivot[1] + by, P.legR.pivot[2], 0, 0, dead ? 0 : -sw, c);
    put(mk, 'body', P.body.pivot[0], P.body.pivot[1] + by, P.body.pivot[2], 0, 0, -lean, c);
    // shoulders follow the body lean
    const sl = Math.sin(lean) * 0.52, sy = (Math.cos(lean) - 1) * 0.52;
    put(mk, 'armL', P.armL.pivot[0] + sl, P.armL.pivot[1] + by + sy, P.armL.pivot[2], aL[0], aL[1], aL[2] - lean, c);
    put(mk, 'armR', P.armR.pivot[0] + sl, P.armR.pivot[1] + by + sy, P.armR.pivot[2], aR[0], aR[1], aR[2] - lean, c);
    if (gun && P.gun) put(mk, 'gun', gun[0] + sl * 0.6, gun[1] + by + sy, gun[2], gun[3], gun[4], gun[5], c);
  }

  function poseRider(mk, P, u, c, dead) {
    const ph = u.walk || 0, mv = u.moving && !dead ? (u.gallop ?? 1) : 0;
    const g = mv * 0.75, bob = Math.abs(Math.sin(ph)) * 0.12 * mv, pitch = Math.sin(ph) * 0.06 * mv;
    put(mk, 'body', P.body.pivot[0], P.body.pivot[1] + bob, P.body.pivot[2], 0, 0, pitch, c);
    put(mk, 'hFL', P.hFL.pivot[0], P.hFL.pivot[1] + bob, P.hFL.pivot[2], 0, 0, Math.sin(ph) * g, c);
    put(mk, 'hFR', P.hFR.pivot[0], P.hFR.pivot[1] + bob, P.hFR.pivot[2], 0, 0, Math.sin(ph + 0.6) * g, c);
    put(mk, 'hBL', P.hBL.pivot[0], P.hBL.pivot[1] + bob, P.hBL.pivot[2], 0, 0, Math.sin(ph + Math.PI) * g * 0.8, c);
    put(mk, 'hBR', P.hBR.pivot[0], P.hBR.pivot[1] + bob, P.hBR.pivot[2], 0, 0, Math.sin(ph + Math.PI + 0.6) * g * 0.8, c);
    const t = u.actT ?? 99;
    let a = 0.5 + (mv ? 0.4 : 0);
    if (u.act === 'melee' && t < 0.55) a = t < 0.2 ? lerp(0.5, 2.8, t / 0.2) : lerp(2.8, 0.4, clamp01((t - 0.2) / 0.25));
    put(mk, 'rider', P.rider.pivot[0], P.rider.pivot[1] + bob * 1.2, P.rider.pivot[2], 0, 0, -pitch * 0.5 - mv * 0.12, c);
    put(mk, 'armL', P.armL.pivot[0] + 0.06 * mv, P.armL.pivot[1] + bob * 1.2, P.armL.pivot[2], 0.2, 0, 0.9, c);
    put(mk, 'armR', P.armR.pivot[0] + 0.06 * mv, P.armR.pivot[1] + bob * 1.2, P.armR.pivot[2], -0.15, 0, a, c);
  }

  function poseGun(m, mk, P, u, c) {
    const t = u.actT ?? 99, fired = u.act === 'fire';
    const rec = fired && t < 0.6 ? -0.4 * Math.exp(-t * 6) : 0;
    put(mk, 'body', P.body.pivot[0] + rec, P.body.pivot[1], P.body.pivot[2], 0, 0, 0, c);
    const r = -(u.roll || 0) / 0.5;
    put(mk, 'wL', P.wL.pivot[0] + rec, P.wL.pivot[1], P.wL.pivot[2], 0, 0, r, c);
    put(mk, 'wR', P.wR.pivot[0] + rec, P.wR.pivot[1], P.wR.pivot[2], 0, 0, r, c);
    if (P.arm) {
      let a = 1.15;
      if (fired) a = t < 0.18 ? lerp(1.15, -0.5, t / 0.18) : lerp(-0.5, 1.15, clamp01((t - 0.18) / 4));
      put(mk, 'arm', P.arm.pivot[0], P.arm.pivot[1], P.arm.pivot[2], 0, 0, a, c);
    }
  }

  return { begin, draw, end, material };
}
