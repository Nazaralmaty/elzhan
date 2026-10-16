// One planar mirror shared by every pool (they all sit at WATER_Y), the water shader
// that reads it, and GPU particle fountains.
import * as THREE from 'three';
import { WATER_Y } from './layout.js';
import { U } from './materials.js';
import * as T from './textures.js';

export class Mirror {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 0 });
    this.rt.texture.generateMipmaps = false;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.matrixAutoUpdate = true;
    this.textureMatrix = new THREE.Matrix4();
    this.enabled = true;
    this.scale = 0.5;
    this.hide = [];
    this.plane = new THREE.Plane();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.pos = new THREE.Vector3(0, WATER_Y, 0);
    this.frame = 0;
    this.every = 1;
  }

  setSize(w, h) {
    this.rt.setSize(Math.max(4, Math.round(w * this.scale)), Math.max(4, Math.round(h * this.scale)));
  }

  render(camera) {
    if (!this.enabled) return;
    if ((this.frame++ % this.every) !== 0) return;
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const view = new THREE.Vector3().subVectors(this.pos, camPos);
    if (view.dot(this.normal) > 0) return;
    // Keep the mirror point under the camera so precision stays good far from origin.
    this.pos.set(camPos.x, WATER_Y, camPos.z);
    view.subVectors(this.pos, camPos);
    view.reflect(this.normal).negate().add(this.pos);
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = new THREE.Vector3().subVectors(this.pos, look).reflect(this.normal).negate().add(this.pos);
    const vc = this.cam;
    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(this.normal);
    vc.lookAt(target);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    // Oblique near plane = water surface.
    this.plane.setFromNormalAndCoplanarPoint(this.normal, this.pos);
    this.plane.applyMatrix4(vc.matrixWorldInverse);
    const clip = new THREE.Vector4(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = vc.projectionMatrix.elements;
    const q = new THREE.Vector4(
      (Math.sign(clip.x) + pm[8]) / pm[0],
      (Math.sign(clip.y) + pm[9]) / pm[5],
      -1.0,
      (1.0 + pm[10]) / pm[14],
    );
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1.0 - 0.003; pm[14] = clip.w;

    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevXr = r.xr.enabled;
    r.xr.enabled = false;
    for (const o of this.hide) o.visible = false;
    r.setRenderTarget(this.rt);
    r.state.buffers.depth.setMask(true);
    r.clear();
    r.render(this.scene, vc);
    for (const o of this.hide) o.visible = true;
    r.xr.enabled = prevXr;
    r.setRenderTarget(prevRT);
  }
}

const waterVert = /* glsl */`
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const waterFrag = /* glsl */`
uniform sampler2D tReflect; uniform mat4 textureMatrix; uniform sampler2D tNormal;
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uDeep;
uniform float uNight; uniform float uMirror; uniform float uFrozen; uniform float uRough;
varying vec3 vW;
#include <fog_pars_fragment>
void main() {
  vec2 uv1 = vW.xz * 0.09 + vec2(uTime * 0.021, uTime * 0.013);
  vec2 uv2 = vW.xz * 0.23 + vec2(-uTime * 0.017, uTime * 0.027);
  vec2 uv3 = vW.xz * 0.6 + vec2(uTime * 0.05, -uTime * 0.04);
  vec3 n1 = texture2D(tNormal, uv1).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tNormal, uv2).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(tNormal, uv3).xyz * 2.0 - 1.0;
  vec2 nxy = (n1.xy * 0.5 + n2.xy * 0.35 + n3.xy * 0.25) * uRough * (1.0 - uFrozen * 0.8);
  vec3 N = normalize(vec3(nxy.x, 1.0, nxy.y));
  vec3 V = normalize(cameraPosition - vW);
  float NdV = max(dot(N, V), 0.0);
  float fres = 0.025 + 0.975 * pow(1.0 - NdV, 5.0);
  vec4 pr = textureMatrix * vec4(vW, 1.0);
  vec2 ruv = pr.xy / pr.w + nxy * 0.06;
  vec3 refl = uMirror > 0.5 ? texture2D(tReflect, ruv).rgb : uSky;
  vec3 body = uDeep * (0.25 + 0.75 * (uSky.b + 0.2));
  float a = mix(0.5, 1.0, fres);
  vec3 col = mix(body, refl, clamp(fres * 1.15 + 0.08, 0.0, 1.0));
  vec3 H = normalize(uSunDir + V);
  float sp = pow(max(dot(N, H), 0.0), 380.0) * 7.0 + pow(max(dot(N, H), 0.0), 60.0) * 0.18;
  col += uSunCol * sp * (1.0 - uNight);
  // ice in winter
  vec3 ice = mix(vec3(0.72, 0.82, 0.88), refl, 0.25 + fres * 0.5);
  col = mix(col, ice, uFrozen);
  a = mix(a, 0.97, uFrozen);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

