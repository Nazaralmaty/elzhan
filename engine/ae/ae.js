/* ~/.claude/engine/ae/ae.js — a headless After Effects for Claude.
   No UI. A composition is data + code; a frame is a pure function of time
   (comp.seek(t)); Chrome draws it, render.js shoots it.

   Concepts (AE names where they exist):
     Comp        fps, duration, root node, camera, layers
     Layer       a DOM node with transform props (x y scale sx sy rot opacity
                 anchor blur), keyframed tracks, expressions, parent, depth
     Keyframes   layer.key('x', t, value, ease)  /  layer.tween(t0, from, to, dur, ease)
     Ease        'linear' | 'in' | 'out' | 'inOut' | 'back' | 'backIn' | 'expo' | 'hold'
                 | [x1,y1,x2,y2] cubic-bezier (AE graph editor)
     Expressions layer.expr('y', (t, v, L) => v + wiggle(t, 1, 6))
     Camera      2.5D: x y zoom rot keyframed like a layer; parallax by layer.depth;
                 motion blur from screen-space speed; lift on long travels
     Text        words / chars split, animators with range selectors
     Shape       SVG paths with trim (draw-on)
     Effects     glow, shadow, blur, mask, vignette, grain, light (as CSS / overlay nodes)
     Presets     pop, up, flip, slide, drawOn, float, sway, spin, drift, orbit  (ae/presets.js)

   Everything is deterministic: no Date, no Math.random, no rAF. */

export const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
export const lerp = (a, b, u) => a + (b - a) * u;
export const pr = (t, t0, d) => clamp((t - t0) / d);

/* ── easing: cubic bezier (AE graph) + named curves ─────────────────────── */
function bezier(x1, y1, x2, y2) {
  const A = (a1, a2) => 1 - 3 * a2 + 3 * a1, B = (a1, a2) => 3 * a2 - 6 * a1, C = a1 => 3 * a1;
  const calc = (u, a1, a2) => ((A(a1, a2) * u + B(a1, a2)) * u + C(a1)) * u;
  const slope = (u, a1, a2) => 3 * A(a1, a2) * u * u + 2 * B(a1, a2) * u + C(a1);
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 6; i++) { const s = slope(u, x1, x2); if (s < 1e-6) break; u -= (calc(u, x1, x2) - x) / s; }
    return calc(u, y1, y2);
  };
}
export const EASE = {
  linear: x => x,
  in: bezier(0.42, 0, 1, 1), out: bezier(0, 0, 0.58, 1), inOut: bezier(0.42, 0, 0.58, 1),
  expo: bezier(0.16, 1, 0.3, 1), back: bezier(0.34, 1.56, 0.64, 1), backIn: bezier(0.36, 0, 0.66, -0.56),
  smooth: bezier(0.65, 0, 0.35, 1), hold: x => x < 1 ? 0 : 1,
  /* v9 (14.09.2026, замечание автора референсов: «работа с графиками — движение переходит слишком резко»):
     кривые уровня плагина Flow. `flow` — длинный выход и мягкая посадка (движение камеры и больших блоков),
     `settle` — приход без удара обратной дуги (посадка вставки), `glide` — старт с уже набранной скоростью
     (продолжение движения, которое началось раньше: наследник ключа, а не новый старт). */
  flow: bezier(0.37, 0, 0.08, 1), settle: bezier(0.17, 0.72, 0.19, 1), glide: bezier(0.12, 0.42, 0.14, 1),
  /* Raylight-style spring: damped overshoot, settles by x=1 (stiff 9, one visible bounce) */
  spring: x => x >= 1 ? 1 : 1 - Math.exp(-6.5 * x) * Math.cos(9 * x) ,
  springSoft: x => x >= 1 ? 1 : 1 - Math.exp(-5 * x) * Math.cos(6 * x),
};
export const easeFn = e => typeof e === 'function' ? e : Array.isArray(e) ? bezier(...e) : (EASE[e] || EASE.out);

