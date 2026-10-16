// Sky, sun/moon, real solar position for Astana, environment lighting, clouds, stars, fog.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, smoothstep, lerp, mulberry32 } from './util.js';
import { PLACE } from './layout.js';
import { U } from './materials.js';

const DEG = Math.PI / 180;

// Solar elevation/azimuth for latitude/longitude at local clock time (hours) and day of year.
export function solarPosition(hour, doy, lat = PLACE.lat, lon = PLACE.lon, tz = PLACE.tz) {
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + doy)) / 365) * DEG;
  const B = (2 * Math.PI * (doy - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const solarTime = hour + (4 * (lon - 15 * tz) + eot) / 60;
  const H = 15 * (solarTime - 12) * DEG;
  const phi = lat * DEG;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(clamp(sinEl, -1, 1));
  const A = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi));
  const az = A + Math.PI; // from north, clockwise
  return { el, az };
}

export function dirFromElAz(el, az, out = new THREE.Vector3()) {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

const cloudVert = /* glsl */`
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const cloudFrag = /* glsl */`
uniform float uTime; uniform float uCover; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform float uNight;
varying vec3 vW;
float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main() {
  vec2 p = vW.xz * 0.00042 + vec2(uTime * 0.004, uTime * 0.0017);
  float base = fbm(p);
  float detail = fbm(p * 3.1 + 4.0);
  float d = base * 0.75 + detail * 0.25;
  float cov = mix(0.72, 0.38, uCover);
  float a = smoothstep(cov, cov + 0.22, d);
  float dist = length(vW.xz - cameraPosition.xz);
  a *= 1.0 - smoothstep(5500.0, 11000.0, dist);
  if (a < 0.003) discard;
  float thick = smoothstep(cov, cov + 0.5, d);
  float lightSide = fbm(p + uSunDir.xz * 0.02);
  float shade = clamp(0.55 + (d - lightSide) * 3.0, 0.25, 1.15);
  vec3 lit = uSunCol * shade * 0.9 + uAmb * 0.9;
  vec3 col = mix(lit, uAmb * 0.75, thick * 0.55);
  col = mix(col, vec3(0.012, 0.016, 0.03), uNight * 0.85);
  gl_FragColor = vec4(col, a * 0.92);
}`;

export class SkySystem {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, renderer } = ctx;
    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    this.sky.frustumCulled = false;
    const su = this.sky.material.uniforms;
    su.turbidity.value = 3.2;
    su.rayleigh.value = 1.35;
    su.mieCoefficient.value = 0.0028;
    su.mieDirectionalG.value = 0.8;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 1200;
    this.shadowSize = 120;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x6b6656, 0.35);
    scene.add(this.hemi);

    // Stars
    const r = mulberry32(3);
    const N = 2600, pos = new Float32Array(N * 3), size = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = r(), v = r() * 0.95 + 0.05;
      const th = u * Math.PI * 2, el = Math.asin(v);
      pos[i * 3] = Math.cos(th) * Math.cos(el) * 7000;
      pos[i * 3 + 1] = Math.sin(el) * 7000;
      pos[i * 3 + 2] = Math.sin(th) * Math.cos(el) * 7000;
      size[i] = Math.pow(r(), 6) * 3 + 0.8;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: U.time },
      vertexShader: `attribute float aSize; uniform float uTime; varying float vT;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        vT = 0.7 + 0.3 * sin(uTime * 2.0 + position.x); gl_PointSize = aSize; }`,
      fragmentShader: `uniform float uOpacity; varying float vT;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * 2.5, uOpacity * vT * (1.0 - d * 2.0)); }`,
      transparent: true, depthWrite: false, fog: false,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -2;
    scene.add(this.stars);

    // Moon disc
    const mc = document.createElement('canvas'); mc.width = mc.height = 128;
    const mx = mc.getContext('2d');
    const g = mx.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.42, 'rgba(240,236,220,1)');
    g.addColorStop(0.5, 'rgba(200,210,240,0.25)'); g.addColorStop(1, 'rgba(160,180,240,0)');
    mx.fillStyle = g; mx.fillRect(0, 0, 128, 128);
    mx.fillStyle = 'rgba(160,150,140,0.35)';
    [[50, 52, 8], [74, 60, 6], [60, 78, 7], [80, 44, 4]].forEach(([x, y, rr]) => { mx.beginPath(); mx.arc(x, y, rr, 0, 7); mx.fill(); });
    const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    this.moon.scale.setScalar(260);
    this.moon.renderOrder = -1;
    scene.add(this.moon);

    // Clouds
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.time, uCover: { value: 0.35 }, uSunDir: { value: new THREE.Vector3() },
        uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uNight: U.night,
      },
      vertexShader: cloudVert, fragmentShader: cloudFrag,
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000).rotateX(-Math.PI / 2), this.cloudMat);
    this.clouds.position.y = 1900;
    this.clouds.renderOrder = -1;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);

    scene.fog = new THREE.FogExp2(0xb8c8da, 0.00022);
    this.haze = 0.5;

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(9000);
    this.envSky.material = this.sky.material;
    this.envScene.add(this.envSky);
    this.envRT = null;
    this.envDirty = true;

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.night = 0;
    this.state = { hour: 13, doy: 196, cloud: 0.35 };
    this.focus = new THREE.Vector3();
  }

  set(hour, doy, cloud = this.state.cloud, haze = this.haze) {
    Object.assign(this.state, { hour, doy, cloud });
    this.haze = haze;
    const { el, az } = solarPosition(hour, doy);
    this.el = el; this.az = az;
    dirFromElAz(el, az, this.sunDir);
    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(this.sunDir);
    const elDeg = el / DEG;
    su.turbidity.value = lerp(1.6, 5.5, haze) + (1 - smoothstep(0, 20, elDeg)) * 2;
    su.rayleigh.value = lerp(1.1, 2.4, 1 - smoothstep(-4, 25, elDeg)) + cloud * 0.4;

    const night = 1 - smoothstep(-9, 1.5, elDeg);
    this.night = night;
    U.night.value = night;
    const day = smoothstep(-2, 10, elDeg);
    U.sunInt.value = day * (1 - cloud * 0.55);

    // Sun colour shifts from deep orange at the horizon to near-white at altitude.
    const warm = 1 - smoothstep(2, 32, elDeg);
    const sunCol = new THREE.Color().setRGB(1, lerp(0.97, 0.52, warm), lerp(0.92, 0.26, warm));
    if (elDeg > -3) {
      this.lightDir.copy(this.sunDir);
      if (elDeg < 3) this.lightDir.y = Math.max(this.lightDir.y, 0.05);
      this.sun.color.copy(sunCol);
      this.sun.intensity = 4.3 * day * (1 - cloud * 0.6);
    } else {
      // Moonlight: opposite-ish side of the sky, dim and blue.
      const { el: mel, az: maz } = solarPosition((hour + 12) % 24, doy);
      dirFromElAz(Math.max(0.35, mel), maz, this.lightDir);
      this.sun.color.setRGB(0.62, 0.72, 1.0);
      this.sun.intensity = 0.32 * night * (1 - cloud * 0.7);
    }
    this.moon.material.opacity = night * (1 - cloud);
    this.moon.position.copy(this.lightDir).multiplyScalar(6000);

    const skyTint = new THREE.Color().setRGB(0.55, 0.68, 0.92).lerp(new THREE.Color(0.9, 0.62, 0.48), warm * 0.6);
    skyTint.lerp(new THREE.Color(0.08, 0.1, 0.2), night);
    this.hemi.color.copy(skyTint);
    this.hemi.groundColor.setRGB(0.36, 0.33, 0.28).multiplyScalar(1 - night * 0.8);
    this.hemi.intensity = lerp(0.16, 0.45, night) + cloud * 0.35;

    // Fog follows the horizon colour.
    const fogDay = new THREE.Color().setRGB(0.62, 0.71, 0.82);
    const fogSet = new THREE.Color().setRGB(0.95, 0.66, 0.46);
    const fogNight = new THREE.Color().setRGB(0.028, 0.034, 0.06);
    const fc = fogDay.clone().lerp(fogSet, warm * smoothstep(-6, 4, elDeg) * 0.85).lerp(fogNight, night);
    fc.lerp(new THREE.Color(0.7, 0.72, 0.75), cloud * 0.4 * (1 - night));
    const fogBright = lerp(1.0, 0.65, warm) * (1 - night * 0.2);
    this.ctx.scene.fog.color.copy(fc).multiplyScalar(fogBright);
    this.ctx.scene.fog.density = lerp(0.00005, 0.00032, haze) * (1 + cloud * 0.5);

    this.starMat.uniforms.uOpacity.value = night * (1 - cloud * 0.9);
    const cu = this.cloudMat.uniforms;
    cu.uCover.value = cloud;
    cu.uSunDir.value.copy(this.sunDir);
    cu.uSunCol.value.copy(sunCol).multiplyScalar(lerp(1.6, 0.9, warm) * day + 0.05);
    cu.uAmb.value.copy(skyTint).multiplyScalar(lerp(1.0, 0.25, night) * (0.6 + 0.4 * day));
    this.clouds.visible = cloud > 0.02;

    this.ctx.scene.environmentIntensity = lerp(0.6, 0.55, night) * lerp(1, 1.15, cloud);
    this.ctx.renderer.toneMappingExposure = lerp(0.66, 0.95, night) * lerp(1, 1.2, cloud * day);
    this.envDirty = true;
  }

  // Keep the shadow frustum tight around what the camera looks at, snapped to texels.
  updateShadow(focus, camDist) {
    const s = clamp(camDist * 0.85, 34, 170);
    this.shadowSize = s;
    const cam = this.sun.shadow.camera;
    if (cam.right !== s) {
      cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s;
      cam.updateProjectionMatrix();
    }
    const texel = (2 * s) / this.sun.shadow.mapSize.x;
    const light = this.sun;
    const d = this.lightDir;
    // snap the focus in light space
    const up = Math.abs(d.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, d).normalize();
    const up2 = new THREE.Vector3().crossVectors(d, right).normalize();
    const fx = Math.round(focus.dot(right) / texel) * texel;
    const fy = Math.round(focus.dot(up2) / texel) * texel;
    const fz = focus.dot(d);
    const snapped = new THREE.Vector3().addScaledVector(right, fx).addScaledVector(up2, fy).addScaledVector(d, fz);
    light.target.position.copy(snapped);
    light.position.copy(snapped).addScaledVector(d, 500);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
  }

  updateEnv() {
    if (!this.envDirty) return;
    this.envDirty = false;
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 20000);
    this.ctx.scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }

  update(camera) {
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.clouds.position.x = camera.position.x;
    this.clouds.position.z = camera.position.z;
    this.moon.position.copy(camera.position).addScaledVector(this.lightDir, 6000);
  }

  label() {
    const h = this.state.hour;
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  }
}