export function waterMaterial(mirror) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      tReflect: { value: mirror.rt.texture },
      textureMatrix: { value: mirror.textureMatrix },
      tNormal: { value: T.waterNormal() },
      uTime: U.time,
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0.5, 0.6, 0.8) },
      uDeep: { value: new THREE.Color(0.05, 0.16, 0.2) },
      uNight: U.night,
      uMirror: { value: 1 },
      uFrozen: { value: 0 },
      uRough: { value: 1 },
    },
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

// ---------------------------------------------------------------------------
// Fountains: each particle replays a ballistic arc computed in the vertex shader.
const fountainVert = /* glsl */`
attribute vec3 aVel; attribute vec3 aLife; // phase, life, size
uniform float uTime; uniform float uScale; uniform float uOn;
varying float vA; varying float vH;
#include <fog_pars_vertex>
void main() {
  float life = aLife.y;
  float t = mod(uTime + aLife.x * life, life);
  vec3 p = position + aVel * t + vec3(0.0, -4.9 * t * t, 0.0);
  float under = step(position.y - 0.05, p.y);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float k = t / life;
  vA = under * uOn * (1.0 - k * k) * smoothstep(0.0, 0.06, k);
  vH = clamp((p.y - position.y) / 3.0, 0.0, 1.0);
  gl_PointSize = aLife.z * uScale / -mvPosition.z * (0.8 + 0.6 * k) * uOn;
  #include <fog_vertex>
}`;
const fountainFrag = /* glsl */`
uniform vec3 uLit; uniform vec3 uGlow; uniform float uNight; uniform sampler2D tDot;
varying float vA; varying float vH;
#include <fog_pars_fragment>
void main() {
  vec4 d = texture2D(tDot, gl_PointCoord);
  float a = d.a * vA * 0.55;
  if (a < 0.01) discard;
  vec3 col = uLit * (0.85 + 0.3 * vH) + uGlow * uNight * (1.2 - vH * 0.6);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

export class Fountains {
  constructor() {
    this.jets = [];
  }
  // A jet: base position, direction (normalised velocity * speed), spread, count, size.
  add(base, vel, { count = 36, spread = 0.12, size = 0.16, life = null } = {}) {
    this.jets.push({ base, vel, count, spread, size, life });
  }
  build() {
    let total = 0;
    for (const j of this.jets) total += j.count;
    const pos = new Float32Array(total * 3), vel = new Float32Array(total * 3), life = new Float32Array(total * 3);
    let i = 0;
    for (const j of this.jets) {
      const T0 = j.life || Math.max(0.5, (2 * j.vel.y) / 9.8 + 0.12);
      for (let k = 0; k < j.count; k++, i++) {
        pos[i * 3] = j.base.x; pos[i * 3 + 1] = j.base.y; pos[i * 3 + 2] = j.base.z;
        const s = j.spread;
        vel[i * 3] = j.vel.x + (Math.random() - 0.5) * s * 2;
        vel[i * 3 + 1] = j.vel.y * (0.94 + Math.random() * 0.08);
        vel[i * 3 + 2] = j.vel.z + (Math.random() - 0.5) * s * 2;
        life[i * 3] = k / j.count + Math.random() * 0.02;
        life[i * 3 + 1] = T0;
        life[i * 3 + 2] = j.size * (0.7 + Math.random() * 0.6);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(life, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5000);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: U.time, uScale: { value: 800 }, uOn: { value: 1 },
        uLit: { value: new THREE.Color(0.9, 0.95, 1) }, uGlow: { value: new THREE.Color(0.55, 0.8, 1.6) },
        uNight: U.night, tDot: { value: T.softDot() },
      },
      vertexShader: fountainVert, fragmentShader: fountainFrag,
      transparent: true, depthWrite: false, fog: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.renderOrder = 3;
    this.points.frustumCulled = false;
    return this.points;
  }
}
