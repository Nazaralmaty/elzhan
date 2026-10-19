/* ~/.claude/engine/ae/presets.js — motion presets on top of ae.js.
   Entry presets set keyframes from t0; life presets add expressions that
   start after landing. Each takes a Layer and returns it. */
import { wiggle, lerp, clamp, pr, EASE } from './ae.js';

/* ── entries ─────────────────────────────────────────────────────────────── */
export const pop   = (L, t0, dur = 0.42) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + dur * 0.35, 1, 'out')
                        .key('scale', t0, 0.2, 'hold').key('scale', t0 + dur, 1, 'back').key('rot', t0, (L.base.rot || 0) - 8, 'hold').key('rot', t0 + dur, L.base.rot || 0, 'back');
export const up    = (L, t0, dur = 0.42, dy = 140) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + dur * 0.5, 1, 'out')
                        .key('y', t0, L.base.y + dy, 'hold').key('y', t0 + dur, L.base.y, 'out');
export const slide = (L, t0, dur = 0.42, dx = -420) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + dur * 0.4, 1, 'out')
                        .key('x', t0, L.base.x + dx, 'hold').key('x', t0 + dur, L.base.x, 'back');
export const flip  = (L, t0, dur = 0.42) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + dur * 0.4, 1, 'out')
                        .key('rx', t0, -70, 'hold').key('rx', t0 + dur, 0, 'back').key('scale', t0, 0.8, 'hold').key('scale', t0 + dur, 1, 'back');
export const grow  = (L, t0, dur = 0.42) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + 0.02, 1, 'out')
                        .key('scale', t0, 0.05, 'hold').key('scale', t0 + dur, 1, 'out');
export const fade  = (L, t0, dur = 0.42) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + dur, 1, 'out');
export const leave = (L, t1, dur = 0.3) => L.key('opacity', t1, 1, 'hold').key('opacity', t1 + dur, 0, 'in').key('blur', t1, 0, 'hold').key('blur', t1 + dur, 8, 'in');
export const ENTRY = { pop, up, slide, flip, grow, fade, left: (L, t0, d) => slide(L, t0, d, -420), right: (L, t0, d) => slide(L, t0, d, 420) };

/* ── v9: те же входы на кривых Flow (14.09.2026) ───────────────────────────
   Замечание автора референсов: движение «переходит слишком резко». Разница не в длительности,
   а в графике: `pop` бил масштабом 0.2 → 1 с обратной дугой за 0.42 с — удар, который глаз читает
   как рывок. Мягкие входы начинают с 0.7 масштаба, гасят скорость кривой `settle` (приход без
   отскока) и тянут смаз (blur) первые две трети — смаз и есть то, что делает быстрый ход плавным.
   Жанр выбирает набор; старые входы остаются для роликов, которые на них собраны. */
export const popSoft = (L, t0, dur = 0.52) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + dur * 0.4, 1, 'flow')
                        .key('scale', t0, 0.72, 'hold').key('scale', t0 + dur, 1, 'settle')
                        .key('blur', t0, 6, 'hold').key('blur', t0 + dur * 0.66, 0, 'flow')
                        .key('rot', t0, (L.base.rot || 0) - 3.5, 'hold').key('rot', t0 + dur, L.base.rot || 0, 'settle');
export const upSoft = (L, t0, dur = 0.58, dy = 96) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + dur * 0.45, 1, 'flow')
                        .key('y', t0, L.base.y + dy, 'hold').key('y', t0 + dur, L.base.y, 'flow')
                        .key('blur', t0, 7, 'hold').key('blur', t0 + dur * 0.7, 0, 'flow');
export const slideSoft = (L, t0, dur = 0.62, dx = -420) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + dur * 0.35, 1, 'flow')
                        .key('x', t0, L.base.x + dx, 'hold').key('x', t0 + dur, L.base.x, 'flow')
                        .key('blur', t0, 10, 'hold').key('blur', t0 + dur * 0.72, 0, 'flow');
export const growSoft = (L, t0, dur = 0.55) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + 0.06, 1, 'flow')
                        .key('scale', t0, 0.35, 'hold').key('scale', t0 + dur, 1, 'settle')
                        .key('blur', t0, 8, 'hold').key('blur', t0 + dur * 0.7, 0, 'flow');
export const flipSoft = (L, t0, dur = 0.6) => L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + dur * 0.35, 1, 'flow')
                        .key('rx', t0, -42, 'hold').key('rx', t0 + dur, 0, 'settle').key('scale', t0, 0.88, 'hold').key('scale', t0 + dur, 1, 'settle')
                        .key('blur', t0, 6, 'hold').key('blur', t0 + dur * 0.66, 0, 'flow');
export const ENTRY_SOFT = { pop: popSoft, up: upSoft, slide: slideSoft, flip: flipSoft, grow: growSoft, fade,
  left: (L, t0, d) => slideSoft(L, t0, d, -420), right: (L, t0, d) => slideSoft(L, t0, d, 420) };

