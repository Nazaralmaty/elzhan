// Buildings from kit pieces: fortress, Morven's necropolis, gold mine, half-timbered houses, mills, towers.
// Every builder returns a list of pieces; tinted pieces take the owner's colour in staticMesh().
import * as THREE from 'three';
import { box, cyl, cone, ball, sphere, prism, dodeca, torus, merge, staticMesh, staticMaterial } from './kit.js';

export const STONE = '#a59d8f', STONE2 = '#8d867a', DARKSTONE = '#3d4247', PLASTER = '#ece3cf', BEAM = '#4e3423', ROOF = '#9b4a33', THATCH = '#c7a35a',
  WOOD = '#7b5435', WOODD = '#523621', BONE = '#e4dac2', GOLD = '#f2c14e', SLATE = '#56606b';

const T = (x, y, z) => ({ at: [x, y, z] });

function crenels(x0, x1, z, y, along = 'x', size = 0.5) {
  const out = [], n = Math.floor(Math.abs(x1 - x0) / (size * 2));
  for (let i = 0; i <= n; i++) {
    const p = x0 + (x1 - x0) * i / n;
    out.push(along === 'x' ? box(size, size * 1.1, size * 1.2, STONE, T(p, y, z)) : box(size * 1.2, size * 1.1, size, STONE, T(z, y, p)));
  }
  return out;
}

export function roundTower(x, z, r, h, roof = 'tint') {
  const out = [cyl(r, r * 1.08, h, 12, STONE, { at: [x, h / 2, z], shade: 0.25 }), cyl(r * 1.12, r * 1.12, 0.5, 12, STONE2, T(x, h, z))];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; out.push(box(0.5, 0.6, 0.5, STONE, T(x + Math.cos(a) * r * 1.05, h + 0.5, z + Math.sin(a) * r * 1.05))); }
  if (roof) out.push(cone(r * 1.2, r * 1.6, 12, roof === 'tint' ? '#ffffff' : roof, { at: [x, h + 0.25 + r * 0.8, z], tint: roof === 'tint' ? 1 : 0 }));
  for (let i = 0; i < 3; i++) out.push(box(0.12, 0.6, 0.35, '#2a2420', T(x + r * 0.98, h * (0.35 + i * 0.2), z)));
  return out;
}

export function flag(x, y, z, len = 1.6) {
  return [cyl(0.05, 0.06, 3, 5, WOODD, T(x, y + 1.5, z)), box(0.04, 0.9, len, '#ffffff', { at: [x, y + 2.5, z + len / 2], tint: 1 }), ball(0.09, GOLD, T(x, y + 3.05, z), 0)];
}