/* ── expressions ─────────────────────────────────────────────────────────── */
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** AE wiggle(freq, amp): smooth pseudo-random around zero, deterministic per seed */
export function wiggle(t, freq = 1, amp = 1, seed = 0) {
  const p = t * freq, i = Math.floor(p), u = p - i, s = u * u * (3 - 2 * u);
  const a = hash(i + seed * 97) * 2 - 1, b = hash(i + 1 + seed * 97) * 2 - 1;
  return lerp(a, b, s) * amp;
}
export const loop = (t, period) => ((t % period) + period) % period;
export const pulse = (t, freq = 1, ph = 0) => 0.5 + 0.5 * Math.sin(t * freq * 2 * Math.PI + ph);

/* ── layer ───────────────────────────────────────────────────────────────── */
const DEFAULTS = { x: 0, y: 0, scale: 1, sx: 1, sy: 1, rot: 0, rx: 0, ry: 0, opacity: 1, blur: 0, ax: 0.5, ay: 0.5, z: 0 };
let LID = 0;

export class Layer {
  /** el: DOM node (or tag name), parent: Layer or DOM node */
  constructor(el, { parent = null, name = '', depth = 1, inPoint = 0, outPoint = Infinity, base = {} } = {}) {
    this.id = ++LID; this.name = name || 'L' + this.id;
    this.node = typeof el === 'string' ? document.createElement(el) : el;
    this.node.style.position = 'absolute'; this.node.style.left = '0'; this.node.style.top = '0';
    this.node.style.willChange = 'transform,opacity';
    (parent instanceof Layer ? parent.node : parent).appendChild(this.node);
    this.parent = parent instanceof Layer ? parent : null;
    this.depth = depth; this.inPoint = inPoint; this.outPoint = outPoint;
    this.base = { ...DEFAULTS, ...base };
    this.tracks = {};      // prop -> [{t, v, e}]
    this.exprs = {};       // prop -> [fn]
    this.children = [];
    if (this.parent) this.parent.children.push(this);
    this.visible = true;
    this.w = base.w || 0; this.h = base.h || 0;
  }
  /** one keyframe; ease applies to the segment ARRIVING at this key */
  key(prop, t, v, e = 'out') {
    const tr = this.tracks[prop] || (this.tracks[prop] = []);
    tr.push({ t, v, e }); tr.sort((a, b) => a.t - b.t); return this;
  }
  /** from → to over dur, with ease (AE "easy ease" between two keys) */
  tween(t0, from, to, dur, e = 'out') {
    for (const p in to) { if (from[p] !== undefined) this.key(p, t0, from[p], 'hold'); this.key(p, t0 + dur, to[p], e); }
    return this;
  }
  set(props) { Object.assign(this.base, props); return this; }
  expr(prop, fn) { (this.exprs[prop] || (this.exprs[prop] = [])).push(fn); return this; }
  /** value of a property at t: base → keyframes → expressions */
  prop(p, t) {
    let v = this.base[p];
    const tr = this.tracks[p];
    if (tr && tr.length) {
      if (t <= tr[0].t) v = tr[0].v;
      else if (t >= tr[tr.length - 1].t) v = tr[tr.length - 1].v;
      else {
        let i = 0; while (i < tr.length - 1 && tr[i + 1].t <= t) i++;
        const a = tr[i], b = tr[i + 1];
        const u = easeFn(b.e)(pr(t, a.t, b.t - a.t));
        v = Array.isArray(a.v) ? a.v.map((x, k) => lerp(x, b.v[k], u)) : lerp(a.v, b.v, u);
      }
    }
    const ex = this.exprs[p];
    if (ex) for (const f of ex) v = f(t, v, this);
    return v;
  }
  /** apply state at t (called by Comp); extra = camera parallax offset in parent space */
  apply(t, extra = null) {
    const on = t >= this.inPoint && t < this.outPoint && this.visible;
    /* display:none, а не visibility:hidden. `will-change` ниже поднимает каждый
       слой в свой слой композитора, и невидимые слои продолжают его занимать:
       на композиции из 28 полнокадровых поверхностей Chrome начинает ронять
       растеризацию — кадр приходит без градиента или вовсе чёрный. */
    if (!on) { this.node.style.display = 'none'; this.node.style.visibility = 'hidden'; this.node.style.opacity = '0'; return false; }
    const x = this.prop('x', t), y = this.prop('y', t), s = this.prop('scale', t), sx = this.prop('sx', t), sy = this.prop('sy', t);
    const rot = this.prop('rot', t), rx = this.prop('rx', t), ry = this.prop('ry', t), o = clamp(this.prop('opacity', t)), bl = this.prop('blur', t) + (extra ? extra.blur || 0 : 0);
    const ds = extra && extra.s ? extra.s : 1;   // dolly: near layers grow faster than far ones when the camera pushes in
    const sized = this.w || this.h; const ax = sized ? this.prop('ax', t) * this.w : 0, ay = sized ? this.prop('ay', t) * this.h : 0;
    this.node.style.transformOrigin = sized ? '0 0' : '50% 50%';
    const px = extra ? extra.x : 0, py = extra ? extra.y : 0;
    const z = this.prop('z', t);
    let tf = `translate3d(${(x + px).toFixed(2)}px,${(y + py).toFixed(2)}px,${z.toFixed(1)}px) `;
    if (rx || ry) tf += `perspective(1400px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) `;
    tf += `translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px) rotate(${rot.toFixed(3)}deg) scale(${(s * sx * ds).toFixed(4)},${(s * sy * ds).toFixed(4)}) translate(${(-ax).toFixed(1)}px,${(-ay).toFixed(1)}px)`;
    this.node.style.display = '';
    this.node.style.visibility = 'visible';
    this.node.style.transform = tf;
    this.node.style.opacity = o.toFixed(3);
    this.node.style.filter = (bl > 0.01 ? `blur(${bl.toFixed(2)}px) ` : '') + (this.fx || '');
    return true;
  }
  /** move along an SVG path (d in the layer's parent coords) from t0 over dur; rotate = align to tangent */
  follow(d, t0, dur, { ease = 'inOut', rotate = false, offset = [0, 0] } = {}) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); svg.appendChild(p); svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'; document.body.appendChild(svg);
    const len = p.getTotalLength(), f = easeFn(ease);
    const at = t => p.getPointAtLength(clamp(f(pr(t, t0, dur))) * len);
    this.expr('x', (t, v) => at(t).x + offset[0]).expr('y', (t, v) => at(t).y + offset[1]);
    if (rotate) this.expr('rot', (t, v) => { const a = at(t), b = p.getPointAtLength(Math.min(len, clamp(f(pr(t, t0, dur))) * len + 2)); return v + Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; });
    return this;
  }
  /** world position of the layer's anchor (through parents: x,y,scale only) */
  world(t) {
    let X = this.prop('x', t) + this.prop('ax', t) * this.w, Y = this.prop('y', t) + this.prop('ay', t) * this.h, S = 1;
    for (let p = this.parent; p; p = p.parent) { const ps = p.prop('scale', t); X = p.prop('x', t) + X * ps; Y = p.prop('y', t) + Y * ps; S *= ps; }
    return { x: X, y: Y, s: S };
  }
}

