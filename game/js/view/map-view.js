// Kingdom map rendering: tiles + buildings, territory, fog, armies, overlays, camera.
import { center, corners, key, neighbor } from '../core/hex.js';
import { tile, building, figInner, MORVEN } from './art.js';
import { territory, cityRadius } from '../rules/map.js';
import { cityById } from '../rules/economy.js';

const NS = 'http://www.w3.org/2000/svg';
const S = 38, PAD = 30;
const BLUE = '#2F6FDB', BANDIT = '#8A6A48';
const el = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
const label = (x, y, t, c) => { const w = t.length * 6.4 + 16; return `<rect x="${x - w / 2}" y="${y}" width="${w}" height="17" rx="8.5" fill="${c}"/><text x="${x}" y="${y + 12}" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-weight="800" font-size="10.5" fill="#fff">${t}</text>`; };

export const armyColor = a => a.owner === 'player' ? BLUE : a.faction === 'bandits' ? BANDIT : MORVEN;

export class MapView {
  constructor(svg, handlers) {
    this.svg = svg;
    this.h = handlers;
    this.cam = { x: 0, y: 0, z: 1.25 };
    this.keys = new Set();
    this.layers = {};
    ['tiles', 'terr', 'over', 'hit', 'armies', 'labels', 'fog'].forEach(n => { this.layers[n] = el('g'); svg.appendChild(this.layers[n]); });
    ['terr', 'over', 'labels', 'fog'].forEach(n => { this.layers[n].style.pointerEvents = 'none'; });
    this.bindInput();
  }

  pos(r, c) { const [x, y] = center(r, c, S); return [x + PAD + S, y + PAD + S * 0.8]; }

  setKingdom(K) {
    this.K = K;
    const [x1] = this.pos(0, K.w - 1), [, y1] = this.pos(K.h - 1, 0);
    this.world = { w: x1 + S * 1.8 + PAD, h: y1 + S + PAD };
    let hit = '';
    for (let r = 0; r < K.h; r++) for (let c = 0; c < K.w; c++) {
      const [x, y] = this.pos(r, c);
      hit += `<polygon class="hit" data-r="${r}" data-c="${c}" points="${corners(x, y, S)}"/>`;
    }
    this.layers.hit.innerHTML = hit;
    this.renderAll();
  }

  renderAll(vis) {
    this.renderTiles();
    this.renderTerritory();
    this.renderArmies(vis);
    this.renderFog(vis);
  }

  renderTiles() {
    const K = this.K;
    let s = '';
    for (let r = 0; r < K.h; r++) for (let c = 0; c < K.w; c++) {
      if (!K.explored[key(r, c)]) continue;
      const [x, y] = this.pos(r, c), b = K.buildings[key(r, c)];
      const base = b && b.type === 'farm' ? 'field' : K.tiles[r][c];
      let extra = '';
      if (b) extra = b.type === 'townhall' ? building('townhall', x, y + 2, S * 0.95, BLUE) : building(b.type, x, y + 2, S * 0.92, BLUE);
      if (b && b.level > 1) extra += `<text x="${x + S * .5}" y="${y + S * .45}" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-weight="800" font-size="10" fill="#fff" stroke="#14212A" stroke-width="2.5" paint-order="stroke">${'I'.repeat(b.level)}</text>`;
      const ruin = K.ruins[key(r, c)];
      if (ruin && !ruin.looted) extra += `<circle cx="${x + S * .45}" cy="${y - S * .35}" r="5" fill="#F2C14E" stroke="#14212A" stroke-width="1.5"/>`;
      s += tile(base, x, y, S, extra);
    }
    this.layers.tiles.innerHTML = s;
  }