export function halfTimber({ x = 0, z = 0, w = 4, d = 3, h = 2.6, roof = ROOF, roofTint = false, ry = 0, stoneBase = true, floors = 1, chimney = true }) {
  const out = [];
  const add = g => { g.rotateY(ry); g.translate(x, 0, z); out.push(g); };
  const H = h * floors;
  if (stoneBase) add(box(w + 0.15, 0.5, d + 0.15, STONE2, T(0, 0.25, 0)));
  add(box(w, H, d, PLASTER, T(0, H / 2 + 0.2, 0)));
  // beams: corner posts, mid posts, floor bands, diagonal braces
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.16, H, 0.16, BEAM, T(sx * w / 2, H / 2 + 0.2, sz * d / 2)));
  for (let f = 0; f <= floors; f++) { add(box(w + 0.05, 0.13, 0.08, BEAM, T(0, 0.25 + f * h - (f === floors ? 0.08 : 0), d / 2 + 0.02))); add(box(w + 0.05, 0.13, 0.08, BEAM, T(0, 0.25 + f * h - (f === floors ? 0.08 : 0), -d / 2 - 0.02))); add(box(0.08, 0.13, d + 0.05, BEAM, T(w / 2 + 0.02, 0.25 + f * h - (f === floors ? 0.08 : 0), 0))); add(box(0.08, 0.13, d + 0.05, BEAM, T(-w / 2 - 0.02, 0.25 + f * h - (f === floors ? 0.08 : 0), 0))); }
  const nPost = Math.max(1, Math.round(w / 1.6));
  for (let f = 0; f < floors; f++) for (let i = 1; i < nPost; i++) {
    const px = -w / 2 + w * i / nPost;
    for (const sz of [-1, 1]) {
      add(box(0.12, h, 0.06, BEAM, T(px, 0.2 + f * h + h / 2, sz * (d / 2 + 0.03))));
      if (i % 2) add(box(0.09, h * 0.95, 0.05, BEAM, { at: [px + w / nPost / 2, 0.2 + f * h + h / 2, sz * (d / 2 + 0.035)], rot: [0, 0, 0.55] }));
      else add(box(0.42, 0.5, 0.06, '#2c3a44', T(px + w / nPost / 2, 0.2 + f * h + h * 0.55, sz * (d / 2 + 0.04))));
    }
  }
  add(box(0.8, 1.4, 0.08, WOODD, T(0, 0.9, d / 2 + 0.05)));
  // roof with overhang, ridge along x
  const rh = Math.min(w, d) * 0.62;
  add(prism(d + 0.8, rh, w + 0.7, roof, { at: [0, H + 0.2, 0], rot: [0, Math.PI / 2, 0], tint: roofTint ? 1 : 0, shade: 0.25 }));
  add(box(w + 0.75, 0.12, 0.12, '#3a2a1e', T(0, H + 0.2 + rh, 0)));
  if (chimney) add(box(0.45, 1.3, 0.45, '#7d6656', T(w * 0.25, H + rh * 0.9, -d * 0.15)));
  return out;
}

/* ---------- lane: fortress, necropolis, mine ---------- */
export function fortress() {
  const P = [];
  // courtyard
  P.push(box(22, 0.3, 26, '#9f9584', T(-4, 0.05, 0)));
  // front curtain wall with gate, side walls, back wall
  P.push(box(1.8, 4.6, 9.2, STONE, { at: [6, 2.3, -7.4], shade: 0.25 }), box(1.8, 4.6, 9.2, STONE, { at: [6, 2.3, 7.4], shade: 0.25 }));
  P.push(...crenels(-11.8, -3, 6.6, 4.9, 'z'), ...crenels(3, 11.8, 6.6, 4.9, 'z'));
  P.push(box(20, 4.2, 1.6, STONE, { at: [-4, 2.1, -12], shade: 0.25 }), box(20, 4.2, 1.6, STONE, { at: [-4, 2.1, 12], shade: 0.25 }), box(1.6, 4.2, 24, STONE, { at: [-14, 2.1, 0], shade: 0.25 }));
  P.push(...crenels(-13, 5, -12.6, 4.5), ...crenels(-13, 5, 12.6, 4.5));
  // gatehouse
  P.push(box(3.2, 6.4, 6.2, STONE2, { at: [6.3, 3.2, 0], shade: 0.25 }), box(0.4, 3.2, 2.6, '#2a2420', T(7.85, 1.6, 0)), box(0.2, 0.25, 2.8, BEAM, T(7.95, 3.25, 0)));
  P.push(...crenels(-2.8, 2.8, 7.6, 6.75, 'z', 0.45), box(0.12, 2.2, 1.6, '#ffffff', { at: [8.0, 4.6, 0], tint: 1 }));
  // towers
  P.push(...roundTower(6, -12, 2.3, 7.2), ...roundTower(6, 12, 2.3, 7.2), ...roundTower(-14, -12, 2, 6.2), ...roundTower(-14, 12, 2, 6.2));
  // keep: stone lower floor, timber upper floor, tall roof
  P.push(box(8, 5, 9, STONE2, { at: [-6, 2.5, 0], shade: 0.2 }));
  P.push(...halfTimber({ x: -6, z: 0, w: 8.4, d: 9.4, h: 3, roof: '#ffffff', roofTint: true, stoneBase: false, chimney: true }).map(g => g.translate(0, 4.8, 0)));
  P.push(...roundTower(-9, -5.5, 1.7, 13, 'tint'), ...flag(-9, 16.2, -5.5, 2.4));
  P.push(...flag(6, 10.4, -12), ...flag(6, 10.4, 12));
  // wall guns
  for (const z of [-7.5, 7.5]) P.push(cyl(0.2, 0.26, 2, 8, '#3b3b3b', { at: [7.2, 5.1, z], rot: [0, 0, -Math.PI / 2 + 0.05] }), box(1.2, 0.5, 0.9, WOODD, T(6.4, 4.85, z)));
  // barrels, crates, a well
  P.push(cyl(0.45, 0.45, 0.9, 8, WOOD, T(2.5, 0.6, 6)), cyl(0.45, 0.45, 0.9, 8, WOOD, T(3.3, 0.6, 6.5)), box(0.9, 0.9, 0.9, '#8a6a45', T(2.8, 0.6, -6)), cyl(0.9, 1, 1, 10, STONE, T(-1, 0.6, -7)), box(2, 0.12, 0.3, WOODD, T(-1, 2, -7)));
  return P;
}