/* ── text: words / chars with animators ─────────────────────────────────── */
export class TextLayer extends Layer {
  constructor(text, opts = {}) {
    super('div', opts);
    this.node.style.whiteSpace = opts.wrap ? 'normal' : 'nowrap';
    if (opts.wrap) this.node.style.width = opts.wrap + 'px';
    if (opts.cls) this.node.className = opts.cls;
    if (opts.css) this.node.style.cssText += ';' + opts.css;
    const split = opts.split || 'words';
    // keep inline markup (<span class="a">…</span>): wrap every word / char inside its element
    const tmp = document.createElement('div'); tmp.innerHTML = String(text);
    // units as a flat list: a punctuation unit glued to the word before it (", а не…" after an
    // accent span wrapped the comma onto the next line — adjacent inline-blocks are a break
    // opportunity); <br> kept (it has no textContent).
    // A unit sign (% ₸) is glued ACROSS the space as well: «ДО 100 %» and «30 000 ₸» are written
    // with a space in Russian, and a no-break space does not help — /\s+/ splits on it too, so the
    // sign became its own unit and wrapped onto a line of its own.
    const units = [];
    const span = (u, cls) => `<span class="ae-u${cls ? ' ' + cls : ''}" style="display:inline-block;will-change:transform,opacity,filter">${u}</span>`;
    const push = (txt, cls) => txt.split(/(\s+)/).forEach(u => {
      if (u === '') return;
      if (/^\s+$/.test(u)) { units.push({ html: ' ', word: false }); return; }
      // chars: every letter is its own inline-block, and a break is allowed between any two of them — a wrapped
      // HIT line split inside a word («НАВР / ЕДИ», 13.09.2026). The letters of one word share a nowrap span.
      if (split === 'chars') { units.push({ html: `<span style="white-space:nowrap">${[...u].map(c => span(c, cls)).join('')}</span>`, word: true }); return; }
      const html = span(u, cls);
      const prev = units[units.length - 1];
      if (split !== 'chars' && prev && prev.word && /^[,.;:!?…»)\]%₸]/.test(u)) { prev.html = `<span style="white-space:nowrap">${prev.html}${html}</span>`; return; }
      if (split !== 'chars' && /^[%₸]/.test(u) && prev && !prev.word && prev.html === ' ') {
        const w = units[units.length - 2];
        if (w && w.word) { w.html = `<span style="white-space:nowrap">${w.html}&nbsp;${html}</span>`; units.pop(); return; }
      }
      units.push({ html, word: true });
    });
    [...tmp.childNodes].forEach(n => n.nodeType === 3 ? push(n.textContent, '') : n.tagName === 'BR' ? units.push({ html: '<br>', word: false }) : push(n.textContent, n.className));
    this.node.innerHTML = units.map(u => u.html).join('');
    this.units = [...this.node.querySelectorAll('.ae-u')];
    this.animators = [];
  }
  /** animator: each unit i starts at times[i] (or t0 + i*stagger), runs `from`→identity over dur with ease */
  animate({ t0 = 0, stagger = 0.06, times = null, dur = 0.24, from = { y: 12, scale: 1.35, opacity: 0, blur: 6, rot: -3 }, ease = 'back',
            select = null,      // (i, n) => 0..1 weight of the offset for unit i  (AE range selector)
            sweep = null,       // { t0, dur, width } — a window moving across units; weight = 1 inside, 0 outside
            loopDur = 0 } = {}) {
    this.animators.push({ t0, stagger, times, dur, from, ease, select, sweep, loopDur }); return this;
  }
  /** per-unit style from a weight w (0 = identity, 1 = full `from`) */
  static unitStyle(u, fr, w, pOpacity) {
    u.style.opacity = (fr.opacity !== undefined ? lerp(1, fr.opacity, w) : 1).toFixed(3);
    u.style.filter = fr.blur ? `blur(${(fr.blur * w).toFixed(2)}px)` : '';
    // sx: horizontal stretch (goz word smear), multiplies the uniform scale on x only
    const sc = lerp(1, fr.scale ?? 1, w), scx = sc * lerp(1, fr.sx ?? 1, w);
    u.style.transform = `translate3d(${((fr.x || 0) * w).toFixed(1)}px,${((fr.y || 0) * w).toFixed(1)}px,0) scale(${scx.toFixed(3)},${sc.toFixed(3)}) rotate(${((fr.rot || 0) * w).toFixed(2)}deg)`;
  }
  apply(t, extra) {
    if (!super.apply(t, extra)) return false;
    const n = this.units.length;
    for (const a of this.animators) {
      const f = easeFn(a.ease);
      this.units.forEach((u, i) => {
        let w;
        if (a.sweep) {                                   // moving window: units light up as the window passes
          // the window must travel one full width PAST the last unit, or the last words keep a residual blur forever (found 12.09.2026 on a hook word)
          const pos = pr(t, a.sweep.t0, a.sweep.dur) * (n + 2 * (a.sweep.width || 2)) - (a.sweep.width || 2);
          w = 1 - clamp((i - pos) / (a.sweep.width || 2) + 1);
          w = 1 - f(w);
        } else {
          const ts = a.times ? a.times[i] : a.t0 + i * a.stagger;
          let p = pr(t, ts, a.dur);
          if (a.loopDur) p = pr(((t - ts) % a.loopDur + a.loopDur) % a.loopDur, 0, a.dur);
          w = 1 - f(p);
          const fo = typeof a.from === 'function' ? a.from(i, n).opacity : a.from.opacity;
          if (fo !== undefined) { const o = lerp(fo, 1, clamp(p * 2)); u.dataset.o = o; }
        }
        if (a.select) w *= clamp(a.select(i, n));
        TextLayer.unitStyle(u, typeof a.from === 'function' ? a.from(i, n) : a.from, w);   // `from(i, n)`: per-unit offset (chars: 'fly')
        if (u.dataset.o !== undefined && !a.sweep) { u.style.opacity = (+u.dataset.o).toFixed(3); delete u.dataset.o; }
      });
    }
    return true;
  }
}