  renderTerritory() {
    const K = this.K, own = territory(K);
    let s = '', labels = '';
    for (const [k, id] of own) {
      const city = cityById(K, id);
      if (!city || city.owner !== 'player') continue;
      const [r, c] = k.split(',').map(Number);
      if (!K.explored[k]) continue;
      const [x, y] = this.pos(r, c);
      s += `<polygon points="${corners(x, y, S)}" fill="${BLUE}" opacity=".07"/>`;
      for (let e = 0; e < 6; e++) {
        const [nr, nc] = neighbor(r, c, e);
        if (own.get(key(nr, nc)) === id) continue;
        const a = Math.PI / 180 * (60 * e + 30), b = Math.PI / 180 * (60 * ((e + 1) % 6) + 30);
        s += `<line x1="${(x + S * Math.cos(a)).toFixed(1)}" y1="${(y + S * Math.sin(a) * .8).toFixed(1)}" x2="${(x + S * Math.cos(b)).toFixed(1)}" y2="${(y + S * Math.sin(b) * .8).toFixed(1)}" stroke="${BLUE}" stroke-width="3" stroke-linecap="round"/>`;
      }
    }
    for (const city of K.cities) {
      const [x, y] = this.pos(city.r, city.c);
      labels += label(x, y + 12, `${city.name} · ${city.pop}`, city.capital ? '#1F55B5' : BLUE);
    }
    for (let r = 0; r < K.h; r++) for (let c = 0; c < K.w; c++) {
      if (K.tiles[r][c] === 'village' && K.explored[key(r, c)] && !K.cities.some(x => x.r === r && x.c === c)) {
        const [x, y] = this.pos(r, c);
        labels += label(x, y + 10, 'Деревня', '#6E7A82');
      }
    }
    this.layers.terr.innerHTML = s;
    this.cityLabels = labels;
  }

  renderArmies(vis) {
    const K = this.K;
    let s = '';
    for (const a of K.armies) {
      if (a.owner !== 'player' && vis && !vis.has(key(a.r, a.c))) continue;
      if (a.owner !== 'player' && !K.explored[key(a.r, a.c)]) continue;
      const [cx0, y] = this.pos(a.r, a.c), col = armyColor(a), flip = a.owner !== 'player';
      // a garrison stands to the side so the town itself stays clickable
      const x = cx0 + (K.cities.some(t => t.r === a.r && t.c === a.c) ? 17 : 0);
      const lead = a.units.find(u => u.kind in { alden: 1, irena: 1, corvin: 1 }) || a.units[0];
      const second = a.units.find(u => u !== lead);
      const k = 0.5;
      const fig = (u, dx) => `<g class="fig" transform="translate(${(x + dx - 32 * k).toFixed(1)} ${(y + 6 - 74 * k).toFixed(1)}) scale(${k})">${figInner(u.kind, u.kind in { skeleton: 1, ghoul: 1, deathknight: 1, acolyte: 1 } ? MORVEN : col, flip)}</g>`;
      s += `<g class="army" data-id="${a.id}">`;
      if (a.owner === 'player' && a.mp <= 0) s += `<ellipse cx="${x}" cy="${y + 6}" rx="16" ry="5" fill="rgba(0,0,0,.25)"/>`;
      if (second) s += fig(second, flip ? 9 : -9);
      s += fig(lead, second ? (flip ? -5 : 5) : 0);
      s += `<circle cx="${x + 17}" cy="${y - 24}" r="8" fill="${col}" stroke="#14212A" stroke-width="2"/><text x="${x + 17}" y="${y - 20.5}" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-weight="800" font-size="10" fill="#fff">${a.units.length}</text>`;
      if (a.kind === 'wander') s += `<text x="${x - 17}" y="${y - 18}" text-anchor="middle" font-size="13" fill="#7CFFB2" stroke="#14212A" stroke-width="2.5" paint-order="stroke" font-weight="800">!</text>`;
      s += `</g>`;
    }
    this.layers.armies.innerHTML = s;
    this.layers.labels.innerHTML = this.cityLabels || '';
  }

  renderFog(vis) {
    const K = this.K;
    let s = '';
    for (let r = 0; r < K.h; r++) for (let c = 0; c < K.w; c++) {
      const k = key(r, c), [x, y] = this.pos(r, c);
      if (!K.explored[k]) s += `<polygon points="${corners(x, y, S + .8)}" fill="#1B2932"/><polygon points="${corners(x, y, S + .8)}" fill="url(#mapHatch)"/>`;
      else if (vis && !vis.has(k)) s += `<polygon points="${corners(x, y, S + .5)}" fill="#14212A" opacity=".38"/>`;
    }
    if (!this.svg.querySelector('#mapHatch')) {
      const defs = el('defs');
      defs.innerHTML = '<pattern id="mapHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#22323C" stroke-width="3"/></pattern>';
      this.svg.prepend(defs);
    }
    this.layers.fog.innerHTML = s;
  }

