// Entry point: renderer, post-processing, world assembly, the frame loop and capture helpers.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Hub, nextFrame, download, stamp, clamp, lerp, mulberry32, easeInOutSine } from './util.js';
import { materials, U, setNight } from './materials.js';
import { SkySystem } from './sky.js';
import { Mirror, Fountains } from './water.js';
import { buildGround } from './ground.js';
import { buildBayterek } from './bayterek.js';
import { buildProps } from './props.js';
import { buildVegetation } from './vegetation.js';
import { buildCity } from './buildings.js';
import { buildTraffic } from './traffic.js';
import { Heroes, HERO_INFO } from './heroes.js';
import { Crowd } from './people.js';
import { CrowdSim } from './crowdsim.js';
import { CameraRig } from './controls.js';
import { Director } from './director.js';
import { Sheets } from './sheets.js';
import { UI } from './ui.js';
import { POOLS, BLVD, WATER_Y, SPHERE, EAST_END, WEST_END, ARCH_X, groundY } from './layout.js';

export const QUALITY = {
  low: { pr: 1, shadow: 2048, msaa: 0, mirror: 0.33, every: 2, bloom: false, ao: false, crowd: 120 },
  medium: { pr: 1.25, shadow: 2048, msaa: 2, mirror: 0.45, every: 1, bloom: true, ao: false, crowd: 180 },
  high: { pr: 1.5, shadow: 4096, msaa: 4, mirror: 0.5, every: 1, bloom: true, ao: false, crowd: 220 },
  ultra: { pr: 2, shadow: 4096, msaa: 4, mirror: 0.75, every: 1, bloom: true, ao: true, crowd: 300 },
};
const SEASON_DOY = [196, 274, 15];

const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches;
const isMobile = isTouch && Math.min(innerWidth, innerHeight) < 820;

const app = {
  hub: new Hub(),
  state: {
    quality: isMobile ? 'low' : 'high',
    aspect: 'free', season: 0, style: 'pixel', hour: 18.4, cloud: 0.3, haze: 0.45, wind: 1,
    markers: true, labels: true, fountains: true, cars: true, reflect: true, shadows: true, bloom: true, ao: false,
    stillRes: 1080, thirds: false, safe: false,
  },
  dt: 0.016, time: 0, fps: 60,
};
window.astana = app;

const progress = async (p, msg) => {
  $('#bar').style.width = `${Math.round(p * 100)}%`;
  $('#msg').textContent = msg;
  await nextFrame();
};

async function init() {
  const canvas = $('#c');
  await progress(0.02, 'Рендерер WebGL2…');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[app.state.quality].pr));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 12000);
  camera.position.set(140, 20, 60);
  Object.assign(app, { renderer, scene, camera, canvas });
  const ctx = { renderer, scene, camera, app };

  await progress(0.06, 'Небо и солнце над Астаной…');
  const sky = new SkySystem(ctx);
  app.sky = sky;
  sky.set(app.state.hour, SEASON_DOY[0], app.state.cloud, app.state.haze);

  await progress(0.12, 'Гранит, газоны и орнамент площади…');
  const M = materials();
  app.M = M;
  const mirror = new Mirror(renderer, scene);
  app.mirror = mirror;

  await progress(0.3, 'Бульвар Нуржол: бассейны и дорожки…');
  app.ground = buildGround(ctx, M, mirror);

  await progress(0.38, 'Байтерек: колонны и золотой шар…');
  app.bayterek = buildBayterek(ctx, M);

  await progress(0.48, 'Фонари, скамейки, флаги…');
  app.props = buildProps(ctx, M);

  await progress(0.56, 'Деревья и цветники…');
  app.veg = buildVegetation(ctx, M);

  await progress(0.66, 'Ак Орда, Хан Шатыр и кварталы…');
  app.city = buildCity(ctx, M);
  app.traffic = buildTraffic(ctx);

  await progress(0.74, 'Фонтаны…');
  app.fountains = new Fountains();
  buildJets(app.fountains);
  scene.add(app.fountains.build());
  mirror.hide.push(app.fountains.points);

  await progress(0.8, 'Люди и главные герои…');
  app.heroes = new Heroes(ctx);
  app.crowd = new Crowd(ctx, { capacity: 420 });
  app.crowdSim = new CrowdSim(app.crowd, app.props, app.heroes);
  app.crowdSim.build(QUALITY[app.state.quality].crowd);
  app.snow = buildSnow(scene);

  await progress(0.86, 'Камера и режиссёр…');
  app.rig = new CameraRig(camera, canvas, app.hub);
  app.rig.raycastTargets = [app.ground.root, app.bayterek.group];
  app.rig.dblOverride = (hit) => {
    if (!app.placing) return false;
    app.placing = false;
    app.hub.emit('placing', false);
    app.heroes.place(hit.x, hit.z, app.heroes.heading);
    app.heroes.setAction('idle');
    app.crowdSim.build();
    return true;
  };
  app.director = new Director(app);
  app.sheets = new Sheets(app);
  app.hub.on('userinput', () => { if (app.director.playing && !app.director.recording) app.director.stop(true); if (app.intro) app.intro = null; });

  app.recordCanvas = document.createElement('canvas');
  app.recordCtx = app.recordCanvas.getContext('2d');

  buildComposer();
  layout();
  window.addEventListener('resize', layout);

  await progress(0.92, 'Прогрев шейдеров…');
  applySeason(0);
  applyTime();
  setStartView();
  renderer.compile(scene, camera);
  renderFrame(0.016);
  app.bayterek.updateEnvironment(renderer, scene, true);

  app.ui = new UI(app);
  await progress(1, 'Готово');
  $('#enter').hidden = false;
  renderer.setAnimationLoop(loop);
}