/* ── shape: SVG path with trim (draw-on) ────────────────────────────────── */
export class ShapeLayer extends Layer {
  /** paths: [{d, stroke, sw, fill}] in a w×h viewBox */
  constructor(w, h, paths, opts = {}) {
    super('div', { ...opts, base: { ...(opts.base || {}), w, h } });
    this.node.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" style="display:block;overflow:visible">${paths.map(p => `<path d="${p.d}" stroke="${p.stroke || '#fff'}" stroke-width="${p.sw || 5}" fill="${p.fill || 'none'}" stroke-linecap="round" stroke-linejoin="round" pathLength="1" style="stroke:${p.stroke || '#fff'};stroke-width:${p.sw || 5};stroke-dasharray:1;stroke-dashoffset:1;${p.css || ''}"/>`).join('')}</svg>`;
    this.paths = [...this.node.querySelectorAll('path')];
    this.trims = this.paths.map(() => ({ t0: 0, dur: 0.6, ease: 'out', delay: 0 }));
  }
  /** draw-on: path i goes from 0 to full length over dur starting at t0 */
  trim(i, t0, dur = 0.6, ease = 'out') { this.trims[i] = { t0, dur, ease }; return this; }
  trimAll(t0, dur = 0.6, gap = 0.1, ease = 'out') { this.paths.forEach((_, i) => this.trim(i, t0 + i * gap, dur, ease)); return this; }
  apply(t, extra) {
    if (!super.apply(t, extra)) return false;
    this.paths.forEach((p, i) => { const tr = this.trims[i]; p.style.strokeDashoffset = (1 - easeFn(tr.ease)(pr(t, tr.t0, tr.dur))).toFixed(4); });
    return true;
  }
}

