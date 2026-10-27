// Low-poly unit models built from kit pieces. Facing +X, right hand +Z, up +Y, a man is ~1.8 tall.
// Each model is a set of rigid parts with pivots; crowd.js poses them per instance.
import { box, cyl, cone, ball, sphere, torus, merge } from './kit.js';

const SKIN = '#e2b593', BOOT = '#2a221d', WHITE = '#ebe5d6', BRASS = '#caa24c', STEEL = '#b4bcc6', DSTEEL = '#59616b',
  WOOD = '#7b5435', WOODD = '#523621', BONE = '#e4dac2', BLACK = '#26221f', TINT = '#ffffff', LEATHER = '#6e4a2c';

/* ---------- humans ---------- */
function hat(kind) {
  switch (kind) {
    case 'tricorn': return [cyl(0.2, 0.22, 0.05, 3, BLACK, { at: [0, 0.88, 0], rot: [0, Math.PI / 6, 0] }), cyl(0.12, 0.14, 0.12, 8, BLACK, { at: [0, 0.94, 0] }), box(0.02, 0.04, 0.3, WHITE, { at: [0.12, 0.89, 0] })];
    case 'morion': return [sphere(0.15, STEEL, { at: [0, 0.84, 0], scale: [1.05, 0.8, 1.05] }), box(0.42, 0.02, 0.16, STEEL, { at: [0, 0.82, 0] }), box(0.24, 0.06, 0.02, STEEL, { at: [0, 0.97, 0] })];
    case 'papakha': return [cyl(0.14, 0.15, 0.2, 9, '#2d2621', { at: [0, 0.9, 0] }), box(0.18, 0.05, 0.18, TINT, { at: [0, 1.0, 0], tint: 1 })];
    case 'helm': return [sphere(0.155, STEEL, { at: [0, 0.8, 0] }), box(0.04, 0.12, 0.22, DSTEEL, { at: [0.13, 0.74, 0] }), box(0.24, 0.12, 0.04, TINT, { at: [-0.04, 1.0, 0], tint: 1 })];
    case 'plume': return [sphere(0.155, STEEL, { at: [0, 0.8, 0] }), box(0.03, 0.05, 0.2, DSTEEL, { at: [0.14, 0.76, 0] }), ball(0.11, TINT, { at: [-0.05, 1.0, 0], scale: [1.6, 0.8, 0.6], tint: 1 }, 0)];
    case 'hood': return [sphere(0.17, TINT, { at: [-0.02, 0.8, 0], scale: [1.05, 1.1, 1.05], tint: 1, shade: 0.3 }), cone(0.1, 0.18, 6, TINT, { at: [-0.13, 0.9, 0], rot: [0, 0, 0.9], tint: 1 })];
    case 'cap': return [cyl(0.13, 0.14, 0.12, 8, TINT, { at: [0, 0.88, 0], tint: 1 }), box(0.12, 0.02, 0.2, BLACK, { at: [0.12, 0.83, 0] })];
    case 'witch': return [cyl(0.26, 0.26, 0.02, 12, TINT, { at: [0, 0.84, 0], tint: 1 }), cone(0.15, 0.42, 9, TINT, { at: [-0.02, 1.06, 0], rot: [0, 0, 0.18], tint: 1 })];
    case 'feather': return [cyl(0.2, 0.2, 0.03, 10, '#4a3b2c', { at: [0, 0.86, 0] }), cyl(0.12, 0.14, 0.14, 8, '#4a3b2c', { at: [0, 0.93, 0] }), box(0.3, 0.03, 0.05, '#d9c9a0', { at: [-0.12, 0.98, 0.1], rot: [0, 0, 0.5] })];
    case 'horned': return [sphere(0.16, '#30343a', { at: [0, 0.8, 0] }), cone(0.04, 0.22, 5, BONE, { at: [0, 0.95, 0.14], rot: [0.7, 0, 0] }), cone(0.04, 0.22, 5, BONE, { at: [0, 0.95, -0.14], rot: [-0.7, 0, 0] }), box(0.03, 0.04, 0.16, '#7CFFB2', { at: [0.15, 0.78, 0] })];
    default: return [];
  }
}

