/* ~/.claude/engine/genre/speaker-canvas.js — /speaker-canvas: the canvas-pro language over shot footage.
   v2 (15.09.2026, Elzhan on v1: «карточка немного наклоняется и появляются розовые границы — некрасиво; сделай её меньше,
   одной из вставок общего канваса; вырежи спикера по матту и вставляй отдельно»). The take is no longer a room the camera
   tilts and pulls back from. It is an ELEMENT that stands in any world, in three modes, all playing the same frame:
     full — the footage room (`footage: true`): plate z 1, `behind: true` type z 2, matte z 3, front z 4. Flat camera only.
     card — { k: 'footage', mode: 'card', x, y, w, r, border } a small framed take among the world's inserts; may lift / tilt with the world.
     cut  — { k: 'footage', mode: 'cut', x, y, w, fade, outline } the speaker cut out by the matte, standing in a world.
   Match seams: `shrink` on a beat's first key and `grow` on the last one make the full frame become a card (and back)
   with no visible cut — see /speaker-canvas.

   Inputs (cam.sh): work/plate.js, work/fr/f_%04d.jpg, work/mt/f_%04d.png, assets/vo/words.js; qa/face.json for the head gate.
   spec = canvas spec (/motion-canvas-pro) plus: rooms[{ footage: true }], beats[{ from: 'слово#N', subs }], subs {…} | false,
          element keys: behind (full room), k: 'footage'; cuts: [s, …] — hard cuts inside the take itself. Defaults for footage: wig 0, drift halved. */
import { mount as canvas } from './canvas.js';
import { subtitles } from './speaker.js';
import { css } from '../core.js';
import { withClient } from './helpers.js';

