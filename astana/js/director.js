// Director: preset camera shots choreographed with the heroes, custom keyframe paths,
// real-time video recording (MP4 where the browser can, WebM otherwise) and the
// Seedance export pack (frames, character sheets, clean plates, prompt, scene JSON).
import * as THREE from 'three';
import { clamp, easeInOutSine, download, stamp } from './util.js';
import { SPHERE, PLACE, groundY } from './layout.js';
import { HERO_INFO } from './heroes.js';
import { zip } from './zip.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Each shot: duration, hero action, camera(t∈0..1) → {pos, look, lens}. Positions are
// built in the couple's frame: f = forward (where they face), r = their right, c = centre.
export const SHOTS = [
  {
    id: 'reels', ru: 'Рилс 9:16 · 10 с: прогулка к Байтереку', en: 'Reels 9:16 · 10 s: walk to Bayterek', dur: 10,
    aspect: '9:16', hour: 19.7, reels: true,
    timeline: [[0, 'walkToTower', { distance: 5.6, speed: 1.1 }], [5.4, 'point'], [8.2, 'lookUp']],
    moveRu: 'вертикальный кадр: камера идёт за парой, облетает их спереди, когда она показывает на шар, и краном поднимается к золотому шару в золотой час',
    moveEn: 'vertical frame: the camera follows the couple from behind, arcs round to their front as she points at the sphere, then cranes up to the golden sphere at golden hour',
    cam(t, k, live) {
      const sm = (a, b, x) => { const v = clamp((x - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); };
      const c = live.c, f = live.f, r = live.r;
      // angle around the couple from their facing direction: π = right behind them
      const a = Math.PI - sm(0.3, 0.58, t) * Math.PI * 0.42 + sm(0.64, 1, t) * Math.PI * 0.36;
      const rad = 3.3 + Math.pow(sm(0.64, 1, t), 1.3) * 19;
      const dir = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(r, Math.sin(a));
      const pos = c.clone().addScaledVector(dir, rad);
      pos.y = c.y + 1.3 + sm(0.64, 1, t) * 1.4;
      const ahead = c.clone().addScaledVector(f, 30).add(V(0, 16, 0));
      const faces = c.clone().add(V(0, 1.5, 0)).addScaledVector(f, 2);
      const tower = V(0, 44, 0);
      const look = ahead.clone().lerp(faces, sm(0.3, 0.55, t) * 0.7).lerp(tower, sm(0.64, 1, t));
      return { pos, look, lens: 24 };
    },
  },
  {
    id: 'establish', ru: 'Общий план: башня и пара', en: 'Establishing wide: tower and couple', dur: 8, action: 'lookUp',
    moveRu: 'медленный подъём камеры от уровня глаз вверх, Байтерек целиком в кадре', moveEn: 'slow crane up from eye level, the whole Bayterek tower in frame',
    cam(t, k) { const back = k.c.clone().addScaledVector(k.away, 34).addScaledVector(k.side, 9); back.y = 1.6 + t * 9; return { pos: back, look: V(0, 38 + t * 10, 0).lerp(k.c, 0.15), lens: 24 }; },
  },
  {
    id: 'dollyIn', ru: 'Наезд на героев', en: 'Dolly in on the couple', dur: 7, action: 'idle', face: 'camera',
    moveRu: 'плавный наезд камеры от среднего плана к крупному, башня на фоне', moveEn: 'smooth dolly-in from a medium-wide to a medium close-up, tower in the background',
    cam(t, k) { const d = 9 - 5.5 * t; const p = k.c.clone().addScaledVector(k.fFace, d).addScaledVector(k.side, 0.4); p.y += 1.55; return { pos: p, look: k.c.clone().add(V(0, 1.45, 0)), lens: 50 }; },
  },
  {
    id: 'orbit', ru: 'Облёт вокруг пары', en: 'Orbit around the couple', dur: 10, action: 'talk',
    moveRu: 'камера облетает пару по дуге 200°, герои разговаривают', moveEn: 'camera arcs 200° around the couple while they talk',
    cam(t, k) { const a = k.h0 + Math.PI * 0.2 + t * Math.PI * 1.1; const p = k.c.clone().add(V(Math.sin(a) * 5.5, 1.7, Math.cos(a) * 5.5)); return { pos: p, look: k.c.clone().add(V(0, 1.3, 0)), lens: 35 }; },
  },
  {
    id: 'craneUp', ru: 'Кран: от героев к шару', en: 'Crane up from the couple to the sphere', dur: 9, action: 'point',
    moveRu: 'камера стартует за спинами героев и поднимается вверх, наклоняясь к золотому шару', moveEn: 'camera starts behind the couple and cranes up, tilting toward the golden sphere',
    cam(t, k) {
      const e = easeInOutSine(t);
      const p = k.c.clone().addScaledVector(k.away, 4.5 - e * 1.5).addScaledVector(k.side, 1.2);
      p.y = 1.7 + e * 26;
      const look = k.c.clone().add(V(0, 1.4, 0)).lerp(V(0, SPHERE.y, 0), e);
      return { pos: p, look, lens: 28 };
    },
  },
  {
    id: 'tracking', ru: 'Проводка сбоку: идут к Байтереку', en: 'Side tracking: walking to Bayterek', dur: 10, action: 'walkToTower', prePlace: 30,
    moveRu: 'боковая проводка камеры параллельно идущей паре, держатся за руки', moveEn: 'lateral tracking shot alongside the couple walking hand in hand',
    cam(t, k, live) { const c = live.c; const p = c.clone().addScaledVector(live.r, -6.5).addScaledVector(live.f, 1.2); p.y += 1.5; return { pos: p, look: c.clone().add(V(0, 1.3, 0)).addScaledVector(live.f, 0.8), lens: 40 }; },
  },
  {
    id: 'follow', ru: 'Со спины: идут к башне', en: 'Follow from behind toward the tower', dur: 10, action: 'walkToTower', prePlace: 30,
    moveRu: 'камера следует за парой со спины на уровне плеч, башня впереди растёт в кадре', moveEn: 'camera follows the couple from behind at shoulder height, the tower growing ahead',
    cam(t, k, live) { const c = live.c; const p = c.clone().addScaledVector(live.f, -4.2).addScaledVector(live.r, 0.5); p.y += 1.65; return { pos: p, look: c.clone().addScaledVector(live.f, 30).add(V(0, 12, 0)), lens: 28 }; },
  },
  {
    id: 'frontWalk', ru: 'Встречная: идут на камеру', en: 'Leading shot: walking toward camera', dur: 9, action: 'walkAway', prePlace: 0,
    moveRu: 'камера отъезжает назад перед идущей парой, Байтерек позади них', moveEn: 'camera backs away in front of the couple as they walk, Bayterek behind them',
    cam(t, k, live) { const c = live.c; const p = c.clone().addScaledVector(live.f, 4.8); p.y += 1.55; return { pos: p, look: c.clone().add(V(0, 1.7, 0)).lerp(V(0, 40, 0), 0.04), lens: 35 }; },
  },
  {
    id: 'selfie', ru: 'Селфи на фоне башни', en: 'Selfie with the tower behind', dur: 7, action: 'selfie',
    moveRu: 'статичная камера на уровне телефона, лёгкое покачивание, башня за спинами', moveEn: 'near-static camera at phone height with slight handheld sway, tower behind them',
    cam(t, k, live, time) { const p = k.c.clone().addScaledVector(k.fFace, 1.5).addScaledVector(k.side, 0.35); p.y += 1.85 + Math.sin(time * 1.3) * 0.02; p.x += Math.sin(time * 0.9) * 0.02; return { pos: p, look: k.c.clone().add(V(0, 1.55, 0)).lerp(V(0, 60, 0), 0.012), lens: 24 }; },
  },
  {
    id: 'drone', ru: 'Дрон: отлёт и подъём', en: 'Drone pull-back reveal', dur: 12, action: 'wave', face: 'camera',
    moveRu: 'дрон отлетает назад и вверх от машущей пары, открывая весь бульвар Нуржол и Байтерек', moveEn: 'drone pulls back and rises from the waving couple, revealing Nurzhol Boulevard and Bayterek',
    cam(t, k) { const e = easeInOutSine(t); const p = k.c.clone().addScaledVector(k.fFace, 6 + e * 70).addScaledVector(k.side, e * 12); p.y = 2.2 + e * 62; return { pos: p, look: k.c.clone().add(V(0, 1.4, 0)).lerp(V(0, 45, 0), e * 0.85), lens: 24 }; },
  },
  {
    id: 'ots', ru: 'Через плечо (восьмёрка)', en: 'Over-the-shoulder', dur: 6, action: 'talk',
    moveRu: 'кадр через плечо мужчины на женщину, затем лёгкий сдвиг', moveEn: 'over-the-man’s-shoulder framing on the woman, gentle push',
    cam(t, k, live) {
      const m = live.m, w = live.w;
      const dir = new THREE.Vector3(w.x - m.x, 0, w.z - m.z).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const p = new THREE.Vector3(m.x, groundY(m.x, m.z) + 1.72, m.z).addScaledVector(dir, -0.9 + t * 0.25).addScaledVector(side, 0.45);
      return { pos: p, look: new THREE.Vector3(w.x, groundY(w.x, w.z) + 1.5, w.z), lens: 50 };
    },
  },
];

export class Director {
  constructor(app) {
    this.app = app;
    this.playing = null;
    this.keys = [];
    this.duration = 8;
    this.recording = null;
    this.recordRes = 720;
    this.fps = 24;
  }

  frameOfCouple() {
    const H = this.app.heroes;
    const c = H.center;
    const h = H.heading;
    const f = V(Math.sin(h), 0, Math.cos(h));
    const r = V(-Math.cos(h), 0, Math.sin(h));
    const toTower = V(-c.x, 0, -c.z).normalize();
    const away = toTower.clone().negate();
    const side = V(-toTower.z, 0, toTower.x);
    return { c, h0: h, f, r, toTower, away, side, fFace: away.clone() };
  }

  liveFrame() {
    const H = this.app.heroes;
    const [m, w] = H.list.map((x) => x.state);
    const c = H.center;
    const h = H.heading;
    return { c, f: V(Math.sin(h), 0, Math.cos(h)), r: V(-Math.cos(h), 0, Math.sin(h)), m, w };
  }

  playShot(id, { record = false, duration = null } = {}) {
    const shot = SHOTS.find((s) => s.id === id);
    if (!shot) return;
    const H = this.app.heroes;
    this.stop(false);
    const dur = duration || shot.dur;
    // put the couple where the move needs them
    if (shot.aspect && this.app.state.aspect !== shot.aspect) { this.app.state.aspect = shot.aspect; this.app.layout(); this.app.hub.emit('aspect', shot.aspect); }
    if (shot.hour !== undefined) { this.app.state.hour = shot.hour; this.app.applyTime(); this.app.ui?.time?.set(shot.hour); }
    if (shot.reels) {
      // on the plaza east of the tower, facing it, clear of the pools
      H.place(54, 1.2 + 0.34, -Math.PI / 2);
      this.app.crowdSim.build();
    }
    if (shot.prePlace !== undefined) {
      const c = H.center;
      const d = Math.max(36, Math.hypot(c.x, c.z));
      const dir = V(c.x, 0, c.z).normalize();
      if (dir.lengthSq() < 0.5) dir.set(1, 0, 0);
      const start = shot.id === 'frontWalk' ? 36 : Math.min(d + 4, 36 + dur * 1.15);
      const p = dir.multiplyScalar(start);
      const towerHeading = Math.atan2(-p.x, -p.z);
      H.place(p.x - Math.cos(towerHeading) * -0.34, p.z + Math.sin(towerHeading) * -0.34, shot.id === 'frontWalk' ? towerHeading + Math.PI : towerHeading);
    }
    const k = this.frameOfCouple();
    if (shot.timeline) H.setAction(shot.timeline[0][1], shot.timeline[0][2] || {});
    else if (shot.face === 'camera') H.setAction(shot.action, { face: Math.atan2(k.away.x, k.away.z) });
    else if (shot.id === 'tracking' || shot.id === 'follow') H.setAction('walkToTower', { distance: 6, speed: 1.15 });
    else if (shot.id === 'frontWalk') H.setAction('walkAway');
    else H.setAction(shot.action);
    this.playing = { kind: 'shot', shot, t: 0, dur, k, smooth: null };
    this.lastShotId = shot.id;
    this.app.rig.external = true;
    if (record) this.startRecording(dur);
    this.app.hub.emit('director', 'play', shot);
  }

  addKey() {
    const c = this.app.camera;
    const dir = new THREE.Vector3();
    c.getWorldDirection(dir);
    this.keys.push({ pos: c.position.clone(), look: c.position.clone().addScaledVector(dir, 20), lens: this.app.rig.lens });
    this.app.hub.emit('keys', this.keys);
  }
  clearKeys() { this.keys = []; this.app.hub.emit('keys', this.keys); }
  removeKey(i) { this.keys.splice(i, 1); this.app.hub.emit('keys', this.keys); }
  gotoKey(i) {
    const k = this.keys[i];
    if (!k) return;
    this.stop(false);
    this.app.rig.setLens(k.lens);
    this.app.rig.setOrbit(k.look, k.pos, true);
    if (this.app.rig.mode !== 'orbit') this.app.rig.setMode('orbit');
    this.app.rig.setOrbit(k.look, k.pos, true);
  }

  playKeys({ record = false } = {}) {
    if (this.keys.length < 2) return false;
    this.stop(false);
    const pts = this.keys.map((k) => k.pos);
    const looks = this.keys.map((k) => k.look);
    this.playing = {
      kind: 'keys', t: 0, dur: this.duration,
      posC: new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
      lookC: new THREE.CatmullRomCurve3(looks, false, 'centripetal'),
      lenses: this.keys.map((k) => k.lens),
    };
    this.app.rig.external = true;
    if (record) this.startRecording(this.duration);
    this.app.hub.emit('director', 'play', null);
    return true;
  }

  stop(sync = true) {
    if (!this.playing) return;
    this.playing = null;
    this.app.rig.external = false;
    if (sync) this.app.rig.syncFromCamera();
    this.app.hub.emit('director', 'stop');
  }

  update(dt, time) {
    const P = this.playing;
    if (!P) return;
    P.t += dt;
    const u = clamp(P.t / P.dur, 0, 1);
    const cam = this.app.camera;
    let pos, look, lens;
    if (P.kind === 'shot' && P.shot.timeline) {
      P.fired = P.fired || 1;
      while (P.fired < P.shot.timeline.length && P.t >= P.shot.timeline[P.fired][0]) {
        const [, act, opts] = P.shot.timeline[P.fired++];
        this.app.heroes.setAction(act, opts || {});
      }
    }
    if (P.kind === 'shot') {
      const r = P.shot.cam(easeInOutSine(u) * 0.15 + u * 0.85, P.k, this.liveFrame(), time);
      pos = r.pos; look = r.look; lens = r.lens;
    } else {
      const e = easeInOutSine(u);
      pos = P.posC.getPoint(e); look = P.lookC.getPoint(e);
      const li = e * (P.lenses.length - 1);
      const i0 = Math.floor(li), i1 = Math.min(P.lenses.length - 1, i0 + 1);
      lens = P.lenses[i0] + (P.lenses[i1] - P.lenses[i0]) * (li - i0);
    }
    // keep above ground
    pos.y = Math.max(pos.y, groundY(pos.x, pos.z) + 0.3);
    // light smoothing so live-follow shots don't jitter
    if (!P.smooth) P.smooth = { pos: pos.clone(), look: look.clone() };
    const k = 1 - Math.exp(-dt * 10);
    P.smooth.pos.lerp(pos, P.t < 0.05 ? 1 : k);
    P.smooth.look.lerp(look, P.t < 0.05 ? 1 : k);
    cam.position.copy(P.smooth.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(P.smooth.look);
    if (Math.abs(this.app.rig.lens - lens) > 0.05) this.app.rig.setLens(lens);
    if (u >= 1) {
      if (this.recording) this.stopRecording();
      this.app.rig.lastTarget = P.smooth.look.clone();
      this.stop(true);
    }
  }

  // ---------------- recording ----------------
  pickMime() {
    const cands = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4d0028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return cands.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  startRecording(seconds = 10) {
    if (!window.MediaRecorder) { this.app.toast('Браузер не поддерживает запись видео (MediaRecorder).'); return; }
    if (this.recording) this.stopRecording();
    const app = this.app;
    app.setRenderSize(this.recordRes);
    const out = app.recordCanvas;
    const stream = out.captureStream(this.fps);
    const mime = this.pickMime();
    const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: this.recordRes >= 1080 ? 16e6 : 9e6 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type });
      this.lastVideo = { blob, name: `astana-bayterek-${this.lastShotId || 'take'}-${stamp()}.${ext}` };
      download(blob, this.lastVideo.name);
      app.setRenderSize(null);
      app.hub.emit('record', false);
      const fps = this.recFrames / Math.max(0.1, (performance.now() - this.recT0) / 1000);
      app.toast(fps < 20
        ? `Видео сохранено, но кадров было мало (${fps.toFixed(0)} fps). Для плавности снизьте качество или выберите 720p.`
        : `Видео сохранено: ${this.lastVideo.name}`, 4200);
    };
    this.lastShotId = this.playing?.shot?.id || (this.playing?.kind === 'keys' ? 'keys' : this.lastShotId || 'live');
    rec.start(250);
    this.recFrames = 0;
    this.recT0 = performance.now();
    this.recording = { rec, t0: performance.now(), max: seconds };
    app.hub.emit('record', true);
  }

  stopRecording() {
    if (!this.recording) return;
    const r = this.recording;
    this.recording = null;
    if (r.rec.state !== 'inactive') r.rec.stop();
  }

  tickRecording() {
    if (!this.recording) return 0;
    this.recFrames++;
    const el = (performance.now() - this.recording.t0) / 1000;
    if (el >= this.recording.max + 0.15 && !this.playing) this.stopRecording();
    return el;
  }

  // ---------------- prompt ----------------
  prompt(lang = 'en', { shotId = null, refs = null } = {}) {
    const app = this.app;
    const sky = app.sky;
    const hour = sky.state.hour;
    const night = sky.night;
    const elDeg = THREE.MathUtils.radToDeg(sky.el);
    const season = ['summer', 'autumn', 'winter'][app.state.season];
    const seasonRu = ['лето', 'осень', 'зима'][app.state.season];
    const tod = night > 0.6 ? ['night, the tower and boulevard illuminated', 'ночь, башня и бульвар в подсветке']
      : elDeg < 4 ? ['sunset / blue hour, warm low sun', 'закат, низкое тёплое солнце']
        : elDeg < 14 ? ['golden hour, long soft shadows', 'золотой час, длинные мягкие тени']
          : hour < 11 ? ['clear morning light', 'чистый утренний свет'] : ['bright daylight, crisp shadows', 'яркий дневной свет, чёткие тени'];
    const lens = Math.round(app.rig.lens);
    const shot = SHOTS.find((s) => s.id === (shotId || this.lastShotId)) || null;
    const aspect = app.state.aspect === 'free' ? '16:9' : app.state.aspect;
    const [A, B] = HERO_INFO;
    const act = app.heroes.action;
    const actEn = { idle: 'stand together holding hands', walkToTower: 'walk hand in hand toward the tower', walkAway: 'walk hand in hand toward the camera', lookUp: 'look up at the golden sphere', point: 'she points up at the sphere, he follows her gaze', selfie: 'take a selfie together, the tower behind them', talk: 'talk and laugh facing each other', wave: 'wave at the camera', hug: 'hug', pose: 'pose for a photo', drive: 'walk across the plaza', stroll: 'stroll along the boulevard' }[act] || 'stand together';
    const actRu = { idle: 'стоят рядом, держась за руки', walkToTower: 'идут к башне, держась за руки', walkAway: 'идут на камеру, держась за руки', lookUp: 'смотрят вверх на золотой шар', point: 'она показывает на шар, он смотрит туда же', selfie: 'делают селфи на фоне башни', talk: 'разговаривают и смеются лицом друг к другу', wave: 'машут в камеру', hug: 'обнимаются', pose: 'позируют для фото', drive: 'идут по площади', stroll: 'гуляют по бульвару' }[act] || 'стоят рядом';
    const r = refs || this.refs();
    if (lang === 'ru') {
      return [
        `Фотореалистичное кино-видео. Место: ${PLACE.ru}. ${seasonRu[0].toUpperCase() + seasonRu.slice(1)}, ${tod[1]}, локальное время ${sky.label()}.`,
        `Главные герои: мужчина (${r.man}) — ${A.descRu}; женщина (${r.woman}) — ${B.descRu}. Сохраняй их лица, причёски и одежду точно как на референсах; превращай блочных персонажей в реальных людей с естественными пропорциями.`,
        `Действие: ${actRu}.`,
        shot ? `Камера: ${shot.moveRu}; объектив ${lens} мм${r.video ? `; повторяй движение камеры и расстановку из ${r.video}` : ''}.` : `Камера: объектив ${lens} мм, композиция как на ${r.start}.`,
        `Окружение: монумент «Байтерек» — белый ствол из стальных колонн, раскрывающийся кроной вокруг зеркального золотого шара (высота 105 м), гранитная площадь с казахским орнаментом, бассейны с фонтанами, газоны, ели, фонари и флаги Казахстана, на горизонте Ак Орда, золотые башни и Хан Шатыр. Используй ${r.plates} для архитектуры, ${r.clean} — как пустой фон, ${r.start} — как первый кадр.`,
        `Прохожие на заднем плане — обычные люди в повседневной одежде. Без текста, без логотипов, реалистичные тени и отражения в воде. Формат ${aspect}, 24 к/с.`,
      ].join('\n\n');
    }
    return [
      `Photorealistic cinematic video. Location: ${PLACE.en}. ${season[0].toUpperCase() + season.slice(1)}, ${tod[0]}, local time ${sky.label()}.`,
      `Lead characters: the man (${r.man}) — ${A.descEn}; the woman (${r.woman}) — ${B.descEn}. Keep their faces, hair and outfits exactly as in the references; turn the blocky reference figures into real people with natural proportions.`,
      `Action: they ${actEn}.`,
      shot ? `Camera: ${shot.moveEn}; ${lens}mm lens${r.video ? `; match the camera move and blocking of ${r.video}` : ''}.` : `Camera: ${lens}mm lens, framing as in ${r.start}.`,
      `Setting: the Bayterek monument — a white trunk of steel columns flaring into a crown that cradles a mirrored golden glass sphere (105 m tall), granite plaza with Kazakh ornament, reflecting pools with fountains, lawns, blue spruces, lamp posts and Kazakhstan flags; Ak Orda, the golden towers and Khan Shatyr on the skyline. Use ${r.plates} for the architecture, ${r.clean} as the empty background plate and ${r.start} as the opening frame.`,
      `Background passers-by are ordinary people in everyday clothes. No text, no logos, realistic shadows and water reflections. Aspect ${aspect}, 24 fps.`,
    ].join('\n\n');
  }

  refs() {
    return { man: '@Image1', woman: '@Image2', couple: '@Image3', start: '@Image4', clean: '@Image5', plates: '@Image6–@Image9', video: this.lastVideo ? '@Video1' : null };
  }

  sceneJSON() {
    const app = this.app;
    return {
      app: 'astana-bayterek-reference',
      version: 1,
      created: new Date().toISOString(),
      place: PLACE,
      time: { hour: app.sky.state.hour, dayOfYear: app.sky.state.doy, season: app.state.season, cloud: app.sky.state.cloud },
      camera: app.rig.serialize(),
      aspect: app.state.aspect,
      heroes: app.heroes.serialize(),
      action: app.heroes.action,
      crowd: app.crowdSim.density,
      style: app.state.style,
      keys: this.keys.map((k) => ({ pos: k.pos.toArray(), look: k.look.toArray(), lens: k.lens })),
      characters: HERO_INFO.map(({ id, ru, en, name, descRu, descEn }) => ({ id, ru, en, name, descRu, descEn })),
    };
  }

  // Build the full Seedance pack as a ZIP.
  async exportPack(onProgress = () => {}) {
    const app = this.app;
    const files = [];
    const add = async (name, blob) => files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
    onProgress('Кадр…');
    await add('04_start_frame.png', await app.captureFrame({ markers: false }));
    onProgress('Листы персонажей…');
    await add('01_man_A_sheet.png', await app.sheets.render(0));
    await add('02_woman_B_sheet.png', await app.sheets.render(1));
    await add('03_couple_sheet.png', await app.sheets.render(-1));
    onProgress('Чистый план…');
    await add('05_clean_plate.png', await app.captureFrame({ markers: false, people: false, heroes: false }));
    onProgress('Планы локации…');
    const plates = await app.capturePlates();
    for (let i = 0; i < plates.length; i++) await add(`0${6 + i}_location_plate_${i + 1}.png`, plates[i]);
    onProgress('Маска героев…');
    await add('10_heroes_mask.png', await app.captureMask());
    const enc = new TextEncoder();
    const refs = this.refs();
    files.push({ name: 'prompt_en.txt', data: enc.encode(this.prompt('en', { refs })) });
    files.push({ name: 'prompt_ru.txt', data: enc.encode(this.prompt('ru', { refs })) });
    files.push({ name: 'scene.json', data: enc.encode(JSON.stringify(this.sceneJSON(), null, 2)) });
    files.push({ name: 'README.txt', data: enc.encode(packReadme()) });
    if (this.lastVideo) await add('11_camera_reference.' + this.lastVideo.name.split('.').pop(), this.lastVideo.blob);
    onProgress('Упаковка…');
    files.sort((a, b) => a.name.localeCompare(b.name));
    const blob = zip(files);
    download(blob, `seedance-pack-astana-${stamp()}.zip`);
    onProgress(null);
  }
}

function packReadme() {
  return `Seedance 2.5 reference pack — Astana, Bayterek
=================================================

Upload order (keeps @-references in prompt_en.txt valid):
  @Image1  01_man_A_sheet.png        man (A): front / 3-4 / side / back
  @Image2  02_woman_B_sheet.png      woman (B): front / 3-4 / side / back
  @Image3  03_couple_sheet.png       both together, scale reference
  @Image4  04_start_frame.png        opening frame (composition, light)
  @Image5  05_clean_plate.png        the same frame without any people
  @Image6–@Image9  location plates   Bayterek & boulevard from 4 sides, no people
  @Video1  11_camera_reference.*     camera move + blocking (only if you recorded a take)
  10_heroes_mask.png                 optional: red = man, blue = woman

Seedance 2.5 limits (third-party docs, Oct 2026): up to 30 images, 10 videos,
10 audio per generation; reference videos 1.8–30 s, total video ≤ 30 s;
output 4–30 s, 24 fps; aspect 16:9 · 9:16 · 1:1 · 4:3 · 3:4 · 21:9.
If your platform only accepts MP4 and the clip is WebM, convert it first.
`;
}