function head(o) {
  if (o.skull) return [ball(0.13, BONE, { at: [0, 0.76, 0], scale: [1.05, 1, 0.95] }, 1), box(0.03, 0.04, 0.05, BLACK, { at: [0.115, 0.78, 0.05] }), box(0.03, 0.04, 0.05, BLACK, { at: [0.115, 0.78, -0.05] }), box(0.1, 0.05, 0.12, BONE, { at: [0.07, 0.66, 0] })];
  const skin = o.skin || SKIN;
  return [cyl(0.06, 0.06, 0.1, 6, skin, { at: [0, 0.6, 0] }), sphere(0.13, skin, { at: [0, 0.76, 0] }), box(0.05, 0.05, 0.04, skin, { at: [0.13, 0.75, 0] }),
    box(0.16, 0.12, 0.25, o.hair || '#4b3524', { at: [-0.06, 0.8, 0] }), o.moustache ? box(0.03, 0.025, 0.12, '#3b2a1c', { at: [0.13, 0.71, 0] }) : null];
}

function torso(o) {
  const parts = [];
  if (o.skull) {
    parts.push(box(0.06, 0.55, 0.06, BONE, { at: [-0.04, 0.3, 0] }));
    for (let i = 0; i < 4; i++) parts.push(box(0.2, 0.035, 0.34 - i * 0.03, BONE, { at: [0.02, 0.5 - i * 0.09, 0] }));
    parts.push(box(0.18, 0.1, 0.3, BONE, { at: [0, 0.02, 0] }), box(0.24, 0.32, 0.36, TINT, { at: [0.02, -0.06, 0], tint: 1, shade: 0.35 }));
    return parts;
  }
  if (o.robe) {
    parts.push(cyl(0.17, 0.32, 1.0, 9, TINT, { at: [0, -0.2, 0], tint: 1, shade: 0.4 }), cyl(0.16, 0.2, 0.55, 9, TINT, { at: [0, 0.32, 0], tint: 1 }),
      box(0.05, 0.8, 0.07, o.trim || BRASS, { at: [0.2, 0.0, 0], rot: [0, 0, -0.12] }), box(0.36, 0.05, 0.36, LEATHER, { at: [0, 0.12, 0] }));
    return parts;
  }
  const coat = o.coatColor || TINT, ct = o.coatColor ? 0 : 1;
  parts.push(box(0.3, 0.58, 0.42, coat, { at: [0, 0.29, 0], tint: ct }), box(0.34, 0.34, 0.46, coat, { at: [-0.01, -0.06, 0], tint: ct, shade: 0.3 }));
  if (o.facings) parts.push(box(0.02, 0.5, 0.16, o.facings, { at: [0.155, 0.3, 0] }));
  if (o.belts) parts.push(box(0.02, 0.72, 0.05, WHITE, { at: [0.165, 0.3, 0], rot: [0.62, 0, 0] }), box(0.02, 0.72, 0.05, WHITE, { at: [0.168, 0.3, 0], rot: [-0.62, 0, 0] }));
  parts.push(box(0.33, 0.05, 0.45, o.belt || LEATHER, { at: [0, 0.04, 0] }));
  if (o.armor) parts.push(box(0.34, 0.42, 0.46, o.armor, { at: [0.01, 0.34, 0] }), box(0.36, 0.05, 0.48, DSTEEL, { at: [0.01, 0.13, 0] }));
  if (o.cape) parts.push(box(0.05, 0.95, 0.46, TINT, { at: [-0.2, 0.08, 0], rot: [0, 0, -0.08], tint: 1, shade: 0.35 }));
  if (o.sash) parts.push(box(0.02, 0.7, 0.07, TINT, { at: [0.17, 0.3, 0], rot: [0.62, 0, 0], tint: 1 }));
  if (o.sack) parts.push(sphere(0.2, '#b99a5e', { at: [-0.28, 0.35, 0], scale: [0.8, 1, 1] }));
  return parts;
}

function legGeo(o) {
  if (o.skull) return merge([box(0.06, 0.85, 0.06, BONE, { at: [0, -0.43, 0] }), box(0.2, 0.06, 0.09, BONE, { at: [0.05, -0.87, 0] })]);
  if (o.robe) return merge([box(0.13, 0.3, 0.13, BLACK, { at: [0, -0.75, 0] }), box(0.22, 0.07, 0.12, BOOT, { at: [0.04, -0.87, 0] })]);
  return merge([box(0.17, 0.5, 0.16, o.trousers || WHITE, { at: [0, -0.24, 0], tint: o.trousersTint || 0 }), box(0.16, 0.42, 0.15, o.boots || BOOT, { at: [0, -0.66, 0] }), box(0.25, 0.08, 0.14, o.boots || BOOT, { at: [0.05, -0.86, 0] })]);
}

