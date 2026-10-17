// Crowd behaviour: who walks where. Promenade loops around the pools, a ring around the
// plinth, people sitting on benches, tourists photographing the tower, kids running.
// Deterministic (seeded) so a given density always produces the same scene.
import * as THREE from 'three';
import { emptyPose, walkPose, idlePose } from './people.js';
import { BLVD, POOLS, PLINTH, groundY, EAST_END, WEST_END, CROSS_STREETS } from './layout.js';
import { mulberry32 } from './util.js';

class Route {
  constructor(points, closed = true) {
    this.p = points;
    this.closed = closed;
    this.len = [0];
    const n = closed ? points.length : points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      this.len.push(this.len[i] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.total = this.len[this.len.length - 1];
  }
  // position & direction at distance d
  at(d, out) {
    d = this.closed ? ((d % this.total) + this.total) % this.total : Math.max(0, Math.min(this.total - 1e-3, d));
    let lo = 0, hi = this.len.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.len[mid] <= d) lo = mid; else hi = mid; }
    const a = this.p[lo], b = this.p[(lo + 1) % this.p.length];
    const seg = this.len[lo + 1] - this.len[lo] || 1;
    const t = (d - this.len[lo]) / seg;
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
    out.dx = (b.x - a.x) / seg; out.dz = (b.z - a.z) / seg;
    return out;
  }
}

// A straight lane at |z| that bulges around the plinth.
function lane(x0, x1, z, step = 3) {
  const pts = [];
  const R = 28.5;
  const dir = x1 > x0 ? 1 : -1;
  for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += step * dir) {
    let zz = z;
    if (Math.abs(x) < R) zz = Math.sign(z) * Math.max(Math.abs(z), Math.sqrt(R * R - x * x));
    pts.push({ x, z: zz });
  }
  return pts;
}

function gaps() {
  const s = [...POOLS].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let i = 0; i < s.length - 1; i++) if (s[i + 1][0] - s[i][1] < 20) out.push((s[i][1] + s[i + 1][0]) / 2);
  return out;
}

export class CrowdSim {
  constructor(crowd, props, heroes) {
    this.crowd = crowd;
    this.props = props;
    this.heroes = heroes;
    this.people = [];
    this.pose = emptyPose();
    this.tmp = {};
    this.avoid = true;
    this.density = 220;
  }