export function necropolis() {
  const P = [];
  P.push(box(22, 0.3, 26, '#4d4a46', T(4, 0.05, 0)));
  const wall = (x, z, w, d) => P.push(box(w, 4.4, d, DARKSTONE, { at: [x, 2.2, z], shade: 0.35 }));
  wall(-6, -7.4, 1.8, 9.2); wall(-6, 7.4, 1.8, 9.2); wall(4, -12, 20, 1.6); wall(4, 12, 20, 1.6); wall(14, 0, 1.6, 24);
  for (let i = 0; i < 14; i++) {
    const z = -12 + i * 24 / 13;
    if (Math.abs(z) > 3) P.push(cone(0.25, 1.4, 5, BONE, { at: [-6.4, 5.1, z], rot: [0, 0, 0.35] }));
    P.push(cone(0.22, 1.2, 5, BONE, { at: [4 + (i - 7) * 1.4, 5, -12.7], rot: [-0.4, 0, 0] }), cone(0.22, 1.2, 5, BONE, { at: [4 + (i - 7) * 1.4, 5, 12.7], rot: [0.4, 0, 0] }));
  }
  // gate of bones
  P.push(box(3, 6, 6, '#30353a', { at: [-6.3, 3, 0], shade: 0.3 }), box(0.4, 3.4, 2.6, '#0f1412', T(-7.85, 1.7, 0)));
  for (let i = 0; i < 5; i++) P.push(ball(0.32, BONE, T(-7.9, 3.7 + i * 0.05, -1.3 + i * 0.65), 1));
  // spires
  const spire = (x, z, r, h) => {
    P.push(cyl(r * 0.25, r, h, 6, '#2e3438', { at: [x, h / 2, z], shade: 0.3 }), cyl(r * 1.15, r * 1.25, 1, 6, '#262b2f', T(x, 0.5, z)));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.push(cone(0.18, h * 0.3, 4, BONE, { at: [x + Math.cos(a) * r * 0.75, h * 0.35, z + Math.sin(a) * r * 0.75], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] })); }
  };
  spire(6, 0, 3.4, 20); spire(-6, -12, 2, 9); spire(-6, 12, 2, 9); spire(14, -12, 1.8, 8); spire(14, 12, 1.8, 8);
  P.push(box(0.14, 2.6, 1.8, '#ffffff', { at: [-7.95, 4.4, 0], tint: 1 }));
  return P;
}

// glowing crystal for the necropolis (separate unlit mesh)
export function crystal(color = '#7CFFB2') {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color }));
  m.scale.set(1, 1.7, 1);
  return m;
}

