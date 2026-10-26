// Lane battle greybox, visual: side-view field, groups as clusters of figures, icons instead of text.
import { createLane, playRound, tick, ordersFor, onField, sideShare, zoneAt, ORDERS, TARGETS, LANE, TICKS, ROUND_CAP } from '../rules/lane.js';
import { figInner, figSVG } from './art.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1400, X0 = 110, X1 = 1290, TICK_MS = 4000 / TICKS;
let H = 520, GROUND = 420, ROW_DY = 46;
const BLUE = '#2F6FDB', RED = '#D64545';
const x = pos => X0 + pos * (X1 - X0) / (LANE - 1);
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const el = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
// cluster slots; the front row comes last so it is drawn on top
const SLOTS = [[-9, -9], [9, -9], [-18, 0], [0, 0], [18, 0]];
const gone = g => g.state === 'dead' || g.state === 'fled';

export function openLane({ player, enemy, seed = 1, onExit }) {
  let st, busy = false, selId = null;
  const svg = $('laneSvg');
  const layers = {};

  function start() {
    st = createLane({ player, enemy, seed });
    st.groups.forEach(g => { const side = st.groups.filter(o => o.side === g.side); g.row = side.indexOf(g); });
    selId = st.groups.find(g => g.side === 'player')?.id ?? null;
    buildScene();
    renderAll();
  }

  const groundY = () => GROUND;
  const groupXY = g => [x(g.pos) + (g.row % 2) * 18 * (g.side === 'player' ? -1 : 1), groundY(g.pos) - g.row * ROW_DY];

  /* ---------- static scene ---------- */
  function buildScene() {
    // fill the available area: height follows the container's aspect ratio
    const box = svg.getBoundingClientRect(), rows = Math.max(...st.groups.map(g => g.row)) + 1;
    H = Math.max(rows * 46 + 170, Math.min(1000, box.width ? W * box.height / box.width : 520));
    GROUND = H - 56;
    ROW_DY = Math.max(46, Math.min(90, (H - 56 - 150) / Math.max(1, rows - 1)));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';
    const top = GROUND - (rows - 1) * ROW_DY - 40;
    let s = `<rect width="${W}" height="${H}" fill="#A9CCE3"/><rect y="${top}" width="${W}" height="${H - top}" fill="#86B86E"/><rect y="${GROUND + 14}" width="${W}" height="${H - GROUND}" fill="#77A960"/>`;
    for (const z of st.terrain) {
      const a = x(z.from) - 20, b = x(z.to) + 20, mid = (a + b) / 2;
      if (z.type === 'hill') {
        s += `<rect x="${a}" y="${top}" width="${b - a}" height="${H - top}" fill="#C9B587"/>`;
        for (let yy = top + 24; yy < H; yy += 34) s += `<path d="M${a + 12} ${yy} q${(b - a - 24) / 2} -16 ${b - a - 24} 0" stroke="#B39D6E" stroke-width="2.5" fill="none"/>`;
        s += `<path d="M${a} ${top} q${(b - a) / 2} -40 ${b - a} 0 Z" fill="#C9B587"/>`;
      }
      if (z.type === 'ford') {
        s += `<rect x="${a}" y="${top}" width="${b - a}" height="${H - top}" fill="#6DB4E8"/>`;
        for (let yy = top + 20; yy < H; yy += 30) s += `<path d="M${a + 10 + (yy % 60 ? 0 : 14)} ${yy} q8 -6 16 0 t16 0 t16 0" stroke="#B5DCF6" stroke-width="2.5" fill="none"/>`;
      }
      if (z.type === 'forest') {
        s += `<rect x="${a}" y="${top}" width="${b - a}" height="${H - top}" fill="#5E8F4C"/>`;
        for (let i = 0; i < 5; i++) {
          const tx = a + 14 + i * (b - a - 28) / 4, ty = top - 46 - (i % 2) * 8;
          s += `<rect x="${tx - 3}" y="${ty + 36}" width="6" height="14" fill="#6B4E2E"/><polygon points="${tx},${ty} ${tx + 20},${ty + 40} ${tx - 20},${ty + 40}" fill="#3E7C59"/>`;
        }
        for (let yy = top + 30; yy < H - 10; yy += 44) for (let i = 0; i < 3; i++) s += `<circle cx="${a + 18 + i * (b - a - 36) / 2 + (yy % 88 ? 10 : 0)}" cy="${yy}" r="6" fill="#4F7E43"/>`;
      }
      const icon = { hill: '⛰ Холм', forest: '🌲 Лес', ford: '≈ Брод' }[z.type];
      s += `<rect x="${mid - 38}" y="${H - 26}" width="76" height="20" rx="10" fill="rgba(20,33,42,.55)"/><text x="${mid}" y="${H - 11.5}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="Nunito,system-ui,sans-serif">${icon}</text>`;
    }
    const foeFlag = st.groups.some(g => g.side === 'enemy' && g.fearless) ? '#2E3B3F' : RED;
    s += `<g transform="translate(${X0 - 70} ${top + 10})"><rect x="-3" y="-90" width="6" height="90" fill="#6B4E2E"/><polygon points="3,-90 46,-78 3,-64" fill="${BLUE}"/></g>`;
    s += `<g transform="translate(${X1 + 70} ${top + 10})"><rect x="-3" y="-90" width="6" height="90" fill="#6B4E2E"/><polygon points="-3,-90 -46,-78 -3,-64" fill="${foeFlag}"/></g>`;
    const scene = el('g'); scene.innerHTML = s; svg.appendChild(scene);
    ['groups', 'fx'].forEach(n => { layers[n] = el('g'); svg.appendChild(layers[n]); });
    layers.fx.style.pointerEvents = 'none';
    layers.nodes = new Map();
    st.groups.slice().sort((a, b) => b.row - a.row).forEach(g => {
      const n = el('g', { class: 'lgrp', 'data-id': g.id });
      n.style.transition = `transform ${TICK_MS}ms linear, opacity .6s`;
      layers.groups.appendChild(n);
      layers.nodes.set(g.id, n);
    });
  }

  /* ---------- groups ---------- */
  function drawGroup(g) {
    const n = layers.nodes.get(g.id), [gx, gy] = groupXY(g);
    n.style.transform = `translate(${gx}px, ${gy}px)`;
    n.style.opacity = gone(g) ? 0 : 1;
    if (gone(g)) return;
    const flip = (g.side === 'enemy') !== (g.state === 'rout');
    const col = g.side === 'player' ? BLUE : RED;
    const k = (g.hero ? 0.72 : 0.56) * (1 - Math.min(g.row, 5) * 0.04);
    const figs = g.hero ? 1 : Math.max(1, Math.round(SLOTS.length * g.count / g.start));
    let s = '';
    if (g.id === selId) s += `<ellipse cx="0" cy="3" rx="40" ry="9" fill="none" stroke="#F2C14E" stroke-width="3"/>`;
    if (g.hero) s += `<ellipse cx="0" cy="3" rx="22" ry="6" fill="none" stroke="#F2C14E" stroke-width="2"/>`;
    const slots = g.hero ? [[0, 0]] : SLOTS.slice(SLOTS.length - figs);
    slots.forEach(([dx, dy]) => {
      s += `<g class="fig${g.state === 'waver' ? ' waver' : ''}" transform="translate(${(dx - 32 * k).toFixed(1)} ${(dy + 4 - 74 * k).toFixed(1)}) scale(${k.toFixed(3)})">${figInner(g.kind, col, flip)}</g>`;
    });
    // one compact header line: order bubble + morale/stamina bars
    const by = g.hero ? -60 : -50;
    const rout = g.state === 'rout';
    const icon = rout ? '!' : ORDERS[g.order].icon;
    const bub = rout ? '#FF6B6B' : g.side === 'enemy' ? (g.order === 'charge' ? '#FF6B6B' : '#F2C14E') : '#FFFFFF';
    s += `<rect x="-10" y="${by - 1}" width="36" height="4.5" rx="2" fill="rgba(20,33,42,.6)"/><rect x="-10" y="${by - 1}" width="${(36 * Math.max(0, g.fearless ? 100 : g.morale) / 100).toFixed(1)}" height="4.5" rx="2" fill="#F2C14E"/>`;
    s += `<rect x="-10" y="${by + 5}" width="36" height="4.5" rx="2" fill="rgba(20,33,42,.6)"/><rect x="-10" y="${by + 5}" width="${(36 * g.stamina / 100).toFixed(1)}" height="4.5" rx="2" fill="#7FB3FF"/>`;
    s += `<g transform="translate(-22 ${by + 4})"><g class="${g.side === 'enemy' && g.order === 'charge' && !rout ? 'lpulse' : ''}"><circle r="10" fill="${bub}" stroke="#14212A" stroke-width="2"/><text y="4.5" text-anchor="middle" font-size="12" font-weight="800" fill="#14212A">${icon}</text></g></g>`;
    s += `<rect x="-40" y="${by - 12}" width="80" height="${-by + 18}" fill="transparent"/>`;
    n.innerHTML = s;
    n.style.cursor = g.side === 'player' && !rout ? 'pointer' : 'default';
  }

  /* ---------- hud ---------- */
  function renderHud() {
    $('laneRound').textContent = `Раунд ${Math.min(st.round, ROUND_CAP)} / ${ROUND_CAP}`;
    $('lanePwrP').style.setProperty('--v', (sideShare(st, 'player') * 100).toFixed(0) + '%');
    $('lanePwrE').style.setProperty('--v', (sideShare(st, 'enemy') * 100).toFixed(0) + '%');
    $('laneChips').innerHTML = onField(st, 'player').map(g => `<button type="button" class="lchip ${g.id === selId ? 'on' : ''} ${g.state === 'rout' ? 'rout' : ''}" data-id="${g.id}" ${g.state === 'rout' ? 'disabled' : ''} title="${g.name}">
      <span class="lchip-fig">${figSVG(g.kind, BLUE)}</span><span class="lchip-n">×${g.count}</span>
      <span class="lchip-ord">${g.state === 'rout' ? '!' : ORDERS[g.order].icon}</span>
      <span class="lchip-bars"><i class="mo" style="width:${Math.max(0, g.morale)}%"></i><i class="st" style="width:${g.stamina}%"></i></span></button>`).join('');
    const g = st.groups.find(o => o.id === selId && o.state !== 'rout' && !gone(o));
    $('laneCmd').innerHTML = g ? `<span class="lcmd-name">${g.name}</span>${ordersFor(g).map((o, i) => `<button type="button" class="lcmd ${g.order === o ? 'on' : ''}" data-order="${o}" title="${ORDERS[o].hint}" ${busy ? 'disabled' : ''}><b>${ORDERS[o].icon}</b><small>${ORDERS[o].name}</small><kbd>${i + 1}</kbd></button>`).join('')}
      ${g.range > 1 ? `<span class="ltarget">${Object.entries(TARGETS).map(([k, v]) => `<button type="button" class="${g.target === k ? 'on' : ''}" data-target="${k}" ${busy ? 'disabled' : ''}>${v}</button>`).join('')}</span>` : ''}` : '';
    $('laneFight').disabled = busy || !!st.winner;
  }

  function renderAll() { st.groups.forEach(drawGroup); renderHud(); }

  /* ---------- effects ---------- */
  function float(id, text, color, size = 15) {
    const g = st.groups.find(o => o.id === id);
    if (!g) return;
    const [gx, gy] = groupXY(g);
    const t = el('text', { x: gx, y: gy - (size >= 18 ? 92 : 66), 'text-anchor': 'middle', 'font-size': size, 'font-weight': 800, fill: color, stroke: '#14212A', 'stroke-width': 3.5, 'paint-order': 'stroke', 'font-family': 'Nunito,system-ui,sans-serif' });
    t.textContent = text;
    layers.fx.appendChild(t);
    t.animate([{ transform: 'translateY(0)', opacity: 0 }, { opacity: 1, offset: .15 }, { transform: 'translateY(-22px)', opacity: 0 }], { duration: 1100, easing: 'ease-out' }).onfinish = () => t.remove();
  }
  function flash(id, cls) {
    layers.nodes.get(id)?.querySelectorAll('.fig').forEach((f, i) => {
      if (cls === 'a-attack' && i % 2) return;
      f.classList.add(cls);
      setTimeout(() => f.classList.remove(cls), 460);
    });
  }
  function shot(fromId, toId, magic) {
    const a = st.groups.find(g => g.id === fromId), b = st.groups.find(g => g.id === toId);
    if (!a || !b) return;
    const [x1, y1] = groupXY(a), [x2, y2] = groupXY(b), dir = Math.sign(x2 - x1) || 1;
    const p = magic ? el('circle', { r: 7, fill: '#FF9A3C' }) : el('line', { x1: -9, y1: 0, x2: 9, y2: 0, stroke: '#F1EAD8', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
    layers.fx.appendChild(p);
    const ang = dir > 0 ? 0 : 180, midY = Math.min(y1, y2) - 120;
    p.animate([
      { transform: `translate(${x1}px, ${y1 - 30}px) rotate(${ang - 30 * dir}deg)` },
      { transform: `translate(${(x1 + x2) / 2}px, ${midY}px) rotate(${ang}deg)` },
      { transform: `translate(${x2}px, ${y2 - 26}px) rotate(${ang + 30 * dir}deg)` }
    ], { duration: TICK_MS * 0.9, easing: 'linear' }).onfinish = () => p.remove();
  }
  function burst(id) {
    const g = st.groups.find(o => o.id === id);
    if (!g) return;
    const [gx, gy] = groupXY(g), c = el('circle', { r: 10, fill: '#FF9A3C', opacity: .85 });
    layers.fx.appendChild(c);
    c.animate([{ transform: `translate(${gx}px, ${gy - 24}px) scale(1)`, opacity: .9 }, { transform: `translate(${gx}px, ${gy - 24}px) scale(9)`, opacity: 0 }], { duration: 650, easing: 'ease-out' }).onfinish = () => c.remove();
  }

  /* ---------- round: rules resolve on the real state, a copy replays tick by tick ---------- */
  async function fight() {
    if (busy || st.winner) return;
    busy = true;
    renderHud();
    const replay = JSON.parse(JSON.stringify(st));
    replay.groups.forEach(g => { g.impact = false; g.chargePaid = false; });
    const { frames } = playRound(st);
    const done = st;
    st = replay;
    for (const frame of frames) {
      tick(st, []);
      st.groups.forEach(drawGroup);
      for (const e of frame) {
        if (e.t === 'melee') flash(e.id, 'a-attack');
        if (e.t === 'shoot') shot(e.id, e.at, false);
        if (e.t === 'spell') { shot(e.id, e.at, true); setTimeout(() => burst(e.at), TICK_MS * 0.8); }
        if (e.t === 'dmg') { flash(e.id, 'a-hit'); if (e.amount >= 3) float(e.id, '−' + e.amount, '#FFFFFF', 13); }
        if (e.t === 'impact') float(e.at, '⚡ ×2.5', '#F2C14E', 20);
        if (e.t === 'counter') float(e.at, 'копья!', '#F2C14E', 20);
        if (e.t === 'rout') float(e.id, 'бегут!', '#FF8A8A', 18);
        if (e.t === 'heal') float(e.id, '+' + e.amount, '#9FE3B5', 15);
      }
      await wait(TICK_MS);
    }
    done.groups.forEach(g => { g.row = replay.groups.find(r => r.id === g.id).row; });
    st = done;
    busy = false;
    if (!st.groups.some(g => g.id === selId && g.state !== 'rout' && !gone(g))) selId = onField(st, 'player').find(g => g.state !== 'rout')?.id ?? null;
    renderAll();
    if (st.winner) showEnd();
  }

  function showEnd() {
    const win = st.winner === 'player';
    $('laneEndBody').innerHTML = `<h2 id="leTitle" class="${win ? 'win' : 'loss'}">${win ? 'Победа' : 'Поражение'}</h2>
      <p>${win ? 'Вражеская армия сломлена.' : 'Твоя армия сломлена.'} Раундов: ${st.round - 1}.</p>
      <div class="row"><button class="gbtn primary" type="button" id="laneAgain">Ещё раз</button><button class="gbtn" type="button" id="laneBack">Назад к отряду</button></div>`;
    $('laneEnd').hidden = false;
    $('laneAgain').onclick = () => { $('laneEnd').hidden = true; seed += 1; start(); };
    $('laneBack').onclick = () => { $('laneEnd').hidden = true; onExit(); };
  }

  /* ---------- input ---------- */
  const select = id => { selId = id; renderAll(); };
  const setOrder = o => { const g = st.groups.find(v => v.id === selId); if (g && !busy && ordersFor(g).includes(o)) { g.order = o; renderAll(); } };
  svg.onclick = e => {
    const n = e.target.closest('.lgrp');
    if (!n) return;
    const g = st.groups.find(v => v.id === +n.dataset.id);
    if (g.side === 'player' && g.state !== 'rout') select(g.id);
    else if (g.side === 'enemy') float(g.id, `${g.name}: ${g.state === 'rout' ? 'бегут' : ORDERS[g.order].name.toLowerCase()}`, '#FFFFFF', 13);
  };
  $('laneChips').onclick = e => { const b = e.target.closest('[data-id]'); if (b && !b.disabled) select(+b.dataset.id); };
  $('laneCmd').onclick = e => {
    const o = e.target.closest('[data-order]');
    if (o) return setOrder(o.dataset.order);
    const t = e.target.closest('[data-target]'), g = st.groups.find(v => v.id === selId);
    if (t && g && !busy) { g.target = t.dataset.target; renderHud(); }
  };
  $('laneFight').onclick = fight;
  $('laneExit').onclick = () => onExit();
  $('laneHelpBtn').onclick = () => { $('laneHelp').hidden = false; };
  $('laneHelpClose').onclick = () => { $('laneHelp').hidden = true; };

  function onKey(e) {
    if ($('lane').hidden || e.target.closest('input')) return;
    if (!$('laneHelp').hidden) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); $('laneHelp').hidden = true; } return; }
    if (!$('laneEnd').hidden) return;
    if (e.key === 'Enter') { e.preventDefault(); fight(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const mine = onField(st, 'player').filter(g => g.state !== 'rout');
      const i = mine.findIndex(g => g.id === selId);
      if (mine.length) select(mine[(i + 1) % mine.length].id);
    } else if (/^[1-4]$/.test(e.key)) {
      const g = st.groups.find(v => v.id === selId);
      if (g) setOrder(ordersFor(g)[+e.key - 1]);
    }
  }
  window.addEventListener('keydown', onKey);
  const onResize = () => { if (!busy && st && !$('lane').hidden) { buildScene(); renderAll(); } };
  window.addEventListener('resize', onResize);
  start();
  try { if (!localStorage.getItem('aos.lane.help2')) { $('laneHelp').hidden = false; localStorage.setItem('aos.lane.help2', '1'); } } catch { /* storage unavailable */ }
  return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
}
