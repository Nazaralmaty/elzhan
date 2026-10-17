// Bayterek: 105 m tower, a bundle of white steel "trunk" columns that flare into roots at
// the bottom and a woven crown at the top, cradling a 22 m mirrored golden sphere
// (observation deck at 97 m). Sits on a round white stone plinth.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { PLINTH, SPHERE } from './layout.js';
import { U } from './materials.js';
import * as T from './textures.js';
import { smoothstep } from './util.js';

const N_PIPES = 24;

// Radius of the column bundle at height y (metres). Control points eyeballed from photos.
const PROFILE = [
  [0, 9.2], [2.5, 7.6], [6, 5.9], [10, 4.75], [15, 4.1], [24, 3.8], [45, 3.62], [62, 3.6],
  [70, 3.85], [75, 4.7], [79, 6.3], [83, 8.6], [87, 10.7], [91, 12.0], [95, 12.45], [98.5, 12.0], [101.5, 10.6], [103.6, 9.0],
];
function radiusAt(y) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [y0, r0] = PROFILE[i], [y1, r1] = PROFILE[i + 1];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      const s = t * t * (3 - 2 * t);
      return r0 + (r1 - r0) * (0.5 * t + 0.5 * s);
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

function trunkMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#e6e5e0', roughness: 0.38, metalness: 0.28 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vY; varying vec3 vN2;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvY = position.y; vN2 = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vY; varying vec3 vN2; uniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // Floodlights from the plinth wash up the trunk; a warm ring lights the crown.
          float up = exp(-vY / 22.0) * 0.9 + 0.22;
          float crown = smoothstep(72.0, 84.0, vY) * (1.0 - smoothstep(96.0, 104.0, vY)) * 0.9;
          float side = 0.55 + 0.45 * max(0.0, vN2.y * -0.5 + 0.5);
          totalEmissiveRadiance += vec3(1.0, 0.93, 0.82) * (up * side + crown * vec3(1.0, 0.8, 0.5)) * uNight * 0.55;
        }`);
  };
  m.customProgramCacheKey = () => 'trunk';
  return m;
}

export function buildBayterek(ctx, M) {
  const group = new THREE.Group();
  group.name = 'Bayterek';

  // ---------- trunk columns ----------
  const trunkMat = trunkMaterial();
  const pipes = [];
  for (let i = 0; i < N_PIPES; i++) {
    const th0 = (i / N_PIPES) * Math.PI * 2;
    const dir = i % 2 === 0 ? 1 : -1;
    const pts = [];
    for (let y = -0.4; y <= 103.6; y += 0.8) {
      const crown = smoothstep(72, 103, y);
      const root = 1 - smoothstep(0, 16, y);
      const th = th0 + dir * (crown * (Math.PI * 2 / N_PIPES) * 1.6 + root * (Math.PI * 2 / N_PIPES) * 0.9);
      const r = radiusAt(Math.max(0, y));
      pts.push(new THREE.Vector3(Math.cos(th) * r, y + PLINTH.top, Math.sin(th) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 220, 0.34, 10, false);
    // taper the very tip
    const p = g.attributes.position;
    pipes.push(g);
    void p;
  }
  // slim inner ribs on the core: give the trunk depth between the columns
  for (let i = 0; i < 12; i++) {
    const th = ((i + 0.5) / 12) * Math.PI * 2;
    const pts = [];
    for (let y = 6; y <= 84; y += 6) pts.push(new THREE.Vector3(Math.cos(th) * 2.95, y + PLINTH.top, Math.sin(th) * 2.95));
    pipes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.16, 6, false));
  }
  const trunk = new THREE.Mesh(BGU.mergeGeometries(pipes), trunkMat);
  trunk.castShadow = true; trunk.receiveShadow = true;
  group.add(trunk);

  // elevator core visible between the columns
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(2.7, 3.1, 86, 40, 1, true).translate(0, 43 + PLINTH.top, 0),
    new THREE.MeshStandardMaterial({ color: '#8d9aa3', roughness: 0.22, metalness: 0.8 }),
  );
  core.castShadow = true;
  group.add(core);

  // tie rings along the trunk and the collar holding the sphere
  const rings = [];
  for (const y of [16, 28, 40, 52, 64]) {
    rings.push(new THREE.TorusGeometry(radiusAt(y) + 0.05, 0.16, 8, 64).rotateX(Math.PI / 2).translate(0, y + PLINTH.top, 0));
  }
  rings.push(new THREE.TorusGeometry(7.6, 0.5, 12, 80).rotateX(Math.PI / 2).translate(0, SPHERE.y - 8.3 + PLINTH.top * 0, 0));
  rings.push(new THREE.TorusGeometry(radiusAt(78) - 0.4, 0.3, 10, 80).rotateX(Math.PI / 2).translate(0, 78 + PLINTH.top, 0));
  const ringMesh = new THREE.Mesh(BGU.mergeGeometries(rings), trunkMat);
  ringMesh.castShadow = true;
  group.add(ringMesh);

  // ---------- the golden sphere ----------
  const panels = T.spherePanels();
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(SPHERE.r + 0.6, 9000, cubeRT);
  cubeCam.position.set(0, SPHERE.y, 0);
  group.add(cubeCam);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: '#ffd27a',
    map: panels.map,
    roughnessMap: panels.roughnessMap,
    roughness: 1,
    metalness: 1,
    envMap: cubeRT.texture,
    envMapIntensity: 1.25,
    emissiveMap: panels.emissiveMap,
    emissive: '#ffb050',
    emissiveIntensity: 0,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(SPHERE.r, 160, 110), sphereMat);
  sphere.position.y = SPHERE.y;
  sphere.castShadow = true;
  sphere.receiveShadow = false;
  sphere.name = 'Bayterek sphere';
  group.add(sphere);
  // dark observation-deck glazing band visible just above the equator
  const band = new THREE.Mesh(
    new THREE.SphereGeometry(SPHERE.r + 0.02, 160, 6, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.045),
    new THREE.MeshStandardMaterial({ color: '#c99a45', roughness: 0.05, metalness: 1, envMap: cubeRT.texture, transparent: true, opacity: 0.55, emissive: '#ffcc80', emissiveIntensity: 0 }),
  );
  band.position.y = SPHERE.y;
  group.add(band);
  // small crown cap on the top of the sphere
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 0.8, 24).translate(0, SPHERE.y + SPHERE.r + 0.2, 0), M.gold);
  group.add(cap);

  // ---------- plinth & base pavilion ----------
  const steps = [];
  PLINTH.steps.forEach((r, i) => {
    const h = 0.3 * (i + 1);
    steps.push(new THREE.CylinderGeometry(r, r, h, 128, 1).translate(0, h / 2, 0));
  });
  const stepMesh = new THREE.Mesh(BGU.mergeGeometries(steps.map((g) => g.toNonIndexed())), M.marble);
  stepMesh.receiveShadow = true; stepMesh.castShadow = true;
  group.add(stepMesh);

  // polished top with the radial ornament (own small disc texture)
  const topTex = plinthTop();
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, color: '#d8d5ce', roughness: 0.34, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -2 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(PLINTH.steps[2], 128).rotateX(-Math.PI / 2).translate(0, PLINTH.top + 0.005, 0), topMat);
  top.receiveShadow = true;
  group.add(top);

  // glazed entrance pavilion wrapped around the core under the roots
  const pav = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: '#7f97a3', roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.82, emissive: '#ffcf8a', emissiveIntensity: 0 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 4.4, 64, 1, true).translate(0, PLINTH.top + 2.2, 0), glass);
  pav.add(wall);
  const mullions = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    mullions.push(new THREE.BoxGeometry(0.08, 4.4, 0.14).translate(0, 2.2 + PLINTH.top, 0).applyMatrix4(new THREE.Matrix4().makeTranslation(Math.cos(a) * 6.42, 0, Math.sin(a) * 6.42)));
  }
  mullions.push(new THREE.CylinderGeometry(6.9, 6.9, 0.45, 64).translate(0, PLINTH.top + 4.6, 0));
  mullions.push(new THREE.CylinderGeometry(6.6, 6.6, 0.25, 64).translate(0, PLINTH.top + 0.12, 0));
  const mm = new THREE.Mesh(BGU.mergeGeometries(mullions.map((g) => g.index ? g.toNonIndexed() : g)), M.metal);
  mm.castShadow = true;
  pav.add(mm);
  // doors east & west
  for (const s of [1, -1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.8, 3.2), M.glassDark);
    door.position.set(s * 6.45, PLINTH.top + 1.4, 0);
    pav.add(door);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 4.2), M.metal);
    canopy.position.set(s * 7.1, PLINTH.top + 3.1, 0);
    canopy.castShadow = true;
    pav.add(canopy);
  }
  group.add(pav);

  // floodlight housings at each root
  const fl = [];
  for (let i = 0; i < N_PIPES; i += 2) {
    const a = (i / N_PIPES) * Math.PI * 2;
    const r = 12.4;
    fl.push(new THREE.BoxGeometry(0.5, 0.25, 0.5).translate(Math.cos(a) * r, PLINTH.top + 0.13, Math.sin(a) * r));
  }
  const flMat = new THREE.MeshStandardMaterial({ color: '#333', emissive: '#fff1d6', emissiveIntensity: 0 });
  group.add(new THREE.Mesh(BGU.mergeGeometries(fl), flMat));

  ctx.scene.add(group);

  let frames = 0;
  const api = {
    group, sphere, sphereMat, cubeCam, cubeRT, band, glass, flMat,
    envDirty: true,
    updateEnvironment(renderer, scene, force = false) {
      frames++;
      if (!force && !api.envDirty) return;
      api.envDirty = false;
      sphere.visible = false; band.visible = false; cap.visible = false;
      cubeCam.update(renderer, scene);
      sphere.visible = true; band.visible = true; cap.visible = true;
    },
    setNight(n) {
      sphereMat.emissiveIntensity = n * 1.35;
      band.material.emissiveIntensity = n * 1.6;
      glass.emissiveIntensity = n * 0.9;
      flMat.emissiveIntensity = n * 8;
    },
  };
  return api;
}

function plinthTop() {
  const S = 2048;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const R = PLINTH.steps[2];
  const ppm = S / (2 * R), C = S / 2;
  g.fillStyle = '#e9e6df'; g.fillRect(0, 0, S, S);
  // concentric marble bands with radial joints
  for (let r = 0; r < R; r += 1.5) {
    g.strokeStyle = 'rgba(120,112,100,0.55)'; g.lineWidth = 2;
    g.beginPath(); g.arc(C, C, r * ppm, 0, Math.PI * 2); g.stroke();
    const seg = Math.max(8, Math.round((2 * Math.PI * r) / 1.2));
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      g.beginPath(); g.moveTo(C + Math.cos(a) * r * ppm, C + Math.sin(a) * r * ppm);
      g.lineTo(C + Math.cos(a) * (r + 1.5) * ppm, C + Math.sin(a) * (r + 1.5) * ppm); g.stroke();
    }
  }
  // dark granite ring with golden ornament around the trunk
  g.fillStyle = '#5c4d45';
  g.beginPath(); g.arc(C, C, 17.2 * ppm, 0, Math.PI * 2); g.arc(C, C, 15.4 * ppm, 0, Math.PI * 2, true); g.fill();
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    g.save(); g.translate(C + Math.cos(a) * 16.3 * ppm, C + Math.sin(a) * 16.3 * ppm); g.rotate(a + Math.PI / 2);
    T.drawRamHorn(g, 1.3 * ppm, '#d8b25a');
    g.restore();
  }
  g.strokeStyle = '#c9a54a'; g.lineWidth = 6;
  g.beginPath(); g.arc(C, C, 21.5 * ppm, 0, Math.PI * 2); g.stroke();
  // compass star inlays
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    g.save(); g.translate(C + Math.cos(a) * 19.3 * ppm, C + Math.sin(a) * 19.3 * ppm); g.rotate(a);
    g.fillStyle = '#7b5a4e';
    for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(0, 0); g.lineTo(0.25 * ppm, 0.45 * ppm); g.lineTo(0, 1.3 * ppm); g.lineTo(-0.25 * ppm, 0.45 * ppm); g.fill(); }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}
