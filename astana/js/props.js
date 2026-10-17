// Street furniture: lamp posts, benches, bins, bollards, flagpoles with waving Kazakh flags,
// kiosks, night light pools. Everything instanced; placements are exported for people & lights.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { BLVD, PLAZA, POOLS, CROSS_STREETS, CROSS_HALF, EAST_END, WEST_END, ARCH_X, PLINTH, groundY } from './layout.js';
import { mat } from './util.js';
import { U } from './materials.js';
import * as T from './textures.js';

const merge = (list) => BGU.mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}));

function lampGeometry() {
  const metal = [], glass = [];
  metal.push(new THREE.CylinderGeometry(0.26, 0.32, 0.7, 8).translate(0, 0.35, 0));
  metal.push(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 16).translate(0, 0.76, 0));
  metal.push(new THREE.CylinderGeometry(0.07, 0.11, 6.0, 12).translate(0, 3.8, 0));
  for (const y of [1.2, 2.6, 6.75]) metal.push(new THREE.TorusGeometry(0.11, 0.035, 6, 16).rotateX(Math.PI / 2).translate(0, y, 0));
  metal.push(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8).rotateZ(Math.PI / 2).translate(0, 6.6, 0));
  // scroll brackets
  for (const s of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 6.1, 0), new THREE.Vector3(s * 0.7, 6.15, 0), new THREE.Vector3(s * 0.9, 6.6, 0));
    metal.push(new THREE.TubeGeometry(curve, 12, 0.028, 6));
    // lantern
    const lx = s * 0.95;
    metal.push(new THREE.ConeGeometry(0.3, 0.26, 8).translate(lx, 6.86, 0));
    metal.push(new THREE.SphereGeometry(0.05, 8, 6).translate(lx, 7.02, 0));
    metal.push(new THREE.CylinderGeometry(0.2, 0.14, 0.07, 8).translate(lx, 6.24, 0));
    metal.push(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6).translate(lx, 6.65, 0));
    glass.push(new THREE.CylinderGeometry(0.22, 0.15, 0.44, 8).translate(lx, 6.5, 0));
  }
  metal.push(new THREE.ConeGeometry(0.07, 0.45, 8).translate(0, 7.05, 0));
  metal.push(new THREE.SphereGeometry(0.09, 10, 8).translate(0, 6.82, 0));
  return { metal: merge(metal), glass: merge(glass) };
}

function benchGeometry() {
  const wood = [], metal = [];
  for (let i = 0; i < 5; i++) wood.push(new THREE.BoxGeometry(1.9, 0.04, 0.085).translate(0, 0.45, -0.2 + i * 0.1));
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BoxGeometry(1.9, 0.085, 0.035);
    g.rotateX(-0.22); g.translate(0, 0.62 + i * 0.12, -0.27 - i * 0.025);
    wood.push(g);
  }
  for (const x of [-0.8, 0.8]) {
    metal.push(new THREE.BoxGeometry(0.06, 0.43, 0.06).translate(x, 0.215, 0.18));
    metal.push(new THREE.BoxGeometry(0.06, 0.88, 0.06).rotateX(-0.12).translate(x, 0.44, -0.25));
    metal.push(new THREE.BoxGeometry(0.06, 0.05, 0.52).translate(x, 0.42, -0.03));
    metal.push(new THREE.BoxGeometry(0.05, 0.05, 0.45).translate(x, 0.66, -0.02));
    metal.push(new THREE.BoxGeometry(0.06, 0.2, 0.05).translate(x, 0.56, 0.2));
  }
  return { wood: merge(wood), metal: merge(metal) };
}

function binGeometry() {
  return merge([
    new THREE.CylinderGeometry(0.24, 0.21, 0.78, 16, 1, true).translate(0, 0.42, 0),
    new THREE.CylinderGeometry(0.27, 0.27, 0.08, 16).translate(0, 0.84, 0),
    new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16).translate(0, 0.03, 0),
    new THREE.CylinderGeometry(0.21, 0.21, 0.72, 12).translate(0, 0.42, 0),
  ]);
}

