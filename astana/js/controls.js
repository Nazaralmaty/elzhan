// Camera controller tuned for a MacBook trackpad (and mouse/touch as fallback).
//   Orbit:  two-finger swipe = orbit, pinch = zoom, Shift+swipe or right-drag = pan,
//           click-drag = orbit, double-click = fly to that point.
//   Walk:   two-finger swipe / drag = look around, pinch = step forward/back, WASD = walk.
//   Fly:    like walk, free height; E/Q up and down.
//   Follow: orbit that keeps the two heroes in the centre.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';
import { groundY, blocked } from './layout.js';

const TAU = Math.PI * 2;

export class CameraRig {
  constructor(camera, dom, hub) {
    this.camera = camera;
    this.dom = dom;
    this.hub = hub;
    this.mode = 'orbit';
    this.device = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'trackpad' : 'auto';
    this.sens = 1;
    this.external = false;
    // orbit state (goal + current)
    this.goal = { target: new THREE.Vector3(0, 30, 0), radius: 160, theta: 1.2, phi: 1.2 };
    this.cur = { target: new THREE.Vector3(0, 30, 0), radius: 160, theta: 1.2, phi: 1.2 };
    // walk/fly state
    this.walk = { pos: new THREE.Vector3(60, 1.65, 0), yaw: -Math.PI / 2, pitch: 0.15, goalYaw: -Math.PI / 2, goalPitch: 0.15, vel: new THREE.Vector3(), eye: 1.65 };
    this.keys = new Set();
    this.followTarget = null;
    this.lens = 35;
    this.aspect = 16 / 9;
    this.raycastTargets = [];
    this.pointers = new Map();
    this.joy = { x: 0, y: 0 };
    this.keyboardEnabled = true;
    this.bind();
  }

