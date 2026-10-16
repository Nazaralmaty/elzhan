// The two lead characters — A (man) and B (woman) — with their looks, actions, markers,
// keyboard control and the choreography used by the director's shots.
import * as THREE from 'three';
import { Character, emptyPose, walkPose, idlePose, lerpPose, copyPose } from './people.js';
import { groundY, blocked, SPHERE, PLAZA } from './layout.js';
import { clamp, lerp } from './util.js';

export const HERO_INFO = [
  {
    id: 'A', color: '#38bdf8', ru: 'Мужчина', en: 'Man', name: 'Арман',
    descRu: 'мужчина ~30 лет, казах, короткие чёрные волосы, аккуратная короткая борода, тёмно-синий пиджак поверх белой футболки, светло-голубые джинсы, белые кеды, золотые часы на левой руке',
    descEn: 'a Kazakh man around 30, short black hair, neatly trimmed short beard, navy blazer over a white T-shirt, light-blue jeans, white sneakers, gold watch on his left wrist',
  },
  {
    id: 'B', color: '#f472b6', ru: 'Женщина', en: 'Woman', name: 'Айгерим',
    descRu: 'женщина ~27 лет, казашка, длинные прямые чёрные волосы, красное платье миди с коротким рукавом, тонкий чёрный пояс, белые кеды, кремовая сумочка через плечо, маленькие золотые серьги',
    descEn: 'a Kazakh woman around 27, long straight black hair, red short-sleeved midi dress with a thin black belt, white sneakers, cream crossbody bag, small gold earrings',
  },
];

const LOOKS = {
  A: (season) => ({
    skin: '#d6a47c', hair: '#120d0a', hairStyle: 'short', beard: true, eyes: '#2a1a10', lips: '#a8665a', shoes: '#f3f3f1',
    watch: '#d4a944',
    top: season === 2
      ? { color: '#26375c', style: 'coat', sleeve: 'long', inner: '#e9e4da' }
      : { color: '#2b3f6b', style: 'blazer', sleeve: 'long', inner: '#f7f7f5', pocket: '#e9e4da' },
    bottom: { color: season === 2 ? '#2b3445' : '#6c8db3', style: 'jeans' },
    coatLong: season === 2,
    gloves: season === 2 ? '#1b1b1b' : null,
  }),
  B: (season) => ({
    skin: '#e8c09c', hair: '#0f0b09', hairStyle: 'long', eyes: '#24160d', lips: '#b3343f', blush: true, lashes: true, earrings: true, slim: true,
    shoes: season === 2 ? '#e9e4da' : '#f5f5f3',
    top: season === 2
      ? { color: '#b3202c', style: 'coat', sleeve: 'long', inner: '#f2efe9', belt: '#1a1a1a' }
      : season === 1
        ? { color: '#c22432', style: 'coat', sleeve: 'long', inner: '#c22432', belt: '#1a1a1a' }
        : { color: '#c8202f', style: 'dress', sleeve: 'short', belt: '#161616' },
    bottom: { color: '#c8202f', style: 'skirt', len: season === 2 ? 9 : 8 },
    dress: true,
    tights: season === 2 ? '#2a2a2e' : null,
    coatLong: season >= 1,
  }),
};

export class Heroes {
  constructor(ctx) {
    this.ctx = ctx;
    this.season = 0;
    this.style = 'pixel';
    this.man = new Character({ look: LOOKS.A(0), height: 1.82, name: 'A_man' });
    this.woman = new Character({ look: LOOKS.B(0), height: 1.68, name: 'B_woman' });
    this.list = [this.man, this.woman];
    this.list.forEach((c, i) => {
      c.info = HERO_INFO[i];
      c.state = { x: 0, z: 0, heading: 0, targetHeading: 0, speed: 0, phase: i * 1.3, pose: emptyPose(), blend: emptyPose() };
      ctx.scene.add(c.group);
    });
    // props
    this.woman.addProp('bag', 'body', [2.2, 3, 3], [-5.4, 1.2, 0.2], '#efe4cc', { roughness: 0.6 });
    this.woman.addProp('strap', 'body', [0.35, 15, 0.35], [-1.2, 7.4, 2.3], '#3a2a1e', { rot: [0, 0, -0.62] });
    this.woman.addProp('phone', 'armR', [0.5, 3.2, 1.7], [0, -10.6, 1.4], '#151515', { roughness: 0.25, metalness: 0.6 });
    this.woman.props.phone.visible = false;

    this.markers = this.list.map((c) => this.makeMarker(c.info.color));
    this.markers.forEach((m) => ctx.scene.add(m));
    this.showMarkers = true;

    this.action = 'idle';
    this.actionT = 0;
    this.together = true;
    this.selected = 0;
    this.control = false;
    this.keys = new Set();
    this.walkTarget = null;
    this.home = { x: 98, z: 9.2, heading: Math.PI / 2 };
    this.reset();
  }

