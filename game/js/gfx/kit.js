// Geometry kit: small primitives with baked vertex colours and a per-vertex "tint" mask,
// merged into one geometry per rigid part. Tinted vertices take the instance (faction) colour.
import * as THREE from 'three';

const tmpM = new THREE.Matrix4(), tmpE = new THREE.Euler(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const col = new THREE.Color();

// opts: { at:[x,y,z], rot:[rx,ry,rz], scale:[sx,sy,sz], tint:0..1 }
function finish(geo, color, opts = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const [x, y, z] = opts.at || [0, 0, 0], [rx, ry, rz] = opts.rot || [0, 0, 0], s = opts.scale || [1, 1, 1];
  tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(s[0], s[1], s[2]));
  g.applyMatrix4(tmpM);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3), t = new Float32Array(n);
  col.set(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; t[i] = opts.tint || 0; }
  // optional vertical shade: darker at the bottom of the piece for a little form
  if (opts.shade) {
    g.computeBoundingBox();
    const { min, max } = g.boundingBox, h = max.y - min.y || 1, p = g.attributes.position.array;
    for (let i = 0; i < n; i++) { const k = 1 - opts.shade * (1 - (p[i * 3 + 1] - min.y) / h); c[i * 3] *= k; c[i * 3 + 1] *= k; c[i * 3 + 2] *= k; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('tint', new THREE.BufferAttribute(t, 1));
  return g;
}

export const box = (w, h, d, color, o) => finish(new THREE.BoxGeometry(w, h, d), color, o);
export const cyl = (rt, rb, h, seg, color, o) => finish(new THREE.CylinderGeometry(rt, rb, h, seg), color, o);
export const cone = (r, h, seg, color, o) => finish(new THREE.ConeGeometry(r, h, seg), color, o);
export const ball = (r, color, o, detail = 1) => finish(new THREE.IcosahedronGeometry(r, detail), color, o);
export const sphere = (r, color, o, ws = 10, hs = 7) => finish(new THREE.SphereGeometry(r, ws, hs), color, o);
export const torus = (r, tube, color, o, rs = 6, ts = 14) => finish(new THREE.TorusGeometry(r, tube, rs, ts), color, o);
export const dodeca = (r, color, o) => finish(new THREE.DodecahedronGeometry(r, 0), color, o);
// triangular prism (roofs): width along x, ridge along z
export function prism(w, h, d, color, o) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return finish(g, color, o);
}
export function lathe(points, seg, color, o) {
  return finish(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg), color, o);
}

export function merge(list) {
  list = list.flat().filter(Boolean);
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), c = new Float32Array(n * 3), t = new Float32Array(n);
  let o = 0;
  for (const g of list) {
    const k = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    c.set(g.attributes.color.array, o * 3);
    t.set(g.attributes.tint.array, o);
    o += k;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  out.setAttribute('tint', new THREE.BufferAttribute(t, 1));
  out.computeBoundingSphere();
  return out;
}

// Standard material that understands the tint mask: colour = vertexColour * mix(1, instanceColour, tint).
// Optional emissive mask through vertex colours brighter than 1 is not used; glow comes from particles.
export function tintMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05, ...opts });
  m.onBeforeCompile = sh => {
    addGrain(sh, 0.1);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tint;')
      .replace('#include <color_vertex>', `#if defined( USE_COLOR_ALPHA )
  vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
  vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, tint );
#endif`);
  };
  m.customProgramCacheKey = () => 'tint';
  return m;
}

// Static mesh from kit pieces (buildings, props): tinted parts get a fixed colour.
export function staticMesh(list, tintColor = '#ffffff', material) {
  const g = merge(list);
  const t = g.attributes.tint.array, c = g.attributes.color.array;
  col.set(tintColor);
  for (let i = 0; i < t.length; i++) if (t[i] > 0) {
    c[i * 3] *= 1 + (col.r - 1) * t[i]; c[i * 3 + 1] *= 1 + (col.g - 1) * t[i]; c[i * 3 + 2] *= 1 + (col.b - 1) * t[i];
  }
  const mesh = new THREE.Mesh(g, material || staticMaterial());
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// Fog of war shared by every world material: a texture over the map (r = explored, g = visible now).
const blank = new THREE.DataTexture(new Uint8Array([255, 255, 0, 255]), 1, 1);
blank.needsUpdate = true;
export const worldFog = { map: { value: blank }, rect: { value: new THREE.Vector4(0, 0, 1, 1) }, on: { value: 0 } };
export function addWorldFog(sh) {
  sh.uniforms.wFogMap = worldFog.map; sh.uniforms.wFogRect = worldFog.rect; sh.uniforms.wFogOn = worldFog.on;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vWFog;\nuniform vec4 wFogRect;')
    .replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_INSTANCING
    vec4 wfp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #else
    vec4 wfp = modelMatrix * vec4(transformed, 1.0);
  #endif
  vWFog = (wfp.xz - wFogRect.xy) / wFogRect.zw;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vWFog;\nuniform sampler2D wFogMap;\nuniform float wFogOn;')
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  if (wFogOn > 0.5) { vec2 fv = texture2D(wFogMap, vWFog).rg; gl_FragColor.rgb *= mix(0.0, mix(0.45, 1.0, fv.g), fv.r); }`);
}

// World-space value noise that breaks up flat colours (stone, plaster, wood grain, cloth).
export function addGrain(sh, amount = 0.16, scale = 3.2) {
  addWorldFog(sh);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;')
    .replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_INSTANCING
    vGrainPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vGrainPos;
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
  float gn = gNoise(vGrainPos * ${scale.toFixed(2)}) * 0.6 + gNoise(vGrainPos * ${(scale * 4.3).toFixed(2)}) * 0.4;
  diffuseColor.rgb *= ${(1 - amount).toFixed(3)} + gn * ${(amount * 2).toFixed(3)};`);
}

let sharedStatic;
export function staticMaterial() {
  if (sharedStatic) return sharedStatic;
  sharedStatic = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 });
  sharedStatic.onBeforeCompile = sh => addGrain(sh, 0.16);
  sharedStatic.customProgramCacheKey = () => 'grain-static';
  return sharedStatic;
}