/* ── camera (2.5D) ───────────────────────────────────────────────────────── */
export class Camera {
  constructor(comp) { this.comp = comp; this.keys = []; this.lift = 0.12; this.blurGain = 7; this.breath = 0.012; this.wig = 1;
    /* v9 «нул-объект» (14.09.2026, автор референсов: «нужно одно единое движение, максимально плавное и
       постоянно продолжительное»): камера не замирает между ключами. `creep` — доля пути, которую она
       проходит за время `hold` (раньше стояла на месте и потом дёргалась), `drift` — медленный бесконечный
       снос всей сцены, как у слоя, привязанного к движущемуся нулю. Оба по умолчанию выключены: включает жанр. */
    this.creep = 0; this.drift = null;
    /* Raylight lens: `dolly` 0 = flat zoom (whole frame magnifies), 1 = the camera travels through the depth stack;
       `focus` is the depth kept sharp, `aperture` how fast other depths blur (px per 0.1 depth). Keyed like x/y/zoom. */
    this.dolly = 0; this.defocus = { focus: 1, aperture: 0 }; /* handheld wiggle multiplier; 0 for footage (Elzhan: camera sway reads amateur, keep the zooms) */ }
  /** key: arrive at (x,y,zoom,rot) at time t; hold = fraction of the previous segment to rest before moving */
  key(t, { x, y, zoom = 1, rot = 0, rx = 0, ry = 0, hold = 0.35, ease = 'inOut', focus, aperture }) { this.keys.push({ t, x, y, zoom, rot, rx, ry, hold, ease, focus, aperture }); this.keys.sort((a, b) => a.t - b.t); return this; }
  at(t) {
    const K = this.keys; if (!K.length) return { x: 540, y: 960, zoom: 1, rot: 0, rx: 0, ry: 0, u: 1 };
    let i = 0; for (let k = 0; k < K.length; k++) if (t >= K[k].t) i = k;
    const a = K[i], b = K[Math.min(i + 1, K.length - 1)];
    let u = 1;
    if (b !== a) {
      const seg = b.t - a.t, h = seg * b.hold, start = a.t + h;
      const main = easeFn(b.ease)(pr(t, start, Math.max(0.3, seg - h)));
      /* creep: пока камера «стоит» на прошлом ключе, она уже ползёт к следующему с постоянной скоростью,
         и основной ход начинается не с нуля. Ключи-склейки (ease 'hold') остаются мгновенными. */
      if (!this.creep || h <= 0.02 || b.ease === 'hold') u = main;
      else { const cr = this.creep; u = t < start ? cr * pr(t, a.t, h) : cr + (1 - cr) * main; }
    }
    const dist = Math.hypot(b.x - a.x, b.y - a.y) * Math.min(a.zoom, b.zoom);
    const lift = clamp(dist / 3000) * this.lift * Math.sin(u * Math.PI);
    // rack focus: focus / aperture travel between keys with the same ease; a key without them inherits the previous
    let fa = this.defocus.focus, aa = this.defocus.aperture;
    for (let k = 0; k <= i; k++) { if (K[k].focus !== undefined) fa = K[k].focus; if (K[k].aperture !== undefined) aa = K[k].aperture; }
    const fb = b.focus !== undefined ? b.focus : fa, ab = b.aperture !== undefined ? b.aperture : aa;
    const breath = 1 + Math.sin(t * 0.7) * this.breath;
    /* drift: медленный синус с несовпадающими периодами — движение не повторяется на длине ролика и не
       читается как маятник. Скорость 10–15 px/с: кадр всё время живёт, но снос не спорит с ходом камеры. */
    const D = this.drift, dx = D ? Math.sin(t * 2 * Math.PI / (D.px || 11)) * (D.x || 0) : 0,
          dy = D ? Math.cos(t * 2 * Math.PI / (D.py || 8.5)) * (D.y || 0) : 0,
          dz = D ? 1 + Math.sin(t * 2 * Math.PI / (D.pz || 13) + 1.1) * (D.z || 0) : 1;
    return {
      x: lerp(a.x, b.x, u) + wiggle(t, 0.4, 6, 1) * this.wig + dx, y: lerp(a.y, b.y, u) + wiggle(t, 0.35, 6, 2) * this.wig + dy,
      zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), u)) * (1 - lift) * breath * dz,
      rot: lerp(a.rot, b.rot, u) + wiggle(t, 0.3, 0.35, 3) * this.wig, rx: lerp(a.rx, b.rx, u), ry: lerp(a.ry, b.ry, u), u, moving: u > 0 && u < 1,
      focus: lerp(fa, fb, u), aperture: lerp(aa, ab, u),
    };
  }
  /** css transform of the root for this camera state; motion blur from screen speed */
  apply(t, root, fps = 30) {
    const c = this.at(t), p = this.at(Math.max(0, t - 1 / fps));
    const v = Math.hypot((c.x - p.x) * c.zoom, (c.y - p.y) * c.zoom) + Math.abs(Math.log(c.zoom / p.zoom)) * 900;
    const mb = clamp((v - 28) / 70) * this.blurGain;
    /* orbit (AE camera with 3D layers): rx/ry tilt the whole world around the camera target; the stage carries the
       perspective (comp.threeD). scale3d so layer z grows with the zoom. No motion blur here: a filter on the root
       flattens the 3D context and the parallax vanishes for the fast frames. */
    if (this.comp.is3d) {
      root.style.transform = `translate(540px,960px) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) scale3d(${c.zoom.toFixed(4)},${c.zoom.toFixed(4)},${c.zoom.toFixed(4)}) rotate(${c.rot.toFixed(2)}deg) translate(${(-c.x).toFixed(1)}px,${(-c.y).toFixed(1)}px)`;
      const flat = Math.abs(c.rx) + Math.abs(c.ry) < 0.05;   // motion blur only while the world lies flat: a filter flattens the 3D context
      root.style.filter = flat && mb > 0.05 ? `blur(${mb.toFixed(2)}px)` : ''; return c;
    }
    root.style.transform = `translate(540px,960px) scale(${c.zoom.toFixed(4)}) rotate(${c.rot.toFixed(2)}deg) translate(${(-c.x).toFixed(1)}px,${(-c.y).toFixed(1)}px)`;
    root.style.filter = mb > 0.05 ? `blur(${mb.toFixed(2)}px)` : '';
    return c;
  }
}