  makeMarker(color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.56, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    ring.renderOrder = 4;
    const dot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    dot.position.y = 2.25;
    g.add(ring, dot);
    g.userData = { ring, dot };
    return g;
  }

  reset() {
    const h = this.home;
    this.place(h.x, h.z, h.heading);
    this.setAction('idle');
  }

  // Place the couple: man at (x,z), woman at his right side.
  place(x, z, heading) {
    const rx = -Math.cos(heading), rz = Math.sin(heading); // character's right vector
    const [m, w] = this.list;
    Object.assign(m.state, { x, z, heading, targetHeading: heading });
    Object.assign(w.state, { x: x + rx * 0.68, z: z + rz * 0.68, heading, targetHeading: heading });
  }

  get center() {
    const [m, w] = this.list;
    return new THREE.Vector3((m.state.x + w.state.x) / 2, groundY((m.state.x + w.state.x) / 2, (m.state.z + w.state.z) / 2), (m.state.z + w.state.z) / 2);
  }
  get heading() { return this.list[0].state.heading; }

  headPos(i) {
    const c = this.list[i];
    return new THREE.Vector3(c.state.x, groundY(c.state.x, c.state.z) + c.height * 0.93, c.state.z);
  }

  setAction(name, opts = {}) {
    this.action = name;
    this.actionT = 0;
    this.actionOpts = opts;
    this.walkTarget = null;
    this.woman.props.phone.visible = name === 'selfie';
    const [m, w] = this.list;
    const c = this.center;
    const toTower = Math.atan2(-c.x, -c.z);
    // On the boulevard the couple walks along the promenade (parallel to the pools);
    // on the plaza they head straight for the tower.
    const onBoulevard = Math.abs(c.x) > PLAZA.halfX - 4 && Math.abs(c.z) > 5;
    if (name === 'walkToTower') {
      const dist = opts.distance || 14;
      if (onBoulevard) {
        const dir = -Math.sign(c.x);
        this.walkTarget = { x: c.x + dir * dist, z: c.z, speed: opts.speed || 1.15 };
        this.faceBoth(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      } else {
        const d = Math.hypot(c.x, c.z);
        const k = Math.max(29, d - dist) / Math.max(d, 1e-3);
        this.walkTarget = { x: c.x * k, z: c.z * k, speed: opts.speed || 1.15 };
        this.faceBoth(toTower);
      }
    } else if (name === 'walkAway') {
      if (onBoulevard) {
        const dir = Math.sign(c.x);
        this.walkTarget = { x: c.x + dir * 12, z: c.z, speed: 1.1 };
        this.faceBoth(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      } else {
        this.walkTarget = { x: c.x + Math.sin(toTower + Math.PI) * 12, z: c.z + Math.cos(toTower + Math.PI) * 12, speed: 1.1 };
        this.faceBoth(toTower + Math.PI);
      }
    } else if (name === 'stroll') {
      const ahead = opts.dir ?? this.heading;
      this.walkTarget = { x: c.x + Math.sin(ahead) * (opts.distance || 18), z: c.z + Math.cos(ahead) * (opts.distance || 18), speed: 1.0 };
    } else if (name === 'lookUp' || name === 'point') {
      this.faceBoth(toTower);
    } else if (name === 'selfie') {
      this.faceBoth(toTower + Math.PI);
    } else if (name === 'talk' || name === 'hug') {
      const a = Math.atan2(w.state.x - m.state.x, w.state.z - m.state.z);
      m.state.targetHeading = a;
      w.state.targetHeading = a + Math.PI;
    } else if (name === 'wave' || name === 'idle' || name === 'pose') {
      if (opts.face !== undefined) this.faceBoth(opts.face);
    }
  }

  faceBoth(h) {
    const [m, w] = this.list;
    // keep the woman on the man's right
    const c = this.center;
    const rx = -Math.cos(h), rz = Math.sin(h);
    m.state.targetHeading = h; w.state.targetHeading = h;
    if (this.together) {
      m.state.tx = c.x - rx * 0.34; m.state.tz = c.z - rz * 0.34;
      w.state.tx = c.x + rx * 0.34; w.state.tz = c.z + rz * 0.34;
    }
  }

  update(dt, t, camera) {
    this.actionT += dt;
    const [m, w] = this.list;
    // ---- locomotion ----
    let moving = false;
    if (this.control && this.keys.size) {
      moving = this.drive(dt, camera);
    } else if (this.walkTarget) {
      const c = this.center;
      const dx = this.walkTarget.x - c.x, dz = this.walkTarget.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) {
        this.walkTarget = null;
        if (this.action === 'walkToTower') this.setAction('lookUp');
        else if (this.action !== 'stroll') this.setAction('idle');
      } else {
        const sp = Math.min(this.walkTarget.speed, d * 1.5 + 0.2);
        const h = Math.atan2(dx, dz);
        moving = this.moveCouple(h, sp, dt);
        if (!moving) this.walkTarget = null;
      }
    }
    // couple formation (step into place for the target heading)
    for (const c of this.list) {
      if (c.state.tx !== undefined && !moving) {
        const dx = c.state.tx - c.state.x, dz = c.state.tz - c.state.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.02) {
          const s = Math.min(d, dt * 0.9);
          c.state.x += (dx / d) * s; c.state.z += (dz / d) * s;
          c.state.stepping = true;
        } else { c.state.tx = undefined; c.state.stepping = false; }
      }
    }
    if (this.action === 'hug') {
      const dx = w.state.x - m.state.x, dz = w.state.z - m.state.z, d = Math.hypot(dx, dz);
      if (d > 0.42) {
        const s = Math.min(d - 0.42, dt * 0.5) / 2;
        m.state.x += dx / d * s; m.state.z += dz / d * s; w.state.x -= dx / d * s; w.state.z -= dz / d * s;
      }
    }

    // ---- headings ----
    for (const c of this.list) {
      let dh = c.state.targetHeading - c.state.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      c.state.heading += dh * Math.min(1, dt * 5);
    }

    // ---- poses ----
    this.list.forEach((c, i) => {
      const st = c.state;
      const target = emptyPose();
      const isMoving = moving || st.stepping;
      if (isMoving) {
        st.phase += (moving ? st.speedNow || 1.1 : 0.6) * dt * Math.PI / 0.72;
        walkPose(target, st.phase, moving ? 1 : 0.4);
      } else {
        idlePose(target, t, i * 2.1);
      }
      this.actionPose(target, i, t, isMoving);
      lerpPose(st.pose, target, Math.min(1, dt * 7), st.pose);
      c.apply(st.pose);
      const y = groundY(st.x, st.z);
      c.group.position.set(st.x, y, st.z);
      c.group.rotation.y = st.heading;
      const mk = this.markers[i];
      mk.visible = this.showMarkers;
      mk.position.set(st.x, y + 0.02, st.z);
      const pulse = 1 + Math.sin(t * 3 + i) * 0.06;
      mk.userData.ring.scale.setScalar(pulse * (this.selected === i && this.control ? 1.25 : 1));
      mk.userData.dot.position.y = c.height + 0.32 + Math.sin(t * 2.4 + i) * 0.05;
      mk.userData.dot.rotation.y = t * 1.5;
    });
  }

