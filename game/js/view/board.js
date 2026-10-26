// SVG board: tiles, overlays, unit nodes, event animations, camera (trackpad pan/pinch, WASD, Q/E).
import { center, corners, key, neighbor } from '../core/hex.js';
import { tile, decor, figInner, figSVG, SIDE_COLOR, MORVEN } from './art.js';

const NS = 'http://www.w3.org/2000/svg';
const S = 46, PAD = 40, FIG_K = 0.72;
const ROLE = {
  militia: '<line x1="0" y1="4" x2="0" y2="-3" stroke="#fff" stroke-width="1.4"/><polygon points="0,-5.5 2,-2 -2,-2" fill="#fff"/>',
  swordsman: '<path d="M-3.5 -4 h7 v3 q0 3.5 -3.5 5 q-3.5 -1.5 -3.5 -5 Z" fill="#fff"/>',
  knight: '<path d="M-3.5 -3.5 v2.5 a3.5 3.5 0 0 0 7 0 v-2.5" stroke="#fff" stroke-width="1.6" fill="none"/>',
  archer: '<path d="M-1.5 -4.5 Q3.5 0 -1.5 4.5" stroke="#fff" stroke-width="1.4" fill="none"/><line x1="-3.5" y1="0" x2="3.5" y2="0" stroke="#fff" stroke-width="1.2"/>',
  apprentice: '<path d="M0 -4 v8 M-4 0 h8" stroke="#fff" stroke-width="2"/>',
  battlemage: '<polygon points="0,-4.5 3,0 0,4.5 -3,0" fill="#fff"/>',
  alden: '<path d="M-4 3 v-5 l2 2 l2 -3 l2 3 l2 -2 v5 Z" fill="#fff"/>',
  irena: '<path d="M-4 3 v-5 l2 2 l2 -3 l2 3 l2 -2 v5 Z" fill="#fff"/>',
  corvin: '<path d="M-4 3 v-5 l2 2 l2 -3 l2 3 l2 -2 v5 Z" fill="#fff"/>',
  skeleton: '<circle r="3" fill="#fff"/><circle cx="-1.1" cy="-.3" r=".9" fill="#14212A"/><circle cx="1.1" cy="-.3" r=".9" fill="#14212A"/>',
  ghoul: '<path d="M-3 -3 l2 6 M0 -3.5 l1 6.5 M3 -3 l0 6" stroke="#fff" stroke-width="1.3"/>',
  deathknight: '<path d="M-3.5 -3.5 v2.5 a3.5 3.5 0 0 0 7 0 v-2.5" stroke="#fff" stroke-width="1.6" fill="none"/>',
  acolyte: '<circle r="3.2" fill="none" stroke="#fff" stroke-width="1.3"/><circle r="1" fill="#fff"/>'
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const el = (tag, attrs = {}, html = '') => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (html) n.innerHTML = html;
  return n;
};

export const unitColor = u => u.undead ? MORVEN : SIDE_COLOR[u.side];

export class Board {
  constructor(svg, handlers) {
    this.svg = svg;
    this.h = handlers;
    this.speed = 1;
    this.nodes = new Map();
    this.cam = { x: 0, y: 0, z: 1 };
    this.keys = new Set();
    this.layers = {};
    ['tiles', 'ice', 'over', 'hit', 'units', 'fx'].forEach(n => { this.layers[n] = el('g', { class: 'L-' + n }); svg.appendChild(this.layers[n]); });
    this.layers.over.style.pointerEvents = 'none';
    this.layers.fx.style.pointerEvents = 'none';
    this.layers.ice.style.pointerEvents = 'none';
    this.bindInput();
  }

  pos(r, c) { const [x, y] = center(r, c, S); return [x + PAD + S, y + PAD + S * 0.8]; }