// ---------------------------------------------------------------------------
function buildJets(F) {
  const g = 9.8;
  for (const [x0, x1] of POOLS) {
    const near = Math.min(Math.abs(x0), Math.abs(x1)) < 700;
    for (let x = x0 + 2; x <= x1 - 2; x += 4) {
      const h = 1.4 + ((Math.round(x / 4) % 3) === 0 ? 1.1 : 0.4);
      F.add(new THREE.Vector3(x, WATER_Y, 0), new THREE.Vector3(0, Math.sqrt(2 * g * h), 0), { count: near ? 42 : 22, spread: 0.1, size: 0.17 });
      if (!near) continue;
      for (const s of [-1, 1]) {
        const vy = Math.sqrt(2 * g * 1.15), T0 = (2 * vy) / g;
        const zFrom = s * (BLVD.water - 0.25);
        F.add(new THREE.Vector3(x + 2, 0.36, zFrom), new THREE.Vector3(0, vy, -zFrom * 0.92 / T0), { count: 26, spread: 0.06, size: 0.12 });
      }
    }
  }
}

function buildSnow(scene) {
  const N = 9000;
  const pos = new Float32Array(N * 3);
  const r = mulberry32(5);
  for (let i = 0; i < N; i++) { pos[i * 3] = (r() - 0.5) * 120; pos[i * 3 + 1] = r() * 60; pos[i * 3 + 2] = (r() - 0.5) * 120; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uCam: { value: new THREE.Vector3() }, uWind: U.wind },
    vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uWind;
      void main(){
        vec3 p = position;
        p.y = mod(p.y - uTime * 1.1, 60.0);
        p.x += sin(uTime * 0.7 + position.z) * 0.8 + uTime * 0.6 * uWind;
        p.z += cos(uTime * 0.5 + position.x) * 0.8;
        p.xz = mod(p.xz - uCam.xz + 60.0, 120.0) - 60.0 + uCam.xz;
        p.y += uCam.y - 20.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(90.0 / -mv.z, 1.0, 6.0);
      }`,
    fragmentShader: `void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.6), (1.0 - d * 2.0) * 0.85); }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  scene.add(pts);
  return { pts, mat };
}

// ---------------------------------------------------------------------------
function buildComposer() {
  const { renderer, scene, camera } = app;
  const q = QUALITY[app.state.quality];
  if (app.composer) app.composer.dispose?.();
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  app.gtao = null;
  if (app.state.ao) {
    const gtao = new GTAOPass(scene, camera, 4, 4);
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
    composer.addPass(gtao);
    app.gtao = gtao;
  }
  app.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.12, 0.45, 1.25);
  app.bloom.enabled = app.state.bloom && q.bloom;
  composer.addPass(app.bloom);
  composer.addPass(new OutputPass());
  app.composer = composer;
  app.mirror.scale = q.mirror;
  app.mirror.every = q.every;
  app.sky.sun.shadow.mapSize.set(q.shadow, q.shadow);
  if (app.sky.sun.shadow.map) { app.sky.sun.shadow.map.dispose(); app.sky.sun.shadow.map = null; }
}

