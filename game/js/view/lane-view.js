// Greybox view for the lane battle: terrain bands, group blocks with morale/stamina, enemy intent, orders, round log.
import { createLane, playRound, tick, ordersFor, onField, sideShare, staminaLabel, ORDERS, TARGETS, TERRAIN_NAME, LANE, TICKS, ROUND_CAP } from '../rules/lane.js';

const W = 1400, X0 = 90, X1 = 1310, ROW = 31, TOP = 24;
const x = pos => X0 + pos * (X1 - X0) / (LANE - 1);
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROLE = { militia: '↟', swordsman: '⛨', knight: '♞', archer: '➶', apprentice: '✚', battlemage: '✦', alden: '♛', irena: '♛', corvin: '♛', skeleton: '☠', ghoul: '☠', deathknight: '♞', acolyte: '✚' };
const ZONE_FILL = { hill: '#5E5A4E', forest: '#3F5246', ford: '#3E5566' };
const stateLabel = g => g.state === 'rout' ? 'бегут' : g.state === 'fled' ? 'бежали' : g.state === 'dead' ? 'разбиты' : g.state === 'waver' ? 'колеблются' : '';

export function openLane({ player, enemy, seed = 1, onExit }) {
  let st = createLane({ player, enemy, seed }), busy = false;
  const svg = $('laneSvg');

  function rowsOf() {
    const p = st.groups.filter(g => g.side === 'player'), e = st.groups.filter(g => g.side === 'enemy');
    const rows = new Map();
    p.forEach((g, i) => rows.set(g.id, i));
    e.forEach((g, i) => rows.set(g.id, p.length + 1 + i));
    return { rows, n: p.length + 1 + e.length };
  }

  function groupSVG(g, y) {
    const gone = g.state === 'dead' || g.state === 'fled';
    const fill = g.side === 'player' ? '#C3C9CE' : '#7D868C', ink = g.side === 'player' ? '#1E2124' : '#F1F3F4';
    const label = `${ROLE[g.kind] || ''} ${g.name} ×${g.count}`, w = Math.max(96, label.length * 7 + 22);
    const live = !gone && g.state !== 'rout';
    const intent = g.side === 'enemy' && live ? `<text x="${-w / 2 - 8}" y="14" text-anchor="end" font-size="12" font-weight="800" fill="#F2C14E">${ORDERS[g.order].icon} ${ORDERS[g.order].name}</text>` : '';
    const moveIcon = g.side === 'player' && live && ['advance', 'charge', 'fallback'].includes(g.order)
      ? `<text x="${g.order === 'fallback' ? -w / 2 - 8 : w / 2 + 8}" y="15" text-anchor="${g.order === 'fallback' ? 'end' : 'start'}" font-size="13" font-weight="800" fill="#F2C14E">${ORDERS[g.order].icon}</text>` : '';
    const tag = stateLabel(g);
    return `<g class="lg" data-id="${g.id}" style="transform:translate(${x(g.pos)}px,${y}px);opacity:${gone ? .3 : 1}">
      <rect x="${-w / 2}" y="0" width="${w}" height="20" rx="4" fill="${fill}" ${g.state === 'waver' ? 'stroke="#F2C14E" stroke-width="2"' : g.state === 'rout' ? 'stroke="#FF6B6B" stroke-width="2"' : ''}/>
      <text x="0" y="14" text-anchor="middle" font-size="11.5" font-weight="800" fill="${ink}">${label}</text>
      <rect x="${-w / 2}" y="23" width="${w}" height="3" rx="1.5" fill="#262A2E"/><rect x="${-w / 2}" y="23" width="${(w * g.hp / g.maxHp).toFixed(1)}" height="3" rx="1.5" fill="${g.side === 'player' ? '#E6E8EA' : '#B8BFC4'}"/>
      <rect x="${-w / 2}" y="28" width="${w / 2 - 2}" height="3" rx="1.5" fill="#262A2E"/><rect x="${-w / 2}" y="28" width="${((w / 2 - 2) * Math.max(0, g.morale) / 100).toFixed(1)}" height="3" rx="1.5" fill="#F2C14E"/>
      <rect x="2" y="28" width="${w / 2 - 2}" height="3" rx="1.5" fill="#262A2E"/><rect x="2" y="28" width="${((w / 2 - 2) * g.stamina / 100).toFixed(1)}" height="3" rx="1.5" fill="#7FB3FF"/>
      ${tag ? `<text x="${-w / 2}" y="-3" font-size="10" font-weight="800" fill="${g.state === 'rout' ? '#FF8A8A' : g.state === 'waver' ? '#F2C14E' : '#9AA3A8'}">${tag}</text>` : ''}
      ${intent}${moveIcon}
    </g>`;
  }

  function renderField() {
    const { rows, n } = rowsOf(), H = TOP + n * ROW + 34;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let s = `<rect width="${W}" height="${H}" fill="#33383C"/>`;
    st.terrain.forEach(z => {
      s += `<rect x="${x(z.from)}" y="8" width="${x(z.to) - x(z.from)}" height="${H - 34}" fill="${ZONE_FILL[z.type]}" opacity=".85"/>
        <text x="${(x(z.from) + x(z.to)) / 2}" y="${H - 30}" text-anchor="middle" font-size="11" font-weight="800" fill="#C9CED2">${TERRAIN_NAME[z.type]}</text>`;
    });
    const pCount = st.groups.filter(g => g.side === 'player').length, mid = TOP + pCount * ROW + ROW / 2 - 6;
    s += `<line x1="${X0 - 40}" y1="${mid}" x2="${X1 + 40}" y2="${mid}" stroke="#4A5157" stroke-dasharray="4 6"/>`;
    s += `<text x="${X0 - 52}" y="${TOP + 14}" font-size="10" font-weight="800" fill="#9AA3A8" text-anchor="middle">ТЫ</text><text x="${X1 + 52}" y="${TOP + (pCount + 1) * ROW + 14}" font-size="10" font-weight="800" fill="#9AA3A8" text-anchor="middle">ВРАГ</text>`;
    for (let i = 0; i < LANE; i++) s += `<line x1="${x(i)}" y1="${H - 22}" x2="${x(i)}" y2="${H - 16}" stroke="#5B6268" stroke-width="2"/><text x="${x(i)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="#7E868C">${i + 1}</text>`;
    st.groups.forEach(g => { s += groupSVG(g, TOP + rows.get(g.id) * ROW); });
    svg.innerHTML = s;
  }

  function renderStatus() {
    const p = sideShare(st, 'player'), e = sideShare(st, 'enemy');
    $('laneStatus').innerHTML = `<span>Раунд ${Math.min(st.round, ROUND_CAP)} из ${ROUND_CAP}</span>
      <span class="meter">Ты <i style="--v:${(p * 100).toFixed(0)}%"></i> ${(p * 100).toFixed(0)}%</span>
      <span class="meter">Враг <i style="--v:${(e * 100).toFixed(0)}%"></i> ${(e * 100).toFixed(0)}%</span>
      <span>${st.ai === 'defensive' ? 'Враг осторожен: первые раунды ждёт на месте' : 'Враг напорист: сразу идёт в бой'}</span>`;
  }

  const bar = (v, cls, label) => `<span class="lbar ${cls}"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(0)}%"></i></span><small>${label}</small>`;

  function logBox() {
    return `<div class="llog"><p class="label">Что произошло в прошлом раунде</p>${st.log.length ? st.log.slice(0, 10).map(t => `<div>${t}</div>`).join('') : '<div class="muted">Пока тихо. Посмотри на планы врага и отдай приказы.</div>'}</div>`;
  }

  function renderPanel() {
    const box = $('laneOrders');
    if (st.winner) {
      box.innerHTML = `<div class="lane-result"><b>${st.winner === 'player' ? 'Победа: вражеская армия сломлена' : 'Поражение: твоя армия сломлена'}</b>
        <button class="gbtn lane-fight" type="button" id="laneAgain">Ещё раз</button><button class="gbtn" type="button" id="laneBack">Назад к отряду</button></div>
        <div class="lane-cols"><div class="lane-col">${logBox()}</div></div>`;
      $('laneAgain').onclick = () => { seed += 1; st = createLane({ player, enemy, seed }); render(); };
      $('laneBack').onclick = onExit;
      return;
    }
    const mine = onField(st, 'player'), foes = onField(st, 'enemy');
    box.innerHTML = `<div class="lane-cols">
      <div class="lane-col"><p class="label">Твои приказы на раунд</p>${mine.map(g => g.state === 'rout'
        ? `<div class="lcard routing"><b>${ROLE[g.kind]} ${g.name} ×${g.count}</b><small>Бегут и приказов не слышат</small></div>`
        : `<div class="lcard">
          <div class="lhead"><b>${ROLE[g.kind]} ${g.name} ×${g.count}</b><span class="lstat">${bar(g.morale, 'mo', `мораль ${Math.max(0, Math.round(g.morale))}`)}${bar(g.stamina, 'st', staminaLabel(g))}${g.state === 'waver' ? '<em>колеблются</em>' : ''}</span></div>
          <div class="seg">${ordersFor(g).map(o => `<label title="${ORDERS[o].hint}"><input type="radio" name="lo${g.id}" value="${o}" ${g.order === o ? 'checked' : ''} ${busy ? 'disabled' : ''}>${ORDERS[o].icon} ${ORDERS[o].name}</label>`).join('')}</div>
          <small class="lhint">${ORDERS[g.order].hint}</small>
          ${g.range > 1 ? `<div class="seg small">${Object.entries(TARGETS).map(([k, v]) => `<label><input type="radio" name="lt${g.id}" value="${k}" ${g.target === k ? 'checked' : ''} ${busy ? 'disabled' : ''}>Цель: ${v}</label>`).join('')}</div>` : ''}
        </div>`).join('')}
        <div class="lane-go"><button class="gbtn lane-fight" type="button" id="laneFight" ${busy ? 'disabled' : ''}>В бой! · 4 с <kbd>Enter</kbd></button><button class="gbtn" type="button" id="laneExit">Выйти</button></div>
      </div>
      <div class="lane-col"><p class="label">Разведка: что задумал враг</p>
        <div class="intel">${foes.map(g => `<div class="irow"><b>${ROLE[g.kind]} ${g.name} ×${g.count}</b><span class="${g.state === 'rout' ? 'bad' : 'gold'}">${g.state === 'rout' ? 'бегут' : ORDERS[g.order].icon + ' ' + ORDERS[g.order].name}</span><small>${bar(g.fearless ? 100 : g.morale, 'mo', g.fearless ? 'бесстрашны' : 'мораль ' + Math.max(0, Math.round(g.morale)))} ${bar(g.stamina, 'st', staminaLabel(g))}</small></div>`).join('')}</div>
        ${logBox()}
      </div></div>`;
    box.querySelectorAll('input[type=radio]').forEach(i => i.onchange = () => {
      const g = st.groups.find(x => 'lo' + x.id === i.name || 'lt' + x.id === i.name);
      if (i.name.startsWith('lo')) g.order = i.value; else g.target = i.value;
      render();
    });
    $('laneFight').onclick = fight;
    $('laneExit').onclick = onExit;
  }

  function render() { renderField(); renderStatus(); renderPanel(); }

  // Rules resolve the round on the real state; a copy replays it tick by tick so blocks move smoothly.
  async function fight() {
    if (busy || st.winner) return;
    busy = true;
    renderPanel();
    const replay = JSON.parse(JSON.stringify(st));
    replay.groups.forEach(g => { g.impact = false; g.chargePaid = false; });
    const { frames } = playRound(st);
    const done = st;
    st = replay;
    for (const frame of frames) {
      tick(st, []);
      renderField();
      frame.forEach(e => {
        if (e.t === 'dmg') floatAt(e.id, '−' + e.amount, '#FFFFFF');
        if (e.t === 'heal') floatAt(e.id, '+' + e.amount, '#9FE3B5');
        if (e.t === 'impact') floatAt(e.at, '⚡ натиск', '#F2C14E');
        if (e.t === 'counter') floatAt(e.at, '↟ копья', '#F2C14E');
        if (e.t === 'rout') floatAt(e.id, 'бегут!', '#FF8A8A');
        if (e.t === 'spell') floatAt(e.at, '✦ огонь', '#FFB37A');
      });
      await wait(4000 / TICKS);
    }
    st = done;
    busy = false;
    render();
  }

  function floatAt(id, text, color) {
    const g = svg.querySelector(`.lg[data-id="${id}"]`);
    if (!g) return;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', 0); t.setAttribute('y', -6); t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', 12); t.setAttribute('font-weight', 800); t.setAttribute('fill', color);
    t.setAttribute('stroke', '#1E2124'); t.setAttribute('stroke-width', 3); t.setAttribute('paint-order', 'stroke');
    t.textContent = text;
    g.appendChild(t);
    t.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-16px)', opacity: 0 }], { duration: 900 }).onfinish = () => t.remove();
  }

  function onKey(e) {
    if ($('lane').hidden || e.target.closest('input')) return;
    if (e.key === 'Enter') { e.preventDefault(); fight(); }
  }
  window.addEventListener('keydown', onKey);
  const help = document.querySelector('.lane-help');
  try { help.open = !localStorage.getItem('aos.lane.help'); localStorage.setItem('aos.lane.help', '1'); } catch { help.open = true; }
  render();
  return () => window.removeEventListener('keydown', onKey);
}
