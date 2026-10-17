// Cars on the two avenues that run along the boulevard. Simple, instanced, lights at night.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { BLVD } from './layout.js';
import { mulberry32 } from './util.js';
import { U } from './materials.js';

const COLORS = ['#f4f4f2', '#1b1c1f', '#9aa0a6', '#c7ccd1', '#2b3a55', '#7a1d22', '#e8e4da', '#3c4a3e', '#d9d9d9', '#121212', '#5c6670'];

function carParts(kind) {
  const L = kind === 2 ? 5.0 : kind === 1 ? 4.7 : 4.4, W = 1.85;
  const H = kind === 1 ? 0.95 : 0.75;
  const body = [
    new THREE.BoxGeometry(L, H, W).translate(0, 0.32 + H / 2, 0),
    new THREE.BoxGeometry(L * 0.96, 0.12, W * 0.96).translate(0, 0.32 + H + 0.06, 0),
  ];
  const cabL = kind === 1 ? L * 0.62 : L * 0.5;
  const cabin = new THREE.BoxGeometry(cabL, kind === 1 ? 0.7 : 0.58, W * 0.86).translate(-L * 0.04, 0.32 + H + 0.12 + (kind === 1 ? 0.35 : 0.29), 0);
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheels.push(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16).rotateX(Math.PI / 2).translate(sx * L * 0.33, 0.34, sz * (W / 2 - 0.08)));
  const front = [], back = [];
  for (const sz of [-1, 1]) {
    front.push(new THREE.BoxGeometry(0.06, 0.14, 0.38).translate(L / 2 + 0.01, 0.32 + H * 0.7, sz * 0.62));
    back.push(new THREE.BoxGeometry(0.06, 0.14, 0.4).translate(-L / 2 - 0.01, 0.32 + H * 0.75, sz * 0.6));
  }
  const m = (a) => BGU.mergeGeometries(a.map((g) => g.toNonIndexed()));
  return { body: m(body), cabin: cabin.toNonIndexed(), wheels: m(wheels), front: m(front), back: m(back), L };
}

export function buildTraffic(ctx) {
  const root = new THREE.Group();
  root.name = 'Traffic';
  const r = mulberry32(31);
  const lanes = [];
  for (const s of [-1, 1]) {
    // two lanes each direction per avenue
    const z0 = s * BLVD.walk2, z1 = s * BLVD.road;
    const w = (BLVD.road - BLVD.walk2) / 4;
    for (let i = 0; i < 4; i++) {
      const z = z0 + s * (w * (i + 0.5));
      const dir = i < 2 ? -1 : 1; // right-hand traffic
      lanes.push({ z, dir: dir * s, speed: 11 + r() * 5 });
      void z1;
    }
  }
  const N = 96;
  const cars = [];
  for (let i = 0; i < N; i++) {
    const lane = lanes[i % lanes.length];
    cars.push({ lane, x: -1600 + r() * 3200, speed: lane.speed * (0.85 + r() * 0.3), kind: (r() * 3) | 0, color: COLORS[(r() * COLORS.length) | 0] });
  }
  const paint = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.28, metalness: 0.65 });
  const glass = new THREE.MeshStandardMaterial({ color: '#141a20', roughness: 0.05, metalness: 0.9 });
  const tyre = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  const head = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4dc', emissiveIntensity: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: '#5a0d0d', emissive: '#ff2a1a', emissiveIntensity: 0.3 });
  const kinds = [carParts(0), carParts(1), carParts(2)];
  const sets = kinds.map((k, ki) => {
    const list = cars.filter((c) => c.kind === ki);
    const mk = (geo, mat, cast = true) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = cast; im.receiveShadow = true;
      im.frustumCulled = false;
      root.add(im);
      return im;
    };
    const s = { list, body: mk(k.body, paint), cabin: mk(k.cabin, glass), wheels: mk(k.wheels, tyre), front: mk(k.front, head, false), back: mk(k.back, tail, false) };
    const c = new THREE.Color();
    list.forEach((car, i) => s.body.setColorAt(i, c.set(car.color)));
    return s;
  });
  ctx.scene.add(root);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  return {
    root,
    update(dt) {
      for (const s of sets) {
        s.list.forEach((car, i) => {
          car.x += car.lane.dir * car.speed * dt;
          if (car.x > 1700) car.x -= 3400;
          if (car.x < -1700) car.x += 3400;
          p.set(car.x, -0.12, car.lane.z);
          q.setFromAxisAngle(yAxis, car.lane.dir > 0 ? 0 : Math.PI);
          m.compose(p, q, one);
          for (const k of ['body', 'cabin', 'wheels', 'front', 'back']) s[k].setMatrixAt(i, m);
        });
        for (const k of ['body', 'cabin', 'wheels', 'front', 'back']) s[k].instanceMatrix.needsUpdate = true;
      }
      head.emissiveIntensity = 0.2 + U.night.value * 7;
      tail.emissiveIntensity = 0.3 + U.night.value * 4;
    },
  };
}
