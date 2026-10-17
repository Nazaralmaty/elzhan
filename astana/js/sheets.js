// Character reference sheets: each hero rendered in a neutral studio from four angles
// (front, three-quarter, side, back) with an orthographic camera — the identity
// references Seedance needs to keep faces and outfits consistent.
import * as THREE from 'three';
import { emptyPose } from './people.js';
import { HERO_INFO } from './heroes.js';

const VIEWS = [
  { ru: 'спереди', en: 'front', a: 0 },
  { ru: '3/4', en: '3/4', a: -Math.PI / 4 },
  { ru: 'сбоку', en: 'side', a: -Math.PI / 2 },
  { ru: 'сзади', en: 'back', a: Math.PI },
];

export class Sheets {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#d8dade');
    const key = new THREE.DirectionalLight('#fff6ec', 2.6);
    key.position.set(2.5, 4, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
    key.shadow.bias = -0.0004;
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.9);
    fill.position.set(-4, 2, 2);
    const rim = new THREE.DirectionalLight('#ffffff', 1.2);
    rim.position.set(-1, 3, -4);
    this.scene.add(key, fill, rim, new THREE.HemisphereLight('#ffffff', '#9a9690', 0.9));
    this.key = key;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.22 }));
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  }

  // Clone a hero in a neutral A-pose.
  cloneHero(i) {
    const src = this.app.heroes.list[i];
    const g = src.group.clone(true);
    const rig = g.children[0];
    const pose = emptyPose();
    pose.armR[2] = -0.14; pose.armL[2] = 0.14;
    const piv = rig.children; // legR, legL, body, armR, armL, head
    const order = ['legR', 'legL', 'body', 'armR', 'armL', 'head'];
    order.forEach((name, k) => piv[k].rotation.set(...pose[name]));
    rig.rotation.set(0, 0, 0);
    rig.position.y = 0;
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    g.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      if (o === src.props?.phone) o.visible = false;
    });
    // hide the phone in the clone (props are cloned too)
    const phoneSrc = src.props?.phone;
    if (phoneSrc) g.traverse((o) => { if (o.isMesh && o.geometry === phoneSrc.geometry) o.visible = false; });
    return g;
  }

  // i = 0 man, 1 woman, -1 the couple. Returns a PNG blob.
  async render(i, { w = 2048, h = 1024 } = {}) {
    const r = this.app.renderer;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const g = out.getContext('2d');
    g.fillStyle = '#d8dade'; g.fillRect(0, 0, w, h);
    const prev = { size: r.getSize(new THREE.Vector2()), pr: r.getPixelRatio(), tm: r.toneMapping, exp: r.toneMappingExposure, target: r.getRenderTarget() };
    r.setRenderTarget(null);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    const couple = i < 0;
    const panels = couple ? 2 : 4;
    const pw = Math.floor(w / panels), ph = h - 70;
    r.setPixelRatio(1);
    r.setSize(pw, ph, false);
    const figures = couple ? [this.cloneHero(0), this.cloneHero(1)] : [this.cloneHero(i)];
    if (couple) { figures[0].position.x = -0.42; figures[1].position.x = 0.42; }
    figures.forEach((f) => this.holder.add(f));
    const viewH = couple ? 2.35 : 2.15;
    const aspect = pw / ph;
    Object.assign(this.cam, { left: -viewH * aspect / 2, right: viewH * aspect / 2, top: viewH / 2, bottom: -viewH / 2, near: 0.1, far: 50 });
    this.cam.updateProjectionMatrix();
    const views = couple ? [VIEWS[0], VIEWS[3]] : VIEWS;
    views.forEach((v, k) => {
      this.holder.rotation.y = v.a;
      this.cam.position.set(0, viewH * 0.48, 10);
      this.cam.lookAt(0, viewH * 0.48, 0);
      r.render(this.scene, this.cam);
      g.drawImage(r.domElement, k * pw, 0, pw, ph);
      g.fillStyle = '#4b4f57';
      g.font = '600 26px Rubik, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(`${v.ru} · ${v.en}`, k * pw + pw / 2, h - 26);
    });
    // header
    g.textAlign = 'left';
    g.font = '700 30px Rubik, system-ui, sans-serif';
    const info = couple ? null : HERO_INFO[i];
    g.fillStyle = couple ? '#2a2e36' : info.color;
    g.fillText(couple ? 'A + B · Пара / Couple' : `${info.id} · ${info.ru} / ${info.en} — ${info.name}`, 24, 44);
    figures.forEach((f) => this.holder.remove(f));
    r.setPixelRatio(prev.pr);
    r.setSize(prev.size.x, prev.size.y, false);
    r.toneMapping = prev.tm;
    r.toneMappingExposure = prev.exp;
    r.setRenderTarget(prev.target);
    return new Promise((res) => out.toBlob(res, 'image/png'));
  }
}