export function mount(spec) {
  spec = withClient(spec, 'speaker-canvas');   // client preset fills what the spec leaves out; no CLIENT → same spec
  const PL = window.PLATE || { frames: 1, fps: 30, dur: 10 }, FPS = PL.fps || 30, W = window.WORDS_ALL || [];
  const norm = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}$]/gu, '');
  const FR = (spec.rooms.find(r => r.footage) || {}).id;

  /* 1. lines from beats — the timeline canvas.js expects, made from the take instead of TTS */
  const starts = [0]; let cur = 0;
  spec.beats.forEach((b, i) => {
    if (i === 0) return;
    const [w, nth] = String(b.from || '').split('#'); const key = norm(w); let k = +nth || 1, j = -1;
    for (let q = cur + 1; q < W.length; q++) if (key && norm(W[q].w).startsWith(key) && --k === 0) { j = q; break; }
    if (j < 0) throw new Error(`speaker-canvas: beat ${i + 1} from "${b.from}" not found after word ${cur} (${W[cur] && W[cur].w})`);
    starts.push(j); cur = j;
  });
  const A = starts.map((s, i) => { const e = (starts[i + 1] ?? W.length) - 1; return [i === 0 ? 0 : W[s].t0, Math.max(W[e].t1, W[s].t0 + 0.2)]; });
  window.VO = A.map((a, i) => [a[1] - a[0], i < A.length - 1 ? Math.max(0, A[i + 1][0] - a[1]) : 0]);
  window.WORDS = A.map((a, i) => W.slice(starts[i], starts[i + 1] ?? W.length).map(w => ({ w: norm(w.w), t: Math.max(0, w.t0 - a[0]) })).filter(w => w.w));
  window.LINES = A.map((a, i) => W.slice(starts[i], starts[i + 1] ?? W.length).map(w => w.w).join(' '));
  spec.lines = window.LINES;
  spec.tail = spec.tail ?? Math.max(0.1, (spec.dur ?? PL.dur) - A[A.length - 1][1]);

  /* 2. footage elements → html layers. Every take carries a hidden head marker scaled to its own size. */
  const H = w => Math.round(w * 1920 / 1080);
  const mark = (s, dx = 0, dy = 0, room = '', win = null) => `<i class="hm" data-s="${s}" data-dx="${dx}" data-dy="${dy}" data-room="${room}"${win ? ` data-w0="${win[0]}" data-w1="${win[1]}"` : ''} style="position:absolute;visibility:hidden"></i>`;
  const expand = (e, b) => {
    if (e.k !== 'footage') return [e];
    const room = e.room || b.room, w = e.w || 480, h = H(w), s = w / 1080;
    if (e.mode === 'cut') {
      const fade = e.fade ?? 0.16, ol = e.outline ?? 0;
      const filt = [ol ? `drop-shadow(${ol}px 0 0 #fff) drop-shadow(-${ol}px 0 0 #fff) drop-shadow(0 ${ol}px 0 #fff) drop-shadow(0 -${ol}px 0 #fff)` : '', e.shadow === false ? '' : 'drop-shadow(0 30px 44px rgba(0,0,0,.42))'].join(' ');
      return [{ ...e, k: 'html', w, h, cls: ((e.cls || '') + ' footage cut').trim(), html:
        `<img class="fm" src="work/mt/f_0001.png" alt="" style="display:block;width:${w}px;height:${h}px;filter:${filt};-webkit-mask-image:linear-gradient(180deg,#000 ${(100 - fade * 100).toFixed(0)}%,transparent);mask-image:linear-gradient(180deg,#000 ${(100 - fade * 100).toFixed(0)}%,transparent)">${mark(s, 0, 0, room)}` }];
    }
    const bd = e.border ?? 10, r = e.r ?? 34;   // card
    // 17.09.2026 Elzhan («вот таких границ карточки при наклоне не должно быть», скрин бита «8 лет»): у карточки
    // подложка и тень были вшиты намертво, `shadow: false` читался только в mode:'cut'. Наклонённый мир проецирует
    // карточку шире её координат, и вшитая тень чертит её кромку поперёк кадра. Теперь карточка слушается `shadow`
    // (и `bg`), а `h` задаётся свободно — лист, напечатанный не в 9:16, больше не растягивается.
    const ch = e.h || h;
    const sh = e.shadow === false ? 'none' : (e.shadow || '0 44px 90px rgba(0,0,0,.42),0 8px 20px rgba(0,0,0,.25)');
    const bg = e.bg || '#fff';
    const wcls = e.dir ? 'fs' : e.win ? 'fw' : 'fp';
    const wdat = e.dir ? ` data-dir="${e.dir}"` : e.win ? ` data-w0="${e.win[0]}" data-w1="${e.win[1]}"` : '';
    const src0 = (e.dir || 'work/fr') + '/f_0001.jpg';
    return [{ ...e, k: 'html', w: w + 2 * bd, h: ch + 2 * bd, cls: ((e.cls || '') + ' footage card').trim(), html:
      `<div class="fcard" style="width:${w + 2 * bd}px;height:${ch + 2 * bd}px;padding:${bd}px;background:${bg};border-radius:${r + bd}px;box-shadow:${sh}"><img class="${wcls}"${wdat} src="${src0}" alt="" style="display:block;width:${w}px;height:${ch}px;border-radius:${r}px"></div>${mark(s, bd, bd, room, e.win)}` }];
  };
  spec.beats.forEach(b => { b.add = (b.add || []).flatMap(e => expand(e, b)); });
  if (FR) {
    /* 17.09.2026 (Елжан: «субтитры появляются все время в разных местах, нет единой концепции»): набор ПЕРЕД спикером
       живёт в экранном пространстве, а не в лицевой комнате. Замер на reel_008: y набора в спеке один — 1150/1210/1380/1470, —
       а на экране 21 разный ряд, потому что зум бита (1.06…1.30) умножает отступ от центра кадра. Полный кадр и так
       неподвижен как картинка, так что набору не за чем ехать вместе с плейтом: он отсчитывается от КРОМКИ КАДРА, как
       субтитры, и лестница у всех битов одна. `behind: true` (типографика в подголовье, под маттом) остаётся в комнате —
       она часть картинки. `screen: false` в спеке возвращает прежнее поведение для отдельного элемента. */
    spec.beats.forEach(b => (b.add || []).forEach(e => { if ((e.room || b.room) !== FR || e.lift || e.k === 'html' && /footage/.test(e.cls || '')) return; if (e.z === undefined) e.z = e.behind ? 2 : 4; if (e.behind) e.cls = ((e.cls || '') + ' behind').trim(); else e.screen = e.screen ?? true; }));
    const R = spec.rooms.find(r => r.id === FR); R.w = 1080; R.h = 1920; R.bg = R.bg || 'dark'; R.r = 0;
    spec.beats[0].add = [
      { k: 'html', room: FR, x: 0, y: 0, w: 1080, h: 1920, at: '0s', anim: 'none', z: 1, cls: 'footage plate', html: `<img class="fp" src="work/fr/f_0001.jpg" alt="" style="display:block;width:1080px;height:1920px">${mark(1, 0, 0, FR)}` },
      ...(PL.matte === false ? [] : [{ k: 'html', room: FR, x: 0, y: 0, w: 1080, h: 1920, at: '0s', anim: 'none', z: 3, cls: 'footage matte', html: '<img class="fm" src="work/mt/f_0001.png" alt="" style="display:block;width:1080px;height:1920px">' }]),
      ...spec.beats[0].add];
  }
  spec.wig = spec.wig ?? 0;
  spec.drift = spec.drift ?? { x: 11, y: 8, z: 0.003, px: 11, py: 8.5, pz: 13 };

  /* 3. match seams: `shrink: 'id'` on a beat = its first camera key frames that card exactly as the full frame was framed at the cut
        (hard cut, same picture), then the camera pulls back; `grow: 'id'` = the beat's last key pushes into that card until it fills
        the frame, and the next beat (in the footage room, cut hard) continues the same picture full frame. */
  const cardCam = (e, z0 = 1, x0 = 540, y0 = 960) => { const bd = e.border ?? 10, w = e.w - 2 * bd, k = z0 * 1080 / w * 1.04;   // 4 % overscan: the drift under the camera is multiplied by the zoom and showed the card edge on the match frame
    return { x: e.x + bd + x0 * w / 1080, y: e.y + bd + y0 * w / 1080, z: k }; };
  spec.beats.forEach((b, i) => {
    const find = id => (b.add || []).find(e => e.id === id) || console.warn(`shrink/grow: no card "${id}" in beat ${i + 1}`);
    if (b.shrink) { const e = find(b.shrink); const p = spec.beats[i - 1], pc = [].concat(p.cam || [{}]).slice(-1)[0];
      if (e) { const c = cardCam(e, pc.z ?? 1, pc.x ?? 540, pc.y ?? 960); b.cut = b.cut || { kind: 'hard', lead: 0.04 }; b.cam = [{ at: 0, ...c, rot: 0 }, ...[].concat(b.cam || [])]; } }
    if (b.grow) { const e = find(b.grow); const n = spec.beats[i + 1], nc = [].concat(n.cam || [{}])[0];
      if (e) { const c = cardCam(e, nc.z ?? 1, nc.x ?? 540, nc.y ?? 960); b.cam = [...[].concat(b.cam || []), { at: 1.0, ...c, rot: 0, hold: b.growHold ?? 0.72, ease: 'in' }]; n.cut = n.cut || { kind: 'hard', lead: 0.02 }; } }
  });

  /* 4. subtitles in screen space, only while a beat lives in the footage room (or says subs: true) */
  const S = spec.subs === false ? null : { y: 255, size: 60, words: 3, gap: 0.35, hold: 0.30, solo: true, ...(spec.subs || {}) };
  const beatAt = t => { let i = 0; A.forEach((a, k) => { if (t >= a[0] - 0.12) i = k; }); return i; };
  const onSubs = i => spec.beats[i].subs ?? (spec.beats[i].room === FR);
  const lead = b => b.cut ? (b.cut.lead ?? 0.05) + (b.cut.kind === 'tone' ? (b.cut.dur ?? 0.9) : b.cut.kind === 'iris' ? (b.cut.in ?? 0.28) : b.cut.kind === 'band' ? (b.cut.dur ?? 0.62) / 2 : 0.12) : 0.12;
  const stops = spec.beats.map((b, i) => i && !onSubs(i) ? A[i][0] - lead(b) : null).filter(x => x !== null);
  if (S) S.cuts = [...(S.cuts || []), ...spec.beats.map((b, i) => i && b.cut ? A[i][0] - lead(b) : null).filter(x => x !== null)];

  // a group that starts inside the lead of a world change (the tone flood is already rising) would live on over the world
  const inLead = t => spec.beats.some((b, i) => i && !onSubs(i) && t >= A[i][0] - lead(b) - 0.02 && t < A[i][0] + 0.12);
  let SUB = { layers: [], fit: () => {} };
  const userFit = spec.fit; spec.fit = () => { SUB.fit(); if (userFit) userFit(); };
  // .subpill must be declared here too: speaker.js owns the plate's markup but injects the rule
  // into its OWN css block, so in this genre subs.pill produced a static inline <i> and the plate
  // never drew — subtitles hung as bare text over the footage (found on realprepod 07.10.2026).
  css('.subs{position:absolute;left:0;width:1080px;text-align:center;white-space:nowrap;line-height:1.2;z-index:60}.subs .ae-u{padding:0 .08em}.subs .subpill{position:absolute;z-index:-1;display:block}');
  const comp = canvas(spec);
  // hard cuts baked into the take (a b-roll edit under a voiceover) are events of the frame; re-expose so CUES carries them
  if (spec.cuts) { spec.cuts.forEach(t => comp.cue(t, 'cut')); comp.expose(); }
  SUB = subtitles(comp, S, { DUR: window.REEL.DUR, FPS, stage: document.getElementById('stage'), hidden: t => !onSubs(beatAt(t)) || inLead(t), stops });
  window.SUBS = SUB.layers.map(L => L.node);

  /* 5. frames: every take on the page plays the same frame; seek awaits their decode */
  const FP = [...document.querySelectorAll('img.fp')], FM = [...document.querySelectorAll('img.fm')], HM = [...document.querySelectorAll('.hm')];
  const FW = [...document.querySelectorAll('img.fw')];   // карточки со своим окном кадров
  const FS = [...document.querySelectorAll('img.fs')];   // карточки со своей дорожкой кадров (dir), кадр — текущий
  const CS = [...document.querySelectorAll('img.cs')];   // экраны коридора: каждый крутит СВОЙ кусок своей дорожки
  const frameAt = t => Math.max(1, Math.min(PL.frames, Math.round(t * FPS) + 1));
  let curN = 1;
  const load = async t => {
    const n = frameAt(t); if (n === curN) return; curN = n; const p4 = String(n).padStart(4, '0');
    FP.forEach(i => { i.src = `work/fr/f_${p4}.jpg`; }); FM.forEach(i => { i.src = `work/mt/f_${p4}.png`; });
    FW.forEach(i => { const a = +i.dataset.w0, b = +i.dataset.w1, span = Math.max(0.1, b - a);
      const q4 = String(frameAt(a + ((t - a) % span + span) % span)).padStart(4, '0'); i.src = `work/fr/f_${q4}.jpg`; });
    FS.forEach(i => { i.src = `${i.dataset.dir}/f_${p4}.jpg`; });
    CS.forEach(i => { const f = Math.max(1, +i.dataset.frames || 1), per = f > 1 ? f * 2 - 2 : 1;
      const raw = n - 1 + (+i.dataset.off || 0), q = ((raw % per) + per) % per;
      i.src = `${i.dataset.dir}/f_${String((q < f ? q : per - q) + 1).padStart(4, '0')}.jpg`; });
    await Promise.all([...FP, ...FM, ...FW, ...FS, ...CS].map(i => i.decode().catch(() => {})));
  };
  /* qa/overlap.js head gate: window.FACE = face.json injected by the gate; heads(t) = screen rect of every take's head incl. hair */
  const winT = (m, t) => { const a = +m.dataset.w0, b = +m.dataset.w1;
    if (!isFinite(a) || !isFinite(b)) return t; const span = Math.max(0.1, b - a); return a + ((t - a) % span + span) % span; };
  window.FOOT = { frameAt, heads: t => {
    return HM.map(m => { const f = window.FACE && window.FACE.frames[frameAt(winT(m, t)) - 1]; if (!f || !f.head) return null;
      const s = +m.dataset.s, dx = +m.dataset.dx, dy = +m.dataset.dy;
      Object.assign(m.style, { left: (dx + f.head[0] * s) + 'px', top: (dy + f.head[1] * s) + 'px', width: (f.head[2] * s) + 'px', height: (f.head[3] * s) + 'px' });
      const q = m.getBoundingClientRect(); return { r: { l: q.left, r: q.right, t: q.top, b: q.bottom }, owner: m.closest('.e') || m.parentElement, room: m.dataset.room }; })
      .filter(h => h && h.r.r - h.r.l > 1); } };
  // a spec that adds cues after mount calls comp.expose() again, which resets window.seek to the bare sync and drops the frame
  // loader: every take froze on f_0001 (T1_polet v2–v7, «лицо спикера не двигается»). So every expose re-wraps.
  const wrap = () => { const sync = window.seek; window.seek = async t => { await load(t); return sync(t); }; };
  const ex = comp.expose; comp.expose = (...a) => { const r = ex.apply(comp, a); wrap(); return r; };
  wrap();
  return comp;
}
