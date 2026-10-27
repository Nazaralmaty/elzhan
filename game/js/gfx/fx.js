// Billboard particles (gun smoke, muzzle flashes, dust, explosions, magic) and simple projectiles.
import * as THREE from 'three';

function puffTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  // a few overlapping soft blobs make a cloud-like puff rather than a perfect disc
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = i ? 22 : 0, cx = S / 2 + Math.cos(a) * r, cy = S / 2 + Math.sin(a) * r, rad = i ? 30 : 46;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

const VERT = `
attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSR;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main() {
  vUv = uv; vCol = iCol;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSR.y), s = sin(iSR.y);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSR.x;
  mv.xy += p;
  vFog = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  vec4 c = vec4(vCol.rgb, vCol.a * t.a);
  float f = smoothstep(fogNear, fogFar, vFog);
  c.rgb = mix(c.rgb, fogColor, f * 0.8);
  if (c.a < 0.004) discard;
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;

class Pool {
  constructor(scene, max, texture, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 16); // x y z vx vy vz life max s0 s1 r vr drag grav a0 seed
    this.c = new Float32Array(max * 3);
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index; g.attributes.position = quad.attributes.position; g.attributes.uv = quad.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iSR', this.aSR);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, fogColor: { value: new THREE.Color(0xc9d8e2) }, fogNear: { value: 150 }, fogFar: { value: 400 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;
    this.geo = g;
    scene.add(this.mesh);
  }
  add(x, y, z, vx, vy, vz, life, s0, s1, color, a0, drag = 1.5, grav = 0, rot = 0, vr = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, o = i * 16, p = this.p;
    p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = vx; p[o + 4] = vy; p[o + 5] = vz;
    p[o + 6] = 0; p[o + 7] = life; p[o + 8] = s0; p[o + 9] = s1; p[o + 10] = rot; p[o + 11] = vr; p[o + 12] = drag; p[o + 13] = grav; p[o + 14] = a0;
    this.c[i * 3] = color.r; this.c[i * 3 + 1] = color.g; this.c[i * 3 + 2] = color.b;
  }
  update(dt) {
    const p = this.p, c = this.c;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 16;
      p[o + 6] += dt;
      if (p[o + 6] >= p[o + 7]) continue;
      const k = Math.exp(-p[o + 12] * dt);
      p[o + 3] *= k; p[o + 4] = p[o + 4] * k + p[o + 13] * dt; p[o + 5] *= k;
      p[o] += p[o + 3] * dt; p[o + 1] += p[o + 4] * dt; p[o + 2] += p[o + 5] * dt;
      if (p[o + 13] < 0 && p[o + 1] < 0) { p[o + 1] = 0; p[o + 3] *= 0.5; p[o + 5] *= 0.5; p[o + 4] = 0; }
      p[o + 10] += p[o + 11] * dt;
      if (w !== i) { p.copyWithin(w * 16, o, o + 16); c.copyWithin(w * 3, i * 3, i * 3 + 3); }
      w++;
    }
    this.n = w;
    const P = this.aPos.array, C = this.aCol.array, SR = this.aSR.array;
    for (let i = 0; i < w; i++) {
      const o = i * 16, f = p[o + 6] / p[o + 7];
      P[i * 3] = p[o]; P[i * 3 + 1] = p[o + 1]; P[i * 3 + 2] = p[o + 2];
      C[i * 4] = c[i * 3]; C[i * 4 + 1] = c[i * 3 + 1]; C[i * 4 + 2] = c[i * 3 + 2];
      // fade in fast, fade out slowly
      C[i * 4 + 3] = p[o + 14] * Math.min(1, f * 12) * (1 - f) * (1 - f * 0.3);
      SR[i * 2] = p[o + 8] + (p[o + 9] - p[o + 8]) * Math.sqrt(f); SR[i * 2 + 1] = p[o + 10];
    }
    this.geo.instanceCount = w;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSR.needsUpdate = true;
  }
}

export function createFx(scene, { max = 4000 } = {}) {
  const smoke = new Pool(scene, max, puffTexture(), false);
  const glow = new Pool(scene, Math.round(max / 2), glowTexture(), true);
  const C = (h) => new THREE.Color(h);
  const WHITE_SMOKE = C('#e9e6df'), GREY = C('#8b8680'), DARK = C('#4a4540'), DIRT = C('#6e5a42'), DUST = C('#b8a27e'), FLASH = C('#ffcf7a'), FIRE = C('#ff8a3a'), GREEN = C('#7CFFB2'), GOLD = C('#ffd76a');
  const r = () => Math.random() - 0.5;

  // ballistic projectiles (cannonballs, bones, fireballs)
  const ballGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const balls = new THREE.InstancedMesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.4 }), 256);
  balls.frustumCulled = false; balls.count = 0; balls.castShadow = true;
  scene.add(balls);
  const flights = [];
  const m4 = new THREE.Matrix4();

  const api = {
    musket(x, y, z, dx, dz) {
      glow.add(x + dx * 0.2, y, z + dz * 0.2, 0, 0, 0, 0.09, 0.9, 1.4, FLASH, 1);
      glow.add(x, y, z, dx * 3, 0.5, dz * 3, 0.15, 0.3, 0.6, FIRE, 0.9, 6);
      for (let i = 0; i < 5; i++) smoke.add(x + dx * 0.3, y, z + dz * 0.3, dx * (2.5 + i * 0.9) + r(), 0.25 + Math.random() * 0.4, dz * (2.5 + i * 0.9) + r(), 3.5 + Math.random() * 2.5, 0.5, 2.2 + Math.random(), WHITE_SMOKE, 0.75, 1.6, 0.25, Math.random() * 6, r() * 0.4);
    },
    cannon(x, y, z, dx, dz) {
      glow.add(x + dx * 0.5, y, z + dz * 0.5, 0, 0, 0, 0.12, 2.0, 3.0, FLASH, 1);
      for (let i = 0; i < 14; i++) smoke.add(x + dx * 0.8, y, z + dz * 0.8, dx * (3 + Math.random() * 6) + r() * 2, 0.6 + Math.random(), dz * (3 + Math.random() * 6) + r() * 2, 4 + Math.random() * 3, 0.9, 3.5 + Math.random() * 1.5, WHITE_SMOKE, 0.8, 1.4, 0.3, Math.random() * 6, r() * 0.3);
    },
    boom(x, y, z, size = 1) {
      glow.add(x, y + 0.5, z, 0, 0, 0, 0.18, 2 * size, 3.5 * size, FIRE, 1);
      for (let i = 0; i < 16 * size; i++) smoke.add(x + r() * size, y + 0.2, z + r() * size, r() * 9 * size, 5 + Math.random() * 7, r() * 9 * size, 0.9 + Math.random() * 0.6, 0.25, 0.35, DIRT, 1, 0.6, -18);
      for (let i = 0; i < 8; i++) smoke.add(x + r() * size, y + 0.4, z + r() * size, r() * 2, 1 + Math.random() * 1.5, r() * 2, 3 + Math.random() * 2, 1.2 * size, 3.4 * size, i < 4 ? DARK : GREY, 0.7, 1.2, 0.2, Math.random() * 6, r() * 0.4);
    },
    dust(x, y, z, k = 1) { smoke.add(x + r() * 0.6, y + 0.15, z + r() * 0.6, r() * 0.8, 0.3, r() * 0.8, 1.2 + Math.random(), 0.4 * k, 1.4 * k, DUST, 0.35, 1.2, 0.1, Math.random() * 6, r()); },
    magic(x, y, z, color = GREEN, n = 6) {
      const c = color.isColor ? color : C(color);
      for (let i = 0; i < n; i++) glow.add(x + r() * 0.3, y + r() * 0.3, z + r() * 0.3, r() * 2, 0.6 + Math.random(), r() * 2, 0.5 + Math.random() * 0.4, 0.35, 0.05, c, 0.9, 1);
    },
    blast(x, y, z, color = FIRE, size = 1) {
      const c = color.isColor ? color : C(color);
      glow.add(x, y + 0.6, z, 0, 0, 0, 0.35, 2.5 * size, 4.5 * size, c, 1);
      for (let i = 0; i < 18; i++) glow.add(x, y + 0.5, z, r() * 10 * size, Math.random() * 6, r() * 10 * size, 0.45 + Math.random() * 0.3, 0.5, 0.1, c, 1, 2.5, -6);
      for (let i = 0; i < 6; i++) smoke.add(x + r(), y + 0.5, z + r(), r() * 2, 1.5, r() * 2, 2.5, 1, 3 * size, GREY, 0.5, 1.2, 0.2, Math.random() * 6, r() * 0.3);
    },
    sparkle(x, y, z, color = GOLD) { for (let i = 0; i < 6; i++) glow.add(x + r() * 0.4, y + Math.random() * 0.6, z + r() * 0.4, r() * 1.2, 1.5 + Math.random() * 1.5, r() * 1.2, 0.6, 0.3, 0.08, color, 1, 2, -3); },
    hit(x, y, z) { for (let i = 0; i < 3; i++) smoke.add(x + r() * 0.2, y, z + r() * 0.2, r() * 2, 1 + Math.random(), r() * 2, 0.5, 0.15, 0.3, C('#8a1c1c'), 0.9, 1, -9); },
    // projectile flight: from (x0,y0,z0) to (x1,y1,z1) in T seconds with an arc of height h
    shoot(x0, y0, z0, x1, y1, z1, T, h, onLand, trail) { flights.push({ x0, y0, z0, x1, y1, z1, T, h, t: 0, onLand, trail }); },
    update(dt) {
      let n = 0;
      for (const f of flights) {
        f.t += dt;
        const k = Math.min(1, f.t / f.T);
        const x = f.x0 + (f.x1 - f.x0) * k, z = f.z0 + (f.z1 - f.z0) * k, y = f.y0 + (f.y1 - f.y0) * k + Math.sin(k * Math.PI) * f.h;
        if (k >= 1) { f.done = true; f.onLand?.(f.x1, f.y1, f.z1); continue; }
        if (f.trail === 'fire') { glow.add(x, y, z, 0, 0, 0, 0.25, 0.9, 0.3, FIRE, 1); smoke.add(x, y, z, 0, 0.2, 0, 0.8, 0.3, 0.8, GREY, 0.3); }
        else if (f.trail === 'magic') glow.add(x, y, z, 0, 0, 0, 0.3, 0.7, 0.2, GREEN, 1);
        else { if (n < 256) { m4.makeTranslation(x, y, z); balls.setMatrixAt(n++, m4); } if (Math.random() < 0.5) smoke.add(x, y, z, 0, 0, 0, 0.6, 0.15, 0.45, GREY, 0.25); }
      }
      for (let i = flights.length - 1; i >= 0; i--) if (flights[i].done) flights.splice(i, 1);
      balls.count = n; balls.instanceMatrix.needsUpdate = true;
      smoke.update(dt); glow.update(dt);
    },
    setFog(color, near, far) { for (const p of [smoke, glow]) { p.mat.uniforms.fogColor.value.set(color); p.mat.uniforms.fogNear.value = near; p.mat.uniforms.fogFar.value = far; } },
    clear() { smoke.n = 0; glow.n = 0; flights.length = 0; }
  };
  return api;
}
