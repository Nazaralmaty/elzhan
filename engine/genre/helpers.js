/* engine/genre/helpers.js — what reels kept copy-pasting, once.
   withClient(spec, genre) — the client preset (engine/gen/client.js → window.CLIENT) fills ONLY what the spec leaves out:
     CLIENT.defaults[genre] (any mount key: subs, push, fx, vignette, lens, grain…), brand mark, brand fonts for ready(),
     kinetic colours from the palette. No CLIENT → the very same spec object comes back (existing reels unchanged).
   CAM.face/close/world/pull — five-key slow camera of a beat (moved from atlas_tourism/_ассеты/geom.js, same numbers).
   when / ring / pin / dot / card — the speaker-canvas element shorthands atlas reels redefined in every spec.
   A reel that defines its own helper of the same name keeps its own: nothing here is global. */

const PAL = () => (window.CLIENT && window.CLIENT.b.palette) || {};

export function withClient(spec, genre) {
  const C = window.CLIENT;
  if (!C || spec._client) return spec;
  const D = (C.defaults || {})[genre] || {}, P = PAL();
  const out = { ...D, ...spec, _client: true };
  if (out.mark === undefined && C.b.mark !== undefined) out.mark = C.b.mark;
  if (!out.fonts && C.fontList.length) out.fonts = C.fontList;
  if (D.subs && spec.subs && typeof D.subs === 'object' && typeof spec.subs === 'object') out.subs = { ...D.subs, ...spec.subs };
  if (genre === 'kinetic') {
    const pc = { acc: P.accent, ink: P.bg, hi: P.accent, side: P.side, paper: P.paper };
    Object.keys(pc).forEach(k => pc[k] === undefined && delete pc[k]);
    out.colors = { ...pc, ...(D.colors || {}), ...(spec.colors || {}) };
  }
  return out;
}

/* `end` squeezes the key times toward the beat start: the last key must stand ≥ 0.3 s before the next beat's cut,
   or the camera flies across the world map (atlas reel_016). */
const squeeze = (end, keys) => (end === 1 ? keys : keys.map(k => ({ ...k, at: +(k.at * end).toFixed(3) })));
export const CAM = {
  face:  (y = 926, z = 1.08, end = 1) => squeeze(end, [
    { at: 0, x: 540, y, z }, { at: .22, x: 543, y: y + 3, z: z + .01 }, { at: .46, x: 545, y: y + 6, z: z + .02 },
    { at: .72, x: 540, y: y + 10, z: z + .032 }, { at: .95, x: 544, y: y + 13, z: z + .045, hold: .1 }]),
  close: (y = 876, z = 1.22, end = 1) => squeeze(end, [
    { at: 0, x: 540, y, z }, { at: .24, x: 544, y: y + 3, z: z + .01 }, { at: .48, x: 547, y: y + 7, z: z + .02 },
    { at: .74, x: 542, y: y + 11, z: z + .03 }, { at: .95, x: 548, y: y + 14, z: z + .04, hold: 0 }]),
  world: (y = 940, z = 1.02, end = 1) => squeeze(end, [
    { at: .04, x: 540, y, z }, { at: .26, x: 544, y: y + 10, z: z + .018 }, { at: .5, x: 547, y: y + 20, z: z + .034 },
    { at: .74, x: 550, y: y + 30, z: z + .052 }, { at: .92, x: 552, y: y + 40, z: z + .07, hold: .1 }]),
  /* entering a world out of a shrink seam: the first key waits until .24 — the card framing (prepended by `shrink`) pulls back
     over a quarter of the beat, not in one frame (atlas reel_053 beats 1 and 10) */
  enter: (y = 960, z = 1.0) => [
    { at: .24, x: 540, y, z }, { at: .55, x: 548, y: y - 14, z: z + .03 }, { at: .80, x: 554, y: y - 26, z: z + .05 }, { at: .97, x: 558, y: y - 34, z: z + .06 }],
  pull:  (y = 930, z = 1.16, end = 1) => squeeze(end, [
    { at: 0, x: 540, y, z }, { at: .24, x: 542, y: y + 3, z: z - .012 }, { at: .48, x: 543, y: y + 6, z: z - .026 },
    { at: .74, x: 540, y: y + 10, z: z - .042 }, { at: .95, x: 542, y: y + 13, z: z - .06, hold: .1 }]),
};

/* 'слово' → on a spoken word, 0.4 / '3.2s' → at */
export const when = at => (typeof at === 'string' && !at.endsWith('s') ? { on: at } : { at });
export const ring = (cx, cy, at, until, w = 64, extra = {}) =>
  ({ k: 'ring', w, sw: 5, color: PAL().accent || '#C9A86A', x: cx - w / 2, y: cy - w / 2, ...when(at), dur: .32, until, ...extra });
/* pin and dot draw with the brand css classes .pin / .dot (atlas client.json) */
export const pin = (t, cx, y, at, until, { dim, ...extra } = {}) =>
  ({ k: 'html', x: cx - 160, y, w: 320, h: 110, html: `<div class="pin${dim ? ' dim' : ''}"><i></i><b>${t}</b></div>`, ...when(at), anim: 'pop', cue: 'pop', until, ...extra });
export const dot = (cx, cy, at, until, w = 26, extra = {}) =>
  ({ k: 'html', x: cx - w / 2, y: cy - w / 2, w, h: w, html: `<div class="dot" style="width:${w}px;height:${w}px"></div>`, ...when(at), anim: 'pop', until, ...extra });
/* the take as a small card in a world: playing the CURRENT frame (a freeze or loop is a defect) */
export const card = (id, x = 660, y = 1180, extra = {}) => ({ k: 'footage', mode: 'card', w: 300, border: 10, r: 26, anim: 'none', id, x, y, at: -.3, ...extra });