  actionPose(p, i, t, moving) {
    const a = this.action;
    const isMan = i === 0;
    const holdHands = this.together && (a === 'walkToTower' || a === 'stroll' || a === 'walkAway' || a === 'idle' || a === 'lookUp' || a === 'drive') && this.handsOn !== false;
    if (holdHands) {
      // inner hands joined: man's right arm, woman's left arm
      if (isMan) { p.armR[0] = moving ? -0.12 + Math.sin(this.list[0].state.phase) * 0.12 : -0.12; p.armR[2] = -0.3; }
      else { p.armL[0] = moving ? -0.12 + Math.sin(this.list[0].state.phase) * 0.12 : -0.12; p.armL[2] = 0.3; }
    }
    if (a === 'lookUp') {
      const k = Math.min(1, this.actionT / 1.2);
      p.head[0] = -0.62 * k; p.body[0] = -0.05 * k;
      p.head[1] = isMan ? 0.08 : -0.08;
    } else if (a === 'point') {
      const k = Math.min(1, this.actionT / 0.8);
      p.head[0] = -0.5 * k;
      if (!isMan) { p.armR[0] = -2.45 * k; p.armR[2] = -0.12 * k; p.head[1] = -0.1; }
      else { p.head[1] = 0.25 * k; p.armR[2] = -0.25; }
    } else if (a === 'selfie') {
      const k = Math.min(1, this.actionT / 0.8);
      if (!isMan) { p.armR[0] = -1.75 * k; p.armR[2] = -0.55 * k; p.head[2] = -0.14 * k; p.head[1] = -0.35 * k; p.head[0] = -0.12 * k; }
      else { p.head[2] = 0.16 * k; p.head[1] = -0.38 * k; p.head[0] = -0.12 * k; p.armR[0] = -0.4 * k; p.armR[2] = -0.75 * k; }
    } else if (a === 'talk') {
      const g = Math.sin(t * 2.2 + i * 1.7);
      const speaking = Math.sin(t * 0.6) > 0 ? isMan : !isMan;
      if (speaking) { p.armR[0] = -0.7 + g * 0.25; p.armR[2] = -0.2 + Math.sin(t * 3.1) * 0.15; p.head[0] = Math.sin(t * 4) * 0.06; }
      else { p.head[0] = 0.1; p.head[2] = 0.08; }
    } else if (a === 'wave') {
      const k = Math.min(1, this.actionT / 0.6);
      p.armR[0] = -2.9 * k; p.armR[2] = (-0.25 + Math.sin(t * 9 + i) * 0.35) * k;
      p.head[1] = 0; p.head[0] = -0.05;
    } else if (a === 'hug') {
      const k = Math.min(1, this.actionT / 1.0);
      p.armR[0] = -1.35 * k; p.armL[0] = -1.35 * k; p.armR[2] = 0.35 * k; p.armL[2] = -0.35 * k;
      p.head[2] = (isMan ? 0.15 : -0.2) * k; p.head[0] = (isMan ? 0.12 : -0.1) * k;
    } else if (a === 'pose') {
      if (isMan) { p.armL[0] = -0.1; p.armL[2] = 0.15; }
      else { p.armR[0] = -0.25; p.armR[2] = 0.4; p.head[2] = -0.12; }
    }
  }

