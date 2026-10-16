// Shared materials and the small shader injections they use:
// world-space detail/macro variation, pool-floor caustics, wind sway, night emission.
import * as THREE from 'three';
import * as T from './textures.js';

export const U = {
  time: { value: 0 },
  night: { value: 0 },        // 0 = day, 1 = full night
  sunInt: { value: 1 },       // 0..1 direct sun strength
  wind: { value: 1 },
  season: { value: 0 },       // 0 summer, 1 autumn, 2 winter
  snow: { value: 0 },
};


// Multiplies albedo by a world-space granite speckle and a large-scale macro variation.
export function worldDetail(mat, { detail = null, detailScale = 1.3, detailAmt = 0.55, macro = null, macroScale = 0.012, macroAmt = 0.25, snowAmt = 0 } = {}) {
  const id = [detail ? detail.uuid : '-', detailScale, detailAmt, macro ? 1 : 0, macroScale, macroAmt, snowAmt].join('|');
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tDetail = { value: detail };
    sh.uniforms.tMacro = { value: macro || T.macroNoise() };
    sh.uniforms.uSnow = U.snow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          #endif
          vWPos = (modelMatrix * wp).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform sampler2D tDetail; uniform sampler2D tMacro; uniform float uSnow;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        ${detail ? `diffuseColor.rgb *= mix(vec3(1.0), texture2D(tDetail, vWPos.xz * ${detailScale.toFixed(3)}).rgb * 1.75, ${detailAmt.toFixed(3)});` : ''}
        ${macro ? `{ float mc = texture2D(tMacro, vWPos.xz * ${macroScale.toFixed(4)}).r;
          diffuseColor.rgb *= 1.0 + (mc - 0.5) * ${macroAmt.toFixed(3)}; }` : ''}
        ${snowAmt > 0 ? `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.98), uSnow * ${snowAmt.toFixed(2)} * smoothstep(0.35, 0.65, texture2D(tMacro, vWPos.xz * 0.08).r + 0.3));` : ''}`);
  };
  mat.customProgramCacheKey = () => 'wd' + id;
  return mat;
}

// Caustics on pool floors.
export function caustics(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uSunInt = U.sunInt;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; uniform float uTime; uniform float uSunInt;
        float cst(vec2 p, float t) {
          vec2 i = p; float c = 1.0; float inten = 0.005;
          for (int n = 0; n < 4; n++) {
            float tt = t * (1.0 - (3.5 / float(n + 1)));
            i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
            c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
          }
          c /= 4.0; c = 1.17 - pow(c, 1.4);
          return pow(abs(c), 8.0);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.75, 0.9, 1.0) * clamp(cst(mod(vWPos.xz * 1.6, 6.2831), uTime * 0.6), 0.0, 1.0) * 0.55 * uSunInt;`);
  };
  mat.customProgramCacheKey = () => 'caustics';
  return mat;
}

