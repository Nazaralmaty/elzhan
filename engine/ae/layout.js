/* ~/.claude/engine/ae/layout.js — auto-layout for canvas beats: elements
   without x/y are placed by a vertical rhythm inside the room; the camera
   key, if missing, frames the column. Rough sizes; qa/overlap.js catches the
   rest. A beat opts in with `auto: true` (or any element without x).

   Rules (1080-wide room space, column at x=90, width 900):
     text        stacked; gap 22; wraps at 900 if estimated wider
     img ≤ 480   right column, level with the column top; wider → below
     card/phone/grid/comment/pill/num/bubble   below the column, centred (pill left)
     cursor      around the last HIT text;  brk around the whole column
     stamp       over the last pill;        ring around the last num
     beam/glow   room ambient defaults
   Per room the next auto beat starts 220 px under the previous one. */
const CH = { hit: 0.52, sans: 0.66, script: 0.46, sub: 0.56 };   // width per char × size
const LH = { hit: 0.92, sans: 1.2, script: 1.05, sub: 1.25 };

export function autoLayout(spec) {
  const roomCur = {};
  spec.beats.forEach(b => {
    const needs = b.auto || (b.add || []).some(e => e.x === undefined && !['arrow'].includes(e.k));
    if (!needs) return;
    const top = b.top ?? (roomCur[b.room] ?? 300);
    let cur = top, lastHit = null, lastPill = null, lastNum = null, hasRightImg = false;
    const X = 140;
    const rightImg = (b.add || []).find(e => e.k === 'img' && e.x === undefined && (e.w || 420) <= 480);
    const W = rightImg ? Math.max(520, 1080 - 100 - (rightImg.w || 420) - 40 - X) : 800;
    for (const e of b.add || []) {
      if (e.x !== undefined) continue;
      switch (e.k) {
        case 'text': {
          const s = e.s || 80, v = e.voice || 'sans';
          const est = String(e.t).replace(/<[^>]+>/g, '').length * CH[v] * s;
          if (est > W && !e.wrap) e.wrap = W;
          const lines = e.wrap ? Math.ceil(est / e.wrap) : 1;
          e.x = X; e.y = cur; cur += lines * s * LH[v] + 22;
          if (v === 'hit') lastHit = e; break;
        }
        case 'img': {
          const w = e.w || 420;
          if (w <= 480 && !hasRightImg) { e.x = 1080 - 100 - w; e.y = top; hasRightImg = true; }
          else { e.x = (1080 - w) / 2; e.y = cur + 30; cur += w * 0.8 + 50; }
          break;
        }
        case 'card': { const w = e.w || 470; e.x = (1080 - w) / 2; e.y = cur + 30; cur += (e.grid ? 380 : 300) + 70; break; }
        case 'phone': { e.x = 280; e.y = cur + 30; cur += 1040 + 60; break; }
        case 'grid': { const cell = e.cell || 80, gap = e.gap || 12, cols = e.cols || 7; e.x = X; e.y = cur + 20; cur += Math.ceil(e.n / cols) * (cell * (e.ratio || 0.8) + gap) + 60; break; }
        case 'comment': { const w = e.w || 420; e.x = 1080 - 80 - w; e.y = cur + 20; cur += 220; break; }
        case 'pill': { e.x = X; e.y = cur + 10; cur += (e.s || 44) * 1.9 + 30; lastPill = e; break; }
        case 'num': { const s = e.s || 420; e.x = X + 20; e.y = cur; cur += s * 0.85 + 30; lastNum = e; break; }
        case 'bubble': { e.w = e.w || 900; e.h = e.h || 600; e.x = (1080 - e.w) / 2; e.y = cur + 40; cur += e.h + 120; break; }
        case 'cursor': { if (lastHit) { const s = lastHit.s || 80; e.x = lastHit.x - 26; e.y = lastHit.y - 18; e.w = e.w || Math.min(W + 40, String(lastHit.t).length * CH.hit * s + 52); e.h = e.h || s * 1.1 + 36; } else { e.x = X; e.y = top; e.w = 600; e.h = 140; } break; }
        case 'brk': { e.x = 40; e.y = top - 50; e.w = 1000; e.h = Math.max(300, cur - top + 100); break; }
        case 'stamp': { const p = lastPill || lastHit; e.w = e.w || 200; if (p) { e.x = p.x + 8; e.y = p.y - 40; } else { e.x = X; e.y = cur; } break; }
        case 'ring': { if (lastNum) { const s = lastNum.s || 420; e.w = e.w || s * 1.4; e.x = lastNum.x - 70; e.y = lastNum.y - 50; } else { e.w = e.w || 600; e.x = X; e.y = cur; cur += e.w + 30; } break; }
        case 'beam': { e.x = -620; e.y = top - 900; e.w = e.w || 1700; break; }
        case 'glow': { e.x = 80; e.y = top + 200; e.w = e.w || 900; break; }
        case 'blob': { e.w = e.w || 600; e.h = e.h || e.w; e.x = -220; e.y = cur; break; }
        case 'orbit': { if (lastNum) { const s = lastNum.s || 420; e.w = e.w || s * 1.3; e.x = lastNum.x - 50; e.y = lastNum.y - 30; } else { e.x = 600; e.y = top; e.w = e.w || 500; } break; }
        default: { e.x = X; e.y = cur; }
      }
    }
    if (!b.cam) {
      const h = cur - top;
      if (h > 1500) b.cam = [{ at: .12, x: 540, y: top + 720, z: 1.0, rot: 0, hold: .3 }, { at: .72, x: 540, y: cur - 760, z: 1.0, rot: 0, hold: .35 }];   // tall column: the camera walks down it
      else b.cam = { at: .12, x: 540, y: top + h / 2 + 40, z: Math.max(1.0, Math.min(1.3, 1600 / (h + 380))), rot: 0, hold: .3 };
    }
    roomCur[b.room] = cur + 220;
  });
  return spec;
}
