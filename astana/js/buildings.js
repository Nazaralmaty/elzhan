// Landmarks along Nurzhol Boulevard and the city around it. Facades are procedural
// (window grids, floor slabs, lit windows at night) computed in the shader from
// object-space position, so one material serves every building at any scale.
import * as THREE from 'three';
import { U } from './materials.js';
import { mulberry32, mat } from './util.js';
import * as T from './textures.js';
import { BLVD, ARCH_X, EAST_END } from './layout.js';

function facadeMaterial(cyl = false) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.night;
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aWall; attribute vec3 aGlass; attribute vec4 aGrid; attribute vec4 aMisc;
        varying vec3 vFP; varying vec3 vFN; varying vec3 vWall; varying vec3 vGlass; varying vec4 vGrid; varying vec4 vMisc;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 sc = vec3(1.0);
        #ifdef USE_INSTANCING
        sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #endif
        vFP = position * sc; vFN = normal; vWall = aWall; vGlass = aGlass; vGrid = aGrid; vMisc = aMisc;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFP; varying vec3 vFN; varying vec3 vWall; varying vec3 vGlass; varying vec4 vGrid; varying vec4 vMisc;
        uniform float uNight; uniform float uTime;
        float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fWin = 0.0; float fSeed = 0.5; float fLit = 0.0; float fRoof = 0.0;
        {
          vec3 an = abs(vFN);
          ${cyl ? 'float u = atan(vFP.z, vFP.x) * length(vFP.xz);' : 'float u = an.x > an.z ? vFP.z : vFP.x;'}
          float y = vFP.y;
          if (an.y > 0.6) {
            fRoof = 1.0;
            diffuseColor.rgb = vWall * 0.5 + 0.06;
          } else {
            vec2 cs = vec2(vGrid.y, vGrid.x);
            vec2 cell = vec2(u, y) / cs;
            vec2 id = floor(cell); vec2 f = fract(cell);
            vec2 fw = fwidth(cell);
            vec2 mg = vec2(1.0 - vGrid.z, 1.0 - vGrid.w) * 0.5;
            float wx = smoothstep(mg.x - fw.x, mg.x + fw.x, f.x) - smoothstep(1.0 - mg.x - fw.x, 1.0 - mg.x + fw.x, f.x);
            float wy = smoothstep(mg.y * 0.7 - fw.y, mg.y * 0.7 + fw.y, f.y) - smoothstep(1.0 - mg.y * 1.3 - fw.y, 1.0 - mg.y * 1.3 + fw.y, f.y);
            float win = clamp(wx, 0.0, 1.0) * clamp(wy, 0.0, 1.0);
            float lod = smoothstep(0.3, 0.9, max(fw.x, fw.y));
            win = mix(win, vGrid.z * vGrid.w * 0.9, lod);
            // podium: tall storefront glazing
            float podium = 1.0 - step(vMisc.w, y);
            win = mix(win, 0.88 * (1.0 - smoothstep(0.92, 0.97, fract(y / max(vMisc.w, 0.1)))), podium * step(0.5, vMisc.w));
            fSeed = fh(id + vMisc.x);
            fWin = win;
            vec3 gcol = vGlass * (0.78 + 0.44 * fSeed);
            float slab = (1.0 - smoothstep(0.0, 0.06 + fw.y, f.y)) * (1.0 - lod) * 0.25;
            diffuseColor.rgb = mix(vWall * (1.0 - slab), gcol, win);
            fLit = step(fh(id * 1.71 + vMisc.x + 3.1), vGrid.z > 0.9 ? 0.25 : 0.42) * (1.0 - lod * 0.5);
            fLit = max(fLit, podium * 0.9);
          }
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.05 + 0.1 * fSeed, fWin);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(0.0, vMisc.y, fWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 warm = mix(vec3(1.0, 0.7, 0.4), vec3(0.8, 0.88, 1.0), step(0.72, fSeed));
          totalEmissiveRadiance += warm * fWin * fLit * uNight * (0.35 + 0.9 * fSeed) * 1.6;
        }`);
  };
  m.customProgramCacheKey = () => 'facade' + (cyl ? 'c' : 'b');
  return m;
}

const STYLES = {
  blueGlass: { wall: '#3e5164', glass: '#7fa8c9', floor: 3.8, bay: 1.6, wx: 0.86, wy: 0.86, metal: 0.9 },
  greenGlass: { wall: '#35514c', glass: '#6fb0a0', floor: 3.8, bay: 1.6, wx: 0.88, wy: 0.86, metal: 0.9 },
  darkGlass: { wall: '#2a3138', glass: '#4f6577', floor: 3.6, bay: 1.5, wx: 0.9, wy: 0.88, metal: 0.92 },
  goldGlass: { wall: '#7a5a22', glass: '#e0b04e', floor: 3.6, bay: 1.7, wx: 0.9, wy: 0.84, metal: 1.0 },
  stone: { wall: '#d6ccb9', glass: '#5d7385', floor: 4.2, bay: 3.0, wx: 0.46, wy: 0.62, metal: 0.72 },
  sand: { wall: '#cdb48a', glass: '#5b6f80', floor: 3.3, bay: 3.0, wx: 0.48, wy: 0.58, metal: 0.7 },
  white: { wall: '#dedbd2', glass: '#62798c', floor: 3.2, bay: 2.8, wx: 0.52, wy: 0.6, metal: 0.7 },
  brick: { wall: '#9c5f47', glass: '#56697a', floor: 3.0, bay: 2.8, wx: 0.5, wy: 0.56, metal: 0.65 },
  cream: { wall: '#e4d4b4', glass: '#5a6e7f', floor: 3.0, bay: 3.2, wx: 0.48, wy: 0.58, metal: 0.65 },
  grey: { wall: '#aeb2b6', glass: '#5f7486', floor: 3.0, bay: 2.6, wx: 0.52, wy: 0.58, metal: 0.7 },
  terracotta: { wall: '#bf8460', glass: '#566a7a', floor: 3.0, bay: 2.8, wx: 0.5, wy: 0.58, metal: 0.65 },
  government: { wall: '#dcd4c4', glass: '#5a7083', floor: 4.6, bay: 2.6, wx: 0.42, wy: 0.7, metal: 0.72 },
  ribbon: { wall: '#d9d6cf', glass: '#6d8aa3', floor: 3.6, bay: 6.0, wx: 0.98, wy: 0.5, metal: 0.85 },
};

class FacadeSet {
  constructor(geo, material) { this.geo = geo; this.material = material; this.items = []; }
  add(matrix, style, extra = {}) { this.items.push({ matrix, style: { ...STYLES[style] || style, ...extra } }); }
  build(seedBase = 0) {
    const n = this.items.length;
    if (!n) return null;
    const im = new THREE.InstancedMesh(this.geo, this.material, n);
    const aWall = new Float32Array(n * 3), aGlass = new Float32Array(n * 3), aGrid = new Float32Array(n * 4), aMisc = new Float32Array(n * 4);
    const c = new THREE.Color();
    this.items.forEach(({ matrix, style }, i) => {
      im.setMatrixAt(i, matrix);
      c.set(style.wall); aWall.set([c.r, c.g, c.b], i * 3);
      c.set(style.glass); aGlass.set([c.r, c.g, c.b], i * 3);
      aGrid.set([style.floor, style.bay, style.wx, style.wy], i * 4);
      aMisc.set([seedBase + i * 1.37, style.metal, 0, style.podium || 0], i * 4);
    });
    im.geometry = this.geo.clone();
    im.geometry.setAttribute('aWall', new THREE.InstancedBufferAttribute(aWall, 3));
    im.geometry.setAttribute('aGlass', new THREE.InstancedBufferAttribute(aGlass, 3));
    im.geometry.setAttribute('aGrid', new THREE.InstancedBufferAttribute(aGrid, 4));
    im.geometry.setAttribute('aMisc', new THREE.InstancedBufferAttribute(aMisc, 4));
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    return im;
  }
}

export function buildCity(ctx, M) {
  const root = new THREE.Group();
  root.name = 'City';
  const boxMat = facadeMaterial(false);
  const cylMat = facadeMaterial(true);
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 1).translate(0, 0.5, 0);
  const coneCyl = new THREE.CylinderGeometry(0.36, 0.5, 1, 64, 1).translate(0, 0.5, 0);
  const boxes = new FacadeSet(unitBox, boxMat);
  const cyls = new FacadeSet(unitCyl, cylMat);
  const cones = new FacadeSet(coneCyl, cylMat);
  const rooftops = [];
  const redLights = [];
  const box = (x, z, w, h, d, style, extra, ry = 0) => {
    boxes.add(mat(x, 0, z, 0, ry, 0, w, h, d), style, extra);
    if (h > 18) rooftops.push({ x, z, w, d, h, ry });
    if (h > 70) redLights.push(new THREE.Vector3(x, h + 1.2, z));
  };
  const footprints = [];
  const reserve = (x0, x1, z0, z1) => footprints.push([x0, x1, z0, z1]);

  // ---------------- Landmarks ----------------
  // Ak Orda presidential palace: white body, colonnade, blue dome and golden spire.
  const AK = EAST_END + 150;
  reserve(AK - 90, AK + 70, -150, 150);
  const ak = new THREE.Group();
  const akWhite = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.55 });
  akWhite.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uNight * 0.35;');
  };
  box(AK, 0, 56, 31, 120, 'government', { wall: '#efece5', wx: 0.36, wy: 0.66, podium: 0 });
  box(AK, -92, 46, 22, 64, 'government', { wall: '#ebe7de' });
  box(AK, 92, 46, 22, 64, 'government', { wall: '#ebe7de' });
  // colonnade on the west face
  const colGeo = new THREE.CylinderGeometry(0.85, 0.95, 24, 20).translate(0, 12, 0);
  const cols = new THREE.InstancedMesh(colGeo, akWhite, 18);
  for (let i = 0; i < 18; i++) cols.setMatrixAt(i, mat(AK - 33, 0, -42.5 + i * 5));
  cols.castShadow = true; cols.receiveShadow = true;
  ak.add(cols);
  const ent = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 92).translate(AK - 32, 26.5, 0), akWhite);
  ent.castShadow = true;
  const pedim = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 96).translate(AK - 33, 30.5, 0), akWhite);
  const stairs = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 100).translate(AK - 37, 0.8, 0), akWhite);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, 12, 64).translate(AK, 37, 0), akWhite);
  const drumCols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.55, 10, 10).translate(0, 5, 0), akWhite, 32);
  for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; drumCols.setMatrixAt(i, mat(AK + Math.cos(a) * 16.6, 31.5, Math.sin(a) * 16.6)); }
  const domeMat = new THREE.MeshStandardMaterial({ color: '#2c6db8', roughness: 0.22, metalness: 0.55 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(15.5, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.25, 1).translate(AK, 43, 0), domeMat);
  const ribs = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const pts = [];
    for (let k = 0; k <= 12; k++) { const t = (k / 12) * Math.PI / 2; pts.push(new THREE.Vector3(AK + Math.cos(a) * Math.cos(t) * 15.6, 43 + Math.sin(t) * 15.6 * 1.25, Math.sin(a) * Math.cos(t) * 15.6)); }
    ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.18, 5));
  }
  const ribMesh = new THREE.Mesh(mergeList(ribs), M.gold);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 6, 24).translate(AK, 64.5, 0), akWhite);
  const lanternTop = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(AK, 67.5, 0), domeMat);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.9, 14, 16).translate(AK, 76, 0), M.gold);
  const sunRing = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.22, 10, 32).translate(AK, 84.5, 0), M.gold);
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12).translate(AK, 84.5, 0), M.gold);
  [ent, pedim, stairs, drum, drumCols, dome, ribMesh, lantern, lanternTop, spire, sunRing, sunCore].forEach((m) => { m.castShadow = true; m.receiveShadow = true; ak.add(m); });
  root.add(ak);

  // Twin golden towers flanking the boulevard's east end.
  for (const s of [-1, 1]) {
    cones.add(mat(EAST_END - 90, 0, s * 92, 0, 0, 0, 30, 118, 30), 'goldGlass', { podium: 0 });
    reserve(EAST_END - 112, EAST_END - 68, s * 70 - 25, s * 114 + 25);
    redLights.push(new THREE.Vector3(EAST_END - 90, 119, s * 92));
  }

  // House of Ministries (south) and the matching government row (north).
  for (const s of [-1, 1]) {
    const z = s * 108;
    const x0 = 540, x1 = EAST_END - 130;
    reserve(x0 - 5, x1 + 5, z - 28, z + 28);
    const L = x1 - x0;
    box((x0 + x1) / 2, z, L, 34, 34, 'government', { wall: s > 0 ? '#e4ddcd' : '#dcd6ca', podium: 6 });
    box((x0 + x1) / 2, z, 46, 64, 40, 'government', { wall: s > 0 ? '#ece6d8' : '#e0dace', wx: 0.32 });
    for (const t of [0.2, 0.8]) box(x0 + L * t, z, 22, 44, 36, 'stone', { wall: '#e8e2d4' });
  }

  // Transport Tower ("the lighter"): blue glass slab with a cut-out top.
  {
    const x = 420, z = -112;
    reserve(x - 30, x + 30, z - 24, z + 24);
    box(x, z, 46, 122, 26, 'blueGlass', { podium: 8 });
    box(x - 18.5, z, 9, 160, 26, 'blueGlass');
    box(x + 18.5, z, 9, 160, 26, 'blueGlass');
    boxes.add(mat(x, 152, z, 0, 0, 0, 46, 8, 26), 'blueGlass');
    redLights.push(new THREE.Vector3(x - 18, 161, z), new THREE.Vector3(x + 18, 161, z));
  }
  // Samruk-Kazyna & other glass offices facing the plaza.
  box(210, 108, 60, 72, 30, 'greenGlass', { podium: 7 });
  reserve(175, 245, 85, 130);
  box(-190, -110, 70, 58, 32, 'darkGlass', { podium: 6 });
  reserve(-230, -150, -130, -90);

  // Emerald Quarter: three green glass towers.
  for (const [x, z, h, r] of [[-250, 170, 210, 30], [-205, 205, 160, 26], [-160, 160, 128, 24]]) {
    cyls.add(mat(x, 0, z, 0, 0, 0, r, h, r * 0.75), 'greenGlass');
    reserve(x - r, x + r, z - r, z + r);
    redLights.push(new THREE.Vector3(x, h + 1, z));
  }
  // Northern Lights: slim elliptical towers with slanted crowns.
  for (const [x, z, h] of [[150, -230, 180], [205, -265, 160], [255, -215, 140]]) {
    cones.add(mat(x, 0, z, 0, 0.6, 0, 26, h, 48), 'blueGlass', { glass: '#7fb3d5' });
    reserve(x - 30, x + 30, z - 30, z + 30);
    redLights.push(new THREE.Vector3(x, h + 1, z));
  }

  // KazMunayGas headquarters: massive arch straddling the boulevard.
  {
    const W = 180, H = 96, D = 58, aw = 33, ah = 62;
    // Outline with the arch notched out of the bottom edge.
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, 0); shape.lineTo(-aw, 0); shape.lineTo(-aw, ah - aw);
    shape.absarc(0, ah - aw, aw, Math.PI, 0, true);
    shape.lineTo(aw, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, H); shape.lineTo(-W / 2, H); shape.lineTo(-W / 2, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 48 });
    g.translate(0, 0, -D / 2);
    g.rotateY(Math.PI / 2);
    const s = new FacadeSet(g, boxMat);
    s.add(mat(ARCH_X, 0, 0), 'sand', { wall: '#d8c5a2', floor: 4.0, bay: 2.4, wx: 0.42, wy: 0.62, podium: 0 });
    root.add(s.build(77));
    reserve(ARCH_X - 34, ARCH_X + 34, -95, 95);
    redLights.push(new THREE.Vector3(ARCH_X, H + 1, -80), new THREE.Vector3(ARCH_X, H + 1, 80));
  }

  // Khan Shatyr: the tilted translucent tent at the west end.
  {
    const cx = -1190, A = 98, B = 72, Ht = 150;
    reserve(cx - 120, cx + 120, -100, 100);
    const geo = new THREE.BufferGeometry();
    const seg = 96, rings = 48;
    const pos = [], uv = [], idx = [];
    const apex = new THREE.Vector3(26, Ht, 0);
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      const k = Math.pow(1 - t, 1.55);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const x = Math.cos(a) * A * k + apex.x * (1 - k);
        const z = Math.sin(a) * B * k;
        pos.push(x, t * Ht, z);
        uv.push((i / seg) * 18, t * 9);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const net = T.cableNet();
    const tentMat = new THREE.MeshStandardMaterial({ map: net, color: '#f4ead2', roughness: 0.45, metalness: 0.05, transparent: true, opacity: 0.93, emissive: '#ffb873', emissiveMap: net, emissiveIntensity: 0, side: THREE.DoubleSide });
    const tent = new THREE.Mesh(geo, tentMat);
    tent.position.x = cx;
    tent.castShadow = true; tent.receiveShadow = true;
    root.add(tent);
    const mastDir = new THREE.Vector3(0.28, 1, 0).normalize();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.3, 34, 12).translate(0, 17, 0), M.metal);
    mast.position.set(cx + apex.x - 2, Ht - 6, 0);
    mast.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), mastDir);
    mast.castShadow = true;
    root.add(mast);
    root.userData.tentMat = tentMat;
    redLights.push(new THREE.Vector3(cx + apex.x + 8, Ht + 26, 0));
  }

  // Triumph of Astana (Stalinist-style tiered tower) to the north-west.
  {
    const x = -320, z = -430;
    reserve(x - 50, x + 50, z - 50, z + 50);
    box(x, z, 80, 40, 60, 'cream', { podium: 0 });
    box(x, z, 44, 92, 36, 'cream');
    box(x, z, 30, 118, 26, 'cream');
    box(x, z, 18, 132, 16, 'cream', { wall: '#d9c7a5' });
    const sp = new THREE.Mesh(new THREE.ConeGeometry(4, 26, 8).translate(x, 145, z), new THREE.MeshStandardMaterial({ color: '#c7b07a', roughness: 0.4, metalness: 0.6 }));
    sp.castShadow = true;
    root.add(sp);
    redLights.push(new THREE.Vector3(x, 159, z));
  }

  // Distant east: Palace of Peace (pyramid), Kazakh Eli column, Hazret Sultan mosque.
  {
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(44, 62, 4, 1).rotateY(Math.PI / 4).translate(2350, 31, 260), new THREE.MeshStandardMaterial({ color: '#d8d2c2', roughness: 0.5 }));
    const apexGlass = new THREE.Mesh(new THREE.ConeGeometry(9.3, 13, 4, 1).rotateY(Math.PI / 4).translate(2350, 55.6, 260), new THREE.MeshStandardMaterial({ color: '#6aa6c8', roughness: 0.1, metalness: 0.8, emissive: '#ffd9a0', emissiveIntensity: 0 }));
    root.userData.pyrGlass = apexGlass.material;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 91, 24).translate(2050, 45.5, -40), akWhite);
    const eagle = new THREE.Mesh(new THREE.OctahedronGeometry(4.5, 0).scale(2.2, 0.7, 1).translate(2050, 94, -40), M.gold);
    const mosque = new THREE.Group();
    const mw = new THREE.Mesh(new THREE.BoxGeometry(110, 22, 110).translate(0, 11, 0), akWhite);
    const md = new THREE.Mesh(new THREE.SphereGeometry(26, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.35, 1).translate(0, 30, 0), new THREE.MeshStandardMaterial({ color: '#3f8fd0', roughness: 0.25, metalness: 0.4 }));
    const drum2 = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 8, 48).translate(0, 26, 0), akWhite);
    mosque.add(mw, md, drum2);
    for (const [dx, dz] of [[-55, -55], [55, -55], [-55, 55], [55, 55]]) {
      mosque.add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 77, 16).translate(dx, 38.5, dz), akWhite));
      mosque.add(new THREE.Mesh(new THREE.ConeGeometry(2.6, 8, 16).translate(dx, 81, dz), md.material));
    }
    mosque.position.set(2250, 0, -380);
    [pyr, apexGlass, col, eagle].forEach((m) => { m.castShadow = true; root.add(m); });
    root.add(mosque);
  }

  // ---------------- Filler city blocks ----------------
  const r = mulberry32(99);
  const taken = (x0, x1, z0, z1) => footprints.some(([a, b, c, d]) => x1 > a && x0 < b && z1 > c && z0 < d);
  const blockW = 120, blockD = 100, street = 22;
  const greens = [];
  for (const side of [-1, 1]) {
    for (let bz = 0; bz < 9; bz++) {
      const z0 = BLVD.side + 26 + bz * (blockD + street);
      for (let bx = -12; bx < 12; bx++) {
        const x0 = bx * (blockW + street) + 11;
        const zc = side * (z0 + blockD / 2), xc = x0 + blockW / 2;
        if (Math.abs(xc) > 1500) continue;
        const far = Math.abs(zc) > 650 || Math.abs(xc) > 1300;
        if (taken(xc - blockW / 2, xc + blockW / 2, zc - blockD / 2, zc + blockD / 2)) continue;
        const front = bz === 0;
        // Each block: perimeter of 2–4 buildings around a green courtyard.
        greens.push(mat(xc, 0.02, zc, 0, 0, 0, blockW - 10, 1, blockD - 10));
        const pick = (arr) => arr[(r() * arr.length) | 0];
        if (front) {
          const n = 2 + ((r() * 2) | 0);
          const w = (blockW - 8) / n;
          const nearTower = Math.abs(xc) < 300;
          for (let i = 0; i < n; i++) {
            const h = nearTower ? 20 + r() * 26 : 26 + r() * 50;
            const st = pick(['blueGlass', 'greenGlass', 'stone', 'ribbon', 'government', 'sand', 'cream', 'darkGlass']);
            box(x0 + 4 + w * (i + 0.5), side * (z0 + 14), w - 6, h, 26, st, { podium: r() < 0.6 ? 5 : 0 });
            if (r() < (nearTower ? 0.2 : 0.4)) box(x0 + 4 + w * (i + 0.5), side * (z0 + 34), (w - 6) * 0.6, h * (1.4 + r() * 0.8), 20, pick(['blueGlass', 'greenGlass', 'ribbon', st]));
          }
        } else {
          const maxH = far ? 45 : 70;
          const style = pick(['white', 'sand', 'brick', 'cream', 'grey', 'terracotta', 'white', 'sand']);
          // L/U shaped residential block
          const h1 = 16 + r() * maxH, h2 = 16 + r() * maxH;
          box(xc, side * (z0 + 9), blockW - 12, h1, 16, style, { podium: r() < 0.5 ? 4.5 : 0 });
          box(x0 + 12, zc, 16, h2, blockD - 30, style);
          if (r() < 0.7) box(x0 + blockW - 12, zc, 16, 16 + r() * maxH, blockD - 30, pick(['white', 'sand', 'grey']));
          if (r() < 0.35) {
            const th = 60 + r() * (far ? 40 : 70);
            box(xc + (r() - 0.5) * 30, zc + side * 10, 22, th, 22, pick(['blueGlass', 'white', 'sand', 'greenGlass']));
          }
          if (r() < 0.5) box(xc, side * (z0 + blockD - 9), blockW * 0.5, 14 + r() * 20, 14, style);
        }
      }
    }
  }
  // around the ends of the boulevard (east/west beyond the landmarks)
  for (let i = 0; i < 70; i++) {
    const x = (r() < 0.5 ? -1 : 1) * (1350 + r() * 900);
    const z = (r() - 0.5) * 2200;
    if (taken(x - 40, x + 40, z - 40, z + 40)) continue;
    box(x, z, 30 + r() * 40, 20 + r() * 80, 20 + r() * 30, ['white', 'sand', 'grey', 'blueGlass', 'brick'][(r() * 5) | 0]);
  }

  for (const set of [boxes, cyls, cones]) {
    const m = set.build(set === boxes ? 1 : set === cyls ? 300 : 600);
    if (m) root.add(m);
  }

  // Courtyard greens
  const yard = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M.grass, greens.length);
  greens.forEach((m, i) => yard.setMatrixAt(i, m));
  yard.receiveShadow = true;
  yard.computeBoundingSphere();
  root.add(yard);

  // Rooftop clutter: plant rooms, AC units, parapets.
  const roofBits = [];
  for (const t of rooftops) {
    const n = 2 + ((r() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const w = 2 + r() * Math.min(10, t.w * 0.3), d = 2 + r() * Math.min(8, t.d * 0.3), h = 1 + r() * 3;
      roofBits.push(mat(t.x + (r() - 0.5) * (t.w - w - 2), t.h, t.z + (r() - 0.5) * (t.d - d - 2), 0, 0, 0, w, h, d));
    }
  }
  const roofMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#8f9296', roughness: 0.7, metalness: 0.3 }), roofBits.length);
  roofBits.forEach((m, i) => roofMesh.setMatrixAt(i, m));
  roofMesh.castShadow = true; roofMesh.receiveShadow = true;
  roofMesh.computeBoundingSphere();
  root.add(roofMesh);

  // Aviation obstruction lights (blink at night).
  const rl = new THREE.BufferGeometry().setFromPoints(redLights);
  const rlMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uNight: U.night },
    vertexShader: `uniform float uTime; varying float vB;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      vB = step(0.5, fract(uTime * 0.5 + position.x * 0.013)); gl_PointSize = clamp(2400.0 / -mv.z, 2.0, 9.0); }`,
    fragmentShader: `uniform float uNight; varying float vB;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      gl_FragColor = vec4(vec3(4.0, 0.25, 0.15), (1.0 - d * 2.0) * uNight * (0.25 + 0.75 * vB)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const rlPts = new THREE.Points(rl, rlMat);
  rlPts.frustumCulled = false;
  root.add(rlPts);

  ctx.scene.add(root);
  return {
    root,
    footprints,
    setNight(n) {
      if (root.userData.tentMat) root.userData.tentMat.emissiveIntensity = n * 0.9;
      if (root.userData.pyrGlass) root.userData.pyrGlass.emissiveIntensity = n * 2;
    },
  };
}

function mergeList(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