app.setQuality = (q) => {
  app.state.quality = q;
  const Q = QUALITY[q];
  app.state.ao = Q.ao || (app.state.ao && q !== 'low');
  buildComposer();
  layout();
  app.hub.emit('quality', q);
};
app.rebuildComposer = () => { buildComposer(); layout(); };

function parseAspect(a) {
  if (a === 'free') return null;
  const [w, h] = a.split(':').map(Number);
  return w / h;
}

function frameRect() {
  const sw = innerWidth, sh = innerHeight;
  const a = parseAspect(app.state.aspect);
  if (!a) return { x: 0, y: 0, w: sw, h: sh };
  const panelOpen = !document.body.classList.contains('clean') && !$('#panel').classList.contains('closed');
  const wide = sw > 720;
  const top = document.body.classList.contains('clean') ? 0 : wide ? 76 : 62;
  const right = panelOpen && wide ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel')) + 20 : 0;
  const bottom = panelOpen && !wide ? Math.min(sh * 0.56, 520) + 12 : 10;
  const left = 10;
  const aw = sw - left - right - 10, ah = sh - top - bottom;
  let w = aw, h = aw / a;
  if (h > ah) { h = ah; w = ah * a; }
  return { x: left + (aw - w) / 2, y: top + (ah - h) / 2, w: Math.floor(w), h: Math.floor(h) };
}