export function goldMine() {
  const P = [];
  const rocks = [[0, 0, 0, 3.8, 2.6], [2.6, 0, 1.6, 2.4, 1.8], [-2.8, 0, 0.8, 2.6, 1.9], [0.8, 0, -2.4, 2.8, 2.2], [-1.6, 0, -2.2, 2, 1.6]];
  rocks.forEach(([x, , z, r, h], i) => P.push(dodeca(r, i % 2 ? '#8a7f70' : '#7a7266', { at: [x, h * 0.45, z], scale: [1, h / r, 1], rot: [i, i * 2, 0], shade: 0.35 })));
  // timber entrance facing +z (toward the field)
  P.push(box(0.3, 2.6, 0.3, WOOD, T(-1.1, 1.3, 3.2)), box(0.3, 2.6, 0.3, WOOD, T(1.1, 1.3, 3.2)), box(2.8, 0.35, 0.4, WOOD, T(0, 2.7, 3.2)), box(1.9, 2.3, 0.6, '#14100d', T(0, 1.15, 3.0)));
  // gold veins and nuggets
  for (let i = 0; i < 16; i++) { const a = i * 2.4, r = 1.5 + (i % 4) * 0.7; P.push(dodeca(0.16 + (i % 3) * 0.06, GOLD, T(Math.cos(a) * r, 0.6 + (i % 5) * 0.45, Math.sin(a) * r * 0.8 + 0.6))); }
  // rails and a cart
  for (let i = 0; i < 6; i++) P.push(box(1.2, 0.08, 0.2, WOODD, T(0, 0.05, 3.6 + i * 0.6)));
  P.push(box(0.06, 0.08, 3.6, '#555', T(-0.4, 0.12, 5.1)), box(0.06, 0.08, 3.6, '#555', T(0.4, 0.12, 5.1)));
  P.push(box(1.1, 0.7, 1.3, '#5e4330', T(0, 0.65, 5.4)), ...[0, 1, 2, 3, 4].map(i => dodeca(0.2, GOLD, T(-0.3 + i * 0.15, 1.05, 5.2 + (i % 2) * 0.3))));
  P.push(torus(0.22, 0.05, '#333', { at: [-0.6, 0.3, 5.0], rot: [0, Math.PI / 2, 0] }), torus(0.22, 0.05, '#333', { at: [0.6, 0.3, 5.0], rot: [0, Math.PI / 2, 0] }));
  P.push(cyl(0.05, 0.05, 1.6, 5, WOODD, T(1.8, 0.8, 3.6)), ball(0.25, '#ffcf7a', T(1.8, 1.7, 3.6), 0));
  return P;
}

export function boneMine() {
  const P = goldMine();
  P.push(...[0, 1, 2, 3].map(i => ball(0.3, BONE, T(-2 + i * 0.4, 0.3, 4.4 + (i % 2) * 0.3), 1)));
  return P;
}

export function windmill(x, z, ry = 0) {
  const P = [cyl(1.4, 2, 6, 8, PLASTER, { at: [x, 3, z], shade: 0.25 }), cone(1.8, 2.2, 8, THATCH, T(x, 7.1, z)), box(0.8, 1.3, 0.1, WOODD, T(x + 1.75, 0.8, z))];
  return P;
}
export function windmillSails() {
  const g = [];
  for (let i = 0; i < 4; i++) g.push(box(0.12, 4.2, 0.9, '#e7dcc2', { at: [0, 2.2, 0], rot: [0, 0, 0] }).rotateX(i * Math.PI / 2));
  g.push(cyl(0.2, 0.2, 0.5, 6, WOODD, { rot: [0, 0, Math.PI / 2] }));
  return merge(g.map(x => x));
}

export function haystack(x, z) { return [cone(1.1, 1.8, 9, THATCH, { at: [x, 0.9, z], shade: 0.3 })]; }
export function fence(x0, z0, x1, z1) {
  const P = [], n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.6)), a = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i <= n; i++) P.push(box(0.12, 1, 0.12, WOODD, T(x0 + (x1 - x0) * i / n, 0.5, z0 + (z1 - z0) * i / n)));
  const len = Math.hypot(x1 - x0, z1 - z0);
  P.push(box(len, 0.08, 0.06, WOOD, { at: [(x0 + x1) / 2, 0.75, (z0 + z1) / 2], rot: [0, a, 0] }), box(len, 0.08, 0.06, WOOD, { at: [(x0 + x1) / 2, 0.4, (z0 + z1) / 2], rot: [0, a, 0] }));
  return P;
}

export { staticMesh, staticMaterial, merge };

/* ---------- Cossacks mode buildings: footprints in metres (1 cell = 2 m), centred on the origin ---------- */
const cobble = (w, d) => box(w + 0.6, 0.25, d + 0.6, '#8f8676', T(0, 0.05, 0));