  bind() {
    const d = this.dom;
    d.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    d.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    d.addEventListener('dblclick', (e) => this.onDbl(e));
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    // Safari trackpad pinch/rotate
    d.addEventListener('gesturestart', (e) => { e.preventDefault(); this.gStart = { scale: 1, rot: 0, r: this.goal.radius, theta: this.goal.theta }; });
    d.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (!this.gStart) return;
      this.touched();
      if (this.mode === 'orbit' || this.mode === 'follow') {
        this.goal.radius = clamp(this.gStart.r / e.scale, 1.5, 4000);
        this.goal.theta = this.gStart.theta - (e.rotation * Math.PI / 180) * 0.6;
      } else {
        const ds = e.scale - (this.gStart.scale || 1);
        this.gStart.scale = e.scale;
        this.stepForward(ds * 6);
      }
    });
    d.addEventListener('gestureend', (e) => { e.preventDefault(); this.gStart = null; });
  }

  touched() { if (this.hub) this.hub.emit('userinput'); }

  detectDevice(e) {
    if (this.device !== 'auto') return this.device;
    // Mouse wheels send big integer steps on one axis; trackpads send small/fractional deltas, often on both axes.
    const big = Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY) && e.deltaX === 0;
    const wd = e.wheelDeltaY;
    if (big && (wd === undefined || Math.abs(wd) % 120 === 0)) return 'mouse';
    return 'trackpad';
  }

  onWheel(e) {
    e.preventDefault();
    this.touched();
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
    const dev = this.detectDevice(e);
    const k = 0.0042 * this.sens;
    if (e.ctrlKey) {
      // pinch-to-zoom on trackpads arrives as ctrl+wheel
      if (this.mode === 'walk' || this.mode === 'fly') this.stepForward(-dy * 0.06 * this.sens);
      else this.zoom(Math.exp(dy * 0.012 * this.sens));
      return;
    }
    if (this.mode === 'walk' || this.mode === 'fly') {
      if (dev === 'mouse') { this.stepForward(-dy * 0.01); return; }
      this.walk.goalYaw -= dx * k * 0.9;
      this.walk.goalPitch = clamp(this.walk.goalPitch - dy * k * 0.9, -1.45, 1.45);
      return;
    }
    if (dev === 'mouse' && !e.shiftKey) { this.zoom(Math.exp(dy * 0.0015)); return; }
    if (e.shiftKey || e.altKey) { this.pan(dx, dy); return; }
    this.goal.theta += dx * k;
    this.goal.phi = clamp(this.goal.phi + dy * k, 0.04, Math.PI / 2 + 0.25);
  }

  zoom(f) {
    this.goal.radius = clamp(this.goal.radius * f, 1.2, 4000);
  }

  pan(dx, dy) {
    const g = this.goal;
    const s = g.radius * 0.0016 * this.sens;
    const right = new THREE.Vector3(Math.cos(g.theta), 0, -Math.sin(g.theta));
    const fwd = new THREE.Vector3(-Math.sin(g.theta), 0, -Math.cos(g.theta));
    if (g.phi > 1.25) {
      // looking roughly horizontally: vertical swipe moves the target up/down
      g.target.addScaledVector(right, dx * s);
      g.target.y = clamp(g.target.y - dy * s, 0, 400);
    } else {
      g.target.addScaledVector(right, dx * s).addScaledVector(fwd, -dy * s);
    }
    if (this.mode === 'follow') this.setMode('orbit');
  }

  stepForward(d) {
    const w = this.walk;
    const f = new THREE.Vector3(-Math.sin(w.yaw), 0, -Math.cos(w.yaw));
    if (this.mode === 'fly') f.set(-Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch), -Math.cos(w.yaw) * Math.cos(w.pitch));
    const np = w.pos.clone().addScaledVector(f, d * (this.mode === 'fly' ? Math.max(1, w.pos.y / 10) : 1));
    if (this.mode === 'walk' && blocked(np.x, np.z)) return;
    w.pos.copy(np);
  }

  onDown(e) {
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, mod: e.metaKey || e.ctrlKey || e.shiftKey, type: e.pointerType });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (dx === 0 && dy === 0) return;
    this.touched();
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (this.mode === 'walk' || this.mode === 'fly') this.stepForward((d - this.pinch.d) * 0.05);
      else {
        this.zoom(this.pinch.d / Math.max(1, d));
        this.pan(-(cx - this.pinch.cx) * 1.5, -(cy - this.pinch.cy) * 1.5);
      }
      this.pinch = { d, cx, cy };
      return;
    }
    const k = 0.0058 * this.sens;
    if (this.mode === 'walk' || this.mode === 'fly') {
      this.walk.goalYaw += dx * k * 0.75;
      this.walk.goalPitch = clamp(this.walk.goalPitch + dy * k * 0.75, -1.45, 1.45);
      return;
    }
    if (p.button === 2 || p.button === 1 || p.mod) { this.pan(-dx * 1.4, -dy * 1.4); return; }
    this.goal.theta -= dx * k;
    this.goal.phi = clamp(this.goal.phi - dy * k, 0.04, Math.PI / 2 + 0.25);
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
  }

  onDbl(e) {
    const hit = this.pick(e.clientX, e.clientY);
    if (!hit) return;
    if (this.dblOverride && this.dblOverride(hit)) return;
    this.touched();
    if (this.mode === 'walk') {
      this.walk.pos.set(hit.x, groundY(hit.x, hit.z) + this.walk.eye, hit.z);
    } else {
      if (this.mode === 'follow') this.setMode('orbit');
      this.goal.target.copy(hit);
      this.goal.radius = Math.max(6, Math.min(this.goal.radius, 60));
    }
  }

  pick(clientX, clientY) {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.raycastTargets, true);
    if (hits.length) return hits[0].point;
    // fall back to the ground plane
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (t > 0 && t < 5000) return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return null;
  }

  setMode(mode, opts = {}) {
    const prev = this.mode;
    this.mode = mode;
    const cam = this.camera;
    if ((mode === 'walk' || mode === 'fly') && prev !== 'walk' && prev !== 'fly') {
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const w = this.walk;
      w.pos.copy(cam.position);
      if (mode === 'walk') {
        // step down to eye level right where the camera is, keep looking the same way
        if (blocked(w.pos.x, w.pos.z)) w.pos.add(new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(-12));
        w.pos.y = groundY(w.pos.x, w.pos.z) + w.eye;
        w.yaw = w.goalYaw = Math.atan2(-dir.x, -dir.z);
        w.pitch = w.goalPitch = clamp(Math.asin(clamp(dir.y, -1, 1)), -0.3, 0.35);
      } else {
        w.yaw = w.goalYaw = Math.atan2(-dir.x, -dir.z);
        w.pitch = w.goalPitch = Math.asin(clamp(dir.y, -1, 1));
      }
    }
    if ((mode === 'orbit' || mode === 'follow') && (prev === 'walk' || prev === 'fly')) {
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const dist = opts.radius || 25;
      const target = cam.position.clone().addScaledVector(dir, dist);
      if (target.y < 0) { const t = -cam.position.y / Math.min(-0.01, dir.y); target.copy(cam.position).addScaledVector(dir, t); }
      this.setOrbit(target, cam.position, true);
    }
    if (mode === 'follow' && opts.radius) this.goal.radius = opts.radius;
    this.hub?.emit('mode', mode);
  }

  // Set orbit so the camera sits at `from` looking at `target`.
  setOrbit(target, from, instant = false) {
    const off = new THREE.Vector3().subVectors(from, target);
    const r = off.length();
    const theta = Math.atan2(off.x, off.z);
    const phi = Math.acos(clamp(off.y / r, -1, 1));
    Object.assign(this.goal, { radius: r, theta, phi });
    this.goal.target.copy(target);
    if (instant) {
      Object.assign(this.cur, { radius: r, theta, phi });
      this.cur.target.copy(target);
    } else {
      // take the short way round
      let d = this.goal.theta - this.cur.theta;
      d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      this.goal.theta = this.cur.theta + d;
    }
  }

  syncFromCamera() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (this.mode === 'walk' || this.mode === 'fly') {
      const w = this.walk;
      w.pos.copy(this.camera.position);
      w.yaw = w.goalYaw = Math.atan2(-dir.x, -dir.z);
      w.pitch = w.goalPitch = Math.asin(clamp(dir.y, -1, 1));
      return;
    }
    let dist = this.cur.radius;
    if (this.lastTarget) dist = this.camera.position.distanceTo(this.lastTarget);
    const target = this.camera.position.clone().addScaledVector(dir, Math.max(2, dist));
    this.setOrbit(target, this.camera.position, true);
  }

  setLens(mm) {
    this.lens = mm;
    this.applyLens();
  }
  applyLens() {
    const a = this.aspect;
    const half = Math.atan(36 / (2 * this.lens));
    const vfov = a >= 1 ? 2 * Math.atan(Math.tan(half) / a) : 2 * half;
    this.camera.fov = THREE.MathUtils.radToDeg(vfov);
    this.camera.updateProjectionMatrix();
  }

  update(dt, followPoint) {
    if (this.external) return;
    const cam = this.camera;
    const kk = 1 - Math.exp(-dt * 14);
    if (this.mode === 'orbit' || this.mode === 'follow') {
      if (this.mode === 'follow' && followPoint) this.goal.target.lerp(followPoint, 1 - Math.exp(-dt * 4));
      if (this.keyboardEnabled) this.keyPan(dt);
      const g = this.goal, c = this.cur;
      c.target.lerp(g.target, kk);
      c.radius = lerp(c.radius, g.radius, kk);
      c.theta = lerp(c.theta, g.theta, kk);
      c.phi = lerp(c.phi, g.phi, kk);
      const sp = Math.sin(c.phi);
      cam.position.set(c.target.x + c.radius * sp * Math.sin(c.theta), c.target.y + c.radius * Math.cos(c.phi), c.target.z + c.radius * sp * Math.cos(c.theta));
      const gy = groundY(cam.position.x, cam.position.z) + 0.35;
      if (cam.position.y < gy) cam.position.y = gy;
      cam.up.set(0, 1, 0);
      cam.lookAt(c.target);
      this.lastTarget = c.target.clone();
    } else {
      const w = this.walk;
      w.yaw = lerp(w.yaw, w.goalYaw, kk);
      w.pitch = lerp(w.pitch, w.goalPitch, kk);
      const fwd = new THREE.Vector3(-Math.sin(w.yaw), 0, -Math.cos(w.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const v = new THREE.Vector3();
      const k = this.keys;
      if (this.keyboardEnabled) {
        if (k.has('KeyW') || k.has('ArrowUp')) v.add(fwd);
        if (k.has('KeyS') || k.has('ArrowDown')) v.sub(fwd);
        if (k.has('KeyD') || k.has('ArrowRight')) v.add(right);
        if (k.has('KeyA') || k.has('ArrowLeft')) v.sub(right);
      }
      v.addScaledVector(fwd, -this.joy.y).addScaledVector(right, this.joy.x);
      let up = 0;
      if (this.mode === 'fly' && this.keyboardEnabled) {
        if (k.has('KeyE') || k.has('Space') || k.has('PageUp')) up += 1;
        if (k.has('KeyQ') || k.has('KeyC') || k.has('PageDown')) up -= 1;
      }
      const run = k.has('ShiftLeft') || k.has('ShiftRight');
      let speed = this.mode === 'fly' ? Math.max(8, w.pos.y * 0.6) * (run ? 3 : 1) : run ? 5.5 : 1.8;
      if (v.lengthSq() > 1) v.normalize();
      w.vel.lerp(v.multiplyScalar(speed).add(new THREE.Vector3(0, up * speed * 0.6, 0)), 1 - Math.exp(-dt * 8));
      const np = w.pos.clone().addScaledVector(w.vel, dt);
      if (this.mode === 'walk') {
        if (!blocked(np.x, w.pos.z)) w.pos.x = np.x;
        if (!blocked(w.pos.x, np.z)) w.pos.z = np.z;
        const gy = groundY(w.pos.x, w.pos.z) + w.eye;
        const moving = w.vel.length() > 0.3;
        w.bob = (w.bob || 0) + (moving ? dt * w.vel.length() * 2.2 : 0);
        w.pos.y = lerp(w.pos.y, gy + (moving ? Math.sin(w.bob * 2) * 0.025 : 0), 1 - Math.exp(-dt * 12));
      } else {
        w.pos.copy(np);
        const gy = groundY(w.pos.x, w.pos.z) + 0.6;
        if (w.pos.y < gy) w.pos.y = gy;
        w.pos.y = Math.min(w.pos.y, 1500);
      }
      cam.position.copy(w.pos);
      const look = new THREE.Vector3(-Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch), -Math.cos(w.yaw) * Math.cos(w.pitch));
      cam.up.set(0, 1, 0);
      cam.lookAt(cam.position.clone().add(look));
    }
  }

  keyPan(dt) {
    const k = this.keys;
    if (!k.size) return;
    const g = this.goal;
    const right = new THREE.Vector3(Math.cos(g.theta), 0, -Math.sin(g.theta));
    const fwd = new THREE.Vector3(-Math.sin(g.theta), 0, -Math.cos(g.theta));
    const s = Math.max(4, g.radius * 0.8) * dt * ((k.has('ShiftLeft') || k.has('ShiftRight')) ? 3 : 1);
    let moved = false;
    if (k.has('KeyW') || k.has('ArrowUp')) { g.target.addScaledVector(fwd, s); moved = true; }
    if (k.has('KeyS') || k.has('ArrowDown')) { g.target.addScaledVector(fwd, -s); moved = true; }
    if (k.has('KeyD') || k.has('ArrowRight')) { g.target.addScaledVector(right, s); moved = true; }
    if (k.has('KeyA') || k.has('ArrowLeft')) { g.target.addScaledVector(right, -s); moved = true; }
    if (k.has('KeyQ')) { g.theta += dt * 1.2; moved = true; }
    if (k.has('KeyE')) { g.theta -= dt * 1.2; moved = true; }
    if (k.has('KeyR')) { g.phi = clamp(g.phi - dt, 0.04, Math.PI / 2 + 0.25); moved = true; }
    if (k.has('KeyF')) { g.phi = clamp(g.phi + dt, 0.04, Math.PI / 2 + 0.25); moved = true; }
    if (k.has('Equal') || k.has('NumpadAdd')) { this.zoom(Math.exp(-dt * 1.5)); moved = true; }
    if (k.has('Minus') || k.has('NumpadSubtract')) { this.zoom(Math.exp(dt * 1.5)); moved = true; }
    if (moved) { this.touched(); if (this.mode === 'follow' && (k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD'))) this.setMode('orbit'); }
  }

  serialize() {
    const c = this.camera;
    const dir = new THREE.Vector3();
    c.getWorldDirection(dir);
    return { mode: this.mode, lens: this.lens, pos: c.position.toArray().map((v) => +v.toFixed(3)), dir: dir.toArray().map((v) => +v.toFixed(4)), target: this.cur.target.toArray().map((v) => +v.toFixed(3)) };
  }
}
