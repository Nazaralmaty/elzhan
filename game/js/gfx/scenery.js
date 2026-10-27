// Terrain mesh with vertex colours and a detail texture, instanced trees, rocks, grass tufts, distant hills.
import * as THREE from 'three';
import { box, cyl, cone, ball, dodeca, merge, tintMaterial, addGrain, addWorldFog } from './kit.js';
import { makeNoise } from '../rts/noise.js';

export function detailTexture(seed = 3) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data, n = makeNoise(seed, 64);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    // tileable: sample noise on a torus-like wrap by mixing four shifted copies
    const u = i / S, v = j / S;
    const f = (a, b) => n.fbm(a * 16, b * 16, 3);
    const w = f(u, v) * (1 - u) * (1 - v) + f(u + 1, v) * u * (1 - v) + f(u, v + 1) * (1 - u) * v + f(u + 1, v + 1) * u * v;
    const blade = Math.random() < 0.06 ? -0.12 : Math.random() < 0.05 ? 0.08 : 0;
    const g = Math.max(0, Math.min(255, (0.86 + (w - 0.5) * 0.34 + blade) * 235));
    const o = (j * S + i) * 4;
    d[o] = g; d[o + 1] = g; d[o + 2] = g; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// heights on a regular grid; colorAt returns an sRGB hex-ish [r,g,b] 0..1
export function buildTerrain({ x0, z0, w, d, step = 1, height, colorAt, uvScale = 0.22 }) {
  const nx = Math.round(w / step), nz = Math.round(d / step);
  const geo = new THREE.PlaneGeometry(w, d, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x0 + w / 2, 0, z0 + d / 2);
  const pos = geo.attributes.position, n = pos.count;
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let i = 0; i < n; i++) { const y = height(pos.getX(i), pos.getZ(i)); pos.setY(i, y); }
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = pos.getY(j * (nx + 1) + i);
  geo.computeVertexNormals();
  const col = new Float32Array(n * 3), uv = geo.attributes.uv, c = new THREE.Color();
  const nor = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), slope = 1 - nor.getY(i);
    const [r, g, b] = colorAt(x, z, y, slope);
    c.setRGB(r, g, b, THREE.SRGBColorSpace);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    uv.setXY(i, x * uvScale, z * uvScale);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, map: detailTexture() });
  mat.onBeforeCompile = sh => addWorldFog(sh);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  function heightAt(x, z) {
    const fx = Math.max(0, Math.min(nx - 0.0001, (x - x0) / step)), fz = Math.max(0, Math.min(nz - 0.0001, (z - z0) / step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = H[j * (nx + 1) + i], b = H[j * (nx + 1) + i + 1], cc = H[(j + 1) * (nx + 1) + i], dd = H[(j + 1) * (nx + 1) + i + 1];
    // PlaneGeometry splits each quad into (i,j)(i+1,j)(i,j+1) and (i+1,j)(i+1,j+1)(i,j+1)
    if (u + v <= 1) return a + (b - a) * u + (cc - a) * v;
    return dd + (cc - dd) * (1 - u) + (b - dd) * (1 - v);
  }
  return { mesh, heightAt };
}

/* ---------- vegetation ---------- */
function pineGeo() {
  return merge([cyl(0.12, 0.18, 1.6, 6, '#5b4030', { at: [0, 0.8, 0] }),
    cone(1.25, 2.0, 7, '#ffffff', { at: [0, 2.0, 0], tint: 1, shade: 0.45 }), cone(1.0, 1.8, 7, '#ffffff', { at: [0, 2.9, 0], tint: 1, shade: 0.4 }), cone(0.7, 1.5, 7, '#ffffff', { at: [0, 3.75, 0], tint: 1, shade: 0.35 })]);
}
function oakGeo() {
  return merge([cyl(0.16, 0.24, 1.9, 6, '#5e4532', { at: [0, 0.95, 0] }), cyl(0.06, 0.09, 0.9, 5, '#5e4532', { at: [0.35, 1.9, 0], rot: [0, 0, -0.7] }),
    ball(1.15, '#ffffff', { at: [0, 2.7, 0], tint: 1, shade: 0.45 }, 1), ball(0.85, '#ffffff', { at: [0.7, 2.35, 0.3], tint: 1, shade: 0.45 }, 1), ball(0.8, '#ffffff', { at: [-0.55, 2.4, -0.45], tint: 1, shade: 0.45 }, 1), ball(0.7, '#ffffff', { at: [0.1, 3.4, 0.2], tint: 1, shade: 0.3 }, 1)]);
}
function birchGeo() {
  return merge([cyl(0.09, 0.13, 2.6, 6, '#e8e4da', { at: [0, 1.3, 0] }), box(0.2, 0.06, 0.2, '#2a2622', { at: [0, 0.9, 0] }), box(0.2, 0.05, 0.2, '#2a2622', { at: [0, 1.7, 0] }),
    ball(0.8, '#ffffff', { at: [0, 2.8, 0], scale: [0.9, 1.3, 0.9], tint: 1, shade: 0.4 }, 1), ball(0.55, '#ffffff', { at: [0.3, 3.5, 0], tint: 1, shade: 0.3 }, 1)]);
}
function rockGeo() { return merge([dodeca(0.7, '#ffffff', { scale: [1.2, 0.7, 1], tint: 1, shade: 0.35 }), dodeca(0.45, '#ffffff', { at: [0.6, -0.1, 0.3], tint: 1, shade: 0.35 })]); }
function bushGeo() { return merge([ball(0.55, '#ffffff', { at: [0, 0.35, 0], scale: [1.2, 0.8, 1], tint: 1, shade: 0.5 }, 1), ball(0.4, '#ffffff', { at: [0.45, 0.28, 0.2], tint: 1, shade: 0.5 }, 1)]); }
function tuftGeo() {
  // three blades, each a triangle in both windings with an upward normal so back faces are lit like grass
  const g = [];
  for (let i = 0; i < 3; i++) {
    const t = new THREE.BufferGeometry();
    const a = i * Math.PI / 3, cx = Math.cos(a) * 0.18, cz = Math.sin(a) * 0.18, h = 0.5 + i * 0.08, lean = (i - 1) * 0.08;
    const tri = [-cx, 0, -cz, cx, 0, cz, cx * 0.2 + lean, h, cz * 0.2];
    t.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...tri, tri[3], tri[4], tri[5], tri[0], tri[1], tri[2], tri[6], tri[7], tri[8]]), 3));
    t.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(Array(6).fill([0.15, 1, 0.15]).flat()), 3));
    t.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 1.05, 1.05, 1.05, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 1.05, 1.05, 1.05]), 3));
    t.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(6).fill(1), 1));
    g.push(t);
  }
  return merge(g);
}

