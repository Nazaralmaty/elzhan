// Trees (broadleaf elms/limes and blue spruces), trimmed hedges and flowerbeds.
// Crowns are clusters of alpha-tested leaf cards with radial normals for soft volume shading.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { BLVD, PLAZA, CROSS_STREETS, CROSS_HALF, EAST_END, WEST_END, ARCH_X, groundY } from './layout.js';
import { mulberry32, mat } from './util.js';
import { windSway, worldDetail } from './materials.js';
import * as T from './textures.js';
import { boxW } from './ground.js';

const clean = (g) => {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
};

function taperTube(curve, segs, radial, r0, r1) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return g;
}

// Crossed leaf cards with normals bent outward from the crown centre.
function cardCluster(cards, center, bend = 0.75) {
  const pos = [], nor = [], uv = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const c of cards) {
    e.set(c.rx, c.ry, c.rz); q.setFromEuler(e);
    const s = c.s / 2;
    const corners = [[-s, -s], [s, -s], [s, s], [-s, -s], [s, s], [-s, s]];
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
    const cardN = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    for (let i = 0; i < 6; i++) {
      v.set(corners[i][0], corners[i][1], 0).applyQuaternion(q).add(c.p);
      pos.push(v.x, v.y, v.z);
      n.copy(v).sub(center).normalize().multiplyScalar(bend).addScaledVector(cardN, 1 - bend).normalize();
      if (n.y < -0.2) n.y = -0.2;
      n.normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(uvs[i][0], uvs[i][1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function broadleaf(seed) {
  const r = mulberry32(seed);
  const trunkH = 2.3 + r() * 0.9;
  const crownR = 2.4 + r() * 0.8, crownH = 2.6 + r() * 0.8;
  const cy = trunkH + crownH * 0.85;
  const wood = [];
  const lean = new THREE.Vector3((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3);
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(lean.x * 0.4, trunkH * 0.5, lean.z * 0.4), new THREE.Vector3(lean.x, trunkH + 0.4, lean.z),
  ]);
  wood.push(taperTube(trunkCurve, 6, 7, 0.17, 0.1));
  const tips = [];
  const nb = 5 + ((r() * 3) | 0);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + r() * 0.6;
    const start = new THREE.Vector3(lean.x, trunkH - 0.2 + r() * 0.5, lean.z);
    const tip = new THREE.Vector3(Math.cos(a) * crownR * (0.6 + r() * 0.3), cy + (r() - 0.3) * crownH * 0.8, Math.sin(a) * crownR * (0.6 + r() * 0.3));
    const mid = start.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.5, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, tip);
    wood.push(taperTube(curve, 5, 5, 0.085, 0.025));
    tips.push(tip);
    // secondary twig
    const t2 = tip.clone().add(new THREE.Vector3((r() - 0.5) * 1.6, 0.6 + r() * 0.6, (r() - 0.5) * 1.6));
    wood.push(taperTube(new THREE.LineCurve3(curve.getPoint(0.6), t2), 2, 4, 0.04, 0.012));
    tips.push(t2);
  }
  const cards = [];
  const center = new THREE.Vector3(lean.x, cy, lean.z);
  for (let i = 0; i < 120; i++) {
    let p;
    if (i < tips.length * 6) {
      const t = tips[i % tips.length];
      p = t.clone().add(new THREE.Vector3((r() - 0.5) * 1.6, (r() - 0.5) * 1.2, (r() - 0.5) * 1.6));
    } else {
      const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1), rad = Math.cbrt(r()) * 0.95;
      p = new THREE.Vector3(Math.sin(v) * Math.cos(u) * crownR * rad, Math.cos(v) * crownH * rad, Math.sin(v) * Math.sin(u) * crownR * rad).add(center);
    }
    cards.push({ p, s: 1.25 + r() * 0.75, rx: r() * Math.PI, ry: r() * Math.PI * 2, rz: r() * Math.PI });
  }
  return {
    wood: BGU.mergeGeometries(wood.map(clean)),
    leaves: cardCluster(cards, center),
    height: cy + crownH,
  };
}

