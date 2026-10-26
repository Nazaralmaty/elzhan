// Real-time lane war view (Age of War / Stick War style): bases, mines, walking figures, shop, army commands.
import { createWar, step, buy, canBuy, setCommand, castRain, units, fighters, miners, income, ROSTER, COMMANDS, FIELD, DT, POP_CAP, RAIN_CD } from '../rules/war.js';
import { figInner, figSVG, MORVEN } from './art.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1000, BLUE = '#2F6FDB', RED = '#D64545';
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
const sx = x => 92 + x / FIELD * 816;
const CMD_ICON = { attack: '⚔', defend: '🛡', garrison: '🏰' };
const CMD_KEY = { attack: 'A', defend: 'D', garrison: 'R' };
const H = 370, GROUND = 312;

export function openWar({ hero, foe = 'undead', seed = 1, enemyIncome = 1, onExit }) {
  let st, raf = 0, last = 0, acc = 0, paused = false, speed = 1, nodes = new Map(), hudT = 0;
  const svg = $('warSvg');
  const enemyHero = foe === 'human' ? ['alden', 'irena', 'corvin'].filter(h => h !== hero)[seed % 2] : null;
  const shopList = () => ['miner', ...st.sides.player.roster, ...(hero ? [hero] : [])];
  const colorOf = u => u.side === 'player' ? BLUE : (st.faction.enemy === 'undead' ? MORVEN : RED);
  const artOf = u => u.kind === 'miner' && u.side === 'enemy' && st.faction.enemy === 'undead' ? 'skeleton' : u.kind;
  const groundY = u => GROUND - u.depth * 10;

  function start() {
    st = createWar({ player: 'human', enemy: foe, hero, enemyHero, seed, enemyIncome });
    nodes = new Map();
    buildScene();
    renderShop();
    renderHud(true);
    $('warEnd').hidden = true;
    paused = false; last = 0; acc = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  /* ---------- scene ---------- */
  function buildScene() {
    // fixed scene anchored to the bottom; the container's sky colour fills any extra height
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
    const castle = (x, col, flip) => `<g transform="translate(${x} ${GROUND - 4}) scale(${flip ? -1 : 1} 1)">
      <rect x="-46" y="-96" width="92" height="96" fill="#C9C2B2"/><rect x="-46" y="-96" width="92" height="12" fill="#B3AC9C"/>
      ${[-46, -26, -6, 14, 34].map(d => `<rect x="${d}" y="-108" width="12" height="12" fill="#C9C2B2"/>`).join('')}
      <rect x="-14" y="-40" width="28" height="40" rx="14" fill="#5A4430"/>
      <rect x="-36" y="-150" width="30" height="58" fill="#D5CFC0"/><polygon points="-40,-150 -21,-182 -2,-150" fill="${col}"/>
      <line x1="-21" y1="-182" x2="-21" y2="-206" stroke="#6B4E2E" stroke-width="3"/><polygon points="-21,-206 6,-199 -21,-192" fill="${col}"/></g>`;
    const spire = x => `<g transform="translate(${x} ${GROUND - 4})">
      <polygon points="-50,0 -30,-120 0,-200 30,-120 50,0" fill="#2E3B3F"/><polygon points="0,-200 30,-120 50,0 0,0" fill="#253034"/>
      <circle cx="0" cy="-120" r="12" fill="#7CFFB2"/><circle cx="0" cy="-120" r="26" fill="#7CFFB2" opacity=".2" class="pulse"/>
      <rect x="-12" y="-36" width="24" height="36" fill="#14211F"/></g>`;
    const mine = x => `<g transform="translate(${x} ${GROUND - 2})"><path d="M-36 0 Q-30 -34 0 -38 Q30 -34 36 0 Z" fill="#8A8F98"/><circle cx="-12" cy="-16" r="6" fill="#F2C14E"/><circle cx="8" cy="-24" r="5" fill="#F2C14E"/><circle cx="16" cy="-10" r="4" fill="#F2C14E"/></g>`;
    svg.innerHTML = `<rect width="${W}" height="${H}" fill="#A9CCE3"/>
      <path d="M0 ${GROUND - 60} Q 250 ${GROUND - 100} 500 ${GROUND - 70} T 1000 ${GROUND - 80} V ${H} H 0 Z" fill="#9CBF8A"/>
      <rect y="${GROUND - 40}" width="${W}" height="${H - GROUND + 40}" fill="#86B86E"/><rect y="${GROUND + 8}" width="${W}" height="${H}" fill="#77A960"/>
      ${mine(sx(75))}${mine(sx(FIELD - 75))}
      ${castle(sx(0) - 30, BLUE, false)}${foe === 'undead' ? spire(sx(FIELD) + 30) : castle(sx(FIELD) + 30, RED, true)}
      <g id="wBaseBars"></g>`;
    ['d3', 'd2', 'd1', 'd0', 'fx'].forEach(n => { const g = el('g', { id: 'w' + n }); svg.appendChild(g); });
    $('wfx').style.pointerEvents = 'none';
  }

  function nodeFor(u) {
    let n = nodes.get(u.id);
    if (!n) {
      n = el('g', { class: 'wunit' });
      $('wd' + u.depth).appendChild(n);
      nodes.set(u.id, n);
    }
    return n;
  }

  function drawUnit(u) {
    const n = nodeFor(u), R = ROSTER[u.kind];
    const facing = u.facing ?? (u.side === 'player' ? 1 : -1);
    const k = R.hero ? 0.95 : 0.74;
    const key = facing + ':' + (u.hp > 0);
    if (n.dataset.key !== key) {
      n.dataset.key = key;
      n.innerHTML = `${R.hero ? `<ellipse cx="0" cy="3" rx="18" ry="5" fill="none" stroke="#F2C14E" stroke-width="2"/>` : ''}<g class="fig${R.miner ? ' mine' : ''}" transform="translate(${-32 * k} ${4 - 74 * k}) scale(${k})">${figInner(artOf(u), colorOf(u), facing < 0)}</g><g class="whp"></g>`;
    }
    n.setAttribute('transform', `translate(${sx(u.x).toFixed(1)} ${groundY(u)})`);
    n.querySelector('.fig').classList.toggle('walk', !!u.moving);
    const hp = n.querySelector('.whp');
    if (u.hp > 0 && u.hp < u.maxHp) hp.innerHTML = `<rect x="-14" y="${R.hero ? -76 : -60}" width="28" height="4" rx="2" fill="rgba(20,33,42,.6)"/><rect x="-14" y="${R.hero ? -76 : -60}" width="${(24 * u.hp / u.maxHp).toFixed(1)}" height="4" rx="2" fill="${u.side === 'player' ? '#5BC97A' : '#FF6B6B'}"/>`;
    else hp.innerHTML = '';
  }

  function baseBars() {
    const bar = (x, side) => { const S = st.sides[side], w = 90; return `<rect x="${x - w / 2}" y="${GROUND - 230}" width="${w}" height="8" rx="4" fill="rgba(20,33,42,.6)"/><rect x="${x - w / 2}" y="${GROUND - 230}" width="${(w * Math.max(0, S.baseHp) / S.baseMax).toFixed(1)}" height="8" rx="4" fill="${side === 'player' ? '#5BC97A' : '#FF6B6B'}"/>`; };
    $('wBaseBars').innerHTML = bar(sx(0) - 30, 'player') + bar(sx(FIELD) + 30, 'enemy');
  }

  /* ---------- effects ---------- */
  function float(x, y, text, color, size = 14) {
    const t = el('text', { x, y, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 800, fill: color, stroke: '#14212A', 'stroke-width': 3, 'paint-order': 'stroke', 'font-family': 'Nunito,system-ui,sans-serif' });
    t.textContent = text;
    $('wfx').appendChild(t);
    t.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-20px)', opacity: 0 }], { duration: 900, easing: 'ease-out' }).onfinish = () => t.remove();
  }
  function flash(id, cls, ms = 420) {
    const f = nodes.get(id)?.querySelector('.fig');
    if (!f) return;
    f.classList.remove(cls); void f.getBoundingClientRect(); f.classList.add(cls);
    setTimeout(() => f.classList.remove(cls), ms);
  }
  function projectile(x1, y1, x2, y2, magic, color) {
    const p = magic ? el('circle', { r: 5, fill: color || '#B49CFF' }) : el('line', { x1: -7, y1: 0, x2: 7, y2: 0, stroke: '#F1EAD8', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
    $('wfx').appendChild(p);
    const dir = Math.sign(x2 - x1) || 1, top = Math.min(y1, y2) - 40 - Math.abs(x2 - x1) * 0.12;
    p.animate([
      { transform: `translate(${x1}px, ${y1}px) rotate(${dir > 0 ? -25 : 205}deg)` },
      { transform: `translate(${(x1 + x2) / 2}px, ${top}px) rotate(${dir > 0 ? 0 : 180}deg)` },
      { transform: `translate(${x2}px, ${y2}px) rotate(${dir > 0 ? 25 : 155}deg)` }
    ], { duration: 380, easing: 'linear' }).onfinish = () => p.remove();
  }
  const posOf = id => { const u = st.units.find(o => o.id === id); return u ? [sx(u.x), groundY(u) - 32] : null; };

  function playEvents() {
    for (const e of st.events) {
      if (e.t === 'attack') {
        const a = posOf(e.id), b = posOf(e.to);
        if (e.ranged && a && b) { flash(e.id, 'a-shoot'); projectile(a[0], a[1] - 6, b[0], b[1], e.magic, e.splash ? '#FF9A3C' : null); }
        else flash(e.id, 'a-attack');
      }
      if (e.t === 'baseHit') {
        const a = posOf(e.by), bx = e.side === 'player' ? sx(0) - 30 : sx(FIELD) + 30;
        if (e.ranged && a) projectile(a[0], a[1] - 6, bx, GROUND - 60, e.magic); else flash(e.by, 'a-attack');
      }
      if (e.t === 'turret') { const b = posOf(e.to); if (b) projectile(e.side === 'player' ? sx(0) - 50 : sx(FIELD) + 50, GROUND - 170, b[0], b[1], false); }
      if (e.t === 'charge') { const a = posOf(e.id); if (a) float(a[0], a[1] - 34, '⚡ натиск', '#F2C14E', 16); }
      if (e.t === 'heal') { const a = posOf(e.id); if (a) float(a[0], a[1] - 30, '+', '#9FE3B5', 18); }
      if (e.t === 'raise') { const a = posOf(e.id); if (a) float(a[0], a[1] - 30, '☠ восстал', '#7CFFB2', 14); }
      if (e.t === 'death') { flash(e.id, 'a-die', 900); const n = nodes.get(e.id); setTimeout(() => { n?.remove(); nodes.delete(e.id); }, 800); }
      if (e.t === 'rain') {
        for (let i = 0; i < 18; i++) {
          const x = sx(e.x1 + Math.random() * (e.x2 - e.x1));
          setTimeout(() => projectile(x - 60, GROUND - 320, x, GROUND - 10, false), i * 40);
        }
        float(sx((e.x1 + e.x2) / 2), GROUND - 260, 'Град стрел!', '#F2C14E', 20);
      }
    }
    st.events = [];
  }

  /* ---------- hud ---------- */
  function renderShop() {
    $('warShop').innerHTML = shopList().map((k, i) => `<button type="button" class="wbuy" data-kind="${k}" title="${ROSTER[k].name}">
      <span class="wbuy-fig">${figSVG(k === 'miner' ? 'miner' : k, BLUE)}</span><span class="wbuy-cost">${ROSTER[k].cost}</span><kbd>${i + 1}</kbd><span class="wbuy-q"></span><i class="wbuy-prog"></i></button>`).join('');
    $('warCmds').innerHTML = Object.entries(COMMANDS).map(([c, name]) => `<button type="button" class="wcmd" data-cmd="${c}"><b>${CMD_ICON[c]}</b><small>${name}</small><kbd>${CMD_KEY[c]}</kbd></button>`).join('');
  }

  function renderHud(force) {
    const S = st.sides.player;
    $('warGold').textContent = Math.floor(S.gold);
    $('warInc').textContent = `+${income(st, 'player').toFixed(0)}/с`;
    $('warPop').textContent = `${fighters(st, 'player').length}/${POP_CAP}`;
    $('warMiners').textContent = miners(st, 'player').length;
    $('warBaseP').style.setProperty('--v', (Math.max(0, S.baseHp) / S.baseMax * 100).toFixed(0) + '%');
    $('warBaseE').style.setProperty('--v', (Math.max(0, st.sides.enemy.baseHp) / st.sides.enemy.baseMax * 100).toFixed(0) + '%');
    $('warShop').querySelectorAll('.wbuy').forEach(b => {
      const k = b.dataset.kind, why = canBuy(st, 'player', k), q = S.queue.filter(x => x === k).length;
      b.disabled = !!why && why !== 'Мало золота';
      b.classList.toggle('poor', why === 'Мало золота');
      b.querySelector('.wbuy-q').textContent = q ? '×' + q : '';
      b.querySelector('.wbuy-prog').style.width = S.queue[0] === k ? (S.train / ROSTER[k].train * 100).toFixed(0) + '%' : '0%';
      b.title = `${ROSTER[k].name} · ${ROSTER[k].cost} золота${why ? ' · ' + why : ''}`;
    });
    $('warCmds').querySelectorAll('.wcmd').forEach(b => b.classList.toggle('on', S.command === b.dataset.cmd));
    const rain = $('warRain');
    rain.disabled = S.rainCd > 0;
    rain.style.setProperty('--cd', ((1 - S.rainCd / RAIN_CD) * 100).toFixed(0) + '%');
    rain.querySelector('small').textContent = S.rainCd > 0 ? Math.ceil(S.rainCd) + ' с' : 'готов';
    $('warPause').textContent = paused ? '▶' : '⏸';
    $('warSpeed').textContent = '×' + speed;
  }

  /* ---------- loop ---------- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    const real = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (paused || st.over || $('war').hidden) return;
    acc += real * speed;
    while (acc >= DT) { step(st, DT); acc -= DT; }
    playEvents();
    st.units.forEach(u => { if (u.hp > 0) drawUnit(u); });
    baseBars();
    hudT += real;
    if (hudT > 0.15) { hudT = 0; renderHud(); }
    if (st.over) showEnd();
  }

  function showEnd() {
    renderHud();
    const win = st.over === 'player';
    $('warEndBody').innerHTML = `<h2 id="weTitle" class="${win ? 'win' : 'loss'}">${win ? 'Победа' : 'Поражение'}</h2>
      <p>${win ? 'Вражеская база разрушена' : 'Твоя база пала'} за ${Math.floor(st.t / 60)}:${String(Math.floor(st.t % 60)).padStart(2, '0')}.</p>
      <div class="row"><button class="gbtn primary" type="button" id="warAgain">Ещё раз</button><button class="gbtn" type="button" id="warBack">Назад к отряду</button></div>`;
    $('warEnd').hidden = false;
    $('warAgain').onclick = () => { seed++; start(); };
    $('warBack').onclick = close;
  }

  /* ---------- input ---------- */
  $('warShop').onclick = e => { const b = e.target.closest('[data-kind]'); if (b && buy(st, 'player', b.dataset.kind)) renderHud(); };
  $('warCmds').onclick = e => { const b = e.target.closest('[data-cmd]'); if (b) { setCommand(st, 'player', b.dataset.cmd); renderHud(); } };
  $('warRain').onclick = () => { if (castRain(st, 'player')) renderHud(); };
  $('warPause').onclick = () => { paused = !paused; renderHud(); };
  $('warSpeed').onclick = () => { speed = speed === 1 ? 2 : 1; renderHud(); };
  $('warHelpBtn').onclick = () => { paused = true; $('warHelp').hidden = false; renderHud(); };
  $('warHelpClose').onclick = () => { $('warHelp').hidden = true; paused = false; renderHud(); };
  $('warExit').onclick = close;

  function onKey(e) {
    if ($('war').hidden || e.target.closest('input')) return;
    if (!$('warHelp').hidden) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); $('warHelpClose').click(); } return; }
    if (!$('warEnd').hidden) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); paused = !paused; renderHud(); }
    else if (/^[1-9]$/.test(k)) { const kind = shopList()[+k - 1]; if (kind && buy(st, 'player', kind)) renderHud(); }
    else if (k === 'a' || k === 'ф') { setCommand(st, 'player', 'attack'); renderHud(); }
    else if (k === 'd' || k === 'в') { setCommand(st, 'player', 'defend'); renderHud(); }
    else if (k === 'r' || k === 'к') { setCommand(st, 'player', 'garrison'); renderHud(); }
    else if (k === 'f' || k === 'а') { if (castRain(st, 'player')) renderHud(); }
  }
  const onResize = () => {};
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  function close() {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    $('warEnd').hidden = true; $('warHelp').hidden = true;
    onExit();
  }

  start();
  try { if (!localStorage.getItem('aos.war.help')) { $('warHelp').hidden = false; paused = true; localStorage.setItem('aos.war.help', '1'); renderHud(); } } catch { /* storage unavailable */ }
  return close;
}