function bollardGeometry() {
  return merge([
    new THREE.CylinderGeometry(0.11, 0.13, 0.85, 12).translate(0, 0.425, 0),
    new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.85, 0),
  ]);
}

function instanced(geo, material, list, { cast = true, receive = true } = {}) {
  const m = new THREE.InstancedMesh(geo, material, list.length);
  list.forEach((mx, i) => m.setMatrixAt(i, mx));
  m.castShadow = cast; m.receiveShadow = receive;
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

// Flags: cloth plane with a travelling wave in the vertex shader.
function flagMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: T.kazFlag(), side: THREE.DoubleSide, roughness: 0.75 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uWind = U.wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <beginnormal_vertex>', `
        float fx = uv.x;
        float ph = uTime * 4.2 - fx * 7.0;
        #ifdef USE_INSTANCING
        ph += instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.2;
        #endif
        float amp = fx * 0.22 * (0.5 + 0.5 * uWind);
        float dz = sin(ph) * amp + sin(ph * 2.3 + uv.y * 3.0) * amp * 0.25;
        float dd = cos(ph) * (-7.0) * amp;
        vec3 objectNormal = normalize(vec3(-dd * 0.15, 0.0, 1.0));
        #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        transformed.z += dz;
        transformed.y -= fx * fx * 0.12 * (1.0 - 0.6 * uWind);`);
  };
  m.customProgramCacheKey = () => 'flag';
  return m;
}

export function buildProps(ctx, M) {
  const root = new THREE.Group();
  root.name = 'Props';
  const lamps = [], benches = [], bins = [], bollards = [], flags = [];
  const seats = []; // world positions + heading for seated people

  const addBench = (x, z, rotY) => {
    const y = groundY(x, z);
    benches.push(mat(x, y, z, 0, rotY));
    const fwd = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    for (const o of [-0.55, 0.05, 0.6]) {
      const side = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY)).multiplyScalar(o);
      seats.push({ x: x + side.x + fwd.x * 0.02, y: y + 0.45, z: z + side.z + fwd.z * 0.02, heading: rotY });
    }
  };

  // Boulevard: lamps & benches along both promenades, bins between.
  const runs = [[PLAZA.halfX + 6, EAST_END - 10], [WEST_END + 30, -PLAZA.halfX - 6]];
  for (const [a, b] of runs) {
    for (let x = a; x < b; x += 24) {
      if (CROSS_STREETS.some((c) => Math.abs(x - c) < CROSS_HALF + 3) || Math.abs(x - ARCH_X) < 36) continue;
      for (const s of [-1, 1]) {
        lamps.push({ x, z: s * (BLVD.walk - 0.6), r: 0 });
        lamps.push({ x: x + 12, z: s * (BLVD.walk2 - 1.2), r: 0 });
        addBench(x + 8, s * (BLVD.walk - 1.1), s > 0 ? Math.PI : 0);
        addBench(x + 16, s * (BLVD.walk - 1.1), s > 0 ? Math.PI : 0);
        bins.push(mat(x + 12, 0, s * (BLVD.walk - 0.7)));
      }
    }
  }
  // Plaza: ring of lamps and benches around the plinth, bollards on the axis.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    lamps.push({ x: Math.cos(a) * 31, z: Math.sin(a) * 31, r: a + Math.PI / 2 });
    if (i % 2 === 0) {
      const ab = a + Math.PI / 16;
      addBench(Math.cos(ab) * 29.2, Math.sin(ab) * 29.2, -ab + Math.PI / 2 + Math.PI);
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.15) continue; // keep E/W approaches open
    bollards.push(mat(Math.cos(a) * 26.6, 0, Math.sin(a) * 26.6));
  }
  for (const s of [-1, 1]) for (let x = -PLAZA.halfX + 4; x <= PLAZA.halfX - 4; x += 8) {
    if (Math.abs(x) < 46) continue;
    lamps.push({ x, z: s * 20, r: 0 });
  }

  // Flags: a row on each side of the east approach, and the big one at Ak Orda.
  const flagSpots = [];
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) flagSpots.push({ x: 50 + k * 4.2, z: s * 30, h: 11, w: 2.6 });
  flagSpots.push({ x: EAST_END + 40, z: 0, h: 34, w: 9 });

  const lampGeo = lampGeometry();
  const lampMats = lamps.map((p) => mat(p.x, groundY(p.x, p.z), p.z, 0, p.r));
  root.add(instanced(lampGeo.metal, M.metalDark, lampMats));
  root.add(instanced(lampGeo.glass, M.lampGlass, lampMats, { cast: false }));

  const benchGeo = benchGeometry();
  root.add(instanced(benchGeo.wood, M.wood, benches));
  root.add(instanced(benchGeo.metal, M.metalDark, benches));
  root.add(instanced(binGeometry(), M.metalDark, bins));
  root.add(instanced(bollardGeometry(), M.metalDark, bollards));

  // flagpoles + flags
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.09, 1, 10).translate(0, 0.5, 0);
  const poles = flagSpots.map((f) => mat(f.x, groundY(f.x, f.z), f.z, 0, 0, 0, f.h / 11, f.h, f.h / 11));
  root.add(instanced(poleGeo, M.chrome, poles));
  const finials = flagSpots.map((f) => mat(f.x, groundY(f.x, f.z) + f.h, f.z, 0, 0, 0, f.h / 11));
  root.add(instanced(new THREE.SphereGeometry(0.12, 12, 8), M.gold, finials));
  const flagGeo = new THREE.PlaneGeometry(1, 0.5, 24, 12).translate(0.5, -0.25, 0);
  const fmat = flagMaterial();
  const flagMats = flagSpots.map((f) => mat(f.x + 0.08, groundY(f.x, f.z) + f.h - 0.25, f.z, 0, -0.25, 0, f.w, f.w, f.w));
  const flagMesh = instanced(flagGeo, fmat, flagMats);
  root.add(flagMesh);
  flags.push(...flagSpots);

  // Night light pools on the ground under each lamp.
  const glowMat = new THREE.MeshBasicMaterial({ map: T.glowDisc(), color: '#ffcf8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6 });
  const glowGeo = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2);
  const glow = instanced(glowGeo, glowMat, lamps.map((p) => mat(p.x, groundY(p.x, p.z) + 0.03, p.z)), { cast: false, receive: false });
  glow.renderOrder = 1;
  root.add(glow);

  // A pair of kiosks (ice cream / souvenirs) with striped umbrellas, near the plaza.
  const kiosk = new THREE.Group();
  const kioskMat = new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.6 });
  const awning = new THREE.MeshStandardMaterial({ color: '#00a6c8', roughness: 0.7 });
  for (const [x, z, r] of [[58, -36, 0.4], [-58, 36, Math.PI + 0.4]]) {
    const k = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.3, 1.8).translate(0, 1.15, 0), kioskMat);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 2.4).translate(0, 2.4, 0.2), awning);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.06).translate(0, 2.75, 0.9), awning);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.5).translate(0, 1.05, 1.05), M.metal);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 0.04).translate(0, 1.6, 0.91), M.glassDark);
    [body, roof, sign, counter, win].forEach((m) => { m.castShadow = true; m.receiveShadow = true; k.add(m); });
    // umbrella
    const um = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 16, 1, true).translate(0, 2.6, 0), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.7, side: THREE.DoubleSide }));
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6).translate(0, 1.3, 0), M.metal);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16).translate(0, 0.75, 0), M.white);
    const ug = new THREE.Group(); ug.add(um, up, tb); ug.position.set(2.8, 0, 1.2);
    um.castShadow = true;
    k.add(ug);
    k.position.set(x, 0, z); k.rotation.y = r;
    kiosk.add(k);
  }
  root.add(kiosk);

  ctx.scene.add(root);
  return {
    root, lamps, seats, flags, glowMat,
    setNight(n) { glowMat.opacity = n * 0.55; },
  };
}