function armGeo(o, right, extra = []) {
  if (o.skull) return merge([box(0.05, 0.55, 0.05, BONE, { at: [0, -0.28, 0] }), ball(0.05, BONE, { at: [0, -0.57, 0] }, 0), ...extra]);
  const sleeve = o.robe ? TINT : (o.coatColor || TINT), st = o.robe || !o.coatColor ? 1 : 0;
  const hand = o.claws ? [box(0.1, 0.12, 0.08, o.skin, { at: [0.03, -0.62, 0] }), cone(0.02, 0.12, 4, BONE, { at: [0.08, -0.72, 0], rot: [0, 0, 2.6] })] : [ball(0.06, o.skin || SKIN, { at: [0, -0.57, 0] }, 1)];
  return merge([box(0.12, 0.52, 0.12, o.claws ? o.skin : sleeve, { at: [0, -0.25, 0], tint: o.claws ? 0 : st }),
    o.armor && !o.robe ? box(0.14, 0.18, 0.14, STEEL, { at: [0, -0.06, 0] }) : null,
    !o.claws && !o.robe ? box(0.13, 0.08, 0.13, o.cuffs || WHITE, { at: [0, -0.48, 0] }) : null, ...hand, ...extra]);
}

// weapons held in the right hand (pivot at the hand), modelled pointing down the arm (-Y)
const W = {
  sword: () => [box(0.04, 0.12, 0.04, BRASS, { at: [0, -0.6, 0] }), box(0.03, 0.04, 0.2, BRASS, { at: [0, -0.62, 0] }), box(0.025, 0.85, 0.07, STEEL, { at: [0.0, -1.06, 0] })],
  bigsword: () => [box(0.05, 0.16, 0.05, BRASS, { at: [0, -0.6, 0] }), box(0.04, 0.05, 0.28, BRASS, { at: [0, -0.64, 0] }), box(0.03, 1.15, 0.09, STEEL, { at: [0, -1.24, 0] })],
  saber: () => [box(0.04, 0.12, 0.04, BRASS, { at: [0, -0.6, 0] }), box(0.02, 0.8, 0.055, STEEL, { at: [0.04, -1.03, 0], rot: [0, 0, 0.08] })],
  rustysword: () => [box(0.04, 0.1, 0.04, '#5a4a3a', { at: [0, -0.6, 0] }), box(0.025, 0.7, 0.07, '#8a7a68', { at: [0, -0.98, 0] })],
  pick: () => [box(0.04, 0.85, 0.04, WOOD, { at: [0.0, -0.55, 0], rot: [0, 0, 0] }), box(0.42, 0.05, 0.05, DSTEEL, { at: [0.0, -0.95, 0], rot: [0, 0, 0.15] })],
  staff: (orb) => [box(0.045, 1.7, 0.045, WOODD, { at: [0, -0.35, 0] }), ball(0.08, orb, { at: [0, 0.52, 0] }, 1)],
  rammer: () => [box(0.03, 1.6, 0.03, WOOD, { at: [0, -0.4, 0] }), cyl(0.05, 0.05, 0.12, 6, '#3a3a3a', { at: [0, 0.42, 0] })]
};
const shield = (color, tint) => cyl(0.26, 0.26, 0.05, 10, color, { at: [0.04, -0.4, -0.05], rot: [Math.PI / 2, 0, 0], tint });

// long arms held by both hands: separate part, posed independently. Modelled along +Y from the grip.
function musketGeo(len = 1.5) {
  return merge([box(0.07, 0.42, 0.05, WOOD, { at: [0, -0.12, 0] }), box(0.05, 0.6, 0.045, WOOD, { at: [0, 0.35, 0] }), cyl(0.018, 0.02, len - 0.3, 6, DSTEEL, { at: [0.02, 0.3 + (len - 0.3) / 2, 0] }),
    box(0.04, 0.06, 0.05, BRASS, { at: [0.0, 0.1, 0] }), cone(0.012, 0.16, 4, STEEL, { at: [0.02, len + 0.08, 0] })]);
}
function pikeGeo() {
  return merge([cyl(0.022, 0.026, 4.4, 5, '#8a6a45', { at: [0, 1.1, 0] }), cone(0.04, 0.3, 4, STEEL, { at: [0, 3.45, 0] })]);
}