  build(count = this.density) {
    this.density = count;
    const crowd = this.crowd;
    crowd.clear();
    this.people = [];
    if (count <= 0) return;
    const r = mulberry32(777);
    const g = gaps();
    const nearGaps = g.filter((x) => Math.abs(x) < 520);
    const heroC = this.heroes.center;
    const camSpot = { x: heroC.x + 15, z: heroC.z + 1.6 };
    const farFromHeroes = (x, z, d = 7) => Math.hypot(x - heroC.x, z - heroC.z) > d && Math.hypot(x - camSpot.x, z - camSpot.z) > 8;
    const skinFor = (kid) => {
      const kids = [...crowd.kidSkins];
      if (kid) return kids[(r() * kids.length) | 0];
      let s;
      do { s = (r() * crowd.skinCount) | 0; } while (crowd.kidSkins.has(s));
      return s;
    };
    const mk = (o) => {
      const kid = !!o.kid;
      const p = {
        skin: skinFor(kid), scale: kid ? 0.55 + r() * 0.15 : 0.93 + r() * 0.13, seed: r() * 10,
        phase: r() * 10, x: 0, y: 0, z: 0, heading: 0, lateral: 0, ...o,
      };
      if (o.elderSlow) p.speed *= 0.7;
      return crowd.add(p) && this.people.push(p);
    };

    const quota = (f) => Math.round(count * f);
    // 1) promenade loops around pairs of pools near the tower
    const loops = [];
    for (let i = 0; i < 14; i++) {
      let a = nearGaps[(r() * nearGaps.length) | 0] ?? -200, b = nearGaps[(r() * nearGaps.length) | 0] ?? 200;
      if (Math.abs(a - b) < 60) b = a + (a < 0 ? 140 : -140);
      const x0 = Math.min(a, b), x1 = Math.max(a, b);
      const z = BLVD.rim + 2.2 + r() * 4.5;
      const pts = [...lane(x0, x1, z), ...lane(x1, x0, -z)];
      loops.push(new Route(pts, true));
    }
    for (let i = 0; i < quota(0.36); i++) {
      const route = loops[(r() * loops.length) | 0];
      mk({ kind: 'route', route, dist: r() * route.total, speed: (1.05 + r() * 0.5) * (r() < 0.5 ? 1 : -1), lane0: (r() - 0.5) * 1.6 });
    }
    // 2) ring around the tower on the plinth
    const ring = [];
    for (let k = 0; k <= 64; k++) { const a = (k / 64) * Math.PI * 2; ring.push({ x: Math.cos(a) * 18.5, z: Math.sin(a) * 18.5 }); }
    const ringRoute = new Route(ring, true);
    for (let i = 0; i < quota(0.1); i++) mk({ kind: 'route', route: ringRoute, dist: r() * ringRoute.total, speed: (0.7 + r() * 0.4) * (r() < 0.5 ? 1 : -1), lane0: (r() - 0.5) * 3 });
    // 3) tourists photographing the sphere
    for (let i = 0; i < quota(0.08); i++) {
      const a = r() * Math.PI * 2, rr = 20 + r() * 22;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (!farFromHeroes(x, z)) continue;
      mk({ kind: 'static', act: 'photo', x, z, heading: Math.atan2(-x, -z) + (r() - 0.5) * 0.3 });
    }
    // 4) small groups chatting on the plaza and promenades
    for (let i = 0; i < quota(0.03); i++) {
      const a = r() * Math.PI * 2, rr = 30 + r() * 12;
      const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
      if (!farFromHeroes(cx, cz, 9)) continue;
      const n = 2 + ((r() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const b = (k / n) * Math.PI * 2;
        const x = cx + Math.cos(b) * 0.7, z = cz + Math.sin(b) * 0.7;
        mk({ kind: 'static', act: 'talk', x, z, heading: Math.atan2(cx - x, cz - z) });
      }
    }
    // 5) people sitting on benches near the centre
    const seats = this.props.seats.filter((s) => Math.abs(s.x) < 420);
    for (let i = 0; i < quota(0.14) && seats.length; i++) {
      const s = seats.splice((r() * seats.length) | 0, 1)[0];
      if (!farFromHeroes(s.x, s.z, 5)) continue;
      mk({ kind: 'seat', x: s.x, y: s.y, z: s.z, heading: s.heading, act: r() < 0.3 ? 'phone' : 'sit' });
    }
    // 6) outer walkways and sidewalks: long straight strolls
    for (let i = 0; i < quota(0.18); i++) {
      const side = r() < 0.5 ? -1 : 1;
      const z = side * (r() < 0.55 ? BLVD.lawn + 3 + r() * 4 : BLVD.road + 2 + r() * 3);
      const x0 = -700 + r() * 400, x1 = 300 + r() * 400;
      const route = new Route([{ x: x0, z }, { x: x1, z }, { x: x1, z: z + side * 0.9 }, { x: x0, z: z + side * 0.9 }], true);
      mk({ kind: 'route', route, dist: r() * route.total, speed: 1.1 + r() * 0.5, lane0: 0 });
    }
    // 7) kids running around the plaza
    const kidRing = [];
    for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2; kidRing.push({ x: Math.cos(a) * (36 + Math.sin(a * 3) * 3), z: Math.sin(a) * (34 + Math.cos(a * 2) * 3) }); }
    const kidRoute = new Route(kidRing, true);
    for (let i = 0; i < quota(0.05); i++) mk({ kind: 'route', route: kidRoute, dist: r() * kidRoute.total, speed: (2.0 + r() * 1.2) * (r() < 0.5 ? 1 : -1), lane0: (r() - 0.5) * 6, kid: true });
    // fill up the remainder on the promenade loops
    while (this.people.length < count && crowd.people.length < crowd.capacity) {
      const route = loops[(r() * loops.length) | 0];
      if (!mk({ kind: 'route', route, dist: r() * route.total, speed: (1.0 + r() * 0.5) * (r() < 0.5 ? 1 : -1), lane0: (r() - 0.5) * 1.6 })) break;
    }
    void EAST_END; void WEST_END; void CROSS_STREETS; void PLINTH;
  }