export const PROP_KINDS = { pine: pineGeo, oak: oakGeo, birch: birchGeo, rock: rockGeo, bush: bushGeo, tuft: tuftGeo };

// items: [{kind, x, y, z, s, r, color}] -> instanced meshes, one per kind; returns handles to hide items later
export function buildProps(scene, items) {
  const by = {};
  for (const it of items) (by[it.kind] ||= []).push(it);
  const out = {};
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  for (const [kind, list] of Object.entries(by)) {
    const geo = PROP_KINDS[kind]();
    const mat = kind === 'tuft' ? grassMaterial() : treeMaterial();
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      m4.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e.set(it.tilt || 0, it.r || 0, 0)), s.set(it.s, it.s * (it.sy || 1), it.s));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c.set(it.color || '#5f8f45'));
      it.index = i;
    });
    mesh.castShadow = kind !== 'tuft';
    mesh.receiveShadow = kind !== 'tuft';
    scene.add(mesh);
    out[kind] = { mesh, list };
  }
  // hide or shrink one item (felled tree, mined rock)
  out.setScale = (it, k) => {
    const h = out[it.kind];
    if (!h) return;
    m4.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e.set(it.tilt || 0, it.r || 0, 0)), s.set(it.s * k, it.s * (it.sy || 1) * k, it.s * k));
    h.mesh.setMatrixAt(it.index, m4);
    h.mesh.instanceMatrix.needsUpdate = true;
  };
  return out;
}

let treeMat, grassMat;
function treeMaterial() {
  if (treeMat) return treeMat;
  treeMat = tintMaterial({ roughness: 0.9 });
  return treeMat;
}
function grassMaterial() {
  if (grassMat) return grassMat;
  grassMat = tintMaterial({ roughness: 1 });
  return grassMat;
}

// Far hills/mountains ring for depth
export function backdrop(scene, cx, cz, radius, seed = 5) {
  const n = makeNoise(seed, 64), parts = [];
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * Math.PI * 2 + n.noise(i, 1) * 0.1, r = radius * (1 + n.noise(i, 3) * 0.25);
    const h = 18 + n.noise(i, 7) * 40, w = 30 + n.noise(i, 9) * 30;
    const far = n.noise(i, 11) > 0.55;
    parts.push(cone(w, h, 6, far ? '#7d8fa0' : '#6f8a6a', { at: [cx + Math.cos(a) * r, h / 2 - 4, cz + Math.sin(a) * r], rot: [0, n.noise(i, 5) * 3, 0], shade: 0.4 }));
    if (h > 44) parts.push(cone(w * 0.3, h * 0.3, 6, '#eef2f4', { at: [cx + Math.cos(a) * r, h - 4 - h * 0.15 + 0.5, cz + Math.sin(a) * r], rot: [0, n.noise(i, 5) * 3, 0] }));
  }
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  scene.add(mesh);
  return mesh;
}

export { addGrain };