export function humanModel(o) {
  const weaponArm = o.weapon && W[o.weapon] ? W[o.weapon](o.orb) : [];
  const parts = {
    legL: { geo: legGeo(o), pivot: [0, 0.9, -0.11] },
    legR: { geo: legGeo(o), pivot: [0, 0.9, 0.11] },
    body: { geo: merge([...torso(o), ...head(o), ...hat(o.hat)]), pivot: [0, 0.9, 0] },
    armL: { geo: armGeo(o, false, o.shield ? [shield(o.shield, o.shieldTint || 0)] : []), pivot: [0, 1.42, -0.27] },
    armR: { geo: armGeo(o, true, weaponArm), pivot: [0, 1.42, 0.27] }
  };
  if (o.long === 'musket' || o.long === 'rifle') parts.gun = { geo: musketGeo(o.long === 'rifle' ? 1.7 : 1.5), pivot: [0.12, 0.95, 0.3] };
  if (o.long === 'pike') parts.gun = { geo: pikeGeo(), pivot: [0.08, 0.95, 0.3] };
  return { type: 'human', parts, scale: o.scale || 1, style: o.style || (o.long || o.weapon || 'none'), hunch: o.hunch || 0, lift: 0 };
}

/* ---------- horses ---------- */
function horseParts(o) {
  const c = o.coat || '#6e4a31', dark = o.mane || '#2b2019', skel = o.skeletal;
  const legGeoH = (front) => merge(skel
    ? [box(0.07, 1.0, 0.07, BONE, { at: [0, -0.5, 0] }), box(0.1, 0.08, 0.1, '#222', { at: [0.02, -1.0, 0] })]
    : [box(0.13, 0.5, 0.13, c, { at: [0, -0.25, 0] }), box(0.09, 0.45, 0.09, c, { at: [0, -0.72, 0] }), box(0.12, 0.08, 0.12, '#1e1a17', { at: [0.02, -0.98, 0] }), front ? box(0.1, 0.06, 0.1, WHITE, { at: [0, -0.88, 0] }) : null]);
  const body = skel ? [
    box(0.9, 0.12, 0.12, BONE, { at: [0, 0.15, 0] }), ...[0, 1, 2, 3, 4].map(i => torus(0.27, 0.035, BONE, { at: [0.35 - i * 0.17, -0.02, 0], rot: [0, Math.PI / 2, 0] }, 4, 10)),
    box(0.35, 0.3, 0.42, '#3a3f44', { at: [-0.55, 0.05, 0] }), box(0.24, 0.7, 0.2, BONE, { at: [0.72, 0.42, 0], rot: [0, 0, -0.6] }), box(0.5, 0.2, 0.18, BONE, { at: [1.02, 0.74, 0], rot: [0, 0, -0.5] }),
    box(0.04, 0.05, 0.2, '#7CFFB2', { at: [1.05, 0.82, 0] })
  ] : [
    cyl(0.33, 0.31, 1.35, 10, c, { at: [0, 0, 0], rot: [0, 0, Math.PI / 2] }), sphere(0.33, c, { at: [0.6, 0.02, 0] }), sphere(0.34, c, { at: [-0.62, 0.02, 0] }),
    box(0.34, 0.86, 0.24, c, { at: [0.8, 0.42, 0], rot: [0, 0, -0.55] }), box(0.1, 0.8, 0.07, dark, { at: [0.7, 0.55, 0], rot: [0, 0, -0.55] }),
    box(0.3, 0.26, 0.22, c, { at: [1.08, 0.86, 0], rot: [0, 0, -0.2] }), box(0.42, 0.18, 0.17, c, { at: [1.24, 0.7, 0], rot: [0, 0, -1.0] }), box(0.12, 0.1, 0.18, '#2a1d15', { at: [1.38, 0.5, 0], rot: [0, 0, -1.0] }),
    cone(0.04, 0.14, 4, c, { at: [1.0, 1.04, 0.06] }), cone(0.04, 0.14, 4, c, { at: [1.0, 1.04, -0.06] }), box(0.03, 0.03, 0.2, '#111', { at: [1.16, 0.88, 0] }),
    box(0.1, 0.55, 0.1, dark, { at: [-0.8, -0.1, 0], rot: [0, 0, 0.45] })
  ];
  body.push(box(0.62, 0.32, 0.74, TINT, { at: [-0.04, 0.2, 0], tint: 1, shade: 0.3 }), box(0.46, 0.1, 0.48, LEATHER, { at: [-0.02, 0.38, 0] }));
  if (o.barding) body.push(box(0.5, 0.45, 0.62, o.barding, { at: [0.55, 0.05, 0] }));
  return {
    body: { geo: merge(body), pivot: [0, 1.25, 0] },
    hFL: { geo: legGeoH(true), pivot: [0.56, 1.05, 0.17] }, hFR: { geo: legGeoH(true), pivot: [0.56, 1.05, -0.17] },
    hBL: { geo: legGeoH(false), pivot: [-0.58, 1.05, 0.17] }, hBR: { geo: legGeoH(false), pivot: [-0.58, 1.05, -0.17] }
  };
}

