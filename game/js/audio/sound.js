// Sound for both games, synthesised with Web Audio at runtime (no sample files). The aim is a field
// recording, not a toy: gunfire and booms are shaped noise with a sub thump, blades and bells use
// inharmonic partials, everything far away gets darker and wetter in one shared outdoor reverb, and
// crowds (marching, hooves, the din of melee, work in the village) are looping beds whose level follows
// what the camera sees. Many identical sounds in one frame merge into one fuller sound.

const STORE = 'aos.sound';
let shared = null;
export function getSound() { return shared || (shared = createSound()); }

function createSound() {
  let ctx = null, master, sfx, amb, ui, rev, noiseW, noiseB, active = 0;
  let on = (() => { try { return localStorage.getItem(STORE) !== '0'; } catch { return true; } })();
  let listener = () => ({ gain: 1, pan: 0, far: 0 });
  const queue = new Map(), lastAt = new Map(), beds = {};

  /* ---------- setup ---------- */
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = on ? 0.85 : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.3;
      master.connect(comp); comp.connect(ctx.destination);
      sfx = bus(1); amb = bus(0.7); ui = bus(0.5);
      rev = ctx.createConvolver(); rev.buffer = impulse(2.8);
      const rg = ctx.createGain(); rg.gain.value = 0.42; rev.connect(rg); rg.connect(master);
      noiseW = noiseBuf('white', 3); noiseB = noiseBuf('brown', 3);
      startBeds();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function bus(v) { const g = ctx.createGain(); g.gain.value = v; g.connect(master); return g; }
  function noiseBuf(kind, sec) {
    const n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }
  // outdoor space: a few early reflections off the ground and treeline, then a tail that darkens as it decays
  function impulse(sec) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, cut = 0.5 * Math.exp(-t * 2.2) + 0.03;
        lp += cut * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-t * 2.6) * 0.9;
      }
      for (const [ms, g] of [[23, 0.5], [41, 0.35], [67, 0.28], [97, 0.2], [140, 0.12]]) d[Math.floor((ms + ch * 7) / 1000 * sr)] += g * (Math.random() < 0.5 ? -1 : 1);
    }
    return b;
  }

  /* ---------- building blocks ---------- */
  const R = (a, b) => a + Math.random() * (b - a);
  // one voice: input → air absorption → pan → dry bus + reverb send; closes itself when done
  function voice(level, pan, far, dur, wet = 0.25, dest = sfx) {
    const g = ctx.createGain(); g.gain.value = level;
    const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 16000 * (1 - far) ** 2.2 + 900; air.Q.value = 0.4;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(air); air.connect(p); p.connect(dest);
    const s = ctx.createGain(); s.gain.value = wet + far * 0.45; p.connect(s); s.connect(rev);
    active++;
    setTimeout(() => { active--; g.disconnect(); }, (dur + 0.3) * 1000);
    return g;
  }
  function noise(out, t, dur, { type = 'white', filter = 'lowpass', f = 1000, f2, q = 0.7, a = 0.002, peak = 1, decay = dur, rate = 1 }) {
    const src = ctx.createBufferSource(); src.buffer = type === 'brown' ? noiseB : noiseW; src.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter(); fl.type = filter; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); env(g.gain, t, a, peak, decay);
    src.connect(fl); fl.connect(g); g.connect(out);
    src.start(t, R(0, Math.max(0, 2.9 - dur)), dur + 0.05);
    return g;
  }
  function tone(out, t, dur, { type = 'sine', f = 220, f2, a = 0.003, peak = 0.5, decay = dur, detune = 0 }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); env(g.gain, t, a, peak, decay);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function env(p, t, a, peak, decay) {
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setTargetAtTime(0.0001, t + a, Math.max(0.005, decay / 4));
  }
  // small debris: dirt, splinters, rattling kit
  function grains(out, t, n, spread, f, peak) {
    for (let i = 0; i < n; i++) noise(out, t + R(0.02, spread), 0.03, { filter: 'bandpass', f: f * R(0.7, 1.4), q: 2, peak: peak * R(0.4, 1), decay: 0.03 });
  }

  /* ---------- sounds ---------- */
  const S = {
    musket(o, t, k) {
      const p = R(0.9, 1.1);
      noise(o, t, 0.05, { filter: 'highpass', f: 1800 * p, peak: 0.7 * k, decay: 0.035 });
      noise(o, t, 0.25, { f: 1100 * p, peak: 0.85 * k, decay: 0.16 });
      tone(o, t, 0.16, { f: 120 * p, f2: 42, peak: 0.55 * k, decay: 0.13 });
      noise(o, t + 0.01, 0.8, { type: 'brown', f: 380, peak: 0.35 * k, decay: 0.55 });
    },
    volley(o, t, k) { for (let i = 0; i < 4; i++) S.musket(o, t + R(0, 0.09), k * 0.62); },
    cannon(o, t, k) {
      noise(o, t, 0.09, { filter: 'highpass', f: 1100, peak: 0.6 * k, decay: 0.06 });
      noise(o, t, 1.8, { type: 'brown', f: 260, peak: 1.0 * k, a: 0.004, decay: 1.2 });
      tone(o, t, 0.7, { f: 64, f2: 28, peak: 0.95 * k, decay: 0.6 });
      noise(o, t + 0.05, 2.6, { type: 'brown', f: 130, peak: 0.45 * k, a: 0.08, decay: 2.2 });
    },
    boom(o, t, k) {
      noise(o, t, 0.9, { type: 'brown', f: 520, peak: 0.85 * k, decay: 0.6 });
      tone(o, t, 0.4, { f: 85, f2: 32, peak: 0.7 * k, decay: 0.35 });
      grains(o, t + 0.05, 9, 0.7, 2600, 0.12 * k);
    },
    grape(o, t, k) { S.cannon(o, t, k * 0.75); grains(o, t + 0.03, 14, 0.25, 3200, 0.16 * k); },
    crash(o, t, k) {
      S.boom(o, t, k);
      noise(o, t + 0.1, 1.6, { type: 'brown', f: 700, peak: 0.5 * k, a: 0.05, decay: 1.2 });
      grains(o, t + 0.1, 24, 1.6, 1100, 0.18 * k);
    },
    // steel on steel: a short scrape and a damped ring from a few bar modes
    blade(o, t, k) {
      const f0 = R(1050, 1500);
      noise(o, t, 0.02, { filter: 'bandpass', f: 3600, q: 1.2, peak: 0.55 * k, decay: 0.018 });
      [[1, 0.22, 0.2], [2.76, 0.14, 0.14], [5.4, 0.08, 0.09], [8.93, 0.04, 0.05]].forEach(([r, g, d]) => tone(o, t, d * 2, { f: f0 * r * R(0.99, 1.01), peak: g * k, decay: d }));
      noise(o, t, 0.08, { f: 700, peak: 0.35 * k, decay: 0.06 });
    },
    thud(o, t, k) {
      noise(o, t, 0.12, { f: 380, peak: 0.7 * k, decay: 0.08 });
      tone(o, t, 0.08, { f: 95, f2: 60, peak: 0.35 * k, decay: 0.07 });
    },
    knock(o, t, k) { // wood: pike shafts, clubs, bones
      noise(o, t, 0.06, { filter: 'bandpass', f: R(600, 900), q: 3, peak: 0.6 * k, decay: 0.05 });
      tone(o, t, 0.07, { f: R(200, 260), peak: 0.25 * k, decay: 0.05 });
    },
    fall(o, t, k) { // a body or a horse going down: heavy thud and rattling kit
      noise(o, t, 0.25, { type: 'brown', f: 300, peak: 0.6 * k, decay: 0.18 });
      grains(o, t + 0.04, 4, 0.2, 2200, 0.08 * k);
    },
    charge(o, t, k) { noise(o, t, 1.0, { type: 'brown', f: 320, a: 0.25, peak: 0.6 * k, decay: 0.6 }); grains(o, t, 10, 0.9, 500, 0.25 * k); },
    // magic of the undead: an airy rush with a beating low pair underneath
    bolt(o, t, k) {
      noise(o, t, 0.45, { filter: 'bandpass', f: 380, f2: 2200, q: 1.4, a: 0.06, peak: 0.35 * k, decay: 0.3 });
      tone(o, t, 0.5, { f: 196, a: 0.05, peak: 0.12 * k, decay: 0.35 });
      tone(o, t, 0.5, { f: 207, a: 0.05, peak: 0.1 * k, decay: 0.35 });
    },
    raise(o, t, k) {
      noise(o, t, 1.3, { type: 'brown', f: 180, f2: 900, a: 0.5, peak: 0.45 * k, decay: 0.7 });
      for (const f of [98, 103.8, 146.8]) tone(o, t, 1.4, { type: 'triangle', f, a: 0.6, peak: 0.08 * k, decay: 0.8 });
      grains(o, t + 0.9, 7, 0.4, 2400, 0.12 * k);
    },
    ice(o, t, k) {
      noise(o, t, 0.3, { filter: 'highpass', f: 5000, peak: 0.2 * k, decay: 0.2 });
      for (const f of [1760, 2349, 3136]) tone(o, t + R(0, 0.04), 0.5, { f, peak: 0.045 * k, decay: 0.35 });
      grains(o, t, 4, 0.12, 4000, 0.15 * k);
    },
    fire(o, t, k) {
      noise(o, t, 0.6, { filter: 'bandpass', f: 300, f2: 1200, q: 0.8, a: 0.08, peak: 0.45 * k, decay: 0.4 });
      grains(o, t + 0.1, 12, 0.6, 1600, 0.1 * k);
    },
    blast(o, t, k) { S.boom(o, t, k * 0.8); noise(o, t, 0.8, { filter: 'bandpass', f: 1500, f2: 300, q: 0.7, peak: 0.3 * k, decay: 0.6 }); },
    sling(o, t, k) { // catapult arm of the bonecaster
      tone(o, t, 0.12, { f: 140, f2: 80, peak: 0.4 * k, decay: 0.1 });
      noise(o, t, 0.1, { filter: 'bandpass', f: 700, q: 2, peak: 0.4 * k, decay: 0.08 });
      noise(o, t + 0.05, 0.35, { filter: 'bandpass', f: 900, f2: 300, q: 1, a: 0.05, peak: 0.25 * k, decay: 0.25 });
    },
    sack(o, t, k) { noise(o, t, 0.12, { f: 260, peak: 0.45 * k, decay: 0.08 }); for (let i = 0; i < 2; i++) tone(o, t + 0.03 + i * 0.05, 0.12, { f: R(4200, 5600), peak: 0.03 * k, decay: 0.08 }); },
    chop(o, t, k) { noise(o, t, 0.05, { filter: 'bandpass', f: 1800, q: 1.5, peak: 0.5 * k, decay: 0.03 }); tone(o, t, 0.1, { f: R(320, 420), peak: 0.25 * k, decay: 0.08 }); },
    treefall(o, t, k) {
      for (let i = 0; i < 6; i++) noise(o, t + i * 0.09 * R(0.7, 1.3), 0.05, { filter: 'bandpass', f: R(900, 1800), q: 3, peak: 0.25 * k, decay: 0.04 });
      noise(o, t + 0.6, 0.6, { type: 'brown', f: 350, peak: 0.55 * k, decay: 0.4 });
    },
    // bells: a real church-bell partial set; small for news, big and slow for alarms and endings
    bell(o, t, k, f0 = 330) {
      noise(o, t, 0.02, { filter: 'bandpass', f: f0 * 6, q: 2, peak: 0.15 * k, decay: 0.015 });
      [[0.5, 0.35, 4], [1, 0.3, 2.4], [1.183, 0.2, 2], [1.506, 0.12, 1.6], [2, 0.12, 1.3], [2.514, 0.06, 1], [2.662, 0.05, 0.9], [3.011, 0.04, 0.7]]
        .forEach(([r, g, d]) => tone(o, t, d * 1.6, { f: f0 * r, peak: g * k, decay: d }));
    },
    news(o, t, k) { S.bell(o, t, k * 0.5, R(560, 640)); },
    alarm(o, t, k) { for (let i = 0; i < 3; i++) S.bell(o, t + i * 0.55, k * 0.7, 196); },
    snare(o, t, k) { noise(o, t, 0.16, { filter: 'bandpass', f: 2600, q: 0.6, peak: 0.45 * k, decay: 0.12 }); tone(o, t, 0.08, { type: 'triangle', f: 185, peak: 0.25 * k, decay: 0.06 }); },
    bass(o, t, k) { tone(o, t, 0.35, { f: 78, f2: 52, peak: 0.6 * k, decay: 0.28 }); noise(o, t, 0.08, { f: 220, peak: 0.3 * k, decay: 0.06 }); },
    // the regimental drum calls the advance: a roll that opens into the beat
    advance(o, t, k) {
      for (let i = 0; i < 9; i++) S.snare(o, t + i * 0.07, k * (0.35 + i * 0.05));
      S.bass(o, t + 0.66, k); S.snare(o, t + 0.66, k * 0.9); S.snare(o, t + 0.96, k * 0.6); S.bass(o, t + 1.26, k * 0.8); S.snare(o, t + 1.26, k * 0.8);
    },
    retreat(o, t, k) { for (let i = 0; i < 3; i++) { S.bass(o, t + i * 0.45, k * 0.8); S.snare(o, t + i * 0.45 + 0.2, k * 0.4); } },
    click(o, t, k) { noise(o, t, 0.03, { filter: 'bandpass', f: 2100, q: 4, peak: 0.35 * k, decay: 0.02 }); },
    place(o, t, k) { noise(o, t, 0.06, { filter: 'bandpass', f: 700, q: 2.5, peak: 0.5 * k, decay: 0.05 }); tone(o, t, 0.08, { f: 170, peak: 0.25 * k, decay: 0.06 }); },
    deny(o, t, k) { for (let i = 0; i < 2; i++) { noise(o, t + i * 0.09, 0.05, { filter: 'bandpass', f: 420, q: 3, peak: 0.45 * k, decay: 0.04 }); } },
    victory(o, t, k) { [196, 246.9, 293.7, 392].forEach((f, i) => S.bell(o, t + i * 0.42, k * 0.8, f)); S.advance(o, t + 1.8, k * 0.7); },
    defeat(o, t, k) { S.bell(o, t, k, 98); S.bell(o, t + 2.4, k * 0.8, 92.5); }
  };
  // how long each sound lasts (voice lifetime), how often it may start, how much reverb it gets
  const META = {
    musket: [1, 0.03, 0.3], volley: [1.1, 0.06, 0.35], cannon: [3, 0.08, 0.5], boom: [1.2, 0.05, 0.4], grape: [3, 0.1, 0.5], crash: [2.5, 0.2, 0.5],
    blade: [0.5, 0.035, 0.15], thud: [0.2, 0.03, 0.1], knock: [0.15, 0.03, 0.1], fall: [0.4, 0.06, 0.15], charge: [1.2, 0.4, 0.2],
    bolt: [0.7, 0.05, 0.4], raise: [1.8, 0.2, 0.5], ice: [0.6, 0.08, 0.4], fire: [0.8, 0.08, 0.35], blast: [1.2, 0.08, 0.45], sling: [0.5, 0.08, 0.25],
    sack: [0.3, 0.15, 0.1], chop: [0.2, 0.05, 0.15], treefall: [1.3, 0.3, 0.3], bell: [6, 0.2, 0.5], news: [5, 0.4, 0.5], alarm: [7, 6, 0.5],
    snare: [0.3, 0.02, 0.2], bass: [0.4, 0.02, 0.2], advance: [2, 1.2, 0.3], retreat: [1.8, 1.2, 0.3], click: [0.1, 0.03, 0.05], place: [0.15, 0.05, 0.08],
    deny: [0.25, 0.15, 0.05], victory: [8, 5, 0.5], defeat: [8, 5, 0.5]
  };
  // trims from offline measurements so quiet recipes sit level with the rest of the mix
  const TRIM = { musket: 0.8, volley: 1.25, fire: 2.4, bolt: 1.5, ice: 1.3, deny: 2.6, click: 1.8, sack: 1.4, treefall: 1.3 };
  const UI = new Set(['click', 'place', 'deny', 'news', 'alarm', 'advance', 'retreat', 'victory', 'defeat']);

  /* ---------- playing ---------- */
  // queue a sound; x/z in game space (omit for interface sounds); merged and played on flush()
  function play(name, x, z, k = 1) {
    if (!ctx || !on || !S[name]) return;
    const pos = x == null ? { gain: 1, pan: 0, far: 0 } : listener(x, z);
    if (pos.gain < 0.02) return;
    const q = queue.get(name);
    if (q) { q.n++; q.gain = Math.max(q.gain, pos.gain * k); q.pan += pos.pan; q.far = Math.min(q.far, pos.far); }
    else queue.set(name, { n: 1, gain: pos.gain * k, pan: pos.pan, far: pos.far });
  }
  function flush() {
    if (!ctx || !queue.size) return;
    const t = ctx.currentTime;
    for (const [name, q] of queue) {
      const [dur, gap, wet] = META[name];
      if (t - (lastAt.get(name) || -9) < gap) continue;
      if (active > 70 && !UI.has(name)) continue;
      lastAt.set(name, t);
      let n = name;
      if (name === 'musket' && q.n >= 4) n = 'volley';
      const level = Math.min(1.6, q.gain * (1 + Math.log2(q.n) * 0.35)) * (TRIM[n] || 1);
      const out = voice(1, q.pan / q.n, q.far, META[n][0], META[n][2], UI.has(n) ? ui : sfx);
      S[n](out, t + 0.005, level);
    }
    queue.clear();
  }

  /* ---------- beds: loops for crowds and weather ---------- */
  // a loop made of many short grains placed at random: footsteps, hoofbeats, clinks, axes and hammers
  function grainLoop(sec, count, grain) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < count; i++) grain(d, sr, Math.floor(Math.random() * n), n);
    }
    return b;
  }
  function burst(d, sr, at, n, len, cut, gain, decay) {
    let lp = 0;
    const L = Math.floor(sr * len);
    for (let i = 0; i < L; i++) {
      lp += cut * ((Math.random() * 2 - 1) - lp);
      d[(at + i) % n] += lp * gain * Math.exp(-i / (sr * decay));
    }
  }
  function ring(d, sr, at, n, f, len, gain) {
    const L = Math.floor(sr * len);
    for (let i = 0; i < L; i++) d[(at + i) % n] += Math.sin(2 * Math.PI * f * i / sr) * gain * Math.exp(-i / (sr * len * 0.25));
  }
  function startBeds() {
    const mk = (buf, filterF, dest = amb) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterF;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(0, Math.random() * buf.duration);
      return { g, f, level: 0 };
    };
    // wind: brown noise breathing slowly
    const wind = mk(noiseB, 520);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg); lg.connect(wind.f.frequency); lfo.start();
    beds.wind = wind;
    beds.march = mk(grainLoop(6, 260, (d, sr, at, n) => burst(d, sr, at, n, 0.06, 0.12, 0.5, 0.02)), 900);
    beds.hooves = mk(grainLoop(5, 160, (d, sr, at, n) => { for (let j = 0; j < 3; j++) burst(d, sr, at + Math.floor(sr * j * 0.07), n, 0.05, 0.08, 0.9, 0.015); }), 600);
    beds.din = mk(grainLoop(5, 130, (d, sr, at, n) => Math.random() < 0.55 ? ring(d, sr, at, n, 1100 + Math.random() * 1800, 0.12, 0.08) : burst(d, sr, at, n, 0.05, 0.15, 0.5, 0.02)), 3200, sfx);
    beds.work = mk(grainLoop(8, 70, (d, sr, at, n) => { burst(d, sr, at, n, 0.03, 0.5, 0.35, 0.01); ring(d, sr, at, n, Math.random() < 0.5 ? 340 + Math.random() * 120 : 900 + Math.random() * 300, 0.09, 0.12); }), 3000);
  }
  // levels 0..1 from the game every frame; changes glide so beds never jump
  function bed(name, level) {
    const b = beds[name];
    if (!b || !ctx) return;
    const v = Math.max(0, Math.min(1, level));
    if (Math.abs(v - b.level) < 0.01) return;
    b.level = v;
    const peak = { wind: 0.22, march: 0.5, hooves: 0.55, din: 0.45, work: 0.4 }[name];
    b.g.gain.setTargetAtTime(v * peak, ctx.currentTime, 0.4);
  }
  function quiet() { for (const k in beds) bed(k, 0); }

  function setOn(v) {
    on = v;
    try { localStorage.setItem(STORE, v ? '1' : '0'); } catch { /* storage unavailable */ }
    if (master) master.gain.setTargetAtTime(v ? 0.85 : 0, ctx.currentTime, 0.05);
  }

  // dev check: render one sound offline and report its peak and loudness (used to balance the mix)
  async function measure(name) {
    const keep = { ctx, sfx, rev, noiseW, noiseB };
    ctx = new OfflineAudioContext(1, 44100 * (META[name][0] + 0.5), 44100);
    noiseW = noiseBuf('white', 3); noiseB = noiseBuf('brown', 3);
    sfx = ctx.createGain(); sfx.connect(ctx.destination); rev = ctx.createGain();
    const out = voice(1, 0, 0, META[name][0], 0);
    S[name](out, 0.01, 1);
    const buf = await ctx.startRendering();
    ({ ctx, sfx, rev, noiseW, noiseB } = keep);
    active = 0;
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0;
    for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
  }

  return {
    unlock, play, flush, bed, quiet, measure, names: Object.keys(S),
    setListener: fn => { listener = fn; },
    get on() { return on; }, toggle() { setOn(!on); if (on) unlock(); return on; }
  };
}