  overlay({ reach = [], attack = [], path = [], sel = null, hover = null, build = [] } = {}) {
    let s = '';
    const hex = (r, c, k, attrs) => { const [x, y] = this.pos(r, c); return `<polygon points="${corners(x, y, S * k)}" ${attrs}/>`; };
    build.forEach(([r, c]) => s += hex(r, c, .88, 'fill="rgba(242,193,78,.12)" stroke="rgba(242,193,78,.65)" stroke-width="1.3" stroke-dasharray="4 3"'));
    reach.forEach(([r, c]) => s += hex(r, c, .9, 'fill="rgba(255,255,255,.2)" stroke="rgba(255,255,255,.6)" stroke-width="1.3"'));
    attack.forEach(([r, c]) => s += hex(r, c, .88, 'fill="rgba(255,107,107,.18)" stroke="#FF6B6B" stroke-width="2.5"'));
    if (sel) s += hex(sel[0], sel[1], .9, 'fill="none" stroke="#F2C14E" stroke-width="3"');
    if (hover) s += hex(hover[0], hover[1], .95, 'fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.7)" stroke-width="1.8"');
    if (path.length > 1) {
      const p = path.map(([r, c]) => this.pos(r, c).join(',')).join(' ');
      const [ex, ey] = this.pos(...path[path.length - 1]);
      s += `<polyline points="${p}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round" class="marching"/><circle cx="${ex}" cy="${ey}" r="5" fill="#fff"/>`;
    }
    this.layers.over.innerHTML = s;
  }

  /* ---------- camera ---------- */
  applyCam() {
    const r = this.svg.getBoundingClientRect(), z = this.cam.z;
    const vw = Math.max(200, r.width) / z, vh = Math.max(200, r.height) / z;
    this.svg.setAttribute('viewBox', `${(this.cam.x - vw / 2).toFixed(1)} ${(this.cam.y - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
  }
  centerOn(r, c) { const [x, y] = this.pos(r, c); this.cam.x = x; this.cam.y = y; this.applyCam(); }
  pan(dx, dy) {
    this.cam.x = Math.min(this.world.w, Math.max(0, this.cam.x + dx / this.cam.z));
    this.cam.y = Math.min(this.world.h, Math.max(0, this.cam.y + dy / this.cam.z));
    this.applyCam();
  }
  zoom(f) { this.cam.z = Math.min(2.2, Math.max(0.35, this.cam.z * f)); this.applyCam(); }

  hexFromEvent(e) {
    const t = e.target.closest('[data-r], .army');
    if (!t) return null;
    if (t.classList.contains('army')) { const a = this.K.armies.find(x => x.id === +t.dataset.id); return a ? [a.r, a.c] : null; }
    return [+t.dataset.r, +t.dataset.c];
  }

  bindInput() {
    const svg = this.svg;
    svg.addEventListener('pointermove', e => this.h.hover(this.hexFromEvent(e), e));
    svg.addEventListener('pointerleave', () => this.h.hover(null));
    svg.addEventListener('click', e => { const h = this.hexFromEvent(e); if (h) this.h.click(h, { onArmy: !!e.target.closest('.army') }); });
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) this.zoom(Math.exp(-e.deltaY * 0.01));
      else this.pan(e.deltaX, e.deltaY);
    }, { passive: false });
    window.addEventListener('resize', () => this.K && this.applyCam());
    const map = { 'ц': 'w', 'ф': 'a', 'ы': 's', 'в': 'd' };
    window.addEventListener('keydown', e => {
      if (e.target.closest('input') || !this.active()) return;
      const k = map[e.key.toLowerCase()] || e.key.toLowerCase();
      if ('wasd'.includes(k) && k.length === 1) { this.keys.add(k); this.loop(); }
      if (k === 'q' || k === 'й') this.zoom(1 / 1.15);
      if (k === 'e' || k === 'у') this.zoom(1.15);
    });
    window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); this.keys.delete(k); this.keys.delete(map[k]); });
    window.addEventListener('blur', () => this.keys.clear());
  }
  active() { return this.svg.closest('[hidden]') === null; }
  loop() {
    if (this.looping) return;
    this.looping = true;
    const step = () => {
      if (!this.keys.size) { this.looping = false; return; }
      const v = 11;
      this.pan((this.keys.has('d') ? v : 0) - (this.keys.has('a') ? v : 0), (this.keys.has('s') ? v : 0) - (this.keys.has('w') ? v : 0));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
export { S as MAP_S, cityRadius };
