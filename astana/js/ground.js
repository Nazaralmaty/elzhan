// Ground surfaces of the boulevard: paving, plaza disc, lawns with curbs, pools with rims,
// roads with markings and crossings, sidewalks and the surrounding city ground.
import * as THREE from 'three';
import { BLVD, PLAZA, POOLS, CROSS_STREETS, CROSS_HALF, EAST_END, WEST_END, ARCH_X, WATER_Y, POOL_FLOOR_Y, PLINTH } from './layout.js';
import { bakeGeometry, mat } from './util.js';
import { waterMaterial } from './water.js';

// Quad on the XZ plane with UVs in world metres / uvScale.
function quad(x0, x1, z0, z1, y, uvScale = 1) {
  const g = new THREE.BufferGeometry();
  const p = [x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0];
  const uv = [];
  for (let i = 0; i < p.length; i += 3) uv.push(p[i] / uvScale, -p[i + 2] / uvScale);
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

// Box whose UVs are scaled in world metres so tiling textures do not stretch.
export function boxW(w, h, d, s = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s);
  }
  return g;
}

class Batch {
  constructor() { this.parts = []; }
  add(geo, matrix = null) { this.parts.push({ geo, matrix }); return this; }
  mesh(material, { shadow = true, cast = false } = {}) {
    if (!this.parts.length) return null;
    const m = new THREE.Mesh(bakeGeometry(this.parts), material);
    m.receiveShadow = shadow; m.castShadow = cast;
    return m;
  }
}

// Spans along x where the boulevard is continuous (cut by cross streets).
function segments(x0, x1) {
  const cuts = CROSS_STREETS.filter((c) => c > x0 && c < x1).sort((a, b) => a - b);
  const out = [];
  let a = x0;
  for (const c of cuts) { out.push([a, c - CROSS_HALF]); a = c + CROSS_HALF; }
  out.push([a, x1]);
  return out;
}