  /* ---------- world ---------- */
  setBattle(st) {
    this.st = st;
    Object.values(this.layers).forEach(l => l.innerHTML = '');
    this.nodes.clear();
    let tiles = '', hit = '';
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
      const [x, y] = this.pos(r, c);
      tiles += tile(st.cells[r][c], x, y, S);
      hit += `<polygon class="hit" data-r="${r}" data-c="${c}" points="${corners(x, y, S)}"/>`;
    }
    this.layers.tiles.innerHTML = tiles;
    this.layers.hit.innerHTML = hit;
    const [x1] = this.pos(0, st.cols - 1), [, y1] = this.pos(st.rows - 1, 0);
    this.world = { w: x1 + S * 1.8 + PAD, h: y1 + S + PAD };
    this.fit();
    this.sync();
  }

  fit() {
    this.cam = { x: this.world.w / 2, y: this.world.h / 2, z: 1 };
    this.applyCam();
  }

  applyCam() {
    const { w, h } = this.world, z = this.cam.z;
    const vw = w / z, vh = h / z;
    this.svg.setAttribute('viewBox', `${(this.cam.x - vw / 2).toFixed(1)} ${(this.cam.y - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
  }

  pxToWorld() {
    const r = this.svg.getBoundingClientRect();
    return Math.max(this.world.w / this.cam.z / r.width, this.world.h / this.cam.z / r.height);
  }

  pan(dx, dy) {
    const k = this.pxToWorld();
    this.cam.x = Math.min(this.world.w, Math.max(0, this.cam.x + dx * k));
    this.cam.y = Math.min(this.world.h, Math.max(0, this.cam.y + dy * k));
    this.applyCam();
  }

  zoom(f) {
    this.cam.z = Math.min(2.6, Math.max(0.6, this.cam.z * f));
    this.applyCam();
  }

  renderIce() {
    this.layers.ice.innerHTML = this.st.ice.map(i => { const [x, y] = this.pos(i.r, i.c); return decor('ice', x, y, S); }).join('');
  }

  /* ---------- units ---------- */
  makeNode(u) {
    const g = el('g', { class: 'unit', 'data-id': u.id });
    const flip = u.side === 'enemy';
    const ring = u.hero ? `<ellipse cx="0" cy="4" rx="19" ry="6" fill="none" stroke="#F2C14E" stroke-width="2.2"/>` : '';
    const roleBg = u.hero ? '#B8862B' : u.side === 'player' ? '#2F6FDB' : (u.undead ? '#2E3B3F' : '#D64545');
    g.innerHTML = ring + `<g class="fig" transform="translate(${-32 * FIG_K} ${4 - 74 * FIG_K}) scale(${FIG_K})">${figInner(u.kind, unitColor(u), flip)}</g>
      <g class="bar" transform="translate(0 -56)"><rect x="-16" y="0" width="32" height="6" rx="3" fill="#14212A"/><rect class="hpfill" x="-15" y="1" height="4" rx="2" fill="${u.side === 'player' ? '#5BC97A' : '#FF6B6B'}"/><g transform="translate(-24 3)"><circle r="7" fill="${roleBg}" stroke="#14212A" stroke-width="1.5"/>${ROLE[u.kind] || ''}</g></g>
      <g class="badges" transform="translate(0 -66)"></g>`;
    const up = g.querySelector('.upper');
    if (up) up.style.animationDelay = (-Math.random() * 2.6).toFixed(2) + 's';
    this.layers.units.appendChild(g);
    this.nodes.set(u.id, g);
    return g;
  }

  place(u, g = this.nodes.get(u.id)) {
    const [x, y] = this.pos(u.r, u.c);
    g.style.transform = `translate(${x}px, ${y}px)`;
    g.dataset.x = x; g.dataset.y = y;
  }

  updateBar(u, g = this.nodes.get(u.id)) {
    if (!g) return;
    g.querySelector('.hpfill').setAttribute('width', (30 * Math.max(0, u.hp) / u.maxHp).toFixed(1));
    const b = [];
    if (u.status.shieldWall) b.push(['#4C86EA', 'Щ']);
    if (u.status.spears) b.push(['#C9A26A', 'К']);
    if (u.status.marked) b.push(['#FF6B6B', '◎']);
    if (u.status.taunt) b.push(['#F2C14E', '!']);
    g.querySelector('.badges').innerHTML = b.map(([c, t], i) => `<g transform="translate(${(i - (b.length - 1) / 2) * 15} 0)"><circle r="6.5" fill="${c}" stroke="#14212A" stroke-width="1.5"/><text y="3.5" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" font-family="Nunito,system-ui,sans-serif">${t}</text></g>`).join('');
  }

  sync() {
    const st = this.st, seen = new Set();
    st.units.forEach(u => {
      if (u.hp <= 0) return;
      seen.add(u.id);
      const g = this.nodes.get(u.id) || this.makeNode(u);
      this.place(u, g);
      this.updateBar(u, g);
      g.style.opacity = u.side === st.turn && u.ap === 0 && st.phase === 'battle' && u.side === 'player' ? '.82' : '1';
    });
    for (const [id, g] of this.nodes) if (!seen.has(id)) { g.remove(); this.nodes.delete(id); }
    [...this.nodes.entries()]
      .sort((a, b) => { const ua = st.units.find(u => u.id === a[0]), ub = st.units.find(u => u.id === b[0]); return ua.r - ub.r || ua.c - ub.c; })
      .forEach(([, g]) => this.layers.units.appendChild(g));
    this.renderIce();
  }

  /* ---------- overlays ---------- */
  overlay({ reach = [], zoc = [], targets = [], area = [], path = [], sel = null, hover = null, deploy = [] }) {
    let s = '';
    const hex = (r, c, k, attrs) => { const [x, y] = this.pos(r, c); return `<polygon points="${corners(x, y, S * k)}" ${attrs}/>`; };
    deploy.forEach(([r, c]) => s += hex(r, c, .9, 'fill="rgba(120,170,255,.16)" stroke="rgba(190,215,255,.5)" stroke-width="1.3" stroke-dasharray="4 3"'));
    reach.forEach(([r, c]) => s += hex(r, c, .9, 'fill="rgba(120,170,255,.22)" stroke="rgba(190,215,255,.6)" stroke-width="1.3"'));
    zoc.forEach(([r, c]) => s += hex(r, c, .8, 'fill="rgba(255,107,107,.08)" stroke="#FF6B6B" stroke-width="1.8" stroke-dasharray="5 4"'));
    area.forEach(([r, c]) => s += hex(r, c, .9, 'fill="rgba(255,154,60,.28)" stroke="#FF9A3C" stroke-width="2"'));
    targets.forEach(([r, c]) => s += hex(r, c, .88, 'fill="rgba(255,107,107,.14)" stroke="#FF6B6B" stroke-width="2.5"'));
    if (sel) s += hex(sel[0], sel[1], .88, 'fill="none" stroke="#F2C14E" stroke-width="3"');
    if (hover) s += hex(hover[0], hover[1], .94, 'fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.75)" stroke-width="2"');
    if (path.length > 1) {
      const p = path.map(([r, c]) => this.pos(r, c).join(',')).join(' ');
      const [ex, ey] = this.pos(...path[path.length - 1]);
      s += `<polyline points="${p}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round" class="marching"/><circle cx="${ex}" cy="${ey}" r="5" fill="#fff"/>`;
    }
    this.layers.over.innerHTML = s;
  }

  /* ---------- effects ---------- */
  float(id, text, color, at) {
    const g = this.nodes.get(id);
    const x = at ? at[0] : +g?.dataset.x, y = at ? at[1] : +g?.dataset.y;
    if (Number.isNaN(x)) return;
    const t = el('text', { x, y: y - 68, 'text-anchor': 'middle', 'font-family': 'Nunito,system-ui,sans-serif', 'font-weight': '800', 'font-size': '15', fill: color, stroke: '#14212A', 'stroke-width': '3', 'paint-order': 'stroke' });
    t.textContent = text;
    this.layers.fx.appendChild(t);
    t.animate([{ transform: 'translateY(0)', opacity: 0 }, { opacity: 1, offset: .15 }, { transform: 'translateY(-22px)', opacity: 1, offset: .7 }, { transform: 'translateY(-28px)', opacity: 0 }], { duration: 1000 * this.speed, easing: 'ease-out' }).onfinish = () => t.remove();
  }

  flash(cls, id, ms) {
    const f = this.nodes.get(id)?.querySelector('.fig');
    if (!f) return;
    f.classList.remove(cls); void f.getBoundingClientRect(); f.classList.add(cls);
    setTimeout(() => f.classList.remove(cls), ms);
  }

  async projectile(fromId, toId, color, magic) {
    const a = this.nodes.get(fromId), b = this.nodes.get(toId);
    if (!a || !b) return;
    const x1 = +a.dataset.x, y1 = +a.dataset.y - 30, x2 = +b.dataset.x, y2 = +b.dataset.y - 26;
    const p = magic ? el('circle', { r: 5, fill: color }) : el('line', { x1: -8, y1: 0, x2: 8, y2: 0, stroke: '#E9E4D6', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
    const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    this.layers.fx.appendChild(p);
    const anim = p.animate([{ transform: `translate(${x1}px, ${y1}px) rotate(${ang}deg)` }, { transform: `translate(${(x1 + x2) / 2}px, ${Math.min(y1, y2) - 24}px) rotate(${ang}deg)` }, { transform: `translate(${x2}px, ${y2}px) rotate(${ang}deg)` }], { duration: 320 * this.speed, easing: 'ease-in' });
    await anim.finished.catch(() => {});
    p.remove();
  }

  async moveNode(id, to, fast) {
    const g = this.nodes.get(id);
    if (!g) return;
    const [x, y] = this.pos(...to), x0 = +g.dataset.x, y0 = +g.dataset.y;
    const anim = g.animate([{ transform: `translate(${x0}px, ${y0}px)` }, { transform: `translate(${(x0 + x) / 2}px, ${(y0 + y) / 2 - (fast ? 4 : 10)}px)` }, { transform: `translate(${x}px, ${y}px)` }], { duration: (fast ? 110 : 210) * this.speed, easing: 'ease-in-out' });
    g.style.transform = `translate(${x}px, ${y}px)`;
    g.dataset.x = x; g.dataset.y = y;
    await anim.finished.catch(() => {});
  }

  /* ---------- event playback ---------- */
  async play(events, st, log) {
    for (const e of events) {
      const u = st.units.find(x => x.id === e.id);
      switch (e.t) {
        case 'step': await this.moveNode(e.id, e.to, e.fast); break;
        case 'push': await this.moveNode(e.id, e.to, true); break;
        case 'bump': {
          const g = this.nodes.get(e.id);
          if (g) { const [nx, ny] = this.pos(...neighbor(u.r, u.c, e.d)); const x = +g.dataset.x, y = +g.dataset.y; await g.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: `translate(${x + (nx - x) * .25}px, ${y + (ny - y) * .25}px)` }, { transform: `translate(${x}px, ${y}px)` }], { duration: 220 * this.speed }).finished.catch(() => {}); }
          this.float(e.id, 'Удар о преграду', '#F2C14E');
          break;
        }
        case 'attack': {
          const t = st.units.find(x => x.id === e.target);
          if (e.ranged) { this.flash(u?.magic ? 'a-cast' : 'a-shoot', e.id, 600); await this.projectile(e.id, e.target, u?.magic ? (u.undead ? '#7CFFB2' : '#A28BFF') : '#E9E4D6', u?.magic); }
          else { this.flash('a-attack', e.id, 520); await wait(260 * this.speed); }
          log(e.opp ? `${u.name}: удар вдогонку по ${t.name}` : e.ret ? `${u.name} отвечает` : `${u.name} → ${t.name}`);
          break;
        }
        case 'dmg':
          this.flash('a-hit', e.id, 460);
          this.float(e.id, '−' + e.amount, '#FF6B6B');
          if (u) this.updateBar(u);
          await wait(160 * this.speed);
          break;
        case 'heal': this.float(e.id, '+' + e.amount, '#5BC97A'); if (u) this.updateBar(u); log(`${u.name}: +${e.amount} ОЗ`); await wait(300 * this.speed); break;
        case 'death': {
          this.flash('a-die', e.id, 900);
          log(`${u.name} пал`);
          await wait(650 * this.speed);
          this.nodes.get(e.id)?.remove();
          this.nodes.delete(e.id);
          break;
        }
        case 'ability': {
          this.flash('a-cast', e.id, 720);
          this.float(e.id, this.h.abilityName(e.ability), '#F2C14E');
          log(`${u.name}: ${this.h.abilityName(e.ability)}`);
          await wait(320 * this.speed);
          if (u) this.updateBar(u);
          break;
        }
        case 'fireball': {
          const [x, y] = this.pos(...e.at);
          const c = el('circle', { r: 10, fill: '#FF9A3C', opacity: .85 });
          this.layers.fx.appendChild(c);
          await c.animate([{ transform: `translate(${x}px, ${y}px) scale(1)`, opacity: .9 }, { transform: `translate(${x}px, ${y}px) scale(${S * 2.2 / 10})`, opacity: 0 }], { duration: 520 * this.speed, easing: 'ease-out' }).finished.catch(() => {});
          c.remove();
          break;
        }
        case 'chain': {
          const pts = [e.from, ...e.ids].map(id => this.nodes.get(id)).filter(Boolean).map(g => `${g.dataset.x},${+g.dataset.y - 28}`).join(' ');
          const l = el('polyline', { points: pts, fill: 'none', stroke: '#BFD8FF', 'stroke-width': 3, 'stroke-linejoin': 'bevel' });
          this.layers.fx.appendChild(l);
          await l.animate([{ opacity: 1 }, { opacity: .2 }, { opacity: 1 }, { opacity: 0 }], { duration: 420 * this.speed }).finished.catch(() => {});
          l.remove();
          break;
        }
        case 'ice': this.renderIce(); break;
        case 'iceMelt': this.renderIce(); break;
        case 'spawn': { const g = this.makeNode(e.unit); this.place(e.unit, g); this.updateBar(e.unit, g); g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 * this.speed }); log(`${e.unit.name} восстаёт`); await wait(300 * this.speed); break; }
        case 'mark': case 'taunt': if (u) this.updateBar(u); break;
        case 'resist': this.float(e.id, 'Устоял', '#9CC0FF'); break;
      }
    }
  }

  /* ---------- input ---------- */
  hexFromEvent(e) {
    const t = e.target.closest('[data-r], .unit');
    if (!t) return null;
    if (t.classList.contains('unit')) { const u = this.st.units.find(x => x.id === +t.dataset.id); return u ? [u.r, u.c] : null; }
    return [+t.dataset.r, +t.dataset.c];
  }

  bindInput() {
    const svg = this.svg;
    svg.addEventListener('pointermove', e => { const h = this.hexFromEvent(e); this.h.hover(h, e); });
    svg.addEventListener('pointerleave', () => this.h.hover(null));
    svg.addEventListener('click', e => { const h = this.hexFromEvent(e); if (h) this.h.click(h); });
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) this.zoom(Math.exp(-e.deltaY * 0.01));
      else this.pan(e.deltaX, e.deltaY);
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target.closest('input')) return;
      const k = e.key.toLowerCase();
      if ('wasd'.includes(k) && k.length === 1) { this.keys.add(k); this.loop(); }
      if (k === 'q' || k === 'й') this.zoom(1 / 1.15);
      if (k === 'e' || k === 'у') this.zoom(1.15);
      const ru = { 'ц': 'w', 'ф': 'a', 'ы': 's', 'в': 'd' }[k];
      if (ru) { this.keys.add(ru); this.loop(); }
    });
    window.addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      this.keys.delete({ 'ц': 'w', 'ф': 'a', 'ы': 's', 'в': 'd' }[k]);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  loop() {
    if (this.looping) return;
    this.looping = true;
    const step = () => {
      if (!this.keys.size) { this.looping = false; return; }
      const v = 9;
      this.pan((this.keys.has('d') ? v : 0) - (this.keys.has('a') ? v : 0), (this.keys.has('s') ? v : 0) - (this.keys.has('w') ? v : 0));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

export { figSVG, key };