  moveCouple(h, speed, dt) {
    const [m, w] = this.list;
    const rx = -Math.cos(h), rz = Math.sin(h);
    const c = this.center;
    const step = speed * dt;
    const nx = c.x + Math.sin(h) * step, nz = c.z + Math.cos(h) * step;
    if (blocked(nx, nz)) return false;
    const k = 1 - Math.exp(-dt * 10);
    for (const [ch, side] of [[m, -1], [w, 1]]) {
      const tx = nx + rx * 0.34 * side, tz = nz + rz * 0.34 * side;
      ch.state.x += (tx - ch.state.x) * k + Math.sin(h) * step * (1 - k);
      ch.state.z += (tz - ch.state.z) * k + Math.cos(h) * step * (1 - k);
      ch.state.targetHeading = h;
      ch.state.speedNow = clamp(speed, 0.4, 3);
      ch.state.tx = undefined;
    }
    return true;
  }

  // WASD / arrows steer the couple (or one hero) relative to the camera.
  drive(dt, camera) {
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const v = new THREE.Vector3();
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) v.add(f);
    if (k.has('KeyS') || k.has('ArrowDown')) v.sub(f);
    if (k.has('KeyD') || k.has('ArrowRight')) v.add(r);
    if (k.has('KeyA') || k.has('ArrowLeft')) v.sub(r);
    if (v.lengthSq() < 1e-6) return false;
    v.normalize();
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const sp = run ? 2.6 : 1.2;
    const h = Math.atan2(v.x, v.z);
    if (this.action !== 'drive') { this.action = 'drive'; this.actionT = 0; this.woman.props.phone.visible = false; }
    if (this.together) return this.moveCouple(h, sp, dt);
    const c = this.list[this.selected];
    const nx = c.state.x + v.x * sp * dt, nz = c.state.z + v.z * sp * dt;
    if (!blocked(nx, nz)) { c.state.x = nx; c.state.z = nz; }
    c.state.targetHeading = h;
    c.state.speedNow = sp;
    return true;
  }

  setSeason(season) {
    this.season = season;
    this.man.look = LOOKS.A(season); this.woman.look = LOOKS.B(season);
    this.man.repaint(this.style); this.woman.repaint(this.style);
  }
  setStyle(style) {
    this.style = style;
    this.man.repaint(style); this.woman.repaint(style);
  }
  setVisible(v) { this.list.forEach((c) => (c.group.visible = v)); }
  setMarkers(v) { this.showMarkers = v; this.markers.forEach((m) => (m.visible = v)); }

  // Where the sphere is relative to the couple (used to aim cameras).
  towerTop() { return new THREE.Vector3(0, SPHERE.y, 0); }

  serialize() {
    return this.list.map((c) => ({ id: c.info.id, x: +c.state.x.toFixed(2), z: +c.state.z.toFixed(2), heading: +c.state.heading.toFixed(3) }));
  }
  restore(arr) {
    arr?.forEach((s, i) => {
      const c = this.list[i];
      if (!c || !s) return;
      Object.assign(c.state, { x: s.x, z: s.z, heading: s.heading, targetHeading: s.heading });
    });
  }
  copyPose(i) { return copyPose(this.list[i].state.pose); }
}
