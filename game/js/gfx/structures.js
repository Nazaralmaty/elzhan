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
