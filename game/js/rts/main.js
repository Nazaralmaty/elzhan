// "Казаки" page: setup, game loop, camera, selection, orders, build placement, HUD and minimap.
import * as THREE from 'three';
import { createEngine } from '../gfx/engine.js';
import { createCrowd } from '../gfx/crowd.js';
import { staticMesh, worldFog } from '../gfx/kit.js';
import { rtsTownhall, rtsHouse, rtsMillBody, rtsStorehouse, rtsBarracks, rtsStable, rtsBlacksmith, rtsFoundry, rtsMine, rtsTower } from '../gfx/structures.js';
import {
  createGame, tick, DT, unit, building, centerOf, distToBuilding, canPlace, snapPlacement, orderBuild, canTrain, train, cancelTrain, canResearch, research,
  commandMove, commandAttack, commandWork, commandStop, setStance, canForm, formFormation, setShape, moveFormation, volley, disband, releaseWorkers, popUsed, canAfford, TREE, ROCK,
  missingNeeds, autoWork, cancelTrainAt, cancelKind, setRepeat
} from './sim.js';
import { aiTick } from './ai.js';
import { UNITS, BUILDINGS, UPGRADES, BUILD_MENU, RES, RES_NAME, RES_ICON, SHAPES, TECH_HINT } from './data.js';
import { createWorld, CELL } from './view/world3d.js';

const $ = id => document.getElementById(id);
const KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'];
const KEY_LABEL = KEYS.map(k => k.slice(3));
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const BUILD_MODEL = { townhall: rtsTownhall, house: () => rtsHouse(0), mill: rtsMillBody, storehouse: rtsStorehouse, barracks: rtsBarracks, stable: rtsStable, blacksmith: rtsBlacksmith, foundry: rtsFoundry, mine: () => rtsMine('gold'), tower: rtsTower };
const UNIT_ICON_MODEL = { peasant: 'peasantAxe', pikeman: 'pikeman', musketeer: 'musketeer', officer: 'officer', drummer: 'drummer', cossack: 'cossack', dragoon: 'dragoon', reiter: 'reiter', cannon: 'cannon' };

/* ---------- setup screen ---------- */
const seedInput = $('rSeed');
const newSeed = () => { seedInput.value = String(1 + Math.floor(Math.random() * 99999)); };
newSeed();
$('rReseed').onclick = newSeed;
const val = name => document.querySelector(`input[name=${name}]:checked`).value;
$('rStart').onclick = () => start();
window.addEventListener('keydown', e => { if (e.key === 'Enter' && !$('rSetup').hidden) start(); });
try { if (!document.createElement('canvas').getContext('webgl2')) $('rGl').textContent = 'Браузер не поддерживает WebGL2 — 3D может не запуститься.'; } catch { /* ignore */ }

let game = null;
function start() {
  const opts = { size: val('rsize'), players: 1 + +val('rfoes'), difficulty: +val('rdif'), peace: +val('rpeace'), startRes: val('rstart'), seed: +seedInput.value || 1 };
  $('rSetup').hidden = true; $('rGame').hidden = false;
  game = runGame(opts);
}
if (new URLSearchParams(location.search).has('autostart')) {
  const q = new URLSearchParams(location.search);
  $('rSetup').hidden = true; $('rGame').hidden = false;
  game = runGame({ size: q.get('size') || 'small', players: +(q.get('players') || 2), difficulty: 1, peace: +(q.get('peace') || 300), startRes: q.get('start') || 'normal', seed: +(q.get('seed') || 7) });
}