function layout() {
  const f = frameRect();
  const fr = $('#frame');
  Object.assign(fr.style, { position: 'absolute', left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
  const tag = $('#aspectTag');
  tag.hidden = app.state.aspect === 'free';
  tag.textContent = app.state.aspect;
  if (app.fixedSize) return;
  const pr = Math.min(devicePixelRatio, QUALITY[app.state.quality].pr);
  setSizes(f.w, f.h, pr);
}

function setSizes(w, h, pr) {
  const { renderer, composer, camera } = app;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  app.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
  if (app.gtao) app.gtao.setSize(w * pr, h * pr);
  app.mirror.setSize(w * pr, h * pr);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  app.rig.aspect = w / h;
  app.rig.applyLens();
  const scale = (h * pr) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  app.fountains.mat.uniforms.uScale.value = scale;
}
app.layout = layout;

// Exact output size for recording / stills (null restores the window size).
function dimsFor(res) {
  let a = parseAspect(app.state.aspect);
  if (!a) a = $('#frame').clientWidth / Math.max(1, $('#frame').clientHeight);
  return a >= 1 ? [Math.round((res * a) / 2) * 2, res] : [res, Math.round(res / a / 2) * 2];
}
app.dimsFor = dimsFor;
app.setRenderSize = (res) => {
  if (!res) { app.fixedSize = null; layout(); return; }
  const [W, H] = dimsFor(res);
  app.fixedSize = { W, H };
  setSizes(W, H, 1);
  app.recordCanvas.width = W;
  app.recordCanvas.height = H;
};

// ---------------------------------------------------------------------------
function applyTime() {
  const s = app.state;
  app.sky.set(s.hour, SEASON_DOY[s.season], s.cloud, s.haze);
  const n = app.sky.night;
  setNight(app.M, n);
  app.bayterek.setNight(n);
  app.props.setNight(n);
  app.city.setNight(n);
  if (app.bloom) app.bloom.strength = 0.12 + n * 0.8;
  app.bayterek.envDirty = true;
  const w = app.ground.waterMat.uniforms;
  w.uSunDir.value.copy(app.sky.lightDir);
  w.uSunCol.value.copy(app.sky.sun.color).multiplyScalar(app.sky.sun.intensity / 3);
  w.uSky.value.copy(app.scene.fog.color).multiplyScalar(1.25);
  app.fountains.mat.uniforms.uLit.value.copy(app.sky.sun.color).multiplyScalar(0.25 + 0.55 * (app.sky.sun.intensity / 3.4)).add(app.sky.hemi.color.clone().multiplyScalar(0.35));
  app.hub.emit('time', s.hour);
}
app.applyTime = applyTime;

function applySeason(season) {
  const s = app.state;
  s.season = season;
  app.veg.setSeason(season);
  app.crowd.setSeason(season);
  app.heroes.setSeason(season);
  U.snow.value = season === 2 ? 1 : 0;
  U.season.value = season;
  app.M.grass.color.set(season === 1 ? '#e2d6a0' : '#ffffff');
  app.ground.waterMat.uniforms.uFrozen.value = season === 2 ? 1 : 0;
  app.fountains.mat.uniforms.uOn.value = season === 2 ? 0 : s.fountains ? 1 : 0;
  app.snow.pts.visible = season === 2;
  applyTime();
}
app.applySeason = applySeason;

// ---------------------------------------------------------------------------
function setStartView() {
  // The couple by the reflecting pool, the whole of Bayterek rising behind them.
  const c = app.heroes.center;
  app.rig.setLens(18);
  app.rig.setOrbit(new THREE.Vector3(c.x - 40, 15.5, c.z - 3.6), new THREE.Vector3(c.x + 15, 1.5, c.z + 1.6), true);
}

const VIEWS = {
  heroes: () => { const c = app.heroes.center; const h = app.heroes.heading; return { pos: new THREE.Vector3(c.x + Math.sin(h) * 4.6 + Math.cos(h) * 0.6, c.y + 1.6, c.z + Math.cos(h) * 4.6), look: c.clone().add(new THREE.Vector3(0, 1.45, 0)), lens: 35 }; },
  east: () => ({ pos: new THREE.Vector3(150, 2.2, 13), look: new THREE.Vector3(0, 42, 0), lens: 24 }),
  west: () => ({ pos: new THREE.Vector3(-150, 2.2, -13), look: new THREE.Vector3(0, 42, 0), lens: 24 }),
  base: () => ({ pos: new THREE.Vector3(15, 1.65, 23), look: new THREE.Vector3(0, 62, 0), lens: 14 }),
  plaza: () => ({ pos: new THREE.Vector3(62, 16, 56), look: new THREE.Vector3(0, 30, 0), lens: 24 }),
  drone: () => ({ pos: new THREE.Vector3(430, 150, 170), look: new THREE.Vector3(0, 30, 0), lens: 35 }),
  deck: () => ({ pos: new THREE.Vector3(9.4, SPHERE.y + 3, 0.5), look: new THREE.Vector3(600, 10, 0), lens: 24 }),
  akorda: () => ({ pos: new THREE.Vector3(EAST_END - 70, 3, 46), look: new THREE.Vector3(EAST_END + 150, 40, 0), lens: 24 }),
  khanshatyr: () => ({ pos: new THREE.Vector3(WEST_END + 60, 3, 80), look: new THREE.Vector3(-1190, 55, 0), lens: 24 }),
  arch: () => ({ pos: new THREE.Vector3(ARCH_X + 170, 2, 9), look: new THREE.Vector3(ARCH_X, 38, 0), lens: 28 }),
};
app.VIEWS = VIEWS;

// Smooth camera flight to a pose (used by viewpoints and the intro).
app.flyTo = (name, dur = 2.2) => {
  const v = typeof name === 'string' ? VIEWS[name]() : name;
  app.director.stop(false);
  if (app.rig.mode !== 'orbit' && app.rig.mode !== 'follow') app.rig.setMode('orbit');
  if (app.rig.mode === 'follow') app.rig.setMode('orbit');
  const cam = app.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  app.intro = {
    t: 0, dur,
    fromPos: cam.position.clone(), fromLook: cam.position.clone().addScaledVector(dir, Math.max(10, app.rig.cur.radius)),
    toPos: v.pos, toLook: v.look, fromLens: app.rig.lens, toLens: v.lens,
  };
  app.rig.external = true;
};

function updateIntro(dt) {
  const I = app.intro;
  if (!I) return;
  I.t += dt;
  const u = clamp(I.t / I.dur, 0, 1);
  const e = easeInOutSine(u);
  const pos = I.fromPos.clone().lerp(I.toPos, e);
  // arc upward a bit on long flights
  const dist = I.fromPos.distanceTo(I.toPos);
  pos.y += Math.sin(Math.PI * e) * Math.min(80, dist * 0.18);
  const look = I.fromLook.clone().lerp(I.toLook, e);
  app.camera.position.copy(pos);
  app.camera.lookAt(look);
  app.rig.setLens(lerp(I.fromLens, I.toLens, e));
  if (u >= 1) {
    app.intro = null;
    app.rig.external = false;
    app.rig.setOrbit(I.toLook, I.toPos, true);
    if (I.then) I.then();
  }
}

app.enter = (mode) => {
  $('#loader').classList.add('done');
  setTimeout(() => $('#loader').remove(), 700);
  if (mode === 'walk') {
    app.rig.setMode('walk');
    app.hub.emit('mode', 'walk');
  }
  app.canvas.focus();
};

// ---------------------------------------------------------------------------
const tmpV = new THREE.Vector3();
function renderFrame(dt) {
  const { renderer, scene, camera, sky } = app;
  sky.update(camera);
  sky.updateEnv();
  // shadow focus: what the camera is looking at
  let focus, dist;
  if (!app.rig.external && (app.rig.mode === 'orbit' || app.rig.mode === 'follow')) {
    focus = app.rig.cur.target.clone();
    dist = app.rig.cur.radius;
  } else {
    camera.getWorldDirection(tmpV);
    const along = clamp(camera.position.y * 1.2 + 25, 25, 140);
    focus = camera.position.clone().addScaledVector(tmpV, along);
    dist = along + camera.position.y * 0.5;
  }
  focus.y = clamp(focus.y, 0, 60);
  sky.updateShadow(focus, dist);
  renderer.shadowMap.enabled = app.state.shadows;
  renderer.shadowMap.needsUpdate = true;
  app.bayterek.updateEnvironment(renderer, scene);
  // The mirror pass only pays off when pools are near enough to see their reflections.
  const cp = camera.position;
  const poolDist = Math.max(0, Math.abs(cp.z) - 5) + Math.max(0, 74 - Math.abs(cp.x)) + Math.max(0, Math.abs(cp.x) - 990);
  const mirrorOn = app.state.reflect && app.mirror.enabled && poolDist < 380 && cp.y < 160;
  app.ground.waterMat.uniforms.uMirror.value = mirrorOn ? 1 : 0;
  if (mirrorOn) app.mirror.render(camera);
  app.composer.render(dt);
}
app.renderFrame = renderFrame;
app.step = (dt = 1 / 30) => step(dt);

let fpsAcc = 0, fpsN = 0;
const clock = new THREE.Clock();
function loop() {
  step(Math.min(clock.getDelta(), 0.05));
}
// One simulation + render step (also used by tests to render deterministically).
function step(dt) {
  app.dt = dt;
  app.time += dt;
  U.time.value = app.time;
  updateIntro(dt);
  app.director.update(dt, app.time);
  app.heroes.update(dt, app.time, app.camera);
  const c = app.heroes.center;
  app.rig.update(dt, c.add(new THREE.Vector3(0, 1.2, 0)));
  app.crowdSim.update(dt, app.time, app.camera);
  if (app.state.cars) app.traffic.update(dt);
  if (app.snow.pts.visible) app.snow.mat.uniforms.uCam.value.copy(app.camera.position);
  renderFrame(dt);
  // recording composite
  if (app.director.recording) {
    app.recordCtx.drawImage(app.renderer.domElement, 0, 0, app.recordCanvas.width, app.recordCanvas.height);
    if (app.state.burnLabels) drawLabels(app.recordCtx, app.recordCanvas.width, app.recordCanvas.height);
  }
  app.ui.frame(dt);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { app.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
}

// ---------------------------------------------------------------------------
// Labels drawn into an exported image or video.
function drawLabels(g, W, H) {
  app.heroes.list.forEach((h, i) => {
    const p = app.heroes.headPos(i).add(new THREE.Vector3(0, 0.55, 0)).project(app.camera);
    if (p.z > 1) return;
    const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
    const info = HERO_INFO[i];
    const text = `${info.id} · ${info.ru}`;
    const fs = Math.round(H / 44);
    g.font = `600 ${fs}px Rubik, system-ui, sans-serif`;
    const tw = g.measureText(text).width;
    g.fillStyle = 'rgba(10,14,20,.8)';
    g.beginPath(); g.roundRect(x - tw / 2 - fs * 0.6, y - fs * 1.6, tw + fs * 1.2, fs * 1.5, fs * 0.75); g.fill();
    g.fillStyle = info.color;
    g.textAlign = 'center';
    g.fillText(text, x, y - fs * 0.55);
  });
}

async function toBlob(canvas) { return new Promise((r) => canvas.toBlob(r, 'image/png')); }

function withState(opts, fn) {
  const H = app.heroes;
  const saved = { markers: H.showMarkers, crowd: app.crowd.group.visible, heroes: H.list[0].group.visible };
  if (opts.markers !== undefined) H.setMarkers(opts.markers);
  if (opts.people !== undefined) app.crowd.group.visible = opts.people;
  if (opts.heroes !== undefined) H.setVisible(opts.heroes);
  try { return fn(); } finally {
    H.setMarkers(saved.markers);
    app.crowd.group.visible = saved.crowd;
    H.setVisible(saved.heroes);
  }
}

app.captureFrame = async ({ markers = false, labels = false, people = true, heroes = true, res = app.state.stillRes } = {}) => {
  const [W, H] = dimsFor(res);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d');
  withState({ markers, people, heroes }, () => {
    app.setRenderSize(res);
    app.bayterek.envDirty = true;
    renderFrame(0);
    g.drawImage(app.renderer.domElement, 0, 0, W, H);
    if (labels) drawLabels(g, W, H);
  });
  app.setRenderSize(null);
  return toBlob(out);
};

app.capturePlates = async () => {
  const blobs = [];
  const cam = app.camera;
  const saved = { pos: cam.position.clone(), q: cam.quaternion.clone(), lens: app.rig.lens, ext: app.rig.external };
  app.rig.external = true;
  for (const name of ['east', 'west', 'plaza', 'drone']) {
    const v = VIEWS[name]();
    cam.position.copy(v.pos); cam.lookAt(v.look);
    app.rig.setLens(v.lens);
    blobs.push(await app.captureFrame({ markers: false, people: false, heroes: false }));
  }
  cam.position.copy(saved.pos); cam.quaternion.copy(saved.q);
  app.rig.setLens(saved.lens);
  app.rig.external = saved.ext;
  return blobs;
};

// Red = man, blue = woman, black elsewhere, with correct occlusion by the scene.
app.captureMask = async () => {
  const { scene, renderer } = app;
  const [W, H] = dimsFor(app.state.stillRes);
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const red = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x0000ff });
  const saved = new Map();
  const heroMeshes = new Map();
  app.heroes.list.forEach((h, i) => h.group.traverse((o) => { if (o.isMesh) heroMeshes.set(o, i ? blue : red); }));
  const hidden = [];
  scene.traverse((o) => {
    if (o.isPoints || o.isSprite || o === app.sky.sky || o === app.sky.clouds) { if (o.visible) { hidden.push(o); o.visible = false; } return; }
    if (o.isMesh) { saved.set(o, o.material); o.material = heroMeshes.get(o) || black; }
  });
  app.heroes.markers.forEach((m) => { if (m.visible) { hidden.push(m); m.visible = false; } });
  const fog = scene.fog, bg = scene.background, tm = renderer.toneMapping;
  scene.fog = null; scene.background = new THREE.Color(0x000000);
  renderer.toneMapping = THREE.NoToneMapping;
  app.setRenderSize(app.state.stillRes);
  renderer.setRenderTarget(null);
  renderer.render(scene, app.camera);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.getContext('2d').drawImage(renderer.domElement, 0, 0, W, H);
  for (const [o, m] of saved) o.material = m;
  hidden.forEach((o) => (o.visible = true));
  scene.fog = fog; scene.background = bg; renderer.toneMapping = tm;
  app.setRenderSize(null);
  return toBlob(out);
};

app.quickShot = async () => {
  const blob = await app.captureFrame({ markers: app.heroes.showMarkers, labels: app.state.labels });
  download(blob, `astana-bayterek-${stamp()}.png`);
  app.toast('Кадр сохранён');
};

app.toast = (msg, ms = 2600) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(app._toastT);
  app._toastT = setTimeout(() => t.classList.remove('on'), ms);
};

init().catch((e) => {
  console.error(e);
  $('#msg').textContent = `Ошибка: ${e.message}. Нужен браузер с WebGL2 (Chrome, Safari 16.4+, Firefox).`;
  $('#msg').style.color = '#ff9aa5';
});

export { app, groundY };