/* ── life (expressions after landing) ────────────────────────────────────── */
export const float = (L, t0, amp = 6, freq = 1.3, ph = 0) => L.expr('y', (t, v) => v + Math.sin(Math.max(0, t - t0) * freq + ph) * amp * clamp((t - t0) / 0.4));
export const sway  = (L, t0, ay = 5, ax = 3, ph = 0) => L.expr('ry', (t, v) => v + Math.sin(Math.max(0, t - t0) * 0.9 + ph) * ay).expr('rx', (t, v) => v + Math.cos(Math.max(0, t - t0) * 0.7 + ph) * ax);
export const spin  = (L, degPerSec = 18) => L.expr('rot', (t, v) => v + t * degPerSec);
export const drift = (L, amp = 60, freq = 0.5) => L.expr('x', (t, v) => v + Math.sin(t * freq) * amp).expr('y', (t, v) => v + Math.cos(t * freq * 0.74) * amp * 0.6);
export const jitter = (L, amp = 2, freq = 6, seed = 0) => L.expr('x', (t, v) => v + wiggle(t, freq, amp, seed)).expr('y', (t, v) => v + wiggle(t, freq, amp, seed + 1));
export const breathe = (L, amp = 0.03, freq = 1) => L.expr('scale', (t, v) => v * (1 + Math.sin(t * freq) * amp));

/* ── ambient light objects ───────────────────────────────────────────────── */
/** rotating light cone (conic gradient masked to a soft disc) */
export function beam(comp, { parent, x, y, w, speed = 12, o = 0.6, color = '255,255,255', blend = 'screen', depth = 0.85, t0 = 0 }) {
  const n = document.createElement('div');
  n.style.cssText = `width:${w}px;height:${w}px;border-radius:50%;mix-blend-mode:${blend};pointer-events:none;
    background:conic-gradient(from 0deg,rgba(${color},0) 0deg,rgba(${color},.55) 16deg,rgba(${color},.62) 26deg,rgba(${color},0) 48deg,rgba(${color},0) 360deg);
    -webkit-mask-image:radial-gradient(circle,#000 0%,rgba(0,0,0,.7) 35%,transparent 70%);mask-image:radial-gradient(circle,#000 0%,rgba(0,0,0,.7) 35%,transparent 70%)`;
  const L = comp.layer(n, { parent, depth, base: { x, y, w, h: w, opacity: o } });
  fade(L, t0, 0.6); L.base.opacity = o; L.tracks.opacity = [{ t: t0, v: 0, e: 'hold' }, { t: t0 + 0.6, v: o, e: 'out' }];
  return spin(L, speed);
}
/** soft drifting light spot */
export function glow(comp, { parent, x, y, w, drift: d = 60, o = 1, depth = 0.8, t0 = 0 }) {
  const n = document.createElement('div');
  n.style.cssText = `width:${w}px;height:${w}px;border-radius:50%;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(circle,rgba(255,255,255,.45) 0%,rgba(255,255,255,.12) 40%,transparent 70%)`;
  const L = comp.layer(n, { parent, depth, base: { x, y, w, h: w, opacity: o } });
  L.tracks.opacity = [{ t: t0, v: 0, e: 'hold' }, { t: t0 + 0.6, v: o, e: 'out' }];
  return drift(L, d);
}
/** dots orbiting a centre on a flat ellipse */
export function orbit(comp, { parent, x, y, w, n = 6, speed = 40, depth = 1.05, t0 = 0, color = '#fff' }) {
  const box = document.createElement('div'); box.style.cssText = `width:${w}px;height:${w}px`;
  const dots = [];
  for (let i = 0; i < n; i++) { const d = document.createElement('i'); d.style.cssText = `position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px;border-radius:50%;background:${color}`; box.appendChild(d); dots.push(d); }
  const L = comp.layer(box, { parent, depth, base: { x, y, w, h: w, opacity: 0 } });
  L.tracks.opacity = [{ t: t0, v: 0, e: 'hold' }, { t: t0 + 0.5, v: 1, e: 'out' }];
  L.dots = dots; L.speed = speed;
  const R = w / 2;
  const apply = L.apply.bind(L);
  L.apply = (t, extra) => { if (!apply(t, extra)) return false; dots.forEach((d, i) => { const a = t * speed * Math.PI / 180 + i * 2 * Math.PI / n; d.style.transform = `translate(${(Math.cos(a) * R).toFixed(1)}px,${(Math.sin(a) * R * 0.45).toFixed(1)}px) scale(${(0.7 + 0.3 * Math.sin(a)).toFixed(2)})`; d.style.opacity = (0.4 + 0.5 * (0.5 + 0.5 * Math.sin(a))).toFixed(2); }); return true; };
  return L;
}
export { EASE };
/* typewriter entrance (Raylight one-click preset): characters appear one by one; needs a TextLayer built with split:'chars' */
export const typewriter = (L, t0, cps = 14) => L.animate({ t0, stagger: 1 / cps, dur: 0.02, from: { opacity: 0 }, ease: 'linear' });