// Wind sway for foliage. Bends vertices by height above the instance base.
export function windSway(mat, { amp = 0.12, freq = 1.3, minY = 2.0 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = U.time;
    sh.uniforms.uWind = U.wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float h = max(0.0, transformed.y - ${minY.toFixed(2)});
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
          #endif
          float ph = ip.x * 0.13 + ip.z * 0.17;
          float s = sin(uTime * ${freq.toFixed(2)} + ph) * 0.6 + sin(uTime * ${(freq * 2.7).toFixed(2)} + ph * 1.7 + transformed.y) * 0.25;
          transformed.x += s * h * ${amp.toFixed(3)} * 0.1 * uWind;
          transformed.z += cos(uTime * ${(freq * 0.8).toFixed(2)} + ph) * h * ${amp.toFixed(3)} * 0.05 * uWind;
          float leaf = sin(uTime * 6.0 + position.x * 7.0 + position.z * 5.0 + ph) * 0.03 * uWind;
          transformed += normal * leaf * step(0.5, h);
        }`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp + freq + minY + (prev ? 'p' : '');
  return mat;
}

let built = null;
export function materials(quality = 'high') {
  if (built) return built;
  const detail = T.graniteDetail();
  const macro = T.macroNoise();

  const pav = T.paving({ seed: 1, colors: ['#cbc7bf', '#c1bdb5', '#d3cfc7', '#bab6ae'] });
  const pav2 = T.paving({ seed: 2, metres: 4.8, tileW: 0.6, tileH: 0.6, colors: ['#a9a59d', '#b3afa7', '#9f9b93'], band: { every: 8, rows: [3, 4], color: '#82665a' } });
  const side = T.paving({ seed: 3, metres: 3.6, tileW: 0.3, tileH: 0.3, colors: ['#9c9a95', '#a5a39e', '#93918c'] });
  const plaza = T.plazaDisc();
  const grass = T.grass();
  const hedge = T.hedge();

  const m = {};
  m.paving = worldDetail(new THREE.MeshStandardMaterial({
    map: pav.map, normalMap: pav.normalMap, roughnessMap: pav.roughnessMap, roughness: 0.95, metalness: 0,
    normalScale: new THREE.Vector2(0.8, 0.8),
  }), { detail, macro, macroAmt: 0.18, snowAmt: 0.9 });
  m.paving2 = worldDetail(new THREE.MeshStandardMaterial({
    map: pav2.map, normalMap: pav2.normalMap, roughnessMap: pav2.roughnessMap, roughness: 0.9,
  }), { detail, macro, macroAmt: 0.18, snowAmt: 0.9 });
  m.sidewalk = worldDetail(new THREE.MeshStandardMaterial({
    map: side.map, normalMap: side.normalMap, roughnessMap: side.roughnessMap, roughness: 1,
  }), { detail, macro, macroAmt: 0.3, snowAmt: 0.95 });
  m.plaza = worldDetail(new THREE.MeshStandardMaterial({
    map: plaza.map, normalMap: plaza.normalMap, roughness: 0.62, metalness: 0.0,
    normalScale: new THREE.Vector2(0.7, 0.7), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), { detail, detailAmt: 0.45, macro, macroAmt: 0.12, snowAmt: 0.85 });
  m.granite = worldDetail(new THREE.MeshStandardMaterial({ color: '#c8c4bc', roughness: 0.45, metalness: 0 }), { detail, detailScale: 2.2, detailAmt: 0.6, snowAmt: 0.6 });
  m.graniteDark = worldDetail(new THREE.MeshStandardMaterial({ color: '#6e6660', roughness: 0.35 }), { detail, detailScale: 2.2, detailAmt: 0.6 });
  m.graniteRed = worldDetail(new THREE.MeshStandardMaterial({ color: '#8a6456', roughness: 0.38 }), { detail, detailScale: 2.2, detailAmt: 0.6 });
  m.marble = worldDetail(new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.4 }), { detail, detailScale: 0.9, detailAmt: 0.25, snowAmt: 0.5 });
  m.grass = worldDetail(new THREE.MeshStandardMaterial({
    map: grass.map, normalMap: grass.normalMap, roughness: 0.96, normalScale: new THREE.Vector2(0.9, 0.9),
  }), { macro, macroScale: 0.03, macroAmt: 0.45, snowAmt: 1.6 });
  m.hedge = worldDetail(new THREE.MeshStandardMaterial({
    map: hedge.map, normalMap: hedge.normalMap, roughness: 0.9, normalScale: new THREE.Vector2(1.2, 1.2),
  }), { macro, macroScale: 0.05, macroAmt: 0.3, snowAmt: 0.8 });
  m.asphalt = worldDetail(new THREE.MeshStandardMaterial({ map: T.asphalt(), roughness: 0.88, color: '#ffffff' }), { macro, macroScale: 0.02, macroAmt: 0.35, snowAmt: 0.25 });
  m.cityGround = worldDetail(new THREE.MeshStandardMaterial({ map: T.asphalt(), roughness: 0.95, color: '#a8a39b' }), { macro, macroScale: 0.004, macroAmt: 0.5, snowAmt: 0.6 });
  m.poolFloor = caustics(new THREE.MeshStandardMaterial({ color: '#4d6a74', roughness: 0.6 }));
  m.poolWall = new THREE.MeshStandardMaterial({ color: '#5f7880', roughness: 0.6 });
  m.marking = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  m.metalDark = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.42, metalness: 0.7 });
  m.metal = new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.32, metalness: 0.85 });
  m.chrome = new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.12, metalness: 1 });
  m.gold = new THREE.MeshStandardMaterial({ color: '#e2b04a', roughness: 0.22, metalness: 1 });
  m.wood = new THREE.MeshStandardMaterial({ color: '#8a5a35', roughness: 0.7 });
  m.lampGlass = new THREE.MeshStandardMaterial({ color: '#fff4dc', roughness: 0.2, emissive: '#ffd59a', emissiveIntensity: 0.0 });
  m.white = new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.5 });
  m.glassDark = new THREE.MeshStandardMaterial({ color: '#1c2a33', roughness: 0.06, metalness: 0.9 });
  m.flowers = [0, 1, 2, 3].map((i) => new THREE.MeshStandardMaterial({ map: T.flowerbed(i), roughness: 0.85 }));
  m.soil = new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 });
  built = m;
  return m;
}

// Apply night emission to every lamp-like material.
export function setNight(m, night) {
  m.lampGlass.emissiveIntensity = night * 6.0;
}
