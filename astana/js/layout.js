// World layout of Nurzhol Boulevard around Bayterek.
// Axes: +X = east (towards Ak Orda), -X = west (towards Khan Shatyr), +Z = south, +Y = up. 1 unit = 1 metre.

export const WATER_Y = 0.06;          // all pools share one reflection plane
export const POOL_FLOOR_Y = -0.42;

export const PLINTH = { top: 0.9, r: 24.4, steps: [25.4, 24.9, 24.4] };
export const SPHERE = { y: 94, r: 11 };

export const PLAZA = { r: 44, halfX: 72, halfZ: 44 };

// Cross-section of the boulevard (distance from the axis, metres).
export const BLVD = {
  water: 5,          // |z| < water: pool water
  rim: 5.6,          // granite rim of the pools
  walk: 14,          // granite promenade
  lawn: 36,          // lawn strip with trees, hedges, flowerbeds
  walk2: 44,         // outer walkway
  road: 56,          // carriageway
  side: 62,          // sidewalk, buildings start beyond
};

export const EAST_END = 1000;    // square in front of Ak Orda begins
export const WEST_END = -1010;   // Khan Shatyr park begins
export const ARCH_X = -560;      // KazMunayGas arch spans the boulevard here
export const CROSS_STREETS = [-820, -330, 300, 640]; // north–south streets crossing the boulevard
export const CROSS_HALF = 9;

// Pools: list of [x0, x1] spans along the axis (east and west of the plaza).
export const POOLS = (() => {
  const spans = [];
  const add = (from, to, dir) => {
    let x = from;
    while ((dir > 0 ? x + 44 : x - 44) * dir <= to * dir) {
      const a = x, b = x + 44 * dir;
      const blocked = CROSS_STREETS.some((c) => Math.min(a, b) < c + CROSS_HALF + 6 && Math.max(a, b) > c - CROSS_HALF - 6)
        || (Math.min(a, b) < ARCH_X + 30 && Math.max(a, b) > ARCH_X - 30);
      if (!blocked) spans.push([Math.min(a, b), Math.max(a, b)]);
      x = b + 8 * dir;
    }
  };
  add(PLAZA.halfX + 4, EAST_END - 20, 1);
  add(-PLAZA.halfX - 4, WEST_END + 40, -1);
  return spans;
})();

export function inPool(x, z, pad = 0) {
  if (Math.abs(z) > BLVD.water + pad) return false;
  for (const [a, b] of POOLS) if (x > a - pad && x < b + pad) return true;
  return false;
}

export function onCrossStreet(x) {
  return CROSS_STREETS.some((c) => Math.abs(x - c) < CROSS_HALF);
}

// Ground height under a point (for walking camera, people, props).
export function groundY(x, z) {
  const r = Math.hypot(x, z);
  if (r < PLINTH.steps[2]) return PLINTH.top;
  if (r < PLINTH.steps[1]) return 0.6;
  if (r < PLINTH.steps[0]) return 0.3;
  const az = Math.abs(z);
  if (az > BLVD.walk && az < BLVD.lawn && Math.abs(x) > PLAZA.halfX && Math.abs(x) < 1000 && !onCrossStreet(x)) return 0.12;
  if (az > BLVD.walk2 && az < BLVD.road) return -0.12;
  return 0;
}

// Simple obstacles for the walking camera and for heroes.
export function blocked(x, z) {
  if (Math.hypot(x, z) < 7.2) return true;           // Bayterek base pavilion
  if (inPool(x, z, 0.25)) return true;
  return false;
}

// Real-world anchors for the prompt generator.
export const PLACE = {
  ru: 'Астана, Казахстан. Бульвар Нуржол (Водно-зелёный бульвар), монумент «Байтерек»',
  en: 'Astana, Kazakhstan — Nurzhol (Water-Green) Boulevard at the foot of the Bayterek monument',
  lat: 51.1283, lon: 71.4305, tz: 5,
};