function spruce(seed) {
  const r = mulberry32(seed);
  const H = 6.5 + r() * 3, R = 1.8 + r() * 0.6;
  const wood = [clean(new THREE.CylinderGeometry(0.05, 0.16, H, 7).translate(0, H / 2, 0))];
  const cards = [];
  const tiers = 13;
  for (let t = 0; t < tiers; t++) {
    const y = 0.7 + (t / tiers) * (H - 1.0);
    const rr = R * Math.pow(1 - (y - 0.4) / H, 0.95) + 0.25;
    const n = Math.max(5, Math.round(rr * 5));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + t * 0.7 + r() * 0.3;
      const p = new THREE.Vector3(Math.cos(a) * rr * 0.5, y - 0.2, Math.sin(a) * rr * 0.5);
      cards.push({ p, s: rr * 1.15 + 0.4, rx: -Math.PI / 2 + 0.55, ry: -a + Math.PI / 2, rz: 0 });
      cards.push({ p: p.clone().add(new THREE.Vector3(0, 0.25, 0)), s: rr * 0.9 + 0.35, rx: -0.2 + r() * 0.4, ry: -a, rz: r() });
    }
  }
  cards.push({ p: new THREE.Vector3(0, H - 0.2, 0), s: 0.9, rx: 0, ry: 0, rz: 0 });
  cards.push({ p: new THREE.Vector3(0, H - 0.2, 0), s: 0.9, rx: 0, ry: Math.PI / 2, rz: 0 });
  return { wood: BGU.mergeGeometries(wood), leaves: cardCluster(cards, new THREE.Vector3(0, H * 0.45, 0), 0.6), height: H };
}