  update(dt, t, camera = null) {
    const pose = this.pose;
    const crowd = this.crowd;
    const hs = this.heroes.list.map((h) => h.state);
    // Keep the line of sight between a ground-level camera and the heroes clear.
    let seg = null;
    if (camera && camera.position.y < 6) {
      const hc = this.heroes.center;
      const cx = camera.position.x, cz = camera.position.z;
      if (Math.hypot(hc.x - cx, hc.z - cz) < 45) seg = { ax: cx, az: cz, bx: hc.x, bz: hc.z };
      hs.push({ x: cx, z: cz });
    }
    const out = this.tmp;
    for (const p of this.people) {
      for (const k of ['legR', 'legL', 'armR', 'armL', 'head', 'body']) { pose[k][0] = 0; pose[k][1] = 0; pose[k][2] = 0; }
      pose.bob = 0;
      if (p.kind === 'route') {
        p.dist += p.speed * dt;
        p.route.at(p.dist, out);
        let dx = out.dx, dz = out.dz;
        if (p.speed < 0) { dx = -dx; dz = -dz; }
        // lateral offset: lane + avoidance push around the heroes
        let lat = p.lane0 + p.lateral;
        let px = out.x + dz * lat, pz = out.z - dx * lat;
        if (this.avoid) {
          let push = 0;
          for (const h of hs) {
            const ddx = px - h.x, ddz = pz - h.z;
            const d = Math.hypot(ddx, ddz);
            if (d < 2.6) {
              const side = Math.sign(ddx * dz - ddz * dx) || 1;
              push += side * (2.6 - d) * 2.2;
            }
          }
          if (seg) {
            const ex = seg.bx - seg.ax, ez = seg.bz - seg.az;
            const L2 = ex * ex + ez * ez || 1;
            const u = Math.max(0, Math.min(1, ((px - seg.ax) * ex + (pz - seg.az) * ez) / L2));
            const qx = seg.ax + ex * u, qz = seg.az + ez * u;
            const ddx = px - qx, ddz = pz - qz;
            const d = Math.hypot(ddx, ddz);
            if (d < 2.2) {
              const side = Math.sign(ddx * dz - ddz * dx) || 1;
              push += side * (2.2 - d) * 3.0;
            }
          }
          p.lateral += (push - p.lateral * 0.35) * dt;
          lat = p.lane0 + p.lateral;
          px = out.x + dz * lat; pz = out.z - dx * lat;
        }
        p.x = px; p.z = pz;
        const h = Math.atan2(dx, dz);
        let dh = h - p.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        p.heading += dh * Math.min(1, dt * 6);
        const sp = Math.abs(p.speed);
        p.phase += sp * dt * Math.PI / (0.72 * p.scale);
        walkPose(pose, p.phase, sp > 1.8 ? 1.5 : 1);
        if (sp > 1.8) { pose.armR[0] *= 1.4; pose.armL[0] *= 1.4; pose.body[0] = 0.12; }
        p.y = groundY(p.x, p.z);
      } else if (p.kind === 'static') {
        idlePose(pose, t, p.seed);
        if (p.act === 'photo') {
          pose.armR[0] = -1.5; pose.armL[0] = -1.5; pose.armR[2] = 0.32; pose.armL[2] = -0.32;
          pose.head[0] = -0.35; pose.head[1] = 0;
        } else if (p.act === 'talk') {
          const g = Math.sin(t * 2 + p.seed * 5);
          if (g > 0.2) { pose.armR[0] = -0.6 - g * 0.3; pose.armR[2] = -0.2; }
          pose.head[1] *= 0.3;
        }
        p.y = groundY(p.x, p.z);
      } else if (p.kind === 'seat') {
        pose.legR[0] = -Math.PI / 2; pose.legL[0] = -Math.PI / 2;
        pose.legR[1] = 0.08; pose.legL[1] = -0.08;
        pose.armR[0] = -0.55; pose.armL[0] = -0.55;
        pose.armR[2] = 0.12; pose.armL[2] = -0.12;
        if (p.act === 'phone') { pose.armR[0] = -1.1; pose.armL[0] = -1.1; pose.armR[2] = 0.35; pose.armL[2] = -0.35; pose.head[0] = 0.4; }
        else { pose.head[1] = Math.sin(t * 0.2 + p.seed) * 0.6; }
        p.yRoot = p.y - 12 * (1.8 / 32) * p.scale;
      }
      const y = p.kind === 'seat' ? p.yRoot : p.y;
      crowd.write(p.index, p.x, y, p.z, p.heading, p.scale, pose);
    }
    crowd.flush();
  }
}

export { THREE };
