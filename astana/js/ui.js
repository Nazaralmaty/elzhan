// Panel, toolbar, keyboard shortcuts, hero labels, touch joystick.
import * as THREE from 'three';
import { SHOTS } from './director.js';
import { HERO_INFO } from './heroes.js';
import { download, stamp } from './util.js';
import { U } from './materials.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function seg(sel, onPick) {
  const root = $(sel);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    for (const x of root.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    onPick(b.dataset.v ?? b.dataset.h, b);
  });
  return {
    set(v) { for (const x of root.querySelectorAll('button')) x.setAttribute('aria-pressed', String((x.dataset.v ?? x.dataset.h) === String(v))); },
  };
}

function range(id, fmt, onInput) {
  const el = $(`#${id}`), out = $(`#${id}-o`);
  const show = () => { if (out) out.textContent = fmt(+el.value); };
  el.addEventListener('input', () => { show(); onInput(+el.value); });
  show();
  return { el, set(v) { el.value = v; show(); } };
}

function toggle(id, onChange) {
  const el = $(`#${id}`);
  el.addEventListener('change', () => onChange(el.checked));
  return el;
}

const fmtHour = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;

export class UI {
  constructor(app) {
    this.app = app;
    const { hub, state } = app;
    this.labelEls = HERO_INFO.map((info) => {
      const d = document.createElement('div');
      d.className = 'hl';
      d.style.color = info.color;
      d.innerHTML = `<i style="background:${info.color}">${info.id}</i><span style="color:#eef2f7">${info.ru}</span>`;
      $('#labels').appendChild(d);
      return d;
    });

    // ---------- toolbar ----------
    const modeBtns = $$('.modes button');
    const setModeUI = (m) => {
      modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
      this.mode2.set(m);
      $('#joystick').hidden = !(this.touch && (m === 'walk' || m === 'fly'));
      $('#hint').innerHTML = m === 'walk' || m === 'fly'
        ? `<b>${m === 'walk' ? 'Прогулка' : 'Полёт'}:</b> два пальца — смотреть · щипок — шаг · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> — идти${m === 'fly' ? ' · <kbd>E</kbd>/<kbd>Q</kbd> — вверх/вниз' : ''} · <kbd>Shift</kbd> — быстрее.`
        : `<b>Трекпад:</b> два пальца — вращать · щипок — зум · <kbd>Shift</kbd>+два пальца — сдвиг · двойной клик — перелететь. <kbd>?</kbd> — все жесты.`;
    };
    this.setMode = (m, opts) => { app.director.stop(true); app.intro = null; app.rig.external = false; app.rig.setMode(m, opts); setModeUI(m); };
    modeBtns.forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode, b.dataset.mode === 'follow' ? { radius: 9 } : {})));
    hub.on('mode', (m) => setModeUI(m));

    $('#btn-panel').addEventListener('click', () => this.togglePanel());
    $('#btn-help').addEventListener('click', () => $('#help').showModal());
    $('#btn-shot').addEventListener('click', () => app.quickShot());
    $('#btn-clean').addEventListener('click', () => this.toggleClean());
    $('#btn-full').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    });
    $$('#enter [data-enter]').forEach((b) => b.addEventListener('click', () => { app.enter(b.dataset.enter); if (b.dataset.enter === 'walk') setModeUI('walk'); }));

    // tabs
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
      $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('.body section').forEach((s) => s.classList.toggle('on', s.dataset.tab === b.dataset.tab));
      if (b.dataset.tab === 'seedance') this.refreshPrompt();
    }));

    // ---------- scene ----------
    this.time = range('time', fmtHour, (v) => { state.hour = v; app.applyTime(); });
    this.time.set(state.hour);
    seg('#time-presets', (h) => { state.hour = +h; this.time.set(+h); app.applyTime(); });
    seg('#season', (v) => { app.applySeason(+v); this.refreshPrompt(); });
    range('cloud', (v) => `${Math.round(v * 100)}%`, (v) => { state.cloud = v; app.applyTime(); }).set(state.cloud);
    range('haze', (v) => `${Math.round(v * 100)}%`, (v) => { state.haze = v; app.applyTime(); }).set(state.haze);
    range('wind', (v) => `${Math.round(v * 50)}%`, (v) => { state.wind = v; U.wind.value = v; });
    const crowd = range('crowd', (v) => String(v), (v) => { clearTimeout(this._crowdT); this._crowdT = setTimeout(() => app.crowdSim.build(v), 120); });
    crowd.set(app.crowdSim.density);
    toggle('fountains', (v) => { state.fountains = v; app.fountains.mat.uniforms.uOn.value = v && state.season !== 2 ? 1 : 0; });
    toggle('cars', (v) => { state.cars = v; app.traffic.root.visible = v; });
    seg('#style', (v) => { state.style = v; app.crowd.setStyle(v); app.heroes.setStyle(v); });
    this.quality = seg('#quality', (v) => { app.setQuality(v); $('#ao').checked = app.state.ao; crowd.set(app.crowdSim.density); });
    this.quality.set(state.quality);
    toggle('reflect', (v) => { state.reflect = v; });
    toggle('shadows', (v) => { state.shadows = v; });
    toggle('bloom', (v) => { state.bloom = v; app.bloom.enabled = v; });
    toggle('ao', (v) => { state.ao = v; app.rebuildComposer(); });
    $('#ao').checked = state.ao;

    // ---------- heroes ----------
    const actions = $('#actions');
    actions.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      app.director.stop(true);
      app.heroes.setAction(b.dataset.a);
      this.syncActions();
    });
    $$('[data-focus]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.focus;
      const hp = app.heroes.headPos(i);
      const h = app.heroes.list[i].state.heading;
      app.flyTo({ pos: hp.clone().add(new THREE.Vector3(Math.sin(h) * 2.4, -0.15, Math.cos(h) * 2.4)), look: hp.clone().add(new THREE.Vector3(0, -0.2, 0)), lens: 50 }, 1.4);
    }));
    this.drive = toggle('drive', (v) => this.setDrive(v));
    toggle('together', (v) => { app.heroes.together = v; });
    this.selhero = seg('#selhero', (v) => { app.heroes.selected = +v; this.syncHeroCards(); });
    const facing = range('facing', (v) => `${Math.round(v)}°`, (v) => {
      const h = THREE.MathUtils.degToRad(v);
      const c = app.heroes.center;
      app.heroes.place(c.x + Math.cos(h) * 0.34, c.z - Math.sin(h) * 0.34, h);
    });
    this.facing = facing;
    $('#place').addEventListener('click', () => { app.placing = !app.placing; hub.emit('placing', app.placing); });
    hub.on('placing', (v) => { $('#place').textContent = v ? 'Двойной клик по земле…' : 'Поставить по двойному клику'; if (v) app.toast('Дважды кликните по земле, чтобы поставить героев'); });
    $('#home').addEventListener('click', () => { app.heroes.reset(); app.crowdSim.build(); this.syncActions(); });
    this.markersT = toggle('markers', (v) => { state.markers = v; app.heroes.setMarkers(v); });
    this.labelsT = toggle('labels-t', (v) => { state.labels = v; });
    toggle('avoid', (v) => { app.crowdSim.avoid = v; });
    toggle('heroes-v', (v) => app.heroes.setVisible(v));

    // ---------- camera ----------
    this.mode2 = seg('#mode2', (v) => this.setMode(v, v === 'follow' ? { radius: 9 } : {}));
    this.lens = seg('#lens', (v) => app.rig.setLens(+v));
    this.lens.set(app.rig.lens);
    const aspectSeg = seg('#aspect', (v) => { state.aspect = v; app.layout(); this.refreshPrompt(); this.updateResNote(); });
    hub.on('aspect', (v) => { aspectSeg.set(v); this.updateResNote(); });
    toggle('thirds-t', (v) => ($('#thirds').hidden = !v));
    toggle('safe-t', (v) => ($('#safe').hidden = !v));
    $('#views').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) app.flyTo(b.dataset.view); });
    const dev = seg('#device', (v) => { app.rig.device = v; });
    dev.set(app.rig.device);
    range('sens', (v) => v.toFixed(1), (v) => { app.rig.sens = v; });

    // ---------- director ----------
    const shotsEl = $('#shots');
    for (const s of SHOTS) {
      const d = document.createElement('div');
      d.className = 'shot';
      d.dataset.id = s.id;
      d.innerHTML = `<div><b>${s.ru}</b><small>${s.moveRu} · ${s.dur} с</small></div>
        <button class="ib" data-play title="Просмотр" aria-label="Просмотр: ${s.ru}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg></button>
        <button class="ib" data-rec title="Снять видео" aria-label="Записать: ${s.ru}" style="color:#ff6b7a"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg></button>`;
      d.querySelector('[data-play]').addEventListener('click', () => app.director.playShot(s.id));
      d.querySelector('[data-rec]').addEventListener('click', () => app.director.playShot(s.id, { record: true }));
      shotsEl.appendChild(d);
    }
    hub.on('director', (ev, shot) => {
      $$('.shot').forEach((el) => el.classList.toggle('playing', ev === 'play' && shot && el.dataset.id === shot.id));
      this.syncActions();
    });
    $('#key-add').addEventListener('click', () => app.director.addKey());
    $('#key-play').addEventListener('click', () => this.playKeys(false));
    $('#key-rec').addEventListener('click', () => this.playKeys(true));
    $('#key-clear').addEventListener('click', () => app.director.clearKeys());
    hub.on('keys', (keys) => this.renderKeys(keys));
    range('dur', (v) => `${v} с`, (v) => { app.director.duration = v; });
    seg('#recres', (v) => { app.director.recordRes = +v; this.updateResNote(); });
    this.updateResNote();
    const recmax = range('recmax', (v) => `${v} с`, () => {});
    $('#rec-live').addEventListener('click', () => { app.director.startRecording(+recmax.el.value); });
    $('#rec-stop').addEventListener('click', () => { app.director.stop(true); app.director.stopRecording(); });
    hub.on('record', (on) => { $('#rec').hidden = !on; });

    // ---------- seedance ----------
    seg('#stillres', (v) => { state.stillRes = +v; });
    this.plang = 'en';
    seg('#plang', (v) => { this.plang = v; this.refreshPrompt(); });
    $('#p-refresh').addEventListener('click', () => this.refreshPrompt());
    $('#p-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('#prompt').value); app.toast('Промпт скопирован'); }
      catch { $('#prompt').select(); document.execCommand('copy'); app.toast('Промпт скопирован'); }
    });
    const busy = async (btn, fn) => {
      const t = btn.textContent;
      btn.disabled = true;
      try { await fn((m) => { if (m) btn.textContent = m; }); } catch (e) { console.error(e); app.toast('Ошибка экспорта: ' + e.message); }
      btn.disabled = false; btn.textContent = t;
    };
    $('#pack').addEventListener('click', (e) => busy(e.currentTarget, async (p) => { await app.director.exportPack(p); app.toast('Пакет для Seedance сохранён'); }));
    $('#ex-frame').addEventListener('click', (e) => busy(e.currentTarget, async () => download(await app.captureFrame({ markers: false }), `frame-${stamp()}.png`)));
    $('#ex-clean').addEventListener('click', (e) => busy(e.currentTarget, async () => download(await app.captureFrame({ markers: false, people: false, heroes: false }), `clean-plate-${stamp()}.png`)));
    $('#ex-a').addEventListener('click', (e) => busy(e.currentTarget, async () => download(await app.sheets.render(0), `A-man-sheet-${stamp()}.png`)));
    $('#ex-b').addEventListener('click', (e) => busy(e.currentTarget, async () => download(await app.sheets.render(1), `B-woman-sheet-${stamp()}.png`)));
    $('#ex-ab').addEventListener('click', (e) => busy(e.currentTarget, async () => download(await app.sheets.render(-1), `couple-sheet-${stamp()}.png`)));
    $('#ex-mask').addEventListener('click', (e) => busy(e.currentTarget, async () => download(await app.captureMask(), `heroes-mask-${stamp()}.png`)));
    $('#scene-save').addEventListener('click', () => download(new Blob([JSON.stringify(app.director.sceneJSON(), null, 2)], { type: 'application/json' }), `astana-scene-${stamp()}.json`));
    $('#scene-load').addEventListener('click', () => $('#scene-file').click());
    $('#scene-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { this.loadScene(JSON.parse(await f.text())); app.toast('Сцена загружена'); } catch (err) { app.toast('Не удалось прочитать JSON'); }
      e.target.value = '';
    });

    // ---------- keyboard ----------
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { app.rig.keys.clear(); app.heroes.keys.clear(); });

    // ---------- touch joystick ----------
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.bindJoystick();
    if (innerWidth <= 720) this.togglePanel(false);

    this.syncActions();
    this.syncHeroCards();
    this.refreshPrompt();
    setTimeout(() => { const h = $('#hint'); if (h) h.style.opacity = '0.75'; }, 9000);
  }

  updateResNote() {
    const [W, H] = this.app.dimsFor(this.app.director.recordRes);
    const n = $('[data-tab=director] .note');
    n.innerHTML = n.innerHTML.replace(/\(24 к\/с, [^)]*\)/, `(24 к/с, ${W}×${H})`).replace('{res}', `${W}×${H}`);
  }

  playKeys(record) {
    if (!this.app.director.playKeys({ record })) this.app.toast('Нужно минимум два ключевых кадра (K)');
  }

  renderKeys(keys) {
    const el = $('#keys');
    el.innerHTML = '';
    keys.forEach((k, i) => {
      const d = document.createElement('div');
      d.innerHTML = `<span>#${i + 1} · ${k.pos.toArray().map((v) => v.toFixed(0)).join(', ')} · ${Math.round(k.lens)}мм</span><button title="Перейти">↗</button><button title="Удалить">✕</button>`;
      const [go, del] = d.querySelectorAll('button');
      go.addEventListener('click', () => this.app.director.gotoKey(i));
      del.addEventListener('click', () => this.app.director.removeKey(i));
      el.appendChild(d);
    });
  }

  setDrive(v) {
    const app = this.app;
    app.heroes.control = v;
    this.drive.checked = v;
    app.rig.keyboardEnabled = !v;
    app.rig.keys.clear(); app.heroes.keys.clear();
    if (v) app.toast('WASD / стрелки ведут героев. Камера — трекпадом. B — выключить.');
  }

  syncActions() {
    const a = this.app.heroes.action;
    $$('#actions button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.a === a)));
  }

  syncHeroCards() {
    [0, 1].forEach((i) => $(`#hero-${i}`).classList.toggle('sel', this.app.heroes.selected === i));
  }

  togglePanel(force) {
    const p = $('#panel');
    const open = force ?? p.classList.contains('closed');
    p.classList.toggle('closed', !open);
    $('#btn-panel').setAttribute('aria-pressed', String(open));
    this.app.layout();
  }

  toggleClean() {
    document.body.classList.toggle('clean');
    $('#btn-clean').setAttribute('aria-pressed', String(document.body.classList.contains('clean')));
    this.app.layout();
    if (document.body.classList.contains('clean')) this.app.toast('Интерфейс скрыт — H, чтобы вернуть', 1800);
  }

  refreshPrompt() {
    const t = $('#prompt');
    if (!t) return;
    t.value = this.app.director.prompt(this.plang || 'en');
  }

  loadScene(s) {
    const app = this.app;
    if (s.time) {
      Object.assign(app.state, { hour: s.time.hour, cloud: s.time.cloud ?? app.state.cloud });
      this.time.set(s.time.hour);
      app.applySeason(s.time.season ?? 0);
    }
    if (s.aspect) { app.state.aspect = s.aspect; app.layout(); }
    if (s.heroes) app.heroes.restore(s.heroes);
    if (s.action) app.heroes.setAction(s.action);
    if (s.camera) {
      const p = new THREE.Vector3(...s.camera.pos);
      const d = new THREE.Vector3(...s.camera.dir);
      app.rig.setLens(s.camera.lens || 35);
      this.setMode('orbit');
      app.rig.setOrbit(p.clone().addScaledVector(d, 20), p, true);
    }
    if (s.keys) { app.director.keys = s.keys.map((k) => ({ pos: new THREE.Vector3(...k.pos), look: new THREE.Vector3(...k.look), lens: k.lens })); this.renderKeys(app.director.keys); }
    if (s.crowd !== undefined) app.crowdSim.build(s.crowd);
    this.syncActions();
  }

  onKey(e, down) {
    const app = this.app;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox' || tag === 'textarea' || tag === 'select') return;
    const code = e.code;
    const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyC', 'Space', 'PageUp', 'PageDown', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'];
    if (moveKeys.includes(code)) {
      const set = app.heroes.control && !['KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyC', 'Space', 'PageUp', 'PageDown', 'Equal', 'Minus'].includes(code) ? app.heroes.keys : app.rig.keys;
      if (code === 'Space' && app.rig.mode !== 'fly') {
        if (down && !e.repeat) {
          if (app.director.playing) app.director.stop(true);
          else if (app.director.keys.length >= 2) app.director.playKeys();
        }
        e.preventDefault();
        return;
      }
      if (down) set.add(code); else set.delete(code);
      if (code.startsWith('Arrow') || code === 'Space') e.preventDefault();
      if (down && app.director.playing && !app.director.recording && set === app.rig.keys && !code.startsWith('Shift')) app.director.stop(true);
      if (down && app.intro) { app.intro = null; app.rig.external = false; app.rig.syncFromCamera(); }
      if (!down) { app.rig.keys.delete(code); app.heroes.keys.delete(code); }
      return;
    }
    if (!down || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (code) {
      case 'Digit1': this.setMode('orbit'); break;
      case 'Digit2': this.setMode('walk'); break;
      case 'Digit3': this.setMode('fly'); break;
      case 'Digit4': this.setMode('follow', { radius: 9 }); break;
      case 'KeyK': app.director.addKey(); app.toast(`Ключ #${app.director.keys.length}`, 1200); break;
      case 'KeyP': app.quickShot(); break;
      case 'KeyH': this.toggleClean(); break;
      case 'KeyM': { const v = !app.heroes.showMarkers; app.heroes.setMarkers(v); this.markersT.checked = v; app.state.markers = v; break; }
      case 'KeyL': app.state.labels = !app.state.labels; this.labelsT.checked = app.state.labels; break;
      case 'KeyB': this.setDrive(!app.heroes.control); break;
      case 'Escape': app.director.stop(true); app.director.stopRecording(); app.placing = false; app.hub.emit('placing', false); break;
      case 'Slash': if (e.shiftKey) $('#help').showModal(); break;
      default: break;
    }
  }

  bindJoystick() {
    const j = $('#joystick'), knob = j.querySelector('.knob');
    let id = null;
    const set = (x, y) => {
      const r = j.getBoundingClientRect();
      let dx = (x - (r.left + r.width / 2)) / (r.width / 2), dy = (y - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
      this.app.rig.joy.x = dx; this.app.rig.joy.y = dy;
    };
    j.addEventListener('pointerdown', (e) => { id = e.pointerId; j.setPointerCapture(id); set(e.clientX, e.clientY); e.stopPropagation(); });
    j.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX, e.clientY); });
    const end = () => { id = null; knob.style.transform = ''; this.app.rig.joy.x = 0; this.app.rig.joy.y = 0; };
    j.addEventListener('pointerup', end);
    j.addEventListener('pointercancel', end);
  }

  // per-frame UI work
  frame() {
    const app = this.app;
    // hero labels (pushed apart when they would overlap)
    const fr = $('#frame');
    const W = fr.clientWidth, H = fr.clientHeight;
    const show = app.state.labels && !document.body.classList.contains('clean');
    const pos = app.heroes.list.map((h, i) => {
      if (!show || !h.group.visible) return null;
      const p = app.heroes.headPos(i).add(new THREE.Vector3(0, 0.62, 0)).project(app.camera);
      if (p.z > 1 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) return null;
      return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H };
    });
    if (pos[0] && pos[1] && Math.abs(pos[0].x - pos[1].x) < 120 && Math.abs(pos[0].y - pos[1].y) < 30) {
      const mx = (pos[0].x + pos[1].x) / 2, my = Math.min(pos[0].y, pos[1].y);
      const left = this.app.heroes.list[0].group.position.clone().project(app.camera).x <= this.app.heroes.list[1].group.position.clone().project(app.camera).x;
      pos[0] = { x: mx + (left ? -58 : 58), y: my };
      pos[1] = { x: mx + (left ? 58 : -58), y: my };
    }
    app.heroes.list.forEach((h, i) => {
      const el = this.labelEls[i];
      if (!pos[i]) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.left = `${pos[i].x}px`;
      el.style.top = `${pos[i].y}px`;
      const d = app.camera.position.distanceTo(app.heroes.headPos(i));
      el.style.opacity = d > 260 ? '0' : d > 140 ? String(1 - (d - 140) / 120) : '1';
    });
    // clock, fps, recording
    this._t = (this._t || 0) + app.dt;
    if (this._t > 0.25) {
      this._t = 0;
      $('#clock').textContent = app.sky.label();
      $('#fps').textContent = `${Math.round(app.fps)} fps`;
    }
    if (app.director.recording) {
      const s = app.director.tickRecording();
      $('#rec span').textContent = `00:${String(Math.floor(s)).padStart(2, '0')}`;
    }
  }
}