function leafMaterial(map, color = '#ffffff') {
  const m = new THREE.MeshStandardMaterial({ map, color, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
  windSway(m, { amp: 0.16, freq: 1.2, minY: 1.6 });
  return m;
}

function blocked(x) {
  return CROSS_STREETS.some((c) => Math.abs(x - c) < CROSS_HALF + 2.5) || Math.abs(x - ARCH_X) < 38;
}

export function buildVegetation(ctx, M) {
  const root = new THREE.Group();
  root.name = 'Vegetation';
  const rnd = mulberry32(2024);

  const summerLeaf = T.leafCard();
  const autumnLeaf = T.leafCard(['#d9a21b', '#e8b830', '#c96f1c', '#b5541b', '#e3c449', '#a8701f'], 6);
  const leafMat = leafMaterial(summerLeaf);
  const needleMat = leafMaterial(T.needleCard(), '#b8d0c8');
  const barkMat = worldDetail(new THREE.MeshStandardMaterial({ map: T.bark(), roughness: 0.95 }), {});
  const depth = (map) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42 });

  const variants = [broadleaf(11), broadleaf(23), broadleaf(37), broadleaf(51)];
  const conifers = [spruce(5), spruce(9)];

  // Placement lists per variant, chunked along x so frustum culling works per chunk.
  const CH = 320;
  const buckets = new Map();
  const put = (kind, v, x, z, s, rot) => {
    const key = `${kind}:${v}:${Math.floor(x / CH)}`;
    if (!buckets.has(key)) buckets.set(key, { kind, v, list: [] });
    buckets.get(key).list.push(mat(x, groundY(x, z), z, 0, rot, 0, s, s * (0.9 + rnd() * 0.2), s));
  };

  const runs = [[PLAZA.halfX + 8, EAST_END - 6], [WEST_END + 20, -PLAZA.halfX - 8]];
  for (const [a, b] of runs) {
    for (let x = a; x < b; x += 10) {
      for (const s of [-1, 1]) {
        for (const [zz, off] of [[BLVD.walk + 4.5, 0], [BLVD.lawn - 4, 5]]) {
          const xx = x + off + (rnd() - 0.5) * 0.8;
          if (blocked(xx)) continue;
          if ((Math.floor((xx - a) / 10) % 6 === 3) && zz > 20) {
            put('c', (rnd() * 2) | 0, xx, s * (zz - 2), 0.9 + rnd() * 0.3, rnd() * 6);
          } else {
            put('b', (rnd() * 4) | 0, xx, s * zz, 0.9 + rnd() * 0.35, rnd() * 6);
          }
        }
      }
    }
  }
  // street trees along the outer sidewalks
  for (let x = -1000; x < 1000; x += 12) {
    if (Math.abs(x) < PLAZA.halfX || blocked(x)) continue;
    for (const s of [-1, 1]) put('b', (rnd() * 4) | 0, x + rnd() * 2, s * (BLVD.road + 2.4), 0.75 + rnd() * 0.25, rnd() * 6);
  }
  // spruce groves at the plaza corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = sx * (54 + (i % 3) * 6 + rnd() * 2), z = sz * (32 + Math.floor(i / 3) * 6 + rnd() * 2);
      put('c', i % 2, x, z, 0.95 + rnd() * 0.3, rnd() * 6);
    }
  }

  const leafMeshes = [];
  for (const { kind, v, list } of buckets.values()) {
    const geo = kind === 'b' ? variants[v] : conifers[v];
    const wood = new THREE.InstancedMesh(geo.wood, barkMat, list.length);
    const leaves = new THREE.InstancedMesh(geo.leaves, kind === 'b' ? leafMat : needleMat, list.length);
    list.forEach((m, i) => { wood.setMatrixAt(i, m); leaves.setMatrixAt(i, m); });
    for (const im of [wood, leaves]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); }
    leaves.customDepthMaterial = depth(kind === 'b' ? summerLeaf : needleMat.map);
    leaves.userData.kind = kind;
    leafMeshes.push(leaves);
    root.add(wood, leaves);
  }

  // ---- hedges along the lawn edges with gaps for paths ----
  const hedgeParts = [];
  for (const [a, b] of runs) {
    for (let x = a; x < b; x += 24) {
      if (blocked(x) || blocked(x + 22)) continue;
      for (const s of [-1, 1]) {
        hedgeParts.push({ geo: boxW(20.5, 0.6, 0.65, 1.2), matrix: mat(x + 11, 0.12 + 0.3, s * (BLVD.walk + 0.75)) });
        hedgeParts.push({ geo: boxW(20.5, 0.9, 0.8, 1.2), matrix: mat(x + 11, 0.12 + 0.45, s * (BLVD.lawn - 0.9)) });
      }
    }
  }
  const hedgeGeo = BGU.mergeGeometries(hedgeParts.map(({ geo, matrix }) => clean(geo.applyMatrix4(matrix))));
  const hedges = new THREE.Mesh(hedgeGeo, M.hedge);
  hedges.castShadow = true; hedges.receiveShadow = true;
  root.add(hedges);

  // ---- flowerbeds: textured ovals plus 3D blossoms ----
  const flowerBeds = [];
  for (const [a, b] of runs) {
    for (let x = a + 30; x < b; x += 48) {
      if (blocked(x) || blocked(x + 8) || blocked(x - 8)) continue;
      for (const s of [-1, 1]) flowerBeds.push({ x, z: s * ((BLVD.walk + BLVD.lawn) / 2 + 0.5), L: 14, W: 3.2, scheme: (Math.abs(Math.round(x / 48)) + (s > 0 ? 1 : 0)) % 4 });
    }
  }
  const bedGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const blossomGeo = new THREE.IcosahedronGeometry(0.075, 0);
  const blossomCols = [['#d7263d', '#f46036'], ['#f5c518', '#ffb000'], ['#8e44ad', '#b06ad8'], ['#ffffff', '#ffd6e0']];
  const bySchemeBeds = [[], [], [], []], blossoms = [[], [], [], []];
  for (const fb of flowerBeds) {
    bySchemeBeds[fb.scheme].push(mat(fb.x, 0.135, fb.z, 0, 0, 0, fb.L / 2, 1, fb.W / 2));
    if (Math.abs(fb.x) < 520) {
      for (let i = 0; i < 140; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.95;
        blossoms[fb.scheme].push(mat(fb.x + Math.cos(a) * rr * fb.L / 2, 0.2 + rnd() * 0.12, fb.z + Math.sin(a) * rr * fb.W / 2, rnd(), rnd(), 0, 0.8 + rnd() * 0.6));
      }
    }
  }
  bySchemeBeds.forEach((list, i) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(bedGeo, M.flowers[i], list.length);
    list.forEach((m, k) => im.setMatrixAt(k, m));
    im.receiveShadow = true; im.computeBoundingSphere();
    root.add(im);
    const bl = blossoms[i];
    if (!bl.length) return;
    const bm = new THREE.InstancedMesh(blossomGeo, new THREE.MeshStandardMaterial({ color: blossomCols[i][0], roughness: 0.7 }), bl.length);
    const c2 = new THREE.Color(blossomCols[i][1]), c1 = new THREE.Color(blossomCols[i][0]);
    bl.forEach((m, k) => { bm.setMatrixAt(k, m); bm.setColorAt(k, k % 3 ? c1 : c2); });
    bm.castShadow = true; bm.computeBoundingSphere();
    root.add(bm);
  });

  ctx.scene.add(root);
  return {
    root, leafMat, needleMat, leafMeshes,
    setSeason(season) {
      // 0 summer, 1 autumn, 2 winter
      leafMat.map = season === 1 ? autumnLeaf : summerLeaf;
      leafMat.needsUpdate = true;
      for (const lm of leafMeshes) {
        if (lm.userData.kind === 'b') {
          lm.visible = season !== 2;
          lm.customDepthMaterial.map = leafMat.map;
          lm.customDepthMaterial.needsUpdate = true;
        }
      }
      needleMat.color.set(season === 2 ? '#d8e4e4' : '#b8d0c8');
    },
  };
}