/* ── comp ────────────────────────────────────────────────────────────────── */
export class Comp {
  constructor({ fps = 30, duration = 10, stage = null, w = 1080, h = 1920 } = {}) {
    this.fps = fps; this.duration = duration; this.w = w; this.h = h;
    this.stage = stage || document.body;
    this.root = document.createElement('div'); this.root.id = 'ae-root';
    this.root.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform-origin:0 0;will-change:transform,filter`;
    this.stage.appendChild(this.root);
    this.layers = []; this.camera = new Camera(this); this.cues = []; this.overlays = [];
  }
  /** switch the comp to real 3D: perspective on the stage, preserve-3d down the tree, camera rx/ry and layer z work.
      A layer with `filter` (blur, FX.glow) or overflow:hidden still flattens its own children — keep z-children out of those. */
  threeD(persp = 1600, all = true) {   // all=false: only the root keeps 3D (children of the root get z; rooms stay flat sheets — canvas.js)
    this.is3d = true; this.all3d = all; this.stage.style.perspective = persp + 'px'; this.stage.style.perspectiveOrigin = `${this.w / 2}px ${this.h / 2}px`;
    this.root.style.transformStyle = 'preserve-3d'; if (all) for (const L of this.layers) L.node.style.transformStyle = 'preserve-3d'; return this;
  }
  layer(el, opts = {}) { const L = new Layer(el, { parent: opts.parent || this.root, ...opts }); this.layers.push(L); if (this.all3d) L.node.style.transformStyle = 'preserve-3d'; return L; }
  text(text, opts = {}) { const L = new TextLayer(text, { parent: opts.parent || this.root, ...opts }); this.layers.push(L); return L; }
  shape(w, h, paths, opts = {}) { const L = new ShapeLayer(w, h, paths, { parent: opts.parent || this.root, ...opts }); this.layers.push(L); return L; }
  cue(t, k, extra = {}) { this.cues.push({ t: +t.toFixed(3), k, ...extra }); }
  /** screen-space overlay (vignette, grain, flash) — not moved by the camera */
  overlay(css, fn = null) { const n = document.createElement('div'); n.style.cssText = `position:absolute;inset:0;pointer-events:none;${css}`; this.stage.appendChild(n); this.overlays.push({ n, fn }); return n; }
  seek(t) {
    t = Math.max(0, Math.min(this.duration - 1e-4, t));
    const c = this.camera.apply(t, this.root, this.fps);
    window.CAM = c;
    for (const L of this.layers) {
      let extra = null;
      if (L.depth !== 1) {
        const w = L.world(t); const k = (1 - L.depth) / (w.s || 1);
        extra = { x: (c.x - w.x) * k, y: (c.y - w.y) * k, s: Math.pow(c.zoom, (L.depth - 1) * this.camera.dolly) };
      }
      if (c.aperture > 0) { const d = Math.abs(L.depth - c.focus); if (d > 0.02) { extra = extra || { x: 0, y: 0 }; extra.blur = d * 10 * c.aperture; } }
      L.apply(t, extra);
    }
    for (const o of this.overlays) if (o.fn) o.fn(t, o.n, c);
    return c;
  }
  expose() {
    window.seek = t => this.seek(t);
    window.REEL = { DUR: this.duration, FPS: this.fps, FRAMES: Math.round(this.duration * this.fps) };
    window.CUES = this.cues.slice().sort((a, b) => a.t - b.t);
  }
}

/* ── effects (CSS-level) ─────────────────────────────────────────────────── */
export const FX = {
  glow: (L, color = 'rgba(255,255,255,.6)', r = 24) => { L.fx = (L.fx || '') + ` drop-shadow(0 0 ${r}px ${color})`; return L; },
  shadow: (L, dx = 0, dy = 30, r = 60, color = 'rgba(20,20,60,.25)') => { L.node.style.boxShadow = `${dx}px ${dy}px ${r}px ${color}`; return L; },
  mask: (L, clip) => { L.node.style.clipPath = clip; return L; },
  /** circular reveal of a layer from (cx,cy) in its own box, over dur */
  reveal: (L, t0, dur = 0.6, cx = '50%', cy = '50%', ease = 'out') => { const f = easeFn(ease); const ap = L.apply.bind(L); L.apply = (t, ex) => { if (!ap(t, ex)) return false; const p = f(pr(t, t0, dur)); L.node.style.clipPath = p < 1 ? `circle(${(p * 150).toFixed(1)}% at ${cx} ${cy})` : ''; return true; }; return L; },
  /** wipe reveal: 'left'|'up' */
  wipe: (L, t0, dur = 0.5, dir = 'left', ease = 'out') => { const f = easeFn(ease); const ap = L.apply.bind(L); L.apply = (t, ex) => { if (!ap(t, ex)) return false; const p = f(pr(t, t0, dur)); const r = ((1 - p) * 100).toFixed(2) + '%'; L.node.style.clipPath = p < 1 ? (dir === 'up' ? `inset(${r} 0 0 0)` : `inset(0 ${r} 0 0)`) : ''; return true; }; return L; },
  /* Raylight bloom: bright areas glow into their surroundings. A screen-blended copy of the frame behind the
     overlay, blurred and pushed through a soft threshold. o 0.18–0.3 reads as light; more turns artificial fast. */
  bloom: (comp, o = 0.22, r = 26) => comp.overlay(`opacity:${o};mix-blend-mode:screen;-webkit-backdrop-filter:blur(${r}px) brightness(0.8) contrast(2.6) saturate(1.15);backdrop-filter:blur(${r}px) brightness(0.8) contrast(2.6) saturate(1.15)`),
  /* film grain: fractal noise (SVG feTurbulence), a new offset every frame so it never freezes */
  grainReal: (comp, o = 0.07, size = 220) => { const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`; return comp.overlay(`opacity:${o};mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}");background-size:${size}px ${size}px`, (t, n) => { const f = Math.floor(t * 30); n.style.backgroundPosition = `${(f * 37) % size}px ${(f * 53) % size}px`; }); },
  vignette: (comp, strength = 0.35) => comp.overlay(`background:radial-gradient(ellipse at 50% 45%,transparent 55%,rgba(10,10,30,${strength}) 100%)`),
  grain: (comp, o = 0.05) => comp.overlay(`opacity:${o};mix-blend-mode:multiply;background-image:repeating-linear-gradient(0deg,#777 0 1px,transparent 1px 3px)`),
  flash: (comp, t0, dur = 0.3, color = '#fff') => comp.overlay(`background:${color};opacity:0`, (t, n) => { const p = pr(t, t0, dur); n.style.opacity = (p > 0 && p < 1 ? Math.sin(p * Math.PI) * 0.7 : 0).toFixed(3); }),
};