export function buildGround(ctx, M, mirror) {
  const root = new THREE.Group();
  root.name = 'Ground';
  const paving = new Batch(), paving2 = new Batch(), sidewalk = new Batch(), grass = new Batch();
  const granite = new Batch(), graniteRed = new Batch(), asphalt = new Batch(), marking = new Batch();
  const poolFloor = new Batch(), poolWall = new Batch(), water = new Batch();

  const sides = [-1, 1];
  const east = [PLAZA.halfX, EAST_END];
  const west = [WEST_END, -PLAZA.halfX];

  // ---- Plaza around Bayterek: rectangle paving under the radial disc ----
  paving2.add(quad(-PLAZA.halfX, PLAZA.halfX, -BLVD.walk2, BLVD.walk2, 0, 4.8));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PLAZA.r, 160).rotateX(-Math.PI / 2).translate(0, 0.01, 0), M.plaza);
  disc.receiveShadow = true;
  root.add(disc);

  // ---- Boulevard strips ----
  for (const [x0, x1] of [east, west]) {
    for (const [a, b] of segments(x0, x1)) {
      for (const s of sides) {
        const zr = (z0, z1) => (s > 0 ? [z0, z1] : [-z1, -z0]);
        // promenade along the water
        paving.add(quad(a, b, ...zr(BLVD.rim, BLVD.walk), 0, 4.8));
        // outer walk
        paving2.add(quad(a, b, ...zr(BLVD.lawn, BLVD.walk2), 0, 4.8));
        // lawn: raised slab with granite curb
        const [lz0, lz1] = zr(BLVD.walk + 0.15, BLVD.lawn - 0.15);
        grass.add(quad(a + 0.15, b - 0.15, lz0, lz1, 0.12, 2.2));
        const L = b - a, W = BLVD.lawn - BLVD.walk;
        const cz = s * (BLVD.walk + BLVD.lawn) / 2;
        granite.add(boxW(L, 0.2, 0.15, 1), mat((a + b) / 2, 0.1, s * (BLVD.walk + 0.075)));
        granite.add(boxW(L, 0.2, 0.15, 1), mat((a + b) / 2, 0.1, s * (BLVD.lawn - 0.075)));
        granite.add(boxW(0.15, 0.2, W, 1), mat(a + 0.075, 0.1, cz));
        granite.add(boxW(0.15, 0.2, W, 1), mat(b - 0.075, 0.1, cz));
        // road
        asphalt.add(quad(a, b, ...zr(BLVD.walk2, BLVD.road), -0.12, 8));
        granite.add(boxW(L, 0.26, 0.22, 1), mat((a + b) / 2, -0.1, s * (BLVD.walk2 + 0.11)));
        granite.add(boxW(L, 0.26, 0.22, 1), mat((a + b) / 2, -0.1, s * (BLVD.road - 0.11)));
        // sidewalk
        sidewalk.add(quad(a, b, ...zr(BLVD.road, BLVD.side + 6), 0, 3.6));
        // lane markings: dashed centre + solid edges
        const zc = s * (BLVD.walk2 + BLVD.road) / 2;
        for (let x = a + 2; x < b - 4; x += 9) marking.add(quad(x, x + 3, zc - 0.07, zc + 0.07, -0.115, 1));
        marking.add(quad(a, b, s * (BLVD.walk2 + 0.5) - 0.06, s * (BLVD.walk2 + 0.5) + 0.06, -0.115, 1));
        marking.add(quad(a, b, s * (BLVD.road - 0.5) - 0.06, s * (BLVD.road - 0.5) + 0.06, -0.115, 1));
      }
      // crossing bridges between pools, and paving over the axis where there is no pool
      const covered = POOLS.filter(([p0, p1]) => p1 > a && p0 < b);
      let cur = a;
      for (const [p0, p1] of covered.sort((u, v) => u[0] - v[0])) {
        if (p0 - 0.6 > cur) paving2.add(quad(cur, p0 - 0.6, -BLVD.rim, BLVD.rim, 0, 4.8));
        cur = p1 + 0.6;
      }
      if (cur < b) paving2.add(quad(cur, b, -BLVD.rim, BLVD.rim, 0, 4.8));
    }
  }
  // roads continue past the plaza
  for (const s of sides) {
    const zr = (z0, z1) => (s > 0 ? [z0, z1] : [-z1, -z0]);
    asphalt.add(quad(-PLAZA.halfX, PLAZA.halfX, ...zr(BLVD.walk2, BLVD.road), -0.12, 8));
    sidewalk.add(quad(-PLAZA.halfX, PLAZA.halfX, ...zr(BLVD.road, BLVD.side + 6), 0, 3.6));
    granite.add(boxW(PLAZA.halfX * 2, 0.26, 0.22, 1), mat(0, -0.1, s * (BLVD.walk2 + 0.11)));
    granite.add(boxW(PLAZA.halfX * 2, 0.26, 0.22, 1), mat(0, -0.1, s * (BLVD.road - 0.11)));
    const zc = s * (BLVD.walk2 + BLVD.road) / 2;
    for (let x = -PLAZA.halfX + 2; x < PLAZA.halfX - 4; x += 9) marking.add(quad(x, x + 3, zc - 0.07, zc + 0.07, -0.115, 1));
    // zebra crossings at the plaza's four corners
    for (const cx of [-PLAZA.halfX + 10, PLAZA.halfX - 10, -40, 40]) {
      for (let k = 0; k < 8; k++) {
        const x = cx - 3 + k * 0.8;
        marking.add(quad(x, x + 0.45, ...zr(BLVD.walk2 + 0.4, BLVD.road - 0.4), -0.115, 1));
      }
    }
  }

  // ---- Cross streets ----
  for (const c of CROSS_STREETS) {
    asphalt.add(quad(c - CROSS_HALF, c + CROSS_HALF, -1400, 1400, -0.12, 8));
    for (const s of [-1, 1]) {
      // zebra across the cross street on the boulevard axis band
      for (let z = -BLVD.lawn; z < BLVD.lawn; z += 0.85) {
        if (Math.abs(z) < 1) continue;
        marking.add(quad(c - CROSS_HALF + 0.6, c + CROSS_HALF - 0.6, z, z + 0.45, -0.115, 1));
      }
      void s;
    }
    for (let z = -1400; z < 1400; z += 9) if (Math.abs(z) > BLVD.road) marking.add(quad(c - 0.07, c + 0.07, z, z + 3, -0.115, 1));
  }

  // ---- Pools: floor, inner walls, raised granite rim, water ----
  for (const [x0, x1] of POOLS) {
    const L = x1 - x0, cx = (x0 + x1) / 2, Wd = BLVD.water * 2;
    poolFloor.add(quad(x0, x1, -BLVD.water, BLVD.water, POOL_FLOOR_Y, 2));
    const depth = 0.3 - POOL_FLOOR_Y;
    poolWall.add(boxW(L, depth, 0.1, 1), mat(cx, POOL_FLOOR_Y + depth / 2, -BLVD.water - 0.05));
    poolWall.add(boxW(L, depth, 0.1, 1), mat(cx, POOL_FLOOR_Y + depth / 2, BLVD.water + 0.05));
    poolWall.add(boxW(0.1, depth, Wd, 1), mat(x0 - 0.05, POOL_FLOOR_Y + depth / 2, 0));
    poolWall.add(boxW(0.1, depth, Wd, 1), mat(x1 + 0.05, POOL_FLOOR_Y + depth / 2, 0));
    const rimW = BLVD.rim - BLVD.water;
    const rimH = 0.42;
    graniteRed.add(boxW(L + rimW * 2, rimH, rimW, 1), mat(cx, rimH / 2, -(BLVD.water + rimW / 2)));
    graniteRed.add(boxW(L + rimW * 2, rimH, rimW, 1), mat(cx, rimH / 2, BLVD.water + rimW / 2));
    graniteRed.add(boxW(rimW, rimH, Wd, 1), mat(x0 - rimW / 2, rimH / 2, 0));
    graniteRed.add(boxW(rimW, rimH, Wd, 1), mat(x1 + rimW / 2, rimH / 2, 0));
    // floor stripes (dark mosaic bands)
    for (let x = x0 + 2; x < x1 - 1; x += 4) granite.add(boxW(0.25, 0.02, Wd - 1, 1), mat(x, POOL_FLOOR_Y + 0.01, 0));
    water.add(quad(x0, x1, -BLVD.water, BLVD.water, WATER_Y, 10));
  }

  // ---- Squares at both ends ----
  paving2.add(quad(EAST_END, EAST_END + 95, -BLVD.side, BLVD.side, 0, 4.8));
  paving2.add(quad(WEST_END - 140, WEST_END, -BLVD.side - 30, BLVD.side + 30, 0, 4.8));
  // under the arch: continuous paving band
  paving2.add(quad(ARCH_X - 34, ARCH_X + 34, -BLVD.rim, BLVD.rim, 0.003, 4.8));

  const meshes = [
    paving.mesh(M.paving), paving2.mesh(M.paving2), sidewalk.mesh(M.sidewalk), grass.mesh(M.grass),
    granite.mesh(M.granite, { cast: true }), graniteRed.mesh(M.graniteRed, { cast: true }), asphalt.mesh(M.asphalt), marking.mesh(M.marking),
    poolFloor.mesh(M.poolFloor), poolWall.mesh(M.poolWall),
  ];
  meshes.forEach((m) => m && root.add(m));

  const waterMat = waterMaterial(mirror);
  const waterMesh = water.mesh(waterMat, { shadow: false });
  waterMesh.renderOrder = 2;
  root.add(waterMesh);
  mirror.hide.push(waterMesh);

  // ---- City ground beyond the boulevard ----
  const city = new THREE.Mesh(quad(-6000, 6000, -6000, 6000, -0.14, 30), M.cityGround);
  city.receiveShadow = true;
  root.add(city);

  ctx.scene.add(root);
  return { root, waterMat, waterMesh, disc, plinthR: PLINTH.steps[0] };
}