export function riderModel(o, horse) {
  const h = horseParts(horse);
  const rider = merge([...torso(o), ...head(o), ...hat(o.hat),
    box(0.45, 0.16, 0.16, o.trousers || WHITE, { at: [0.15, -0.08, 0.22] }), box(0.15, 0.5, 0.15, o.boots || BOOT, { at: [0.33, -0.36, 0.25] }),
    box(0.45, 0.16, 0.16, o.trousers || WHITE, { at: [0.15, -0.08, -0.22] }), box(0.15, 0.5, 0.15, o.boots || BOOT, { at: [0.33, -0.36, -0.25] }),
    ...(o.shield ? [] : [])]);
  return {
    type: 'rider', scale: o.scale || 1, style: o.weapon,
    parts: {
      ...h,
      rider: { geo: rider, pivot: [-0.05, 1.72, 0] },
      armL: { geo: armGeo(o, false, o.shield ? [shield(o.shield, o.shieldTint || 0)] : []), pivot: [-0.05, 2.24, -0.27] },
      armR: { geo: armGeo(o, true, W[o.weapon] ? W[o.weapon]() : []), pivot: [-0.05, 2.24, 0.27] }
    }
  };
}

/* ---------- artillery ---------- */
function wheelGeo(r = 0.5) {
  const spokes = [];
  for (let i = 0; i < 6; i++) spokes.push(box(0.04, r * 1.9, 0.04, WOOD, { rot: [0, 0, i * Math.PI / 6] }));
  return merge([torus(r, 0.05, '#4c3424', {}, 5, 16), cyl(0.08, 0.08, 0.16, 8, '#3a2a1d', { rot: [Math.PI / 2, 0, 0] }), ...spokes]);
}

export function cannonModel(o = {}) {
  const barrel = o.bone
    ? [box(0.25, 0.2, 0.25, '#4b4038', { at: [0, 0.75, 0] })]
    : [cyl(0.11, 0.16, 1.7, 10, o.metal || '#8a6a3a', { at: [0.25, 0.86, 0], rot: [0, 0, -Math.PI / 2 + 0.08] }), torus(0.13, 0.03, o.metal || '#8a6a3a', { at: [1.08, 0.93, 0], rot: [0, Math.PI / 2, 0] }), sphere(0.16, o.metal || '#8a6a3a', { at: [-0.6, 0.8, 0] })];
  const body = merge([
    box(0.9, 0.18, 0.36, WOOD, { at: [0.1, 0.62, 0] }), box(0.8, 0.3, 0.06, WOODD, { at: [0.05, 0.7, 0.2] }), box(0.8, 0.3, 0.06, WOODD, { at: [0.05, 0.7, -0.2] }),
    box(1.5, 0.14, 0.18, WOOD, { at: [-0.85, 0.3, 0], rot: [0, 0, 0.32] }), box(0.08, 0.06, 0.9, DSTEEL, { at: [0.1, 0.55, 0] }),
    box(0.3, 0.12, 0.12, TINT, { at: [-1.5, 0.08, 0], tint: 1 }), ...barrel
  ]);
  const parts = {
    body: { geo: body, pivot: [0, 0, 0] },
    wL: { geo: wheelGeo(), pivot: [0.1, 0.55, -0.48] },
    wR: { geo: wheelGeo(), pivot: [0.1, 0.55, 0.48] }
  };
  if (o.bone) parts.arm = { geo: merge([box(0.1, 1.5, 0.1, BONE, { at: [0, 0.7, 0] }), sphere(0.2, '#3d332b', { at: [0, 1.45, 0] }), sphere(0.12, BONE, { at: [0, 1.5, 0] })]), pivot: [0.0, 0.8, 0] };
  return { type: 'gun', parts, scale: o.scale || 1, style: o.bone ? 'catapult' : 'cannon' };
}