export function rtsTownhall() {
  const P = [cobble(12, 12)];
  P.push(box(11, 1.0, 9, STONE2, T(0, 0.5, -0.5)));
  P.push(...halfTimber({ x: 0, z: -0.5, w: 10.4, d: 8.4, h: 3.1, floors: 2, roof: '#ffffff', roofTint: true, stoneBase: false, chimney: true }).map(g => g.translate(0, 0.8, 0)));
  // bell tower with clock
  P.push(box(3, 11, 3, STONE, { at: [0, 5.5, 4.2], shade: 0.25 }), box(3.3, 0.4, 3.3, STONE2, T(0, 11, 4.2)), cyl(0.7, 0.7, 0.12, 14, '#efe6cf', { at: [0, 9, 5.75], rot: [Math.PI / 2, 0, 0] }), box(0.08, 0.5, 0.05, '#222', T(0, 9.15, 5.85)));
  P.push(cone(2.4, 4, 4, '#ffffff', { at: [0, 13.2, 4.2], rot: [0, Math.PI / 4, 0], tint: 1 }), ...flag(0, 15, 4.2, 1.8));
  P.push(box(1.6, 2.4, 0.2, WOODD, T(-2.5, 2.0, 3.75)), box(1.6, 2.4, 0.2, WOODD, T(2.5, 2.0, 3.75)));
  // well and market stalls
  P.push(cyl(0.8, 0.9, 0.9, 10, STONE, T(-4.6, 0.6, 4.6)), box(1.8, 0.12, 0.25, WOODD, T(-4.6, 2, 4.6)), box(0.12, 1.6, 0.12, WOODD, T(-5.4, 1.4, 4.6)), box(0.12, 1.6, 0.12, WOODD, T(-3.8, 1.4, 4.6)));
  P.push(box(2, 0.8, 1, WOOD, T(4.4, 0.55, 4.8)), prism(1.4, 0.6, 2.2, '#ffffff', { at: [4.4, 1.6, 4.8], rot: [0, Math.PI / 2, 0], tint: 1 }), box(0.1, 1.2, 0.1, WOODD, T(3.5, 1.1, 5.2)), box(0.1, 1.2, 0.1, WOODD, T(5.3, 1.1, 5.2)));
  return P;
}
export function rtsHouse(v = 0) {
  const roofs = ['#a65537', '#8f4a32', '#c7a35a', '#6d5a4a'];
  return [box(6, 0.2, 6, '#8f8676', T(0, 0.02, 0)), ...halfTimber({ x: 0, z: 0, w: 4.6, d: 3.8, h: 2.6, roof: roofs[v % 4], ry: v % 2 ? Math.PI / 2 : 0 }), box(1.2, 0.6, 0.6, WOOD, T(2.2, 0.4, 2.4)), cyl(0.3, 0.3, 0.6, 8, WOOD, T(-2.3, 0.4, 2.3))];
}
export function rtsMillBody() {
  return [box(8, 0.2, 8, '#9a8f75', T(0, 0.02, 0)), cyl(1.9, 2.5, 7, 10, PLASTER, { at: [0, 3.5, 0], shade: 0.25 }), cone(2.4, 2.6, 10, THATCH, T(0, 8.3, 0)), box(1, 1.6, 0.12, WOODD, T(0, 0.9, 2.45)),
    box(0.7, 0.7, 0.1, '#2c3a44', T(0, 4.5, 2.2)), ...halfTimber({ x: -2.6, z: -2.4, w: 2.6, d: 2.2, h: 2, roof: THATCH, chimney: false }), cyl(0.5, 0.5, 0.8, 8, '#c9b48a', T(2.6, 0.5, 2.6)), cyl(0.5, 0.5, 0.8, 8, '#c9b48a', T(3.3, 0.5, 2.0))];
}
export function rtsStorehouse() {
  const P = [box(8, 0.2, 8, '#8f8676', T(0, 0.02, 0)), box(6.6, 3.2, 4.6, WOOD, { at: [0, 1.7, -1], shade: 0.3 }), prism(5.6, 2.2, 7.2, '#7a5a3c', { at: [0, 3.3, -1], rot: [0, Math.PI / 2, 0] })];
  for (let i = 0; i < 5; i++) P.push(box(0.12, 3.2, 0.12, WOODD, T(-3.2 + i * 1.6, 1.7, 1.35)));
  P.push(box(2.6, 2.6, 0.1, '#2a1f17', T(0, 1.4, 1.32)));
  for (let i = 0; i < 6; i++) P.push(cyl(0.22, 0.22, 2.2, 7, '#8a6342', { at: [-2.6 + (i % 3) * 0.48, 0.35 + Math.floor(i / 3) * 0.42, 2.8], rot: [0, 0, Math.PI / 2] }));
  P.push(dodeca(0.5, '#8d8a84', T(2.4, 0.4, 2.8)), dodeca(0.42, '#9a968f', T(3.0, 0.35, 2.3)), dodeca(0.36, '#85827c', T(2.6, 0.75, 2.5)));
  return P;
}
export function rtsBarracks() {
  const P = [box(12, 0.25, 10, '#8f8676', T(0, 0.05, 0))];
  P.push(box(10.5, 3, 5.4, STONE, { at: [0, 1.5, -1.8], shade: 0.25 }));
  P.push(...halfTimber({ x: 0, z: -1.8, w: 10.4, d: 5.2, h: 2.6, roof: '#ffffff', roofTint: true, stoneBase: false, chimney: true }).map(g => g.translate(0, 2.9, 0)));
  for (let i = 0; i < 5; i++) P.push(box(0.5, 0.9, 0.1, '#2c3a44', T(-4 + i * 2, 1.8, 1.0)));
  P.push(box(1.4, 2.2, 0.15, WOODD, T(0, 1.1, 0.95)));
  // drill yard: fence, dummies, flag
  P.push(...fence(-5.6, 2.2, -5.6, 4.6), ...fence(-5.6, 4.6, 5.6, 4.6), ...fence(5.6, 4.6, 5.6, 2.2));
  for (const x of [-3, -1.2]) P.push(box(0.12, 1.6, 0.12, WOODD, T(x, 0.8, 3.4)), box(0.8, 0.12, 0.12, WOODD, T(x, 1.3, 3.4)), sphere(0.22, '#c9b48a', T(x, 1.75, 3.4)), box(0.45, 0.6, 0.3, '#c9b48a', T(x, 1.1, 3.4)));
  P.push(...flag(4.2, 0, 3.4, 1.6));
  P.push(cyl(0.05, 0.05, 1.6, 4, '#8a6a45', { at: [2.5, 0.8, 3.0], rot: [0.3, 0, 0] }), cyl(0.05, 0.05, 1.6, 4, '#8a6a45', { at: [2.5, 0.8, 3.0], rot: [-0.3, 0, 0] }));
  return P;
}
export function rtsStable() {
  const P = [box(12, 0.25, 10, '#9a8f75', T(0, 0.05, 0)), box(10.5, 2.8, 4.6, '#8a6242', { at: [0, 1.4, -2.2], shade: 0.3 }), prism(5.6, 2, 11.2, '#ffffff', { at: [0, 2.8, -2.2], rot: [0, Math.PI / 2, 0], tint: 1, shade: 0.2 })];
  for (let i = 0; i < 5; i++) P.push(box(1.3, 1.7, 0.1, i % 2 ? '#5a3b25' : '#4e3423', T(-4 + i * 2, 0.95, 0.12)), box(1.4, 0.12, 0.14, '#3a2a1e', T(-4 + i * 2, 1.86, 0.16)));
  P.push(...fence(-5.6, 1.4, -5.6, 4.6), ...fence(-5.6, 4.6, 5.6, 4.6), ...fence(5.6, 4.6, 5.6, 1.4));
  P.push(cone(0.9, 1.4, 8, THATCH, T(-3.5, 0.7, 3.2)), box(1.4, 0.5, 0.5, WOOD, T(2.8, 0.35, 3.6)), box(1.2, 0.08, 0.4, '#4a7fb0', T(2.8, 0.58, 3.6)));
  P.push(...flag(5, 0, -4.4, 1.4));
  return P;
}
export function rtsBlacksmith() {
  const P = [box(8, 0.2, 8, '#8f8676', T(0, 0.02, 0)), box(6, 3, 4.6, STONE, { at: [0, 1.5, -1], shade: 0.3 }), prism(5.4, 2, 6.8, SLATE, { at: [0, 3, -1], rot: [0, Math.PI / 2, 0] })];
  P.push(box(1.3, 5.6, 1.3, '#6e5a4c', T(2.2, 3, -2.2)), box(1.6, 0.25, 1.6, '#5a4a3e', T(2.2, 5.9, -2.2)));
  // open forge front: posts, awning, anvil, quench barrel, glowing hearth
  P.push(box(0.2, 2.6, 0.2, WOODD, T(-2.8, 1.3, 2.6)), box(0.2, 2.6, 0.2, WOODD, T(2.8, 1.3, 2.6)), box(6.2, 0.15, 2.4, '#5a4636', { at: [0, 2.6, 2.0], rot: [0.12, 0, 0] }));
  P.push(box(0.8, 0.5, 0.4, '#3a3a3a', T(-0.8, 0.6, 2.0)), box(0.3, 0.4, 0.3, '#2a2a2a', T(-0.8, 0.3, 2.0)), cyl(0.4, 0.4, 0.8, 8, WOOD, T(1.4, 0.5, 2.2)), box(1.3, 0.8, 0.9, '#5d4c40', T(-2.0, 0.5, 1.2)), box(0.8, 0.12, 0.5, '#ff8a3a', T(-2.0, 0.95, 1.2)));
  return P;
}
export function rtsFoundry() {
  const P = [box(12, 0.25, 10, '#8a7f70', T(0, 0.05, 0)), box(10, 4, 5.6, '#9c5a43', { at: [0, 2, -1.8], shade: 0.3 }), prism(6.4, 2.2, 10.6, SLATE, { at: [0, 4, -1.8], rot: [0, Math.PI / 2, 0] })];
  for (const x of [-3, 3]) P.push(cyl(0.7, 0.9, 9, 10, '#8a4a36', T(x, 4.5, -3)), cyl(0.85, 0.85, 0.4, 10, '#6e3a2a', T(x, 9, -3)));
  for (let i = 0; i < 4; i++) P.push(box(0.9, 1.4, 0.1, '#ffb066', T(-3.6 + i * 2.4, 1.6, 1.0)));
  P.push(box(2, 3, 0.15, WOODD, T(0, 1.5, 1.0)));
  P.push(cyl(0.2, 0.26, 2, 8, '#3b3b3b', { at: [3.2, 0.7, 3.4], rot: [0, 0, Math.PI / 2] }), cyl(0.4, 0.4, 0.1, 10, WOODD, { at: [3.0, 0.4, 3.0], rot: [Math.PI / 2, 0, 0] }), cyl(0.4, 0.4, 0.1, 10, WOODD, { at: [3.0, 0.4, 3.8], rot: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 6; i++) P.push(sphere(0.14, '#2a2a2a', T(-3 + (i % 3) * 0.3, 0.3 + Math.floor(i / 3) * 0.24, 3.4)));
  P.push(...flag(-5, 0, 3.6, 1.4));
  return P;
}
export function rtsMine(res) {
  const ore = res === 'gold' ? GOLD : res === 'iron' ? '#9a5a3c' : '#2a2a2a';
  const P = [];
  [[0, 0, 0, 3.4, 2.4], [2.2, 0, -1.4, 2.2, 2], [-2.2, 0, -1, 2.4, 1.9], [0.4, 0, -2.6, 2.4, 2.6]].forEach(([x, , z, r, h], i) => P.push(dodeca(r, i % 2 ? '#8a7f70' : '#7a7266', { at: [x, h * 0.45, z], scale: [1, h / r, 1], rot: [i, i * 2, 0], shade: 0.35 })));
  P.push(box(0.3, 3.2, 0.3, WOOD, T(-1.2, 1.6, 2.8)), box(0.3, 3.2, 0.3, WOOD, T(1.2, 1.6, 2.8)), box(3.2, 0.4, 0.5, WOOD, T(0, 3.2, 2.8)), box(2, 2.6, 0.6, '#14100d', T(0, 1.3, 2.55)));
  // head frame with wheel
  P.push(box(0.2, 4.5, 0.2, WOODD, { at: [2.6, 2.2, 1.6], rot: [0, 0, 0.12] }), box(0.2, 4.5, 0.2, WOODD, { at: [3.6, 2.2, 1.6], rot: [0, 0, -0.12] }), torus(0.6, 0.06, '#4a3424', { at: [3.1, 4.3, 1.6] }, 5, 14));
  for (let i = 0; i < 12; i++) { const a = i * 2.3, r = 1.2 + (i % 4) * 0.6; P.push(dodeca(0.15 + (i % 3) * 0.06, ore, T(Math.cos(a) * r, 0.5 + (i % 5) * 0.4, Math.sin(a) * r * 0.7 + 0.4))); }
  P.push(box(1.1, 0.7, 1.3, '#5e4330', T(-2.6, 0.55, 3.2)), ...[0, 1, 2].map(i => dodeca(0.22, ore, T(-2.9 + i * 0.3, 1.0, 3.2))));
  P.push(box(0.12, 1.4, 1.2, '#ffffff', { at: [1.6, 3.6, 2.9], tint: 1 }));
  return P;
}
export function rtsDeposit(res) {
  const ore = res === 'gold' ? GOLD : res === 'iron' ? '#9a5a3c' : '#262626';
  const P = [];
  [[0, 0, 0, 2.6, 1.8], [1.8, 0, 1.2, 1.6, 1.3], [-1.6, 0, 1.0, 1.7, 1.4], [0.6, 0, -1.8, 1.8, 1.6], [-1.4, 0, -1.4, 1.4, 1.1]].forEach(([x, , z, r, h], i) => P.push(dodeca(r, i % 2 ? '#8a8378' : '#7b746a', { at: [x, h * 0.4, z], scale: [1, h / r, 1], rot: [i * 1.3, i * 2.1, 0], shade: 0.35 })));
  for (let i = 0; i < 18; i++) { const a = i * 2.1, r = 0.8 + (i % 5) * 0.5; P.push(dodeca(0.16 + (i % 3) * 0.08, ore, T(Math.cos(a) * r, 0.4 + (i % 4) * 0.35, Math.sin(a) * r))); }
  return P;
}
export function rtsTower() {
  return [box(6, 0.2, 6, '#8f8676', T(0, 0.02, 0)), ...roundTower(0, 0, 2.2, 9.5), box(0.12, 1.2, 0.8, '#2a2420', T(2.2, 1.2, 0)), ...flag(0, 14, 0, 1.6)];
}
export function scaffold(w, d, h) {
  const P = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(box(0.14, h, 0.14, '#8a6a45', T(sx * w / 2, h / 2, sz * d / 2)));
  for (let y = 1.2; y < h; y += 1.6) { P.push(box(w, 0.1, 0.1, '#8a6a45', T(0, y, d / 2)), box(w, 0.1, 0.1, '#8a6a45', T(0, y, -d / 2)), box(0.1, 0.1, d, '#8a6a45', T(w / 2, y, 0)), box(0.1, 0.1, d, '#8a6a45', T(-w / 2, y, 0))); }
  P.push(box(w * 0.6, 0.12, 0.8, '#a07a50', { at: [0, h * 0.55, d / 2 + 0.3], rot: [0, 0, 0.2] }));
  return P;
}
export function rubble(w, d) {
  const P = [];
  for (let i = 0; i < 9; i++) P.push(dodeca(0.4 + (i % 3) * 0.25, i % 2 ? '#6e665c' : '#4e463e', T((i % 3 - 1) * w * 0.28, 0.2, (Math.floor(i / 3) - 1) * d * 0.28)));
  P.push(box(w * 0.6, 0.15, 0.3, '#2c2620', { at: [0, 0.3, 0], rot: [0, 0.5, 0.1] }), box(w * 0.5, 0.15, 0.3, '#2c2620', { at: [0.4, 0.4, 0.5], rot: [0, -0.8, -0.15] }));
  return P;
}