/* ---------- game ---------- */
function runGame(opts) {
  const st = createGame(opts);
  const canvas = $('rCanvas'), overlay = $('rOverlay'), octx = overlay.getContext('2d');
  const W = st.W, H = st.H;
  const eng = createEngine(canvas, { dist: 46, pitch: 0.92, minDist: 16, maxDist: 150, bounds: [0, 0, W * CELL, H * CELL], fogNear: 180, fogFar: 520, fov: 40 });
  const { rig } = eng;
  const world = createWorld(eng, st);
  rig.groundY = (x, z) => world.heightAt(x / CELL, z / CELL);
  const home = centerOf(st.buildings.find(b => b.side === 0 && b.kind === 'townhall'));
  rig.tx = home.x * CELL; rig.tz = (home.z + 6) * CELL;
  eng.updateCamera();

  const sel = { units: new Set(), building: 0 };
  const groups = {};
  let mode = null; // { type: 'build', kind } | { type: 'rally' } | { type: 'attackMove' }
  let ghost = null;
  let paused = false, speed = 1, acc = 0, last = 0, raf = 0, closed = false, hudT = 0, fogT = 0, bldT = 0;
  const prev = new Map(), keys = new Set(), markers = [];
  const icons = makeIcons(world.models);

  /* ---------- helpers ---------- */
  const myUnits = () => [...sel.units].map(id => unit(st, id)).filter(u => u && u.side === 0);
  const selFormations = () => [...new Set(myUnits().filter(u => u.formation).map(u => u.formation))].map(id => st.fById.get(id)).filter(Boolean);
  function cleanSel() {
    for (const id of sel.units) { const u = unit(st, id); if (!u || u.side !== 0) sel.units.delete(id); }
    if (sel.building) { const b = building(st, sel.building); if (!b) sel.building = 0; }
  }
  function screenOf(x, z, h = 1.2) { return eng.project(x * CELL, world.heightAt(x, z) + h, z * CELL); }
  function groundAt(e) {
    const p = eng.pick(e.clientX, e.clientY, world.terrain);
    return p ? { x: p.x / CELL, z: p.z / CELL } : null;
  }
  function unitAt(cx, cy, pred = () => true) {
    const r = canvas.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top;
    let best = null, bd = 22;
    const vis = st.sides[0].visible;
    for (const u of st.units) {
      if (u.inside || !pred(u)) continue;
      if (u.side !== 0 && !vis[Math.floor(u.z) * W + Math.floor(u.x)]) continue;
      const v = world.view.get(u.id), x = v ? v.x : u.x, z = v ? v.z : u.z;
      const p = screenOf(x, z, UNITS[u.kind].cav ? 1.6 : 1);
      if (p.behind) continue;
      const d = Math.hypot(p.x - mx, p.y - my) - (u.side === 0 ? 3 : 0);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function buildingAt(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, eng.camera);
    const groups = [...world.bview.entries()];
    let best = null, bd = Infinity;
    for (const [id, v] of groups) {
      const h = ray.intersectObject(v.group, true)[0];
      if (h && h.distance < bd) { bd = h.distance; best = id; }
    }
    if (best) { const b = building(st, best); if (b && (b.side === 0 || st.sides[0].explored[Math.floor(b.z) * W + Math.floor(b.x)])) return b; }
    const g = groundAt(e);
    if (!g) return null;
    const id = st.occ[Math.floor(g.z) * W + Math.floor(g.x)];
    return id ? building(st, id) : null;
  }
  function select(units, add = false) {
    if (!add) sel.units.clear();
    sel.building = 0;
    for (const u of units) {
      if (u.side !== 0) continue;
      // a soldier in a formation brings the whole formation
      if (u.formation) { const f = st.fById.get(u.formation); if (f) for (const id of [...f.members, f.officer, f.drummer]) if (id) sel.units.add(id); }
      else sel.units.add(u.id);
    }
    renderPanel();
  }
  function rallyText(g) {
    const k = st.map.kind[Math.floor(g.z) * W + Math.floor(g.x)], b = building(st, st.occ[Math.floor(g.z) * W + Math.floor(g.x)]);
    if (k === TREE) return 'Сбор на лесе: новые крестьяне сразу рубят';
    if (k === ROCK) return 'Сбор на камне: новые крестьяне сразу ломают камень';
    if (b?.kind === 'mill') return 'Сбор на мельнице: новые крестьяне идут в поле';
    if (b?.kind === 'mine') return 'Сбор на шахте: новые крестьяне идут в шахту';
    return 'Точка сбора установлена';
  }
  function marker(x, z, color = '#7dff9a') { markers.push({ x, z, t: 0, color }); }
  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'ltoast ' + kind; el.textContent = text;
    $('rToasts').appendChild(el);
    while ($('rToasts').children.length > 4) $('rToasts').firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }

  /* ---------- orders ---------- */
  // ground point under the cursor, snapped onto a tree or rock when the cursor is on its crown
  function workPoint(e) {
    const r0 = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r0.left) / r0.width) * 2 - 1, -((e.clientY - r0.top) / r0.height) * 2 + 1);
    ray.setFromCamera(ndc, eng.camera);
    const cell = world.pickProp(ray);
    if (cell >= 0) return { x: cell % W + 0.5, z: Math.floor(cell / W) + 0.5 };
    return groundAt(e);
  }
  function orderAt(e, facingFrom = null) {
    const units = myUnits();
    if (sel.building && !units.length) {
      const g = workPoint(e), b = building(st, sel.building);
      if (g && b && b.side === 0) { b.rally = { x: g.x, z: g.z }; marker(g.x, g.z, '#ffd76a'); toast(rallyText(g)); }
      return;
    }
    if (!units.length) return;
    const ids = units.map(u => u.id);
    const enemy = unitAt(e.clientX, e.clientY, u => u.side !== 0);
    if (enemy) { commandAttack(st, ids, enemy.id); marker(enemy.x, enemy.z, '#ff6b6b'); return; }
    const b = buildingAt(e);
    if (b && b.side !== 0) { commandAttack(st, ids, b.id, true); const c = centerOf(b); marker(c.x, c.z, '#ff6b6b'); return; }
    const g = groundAt(e);
    if (!g) return;
    const peasants = units.filter(u => UNITS[u.kind].peasant);
    const others = units.filter(u => !UNITS[u.kind].peasant);
    if (peasants.length) {
      let cell = { x: g.x, z: g.z };
      const r0 = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r0.left) / r0.width) * 2 - 1, -((e.clientY - r0.top) / r0.height) * 2 + 1);
      ray.setFromCamera(ndc, eng.camera);
      const propCell = b ? -1 : world.pickProp(ray);
      // the cursor is often on a tree crown: look for a tree or rock under or near the point
      const k = st.map.kind[Math.floor(g.z) * W + Math.floor(g.x)];
      if (!b && k !== TREE && k !== ROCK) {
        for (let r = 1; r <= 1; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
          const kk = st.map.kind[(Math.floor(g.z) + j) * W + Math.floor(g.x) + i];
          if (kk === TREE || kk === ROCK) cell = { x: Math.floor(g.x) + i + 0.5, z: Math.floor(g.z) + j + 0.5 };
        }
      }
      if (propCell >= 0) cell = { x: propCell % W + 0.5, z: Math.floor(propCell / W) + 0.5 };
      if (b && b.side === 0) cell = centerOf(b);
      if (commandWork(st, peasants.map(u => u.id), cell.x, cell.z)) { marker(cell.x, cell.z, '#ffd76a'); }
      else commandMove(st, peasants.map(u => u.id), g.x, g.z);
    }
    if (others.length) {
      const forms = [...new Set(others.filter(u => u.formation).map(u => u.formation))];
      const loose = others.filter(u => !u.formation).map(u => u.id);
      let dir = null;
      if (facingFrom) dir = Math.atan2(g.z - facingFrom.z, g.x - facingFrom.x);
      const tx = facingFrom ? facingFrom.x : g.x, tz = facingFrom ? facingFrom.z : g.z;
      forms.forEach((fid, i) => {
        const f = st.fById.get(fid);
        if (!f) return;
        // several formations stand side by side
        const side = (i - (forms.length - 1) / 2) * (f.shape === 'column' ? 5 : 14);
        const d = dir ?? Math.atan2(tz - f.z, tx - f.x);
        moveFormation(st, fid, tx - Math.sin(d) * side, tz + Math.cos(d) * side, dir);
      });
      if (loose.length) commandMove(st, loose, tx, tz, { attackMove: mode?.type === 'attackMove' });
    }
    marker(g.x, g.z);
  }

  /* ---------- build ghost ---------- */
  const ghostMat = new THREE.MeshStandardMaterial({ color: '#7dff9a', transparent: true, opacity: 0.45, depthWrite: false });
  function setMode(m) {
    mode = m;
    if (ghost) { eng.scene.remove(ghost); ghost.geometry.dispose(); ghost = null; }
    if (m?.type === 'build') {
      const B = BUILDINGS[m.kind], foot = { townhall: [12, 12], house: [6, 6], mill: [8, 8], storehouse: [8, 8], barracks: [12, 10], stable: [12, 10], blacksmith: [8, 8], foundry: [12, 10], mine: [8, 8], tower: [6, 6] }[m.kind];
      ghost = staticMesh(BUILD_MODEL[m.kind]());
      ghost.material = ghostMat; ghost.castShadow = false; ghost.receiveShadow = false;
      const sx = B.w * CELL / foot[0], sz = B.h * CELL / foot[1];
      ghost.scale.set(sx, Math.min(sx, sz), sz);
      if (m.kind === 'mill') {
        // the ring of fields the mill will plough around itself
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.6 * CELL, 5.2 * CELL, 32), new THREE.MeshBasicMaterial({ color: '#e0bd55', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; ring.scale.set(1 / sx, 1 / sz, 1);
        ghost.add(ring);
      }
      eng.scene.add(ghost);
      $('rHint').textContent = `${BUILDINGS[m.kind].name}: кликни место · Esc — отмена${m.kind === 'mine' ? ' · ставь на месторождение' : ''}`;
    } else if (m?.type === 'rally') $('rHint').textContent = 'Кликни точку сбора · Esc — отмена';
    else if (m?.type === 'attackMove') $('rHint').textContent = 'Атака с ходу: кликни точку · Esc — отмена';
    $('rHint').hidden = !m;
    canvas.classList.toggle('cmd', !!m);
  }
  function updateGhost(e) {
    if (!ghost || !e) return;
    const g = groundAt(e);
    if (!g) return;
    const p = snapPlacement(st, mode.kind, g.x, g.z), B = BUILDINGS[mode.kind];
    mode.x = p.x; mode.z = p.z;
    const cx = p.x + B.w / 2, cz = p.z + B.h / 2;
    ghost.position.set(cx * CELL, world.heightAt(cx, cz), cz * CELL);
    const why = canPlace(st, 0, mode.kind, p.x, p.z) || (canAfford(st.sides[0], B.cost) ? '' : 'Не хватает ресурсов');
    mode.why = why;
    ghostMat.color.set(why ? '#ff6b6b' : '#7dff9a');
  }
  function placeBuilding(e, keep) {
    updateGhost(e);
    if (mode.why) { toast(mode.why, 'bad'); return; }
    const peasants = myUnits().filter(u => UNITS[u.kind].peasant).map(u => u.id);
    const why = orderBuild(st, 0, mode.kind, mode.x, mode.z, peasants);
    if (why) { toast(why, 'bad'); return; }
    if (!keep) setMode(null);
    world.syncBuildings();
  }

  /* ---------- pointer input ---------- */
  let down = null, lastClick = { t: 0, id: 0 }, hoverEvent = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    down = { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey, drag: false, ground: groundAt(e) };
  });
  canvas.addEventListener('pointermove', e => {
    hoverEvent = e;
    if (mode?.type === 'build') updateGhost(e);
    if (performance.now() - hintT > 120) { hintT = performance.now(); cursorHint(e); }
    if (!down) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) down.drag = true;
    down.cx = e.clientX; down.cy = e.clientY;
  });
  canvas.addEventListener('pointerleave', () => { $('rCursor').hidden = true; });
  canvas.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d) return;
    if (d.button === 2) {
      if (mode) { setMode(null); return; }
      // right drag with formations: stand at the press point facing the drag direction
      if (d.drag && d.ground && selFormations().length) orderAt(e, d.ground);
      else orderAt(e);
      return;
    }
    if (mode?.type === 'build') { placeBuilding(e, e.shiftKey); return; }
    if (mode?.type === 'rally') { const g = workPoint(e), b = building(st, sel.building); if (g && b) { b.rally = { x: g.x, z: g.z }; marker(g.x, g.z, '#ffd76a'); toast(rallyText(g)); } setMode(null); return; }
    if (mode?.type === 'attackMove') { orderAt(e); setMode(null); return; }
    if (d.drag) { boxSelect(d, e, d.shift); return; }
    // click: own unit / own building select; otherwise it's an order for the selection
    const own = unitAt(e.clientX, e.clientY, u => u.side === 0);
    if (own) {
      const now = performance.now();
      if (now - lastClick.t < 350 && lastClick.kind === own.kind) selectSameOnScreen(own.kind, d.shift);
      else if (d.shift && sel.units.has(own.id)) { sel.units.delete(own.id); renderPanel(); }
      else select([own], d.shift);
      lastClick = { t: now, kind: own.kind };
      return;
    }
    const b = buildingAt(e);
    const units = myUnits();
    if (b && b.side === 0 && !(units.some(u => UNITS[u.kind].peasant) && (!b.done || b.kind === 'mine' || b.kind === 'mill' || b.hp < b.maxHp))) {
      sel.units.clear(); sel.building = b.id; renderPanel(); return;
    }
    if (units.length) { orderAt(e); return; }
    if (b && b.side !== 0) { sel.units.clear(); sel.building = b.id; renderPanel(); return; }
    sel.units.clear(); sel.building = 0; renderPanel();
  });
  function boxSelect(d, e, add) {
    const r = canvas.getBoundingClientRect();
    const x0 = Math.min(d.x, e.clientX) - r.left, x1 = Math.max(d.x, e.clientX) - r.left, y0 = Math.min(d.y, e.clientY) - r.top, y1 = Math.max(d.y, e.clientY) - r.top;
    const inside = st.units.filter(u => {
      if (u.side !== 0 || u.inside) return false;
      const v = world.view.get(u.id), p = screenOf(v ? v.x : u.x, v ? v.z : u.z, 1);
      return !p.behind && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    });
    // soldiers win over peasants when both are in the box
    const mil = inside.filter(u => !UNITS[u.kind].peasant);
    select(mil.length ? mil : inside, add);
  }
  function selectSameOnScreen(kind, add) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    select(st.units.filter(u => {
      if (u.side !== 0 || u.kind !== kind || u.inside) return false;
      const p = screenOf(u.x, u.z, 1);
      return !p.behind && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
    }), add);
  }
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey) rig.dist *= Math.exp(e.deltaY * 0.01);
    else {
      const k = rig.dist * 0.0018, c = Math.cos(rig.yaw), s = Math.sin(rig.yaw);
      const dx = e.deltaX * k, dz = e.deltaY * k;
      rig.tx += dx * c + dz * s; rig.tz += -dx * s + dz * c;
    }
  }, { passive: false });

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (closed || e.target.closest?.('input')) return;
    if (e.type === 'keyup') { keys.delete(e.code); return; }
    if (!$('rHelp').hidden) { if (e.key === 'Escape' || e.key === 'Enter') $('rHelpClose').click(); return; }
    if (!$('rEnd').hidden) return;
    keys.add(e.code);
    if (e.code === 'Escape') { if (mode) setMode(null); else { sel.units.clear(); sel.building = 0; renderPanel(); } return; }
    if (e.code === 'KeyP' || e.code === 'Pause') { paused = !paused; renderSpeed(); return; }
    if (e.code === 'Home') { rig.tx = home.x * CELL; rig.tz = (home.z + 6) * CELL; return; }
    if (/^Digit[0-9]$/.test(e.code)) {
      const n = e.code.slice(5);
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); groups[n] = [...sel.units]; toast(`Группа ${n}: ${groups[n].length}`); }
      else if (groups[n]) {
        const list = groups[n].map(id => unit(st, id)).filter(u => u && u.side === 0);
        if (list.length) {
          const again = list.every(u => sel.units.has(u.id)) && sel.units.size === list.length;
          select(list);
          if (again) { rig.tx = list[0].x * CELL; rig.tz = list[0].z * CELL; }
        }
      }
      return;
    }
    const k = KEYS.indexOf(e.code);
    if (k >= 0 && !e.ctrlKey && !e.metaKey) {
      const btn = $('rCmds').querySelectorAll('.rbtn')[k];
      if (btn && !btn.disabled) { e.preventDefault(); btn.dispatchEvent(new MouseEvent('click', { shiftKey: e.shiftKey, bubbles: true })); }
    }
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const onResize = () => eng.resize();
  window.addEventListener('resize', onResize);

  /* ---------- command panel ---------- */
  // every button: big picture (3D render or pictogram), short label, hotkey; details in the hint card
  let buttons = [];
  const chips = cost => Object.entries(cost).map(([r, n]) => `<span class="chip ${st.sides[0].res[r] < n ? 'short' : ''}" title="${RES_NAME[r]}">${RES_ICON[r]} ${n}</span>`).join('');
  function renderPanel() {
    cleanSel();
    buttons = [];
    const units = myUnits(), b = sel.building && building(st, sel.building);
    if (b && b.side === 0) buildingButtons(b);
    else if (units.length) {
      const peasants = units.filter(u => UNITS[u.kind].peasant), mil = units.filter(u => !UNITS[u.kind].peasant);
      if (peasants.length && !mil.length) peasantButtons();
      else militaryButtons(mil);
    }
    $('rCmds').innerHTML = Array.from({ length: 15 }, (_, i) => {
      const bt = buttons[i];
      if (!bt) return `<button type="button" class="rbtn" disabled style="visibility:hidden"></button>`;
      return `<button type="button" class="rbtn${bt.img ? ' pic' : ''}" data-i="${i}">${bt.img ? `<img src="${bt.img}" alt="">` : `<span class="ic">${bt.icon || ''}</span>`}${bt.badge ? `<span class="badge">${bt.badge}</span>` : ''}<span class="lb">${bt.label}</span><kbd>${KEY_LABEL[i]}</kbd><span class="n"></span><span class="lock">🔒</span><i class="p"></i></button>`;
    }).join('');
    renderSel();
    refreshButtons();
  }
  const isPoor = why => /ресурс/i.test(why);
  function refreshButtons() {
    $('rCmds').querySelectorAll('.rbtn[data-i]').forEach(el => {
      const bt = buttons[+el.dataset.i];
      const why = bt.why ? bt.why() : '';
      const locked = !!bt.locked && !!bt.locked();
      el.disabled = !!why && !isPoor(why) && !locked;
      el.classList.toggle('poor', isPoor(why));
      el.classList.toggle('locked', locked);
      el.classList.toggle('on', !!(bt.isOn && bt.isOn()));
      if (bt.count) el.querySelector('.n').textContent = bt.count() || '';
      if (bt.prog) el.querySelector('.p').style.width = (bt.prog() * 100).toFixed(0) + '%';
    });
  }
  function showInfo(bt) {
    $('rInfo').classList.toggle('off', !bt);
    if (!bt) return;
    const why = bt.why ? bt.why() : '';
    const pic = bt.img ? `<img src="${bt.img}" alt="">` : `<span class="ic">${bt.icon || ''}</span>`;
    $('rInfo').innerHTML = `<div class="card">${pic}<div><b>${bt.title || bt.label}</b>${bt.cost ? `<div class="chips">${chips(bt.cost)}${bt.time ? `<span class="chip">⏱ ${bt.time} с</span>` : ''}</div>` : ''}<div>${bt.desc || ''}</div>${why ? `<div class="why">${why}</div>` : ''}${bt.extra || ''}</div></div>`;
  }
  $('rCmds').addEventListener('click', e => {
    const el = e.target.closest('.rbtn[data-i]');
    if (!el) return;
    const bt = buttons[+el.dataset.i];
    const why = bt.why ? bt.why() : '';
    if (why) { toast(why, 'bad'); return; }
    bt.act(e.shiftKey);
    renderPanel();
    showInfo(bt);
  });
  // right click on a training button takes one unit of that kind back out of the queue
  $('rCmds').addEventListener('contextmenu', e => {
    e.preventDefault();
    const el = e.target.closest('.rbtn[data-i]');
    const bt = el && buttons[+el.dataset.i];
    if (bt?.cancel) { bt.cancel(); renderPanel(); }
  });
  $('rCmds').addEventListener('mouseover', e => { const el = e.target.closest('.rbtn[data-i]'); if (el) showInfo(buttons[+el.dataset.i]); });
  $('rCmds').addEventListener('mouseleave', () => showInfo(null));

  function peasantButtons() {
    const ids = () => myUnits().filter(u => UNITS[u.kind].peasant).map(u => u.id);
    for (const k of BUILD_MENU) {
      const B = BUILDINGS[k];
      buttons.push({
        label: B.name, title: 'Построить: ' + B.name, img: icons[k], cost: B.cost, time: B.time, desc: B.desc,
        locked: () => !!missingNeeds(st, 0, k),
        why: () => { const m = missingNeeds(st, 0, k); return m ? `Сначала постройте ${BUILDINGS[m].icon} ${BUILDINGS[m].name}` : canAfford(st.sides[0], B.cost) ? '' : 'Не хватает ресурсов'; },
        act: () => setMode({ type: 'build', kind: k })
      });
    }
    const work = (job, icon, label, desc, none) => buttons.push({ label, icon, title: label, desc, act: () => { const n = autoWork(st, ids(), job); if (!n) toast(none, 'bad'); else toast(`${label}: ${n}`, 'good'); } });
    work('wood', '🪓', 'Рубить лес', 'Каждый идёт к ближайшему дереву и носит брёвна на склад или в ратушу. Можно и просто кликнуть по дереву.', 'Рядом нет леса');
    work('stone', '🪨', 'Ломать камень', 'К ближайшим серым скалам; камень носят на склад или в ратушу.', 'Рядом нет камня');
    work('farm', '🌾', 'В поле', 'На свободные поля ближайшей мельницы: еда идёт сразу, без переноски. 12 мест на мельницу.', 'Нет мельницы со свободными полями');
    work('mine', '⛏', 'В шахту', 'В ближайшую шахту, где есть места. Шахта даёт золото, железо или уголь.', 'Нет шахты со свободными местами');
    buttons.push({ label: 'Стоп', icon: '✋', desc: 'Остановить и бросить работу', act: () => commandStop(st, [...sel.units]) });
  }
  function militaryButtons(mil) {
    const ids = [...sel.units];
    buttons.push({ label: 'Стоп', icon: '✋', desc: 'Остановиться', act: () => commandStop(st, ids) });
    buttons.push({ label: 'Стоять', icon: '🛡', desc: 'Не преследовать: стоять на месте и бить только тех, кто подошёл', isOn: () => myUnits().some(u => u.stance === 'hold'), act: () => setStance(st, ids, myUnits().some(u => u.stance === 'hold') ? 'free' : 'hold') });
    buttons.push({ label: 'Атака с ходу', icon: '⚔', desc: 'Идти к точке и бить всех по пути', act: () => setMode({ type: 'attackMove' }) });
    const forms = selFormations();
    if (forms.length) {
      for (const [shape, name] of Object.entries(SHAPES)) buttons.push({ label: name, icon: shape === 'line' ? '▬' : shape === 'column' ? '▮' : '⬜', desc: shape === 'line' ? 'Широкий фронт: все стреляют разом' : shape === 'column' ? 'Узкий строй: быстрее на марше' : 'Каре: броня +3 против конницы, медленно', isOn: () => selFormations().every(f => f.shape === shape), act: () => forms.forEach(f => setShape(st, f.id, shape)) });
      if (forms.some(f => UNITS[f.kind].shot)) buttons.push({ label: 'Залп!', icon: '💥', desc: 'Все заряженные мушкеты стреляют сейчас', act: () => forms.forEach(f => volley(st, f.id)) });
      buttons.push({ label: 'Распустить', icon: '✖', desc: 'Разбить строй: солдаты станут свободными', act: () => forms.forEach(f => disband(st, f.id)) });
    }
    const loose = mil.filter(u => !u.formation);
    for (const kind of ['pikeman', 'musketeer']) {
      if (!loose.some(u => u.kind === kind)) continue;
      for (const size of [15, 36]) buttons.push({
        label: `Отряд ${size}`, img: icons[kind], badge: size, title: `Отряд: ${UNITS[kind].name.toLowerCase()}ы ×${size}`, desc: `Офицер, барабанщик и ${size} свободных ${kind === 'pikeman' ? 'пикинёров' : 'мушкетёров'} встают в строй`,
        why: () => canForm(st, 0, kind, size, home),
        act: () => {
          const c = loose.reduce((a, u) => ({ x: a.x + u.x / loose.length, z: a.z + u.z / loose.length }), { x: 0, z: 0 });
          const r = formFormation(st, 0, kind, size, c);
          if (r.f) { select([unit(st, r.f.members[0])]); toast('Отряд построен', 'good'); }
        }
      });
    }
  }
  function buildingButtons(b) {
    const B = BUILDINGS[b.kind];
    if (!b.done) { buttons.push({ label: 'Снести', icon: '✖', desc: 'Снести недостроенное здание (ресурсы не вернутся)', act: () => { b.hp = 0; } }); return; }
    for (const k of B.trains || []) {
      const U = UNITS[k];
      buttons.push({
        label: U.name, img: icons[k], cost: U.cost, time: U.time, desc: U.desc + '. Shift — сразу 5, правый клик — убрать одного из очереди.', title: 'Нанять: ' + U.name,
        why: () => { const w = canTrain(st, b.id, k); return w === 'Очередь полна' ? '' : w; },
        count: () => b.queue.filter(q => q === k).length,
        prog: () => b.queue[0] === k ? b.trainT / UNITS[k].time : 0,
        cancel: () => cancelKind(st, b.id, k),
        act: shift => { const w = train(st, b.id, k, shift ? 5 : 1); if (w) toast(w, 'bad'); }
      });
    }
    if (B.trains) {
      buttons.push({ label: 'Бесконечно', icon: '♾', title: 'Бесконечный найм', desc: 'Когда очередь пустеет, здание само заказывает последний вид юнита, пока хватает ресурсов и домов.', isOn: () => !!b.repeat, act: () => { setRepeat(st, b.id, !b.repeat); toast(b.repeat ? `Бесконечный найм: ${UNITS[b.lastKind].name}` : 'Бесконечный найм выключен'); } });
      buttons.push({ label: 'Отмена', icon: '↩', desc: 'Убрать последнего из очереди, ресурсы вернутся. Можно кликнуть по иконке в очереди слева.', why: () => b.queue.length ? '' : 'Очередь пуста', act: () => cancelTrainAt(st, b.id, b.queue.length - 1) });
      buttons.push({ label: 'Сбор', icon: '🚩', desc: 'Куда идут новые юниты. Флаг на лесе, камне, поле или шахте — крестьяне сразу начнут работать.', act: () => setMode({ type: 'rally' }) });
    }
    for (const [key, U] of Object.entries(UPGRADES)) {
      if (U.at !== b.kind) continue;
      buttons.push({
        label: U.name, icon: U.icon, cost: U.cost, time: U.time, desc: U.desc, title: 'Улучшение: ' + U.name,
        isOn: () => !!st.sides[0].up[key],
        locked: () => !!U.needs && !st.sides[0].up[U.needs],
        why: () => st.sides[0].up[key] ? 'Уже изучено' : b.research?.key === key ? 'Изучается' : canResearch(st, b.id, key),
        prog: () => b.research?.key === key ? b.research.t / b.research.T : 0,
        act: () => { const w = research(st, b.id, key); if (w) toast(w, 'bad'); }
      });
    }
    if (b.kind === 'mine') buttons.push({ label: 'Выпустить', icon: '🚪', desc: 'Вывести крестьян из шахты', count: () => b.workers.length, act: () => releaseWorkers(st, b.id) });
    if (b.kind === 'mill') buttons.push({ label: 'Крестьян в поле', icon: '🌾', desc: 'Позвать свободных крестьян на пустые поля этой мельницы', act: () => { const idle = st.units.filter(u => u.side === 0 && UNITS[u.kind].peasant && !u.task && !u.inside); const n = autoWork(st, idle.map(u => u.id), 'farm'); toast(n ? `В поле: ${n}` : 'Нет свободных крестьян', n ? 'good' : 'bad'); } });
  }

  /* ---------- selection panel ---------- */
  function renderSel() {
    const units = myUnits(), b = sel.building && building(st, sel.building);
    const el = $('rSel');
    if (b) {
      const B = BUILDINGS[b.kind], S = st.sides[b.side];
      let extra = '';
      if (!b.done) extra = `<div class="sub">Стройка: ${Math.round(b.progress * 100)}%</div><div class="bar prog"><i style="width:${b.progress * 100}%"></i></div>`;
      if (b.kind === 'mine') extra += `<div class="sub">${{ gold: 'Золото', iron: 'Железо', coal: 'Уголь', stone: 'Камень' }[b.res] || ''} · крестьян в шахте: ${b.workers.length}/${S.up.deepmines ? 10 : 5}</div>`;
      if (b.kind === 'mill') extra += `<div class="sub">На полях: ${b.farmers.length}/${B.farm}</div>`;
      if (b.research) extra += `<div class="sub">Изучается: ${UPGRADES[b.research.key].name}</div><div class="bar prog"><i style="width:${b.research.t / b.research.T * 100}%"></i></div>`;
      if (b.blocked) extra += `<div class="sub" style="color:var(--bad)">Нет мест: постройте дома</div>`;
      const q = b.queue.length ? `<div class="queue"><span class="sub">Очередь (клик — отменить):</span>${b.queue.map((k, i) => `<button type="button" class="kind" data-cancel="${i}" title="Отменить: ${UNITS[k].name}"><img src="${icons[k]}" alt="">${i === 0 ? `<i style="width:${b.trainT / UNITS[k].time * 100}%"></i>` : ''}</button>`).join('')}${b.repeat ? '<span class="sub">♾ бесконечно</span>' : ''}</div>` : (b.repeat ? '<div class="sub">♾ бесконечный найм ждёт ресурсов или домов</div>' : '');
      el.innerHTML = `<div class="head"><div class="por"><img src="${icons[b.kind]}" alt=""></div><div><h3>${B.name}${b.side !== 0 ? ` · ${S.name}` : ''}</h3><div class="sub">${B.desc}</div><div class="bar"><i style="width:${b.hp / b.maxHp * 100}%"></i></div><div class="sub">${Math.ceil(b.hp)} / ${b.maxHp}</div></div></div>${extra}${q}`;
      return;
    }
    if (!units.length) { el.innerHTML = `<div class="sub">Выдели юнитов рамкой или кликом. Клик по зданию — найм и исследования.</div>`; return; }
    if (units.length === 1) {
      const u = units[0], U = UNITS[u.kind];
      const task = u.inside ? 'в шахте' : u.task ? { gather: u.task.res === 'wood' ? 'рубит лес' : 'добывает камень', farm: 'работает в поле', build: 'строит', mine: 'идёт в шахту', repair: 'чинит' }[u.task.kind] : u.formation ? 'в отряде' : u.order.type === 'attack' ? 'в бою' : u.order.type === 'move' ? 'идёт' : 'ждёт';
      el.innerHTML = `<div class="head"><div class="por"><img src="${icons[u.kind]}" alt=""></div><div><h3>${U.name}</h3><div class="sub">${U.desc} · ${task}${u.carry?.n ? ` · несёт ${Math.floor(u.carry.n)} ${RES_ICON[u.carry.res]}` : ''}</div><div class="bar"><i style="width:${u.hp / u.maxHp * 100}%"></i></div><div class="sub">${Math.ceil(u.hp)} / ${Math.round(u.maxHp)}${u.stance === 'hold' ? ' · стоит на месте' : ''}</div></div></div>${formationInfo()}`;
      return;
    }
    const counts = {};
    for (const u of units) counts[u.kind] = (counts[u.kind] || 0) + 1;
    const allPeasants = units.every(u => UNITS[u.kind].peasant);
    el.innerHTML = `<div class="sub">Выделено: ${units.length}${allPeasants ? ` · кликни лес, камень, мельницу или шахту — или кнопку справа` : ''}</div>${allPeasants ? `<div class="sub">Порядок построек: ${TECH_HINT}</div>` : ''}<div class="kinds">${Object.entries(counts).map(([k, n]) => `<button type="button" class="kind" data-kind="${k}" title="${UNITS[k].name}"><img src="${icons[k]}" alt=""><b>${n}</b></button>`).join('')}</div>${formationInfo()}`;
  }
  function formationInfo() {
    const forms = selFormations();
    if (!forms.length) return '';
    return `<div class="forms">${forms.slice(0, 4).map(f => `<div class="form">${UNITS[f.kind].name}ы ×${f.members.length} · ${SHAPES[f.shape].toLowerCase()} <div class="bar morale" title="Мораль"><i style="width:${Math.max(0, f.morale)}%"></i></div>${f.drummer ? '🥁' : ''}${f.officer ? '' : ' без офицера'}</div>`).join('')}</div>`;
  }
  $('rSel').addEventListener('click', e => {
    const c = e.target.closest('[data-cancel]');
    if (c && sel.building) { cancelTrainAt(st, sel.building, +c.dataset.cancel); renderPanel(); return; }
    const k = e.target.closest('[data-kind]');
    if (k) select(myUnits().filter(u => u.kind === k.dataset.kind));
  });

  /* ---------- idle peasants and the cursor hint ---------- */
  const idlePeasants = () => st.units.filter(u => u.side === 0 && UNITS[u.kind].peasant && !u.inside && !u.task && u.order.type === 'idle');
  let idleIdx = 0;
  $('rIdle').onclick = () => {
    const list = idlePeasants();
    if (!list.length) { toast('Все крестьяне при деле', 'good'); return; }
    const u = list[idleIdx++ % list.length];
    select([u]); rig.tx = u.x * CELL; rig.tz = u.z * CELL;
  };
  let hintT = 0;
  function cursorHint(e) {
    const el = $('rCursor');
    if (!e || mode || down) { el.hidden = true; return; }
    const units = myUnits();
    if (!units.length) { el.hidden = true; return; }
    const peasants = units.some(u => UNITS[u.kind].peasant), mil = units.some(u => !UNITS[u.kind].peasant);
    let text = '';
    const enemy = unitAt(e.clientX, e.clientY, u => u.side !== 0);
    const b = !enemy && buildingAt(e);
    if ((enemy || (b && b.side !== 0)) && mil) text = '⚔ Атаковать';
    else if (peasants && b && b.side === 0) text = !b.done ? '🔨 Строить' : b.kind === 'mill' ? '🌾 В поле' : b.kind === 'mine' ? '⛏ В шахту' : b.hp < b.maxHp ? '🔨 Чинить' : '';
    else if (peasants && !b) {
      const r0 = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r0.left) / r0.width) * 2 - 1, -((e.clientY - r0.top) / r0.height) * 2 + 1);
      ray.setFromCamera(ndc, eng.camera);
      let cell = world.pickProp(ray);
      if (cell < 0) { const g = groundAt(e); if (g) cell = Math.floor(g.z) * W + Math.floor(g.x); }
      const k = cell >= 0 ? st.map.kind[cell] : -1;
      text = k === TREE ? '🪓 Рубить лес' : k === ROCK ? '🪨 Ломать камень' : '';
      if (k === 4) {
        const d = st.map.deposits.find(d => cell % W >= d.x && cell % W < d.x + 3 && Math.floor(cell / W) >= d.z && Math.floor(cell / W) < d.z + 3);
        if (d && !d.mine) text = `${{ gold: '🪙 Золото', iron: '⛓ Железо', coal: '⚫ Уголь', stone: '🪨 Камень' }[d.kind]}: постройте здесь шахту`;
      }
    }
    if (!text) { el.hidden = true; return; }
    const r = canvas.parentElement.getBoundingClientRect();
    el.textContent = text; el.hidden = false;
    el.style.left = (e.clientX - r.left + 16) + 'px'; el.style.top = (e.clientY - r.top + 14) + 'px';
  }

  /* ---------- top bar ---------- */
  const prevRes = {};
  function renderTop() {
    const S = st.sides[0];
    $('rRes').innerHTML = RES.map(r => `<span title="${RES_NAME[r]}" class="${S.res[r] < 30 ? 'low' : ''}"><i>${RES_ICON[r]}</i>${Math.floor(S.res[r])}</span>`).join('');
    const used = popUsed(st, 0);
    $('rPop').textContent = `👥 ${used}/${S.popCap}`;
    $('rPop').classList.toggle('full', used >= S.popCap);
    $('rTime').textContent = fmtTime(st.t);
    const idle = idlePeasants().length;
    $('rIdle').textContent = `😴 ${idle}`;
    $('rIdle').classList.toggle('warn', idle > 0);
    $('rIdle').title = idle ? `Без дела: ${idle} крестьян. Клик — показать следующего` : 'Все крестьяне при деле';
    const peace = st.peace - st.t;
    $('rPeace').hidden = peace <= 0;
    if (peace > 0) $('rPeace').textContent = `Мирное время ${fmtTime(peace)}`;
  }
  function renderSpeed() {
    $('rSpeed').innerHTML = [['⏸', 0], ['×1', 1], ['×2', 2], ['×3', 3]].map(([l, v]) => `<button type="button" data-v="${v}" class="${(paused ? 0 : speed) === v ? 'on' : ''}">${l}</button>`).join('');
  }
  $('rSpeed').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const v = +b.dataset.v; if (v === 0) paused = true; else { paused = false; speed = v; } renderSpeed(); };
  $('rHelpBtn').onclick = () => { $('rHelp').hidden = false; };
  $('rHelpClose').onclick = () => { $('rHelp').hidden = true; };
  // two clicks to leave: the first one asks
  let exitArmed = 0;
  $('rExit').onclick = () => {
    if (performance.now() - exitArmed < 3000) { close(); return; }
    exitArmed = performance.now();
    $('rExit').textContent = 'Точно выйти?';
    setTimeout(() => { $('rExit').textContent = 'Выйти'; }, 3000);
  };

  /* ---------- minimap ---------- */
  const mm = $('rMini'), mctx = mm.getContext('2d');
  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  (() => {
    const x = base.getContext('2d'), img = x.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const k = st.map.kind[i], hgt = st.map.height[Math.floor(i / W) * (W + 1) + i % W];
      const c = k === 1 ? [61, 112, 150] : k === 2 ? [44, 82, 46] : k === 3 ? [140, 136, 128] : k === 4 ? [180, 150, 70] : [96 + hgt * 6, 128 + hgt * 6, 70];
      img.data.set([c[0], c[1], c[2], 255], i * 4);
    }
    x.putImageData(img, 0, 0);
  })();
  const fogC = document.createElement('canvas'); fogC.width = W; fogC.height = H;
  const fogX = fogC.getContext('2d'), fogImg = fogX.createImageData(W, H);
  function drawMini() {
    const w = mm.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mm.width !== Math.round(w * dpr)) { mm.width = mm.height = Math.round(w * dpr); }
    const k = mm.width / W;
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(base, 0, 0, mm.width, mm.height);
    const S = st.sides[0];
    for (let i = 0; i < W * H; i++) fogImg.data[i * 4 + 3] = S.explored[i] ? (S.visible[i] ? 0 : 110) : 255;
    fogX.putImageData(fogImg, 0, 0);
    for (const b of st.buildings) {
      if (b.side !== 0 && !S.explored[Math.floor(b.z) * W + Math.floor(b.x)]) continue;
      mctx.fillStyle = st.sides[b.side].color;
      mctx.fillRect(b.x * k, b.z * k, b.w * k, b.h * k);
    }
    for (const u of st.units) {
      if (u.inside || (u.side !== 0 && !S.visible[Math.floor(u.z) * W + Math.floor(u.x)])) continue;
      mctx.fillStyle = sel.units.has(u.id) ? '#ffffff' : st.sides[u.side].color;
      mctx.fillRect(u.x * k - 1.5, u.z * k - 1.5, 3, 3);
    }
    mctx.drawImage(fogC, 0, 0, mm.width, mm.height);
    // camera footprint
    const r = canvas.getBoundingClientRect();
    const pts = [[0, 0], [r.width, 0], [r.width, r.height], [0, r.height]].map(([x, y]) => eng.pick(r.left + x, r.top + y));
    if (pts.every(Boolean)) {
      mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.beginPath();
      pts.forEach((p, i) => { const X = p.x / CELL * k, Y = p.z / CELL * k; i ? mctx.lineTo(X, Y) : mctx.moveTo(X, Y); });
      mctx.closePath(); mctx.stroke();
    }
  }
  let mmDown = false;
  const mmPoint = e => { const r = mm.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, z: (e.clientY - r.top) / r.height * H }; };
  mm.addEventListener('contextmenu', e => e.preventDefault());
  mm.addEventListener('pointerdown', e => {
    const p = mmPoint(e);
    if (e.button === 2) { const units = myUnits(); if (units.length) { commandMove(st, units.filter(u => !u.formation).map(u => u.id), p.x, p.z); selFormations().forEach(f => moveFormation(st, f.id, p.x, p.z)); marker(p.x, p.z); } return; }
    mmDown = true; mm.setPointerCapture(e.pointerId);
    rig.tx = p.x * CELL; rig.tz = p.z * CELL;
  });
  mm.addEventListener('pointermove', e => { if (mmDown) { const p = mmPoint(e); rig.tx = p.x * CELL; rig.tz = p.z * CELL; } });
  mm.addEventListener('pointerup', () => { mmDown = false; });

  /* ---------- overlay ---------- */
  function drawOverlay(dt) {
    const w = overlay.clientWidth, h = overlay.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) { overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr); }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, w, h);
    const vis = st.sides[0].visible;
    // hp bars: selected units always, other visible units when hurt
    for (const u of st.units) {
      if (u.inside) continue;
      const selected = sel.units.has(u.id);
      if (!selected && u.hp >= u.maxHp) continue;
      if (u.side !== 0 && !vis[Math.floor(u.z) * W + Math.floor(u.x)]) continue;
      const v = world.view.get(u.id), p = screenOf(v ? v.x : u.x, v ? v.z : u.z, UNITS[u.kind].cav ? 3.2 : 2.3);
      if (p.behind || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) continue;
      const bw = 18, k = Math.max(0, u.hp / u.maxHp);
      octx.fillStyle = 'rgba(15,22,28,.7)'; octx.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, 4);
      octx.fillStyle = u.side === 0 ? (k > 0.5 ? '#5BC97A' : '#F2C14E') : '#FF6B6B'; octx.fillRect(p.x - bw / 2, p.y, bw * k, 2);
    }
    // formation banners: morale over the officer
    for (const f of st.formations) {
      if (f.side !== 0 && !vis[Math.floor(f.z) * W + Math.floor(f.x)]) continue;
      const p = screenOf(f.x, f.z, 4.2);
      if (p.behind || p.x < -40 || p.x > w + 40) continue;
      const k = Math.max(0, f.morale / 100);
      octx.fillStyle = 'rgba(15,22,28,.75)'; octx.fillRect(p.x - 22, p.y - 2, 44, 7);
      octx.fillStyle = k > 0.5 ? '#F2C14E' : '#FF6B6B'; octx.fillRect(p.x - 21, p.y - 1, 42 * k, 5);
      octx.font = '800 11px Nunito, system-ui'; octx.textAlign = 'center'; octx.fillStyle = st.sides[f.side].color;
      octx.lineWidth = 3; octx.strokeStyle = 'rgba(15,22,28,.85)';
      const t = `${f.members.length}${f.shape === 'square' ? ' ◻' : f.shape === 'column' ? ' ▮' : ' ▬'}`;
      octx.strokeText(t, p.x, p.y - 5); octx.fillText(t, p.x, p.y - 5);
    }
    // buildings: construction progress and damage
    for (const b of st.buildings) {
      if (b.side !== 0 && b.id !== sel.building) continue;
      if (b.done && b.hp >= b.maxHp && b.id !== sel.building && !b.captureT) continue;
      const c = centerOf(b), p = screenOf(c.x, c.z, 9);
      if (p.behind) continue;
      const bw = 60;
      octx.fillStyle = 'rgba(15,22,28,.75)'; octx.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, 6);
      octx.fillStyle = !b.done ? '#9CC0FF' : '#5BC97A'; octx.fillRect(p.x - bw / 2, p.y, bw * (b.done ? b.hp / b.maxHp : b.progress), 4);
      if (b.captureT > 0) { octx.fillStyle = '#FF6B6B'; octx.fillRect(p.x - bw / 2, p.y + 6, bw * b.captureT / 3, 3); }
    }
    // rally point of the selected building
    const sb = sel.building && building(st, sel.building);
    if (sb?.rally) { const p = screenOf(sb.rally.x, sb.rally.z, 0); octx.fillStyle = '#ffd76a'; octx.font = '18px system-ui'; octx.textAlign = 'center'; octx.fillText('🚩', p.x + 4, p.y); }
    // click markers
    for (const m of markers) {
      m.t += dt;
      const p = screenOf(m.x, m.z, 0.1), r = 6 + m.t * 26;
      octx.globalAlpha = Math.max(0, 1 - m.t / 0.6); octx.strokeStyle = m.color; octx.lineWidth = 2.5;
      octx.beginPath(); octx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); octx.stroke(); octx.globalAlpha = 1;
    }
    for (let i = markers.length - 1; i >= 0; i--) if (markers[i].t > 0.6) markers.splice(i, 1);
    // selection box and facing arrow
    if (down?.drag && down.cx != null) {
      const r = canvas.getBoundingClientRect();
      if (down.button === 0 && !mode) {
        octx.strokeStyle = '#7dff9a'; octx.lineWidth = 1.5; octx.fillStyle = 'rgba(125,255,154,.08)';
        const x = Math.min(down.x, down.cx) - r.left, y = Math.min(down.y, down.cy) - r.top, ww = Math.abs(down.cx - down.x), hh = Math.abs(down.cy - down.y);
        octx.fillRect(x, y, ww, hh); octx.strokeRect(x, y, ww, hh);
      } else if (down.button === 2) {
        octx.strokeStyle = '#ffd76a'; octx.lineWidth = 3;
        octx.beginPath(); octx.moveTo(down.x - r.left, down.y - r.top); octx.lineTo(down.cx - r.left, down.cy - r.top); octx.stroke();
      }
    }
  }

  /* ---------- loop ---------- */
  function events() {
    world.playEvents(st.events, st.t);
    let rebuild = false;
    for (const e of st.events) {
      if (e.t === 'msg' && e.side === 0) toast(e.text, e.kind);
      if (e.t === 'placed' || e.t === 'built' || e.t === 'captured' || e.t === 'destroyed') rebuild = true;
      if (e.t === 'rout' && e.side !== 0) toast('Враг бежит!', 'good');
      if (e.t === 'built' || e.t === 'researched' || e.t === 'captured') bldT = 0;
    }
    if (rebuild) world.syncBuildings();
    st.events.length = 0;
  }
  function loop(ts) {
    if (closed) return;
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    const real = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    // camera keys
    const pan = rig.dist * 1.1 * real, c = Math.cos(rig.yaw), s = Math.sin(rig.yaw);
    const mv = (dx, dz) => { rig.tx += dx * c + dz * s; rig.tz += -dx * s + dz * c; };
    if (keys.has('ArrowLeft')) mv(-pan, 0);
    if (keys.has('ArrowRight')) mv(pan, 0);
    if (keys.has('ArrowUp')) mv(0, -pan);
    if (keys.has('ArrowDown')) mv(0, pan);
    if (keys.has('Equal') || keys.has('NumpadAdd') || keys.has('PageUp')) rig.dist *= Math.exp(-real * 1.4);
    if (keys.has('Minus') || keys.has('NumpadSubtract') || keys.has('PageDown')) rig.dist *= Math.exp(real * 1.4);
    if (keys.has('Comma')) rig.yaw -= real * 1.2;
    if (keys.has('Period')) rig.yaw += real * 1.2;
    let dt = 0;
    if (!paused && !st.over) {
      acc += real * speed;
      let steps = 0;
      while (acc >= DT && steps < 6) {
        prev.clear();
        for (const u of st.units) prev.set(u.id, [u.x, u.z]);
        for (let s2 = 1; s2 < st.sides.length; s2++) aiTick(st, s2, DT);
        tick(st, DT);
        events();
        acc -= DT; steps++;
      }
      if (steps >= 6) acc = 0;
      dt = real * speed;
    }
    const alpha = paused || st.over ? 1 : Math.min(1, acc / DT);
    world.drawUnits(alpha, dt, st.t, sel.units, prev);
    world.drawShots();
    world.update(paused ? 0 : real * speed, st.t);
    fogT -= real;
    if (fogT <= 0) { fogT = 0.25; world.syncFog(); }
    eng.updateCamera();
    eng.render();
    drawOverlay(real);
    hudT -= real; bldT -= real;
    if (hudT <= 0) { hudT = 0.25; cleanSel(); renderTop(); renderSel(); refreshButtons(); drawMini(); }
    if (bldT <= 0) { bldT = 2; renderPanel(); }
    if (st.over && $('rEnd').hidden) showEnd();
  }
  function showEnd() {
    const win = st.over === 'victory', S = st.sides[0];
    $('rEndBody').innerHTML = `<h2 class="${win ? 'win' : 'loss'}">${win ? 'Победа!' : 'Поражение'}</h2>
      <p>${win ? 'Все соперники разбиты' : 'Ратуша и крестьяне потеряны'} за ${fmtTime(st.t)}.</p>
      <div class="lstats"><span>Убито врагов <b>${S.stats.killed}</b></span><span>Потеряно <b>${S.stats.lost}</b></span><span>Добыто ресурсов <b>${Math.round(S.stats.gathered)}</b></span><span>Захвачено зданий <b>${S.stats.captured}</b></span></div>
      <div class="row"><button class="gbtn primary" type="button" id="rAgain">Новая партия</button><button class="gbtn" type="button" id="rLook">Посмотреть на поле</button></div>`;
    $('rEnd').hidden = false;
    $('rAgain').onclick = () => close();
    $('rLook').onclick = () => { $('rEnd').hidden = true; };
  }
  function close() {
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('resize', onResize);
    eng.renderer.dispose();
    $('rEnd').hidden = true; $('rGame').hidden = true; $('rSetup').hidden = false;
    location.reload();
  }

  renderSpeed(); renderTop(); renderPanel();
  setMode(null);
  raf = requestAnimationFrame(loop);
  try { if (!localStorage.getItem('aos.rts.help')) { $('rHelp').hidden = false; localStorage.setItem('aos.rts.help', '1'); } } catch { /* storage unavailable */ }
  // first selection: all peasants, so the player can start working at once
  select(st.units.filter(u => u.side === 0 && UNITS[u.kind].peasant));
  window.__rts = { st, eng, rig, world, sel, select, orderAt };
  return { st };
}