/* ---------- static props carried by units ---------- */
export function goldSack() { return merge([sphere(0.2, '#b48f4e', { scale: [1, 0.9, 1] }), ball(0.06, '#f2c14e', { at: [0.05, 0.17, 0.05] }, 0)]); }

/* ---------- roster ---------- */
export function buildModels() {
  const M = {};
  M.pikeman = humanModel({ hat: 'morion', armor: STEEL, long: 'pike', facings: WHITE, trousers: '#d8d0bd', moustache: true });
  M.musketeer = humanModel({ hat: 'tricorn', belts: true, long: 'musket', facings: '#e9dfc4', trousers: WHITE });
  M.gunner = humanModel({ hat: 'cap', weapon: 'rammer', trousers: '#d8d0bd' });
  M.miner = humanModel({ hat: 'cap', coatColor: '#d8cdb3', sash: true, weapon: 'pick', trousers: '#6b5a48', boots: '#3a2c20', style: 'pick' });
  M.minerSack = humanModel({ hat: 'cap', coatColor: '#d8cdb3', sash: true, sack: true, trousers: '#6b5a48', boots: '#3a2c20', style: 'carry' });
  M.cossack = riderModel({ hat: 'papakha', weapon: 'saber', trousers: '#2c3d63', boots: '#5a2a1c', moustache: true, belt: '#c23b2a' }, { coat: '#7a5233' });
  M.cuirassier = riderModel({ hat: 'plume', armor: STEEL, weapon: 'sword', trousers: '#e8e0cc', boots: BOOT }, { coat: '#3b2a20', mane: '#16110d' });
  M.cannon = cannonModel();
  M.skeleton = humanModel({ skull: true, weapon: 'rustysword', shield: '#4c4038', style: 'sword' });
  M.skeletonMiner = humanModel({ skull: true, weapon: 'pick', style: 'pick' });
  M.skeletonSack = humanModel({ skull: true, sack: true, style: 'carry' });
  M.ghoul = humanModel({ skin: '#8f9c86', coatColor: '#59604f', trousers: '#4a4f42', boots: '#8f9c86', claws: true, hair: '#3a3f35', hunch: 0.5, style: 'claws' });
  M.acolyte = humanModel({ robe: true, hat: 'hood', weapon: 'staff', orb: '#7CFFB2', skin: '#b9b2a2', trim: '#7CFFB2', style: 'staff' });
  M.deathknight = riderModel({ hat: 'horned', armor: '#3a3f46', coatColor: '#262a2f', weapon: 'sword', trousers: '#262a2f', boots: '#1a1c1f', cape: true, skin: '#9aa39a' }, { skeletal: true });
  M.bonecaster = cannonModel({ bone: true });
  M.alden = humanModel({ hat: 'plume', armor: '#c9d0d8', cape: true, weapon: 'bigsword', shield: '#ffffff', shieldTint: 1, trousers: '#c9d0d8', boots: '#8a929c', scale: 1.15, style: 'sword', moustache: true });
  M.irena = humanModel({ robe: true, hat: 'witch', weapon: 'staff', orb: '#FFB347', trim: BRASS, hair: '#b5532c', scale: 1.08, style: 'staff' });
  M.corvin = humanModel({ hat: 'feather', coatColor: '#3d5a3a', sash: true, long: 'rifle', trousers: '#5a4a38', boots: '#3a2a1e', scale: 1.1, moustache: true });
  return M;
}