/* ---------- icons rendered from the 3D models ---------- */
function makeIcons(models) {
  const out = {};
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  let r;
  try { r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return out; }
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  const fogWas = worldFog.on.value;
  worldFog.on.value = 0;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6b5a3c', 1.6));
  const d = new THREE.DirectionalLight('#fff3dc', 2.4); d.position.set(3, 5, 4); scene.add(d);
  const crowd = createCrowd(scene, models, { capacity: 2, shadows: false });
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const blue = new THREE.Color('#2F6FDB');
  for (const [k, m] of Object.entries(UNIT_ICON_MODEL)) {
    const big = models[m].type !== 'human';
    cam.position.set(big ? 3.2 : 2.2, big ? 2.6 : 1.9, big ? 5.4 : 3.6); cam.lookAt(0.1, big ? 1.3 : 1.05, 0);
    crowd.begin(); crowd.draw({ model: m, x: 0, y: 0, z: 0, yaw: 0.65, color: blue, walk: 0, moving: false, act: 'idle', actT: 99, aim: 0, dead: -1, t: 0 }); crowd.end();
    r.render(scene, cam);
    out[k] = c.toDataURL();
  }
  crowd.begin(); crowd.end();
  for (const [k, fn] of Object.entries(BUILD_MODEL)) {
    const mesh = staticMesh(fn(), '#2F6FDB');
    scene.add(mesh);
    mesh.geometry.computeBoundingSphere();
    const rad = mesh.geometry.boundingSphere.radius, ctr = mesh.geometry.boundingSphere.center;
    cam.position.set(ctr.x + rad * 1.5, ctr.y + rad * 1.3, ctr.z + rad * 2.2); cam.lookAt(ctr.x, ctr.y * 0.8, ctr.z);
    r.render(scene, cam);
    out[k] = c.toDataURL();
    scene.remove(mesh); mesh.geometry.dispose();
  }
  r.dispose();
  worldFog.on.value = fogWas;
  return out;
}
