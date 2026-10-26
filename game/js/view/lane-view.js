// Greybox view for the lane battle: grey bars on a line, orders per group, 4-second rounds.
import { createLane, playRound, tick, aiOrders, ordersFor, alive, sideShare, ORDERS, LANE, TICKS, BREAK } from '../rules/lane.js';

const W = 1000, X0 = 60, X1 = 940, ROW = 34, TOP = 34;
const x = pos => X0 + pos * (X1 - X0) / (LANE - 1);
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));

export function openLane({ player, enemy, onExit }) {
  let st = createLane({ player, enemy }), busy = false;
  const svg = $('laneSvg');

  function rows(side) { return st.groups.filter(g => g.side === side); }
  function render() {
    const H = TOP + 6 * ROW + 40;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let s = `<rect width="${W}" height="${H}" fill="#3A4045"/><line x1="${X0 - 20}" y1="${H - 30}" x2="${X1 + 20}" y2="${H - 30}" stroke="#5B6268" stroke-width="2"/>`;
    for (let i = 0; i < LANE; i++) s += `<line x1="${x(i)}" y1="${H - 30}" x2="${x(i)}" y2="${H - 22}" stroke="#5B6268" stroke-width="2"/><text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#7E868C">${i + 1}</text>`;
    ['player', 'enemy'].forEach(side => rows(side).forEach((g, i) => {
      const y = TOP + i * ROW + (side === 'enemy' ? ROW / 2 : 0) - 14;
      const label = `${g.name} ×${g.count}`, w = Math.max(60, label.length * 7.4 + 18), alive = g.hp > 0;
      const fill = side === 'player' ? (alive ? '#AEB6BB' : '#545B60') : (alive ? '#6E777C' : '#4A5055');
      s += `<g class="lg" data-id="${g.id}" style="transform:translate(${x(g.pos)}px,${y}px);transition:transform .45s ease-in-out;opacity:${alive ? 1 : .35}">
        <rect x="${-w / 2}" y="0" width="${w}" height="22" rx="4" fill="${fill}"/>
        <text x="0" y="15" text-anchor="middle" font-size="11" font-weight="800" fill="#1E2124">${label}</text>
        <rect x="${-w / 2}" y="25" width="${w}" height="3" rx="1.5" fill="#262A2E"/><rect x="${-w / 2}" y="25" width="${(w * g.hp / g.maxHp).toFixed(1)}" height="3" rx="1.5" fill="${side === 'player' ? '#C9CED2' : '#9AA3A8'}"/>
        ${alive && g.order !== 'advance' ? `<text x="${w / 2 + 6}" y="15" font-size="10" font-weight="800" fill="#C9CED2">${{ hold: '▣', retreat: '◁', volley: '➶', spell: '✦' }[g.order]}</text>` : ''}
      </g>`;
    }));
    svg.innerHTML = s;
    const p = sideShare(st, 'player'), e = sideShare(st, 'enemy');
    $('laneStatus').innerHTML = `<span>Раунд ${Math.min(st.round, 12)} из 12</span>
      <span class="meter">Ты <i style="--v:${(p * 100).toFixed(0)}%"></i> ${(p * 100).toFixed(0)}%</span>
      <span class="meter">Враг <i style="--v:${(e * 100).toFixed(0)}%"></i> ${(e * 100).toFixed(0)}%</span>
      <span>Сломлен при ${BREAK * 100}% и ниже</span>`;
    renderOrders();
  }

  function renderOrders() {
    const box = $('laneOrders');
    if (st.winner) {
      box.innerHTML = `<div class="lane-result"><b>${st.winner === 'player' ? 'Враг сломлен' : 'Твоя армия сломлена'}</b>
        <button class="gbtn" type="button" id="laneAgain">Ещё раз</button><button class="gbtn" type="button" id="laneBack">Назад к отряду</button></div>`;
      $('laneAgain').onclick = () => { st = createLane({ player, enemy }); render(); };
      $('laneBack').onclick = onExit;
      return;
    }
    box.innerHTML = alive(st, 'player').map(g => `<div class="order-row"><span>${g.name} ×${g.count}</span><div class="seg">${ordersFor(g).map(o => `<label><input type="radio" name="lo${g.id}" value="${o}" ${g.order === o ? 'checked' : ''} ${busy ? 'disabled' : ''}>${ORDERS[o]}</label>`).join('')}</div></div>`).join('')
      + `<div class="lane-go"><button class="gbtn lane-fight" type="button" id="laneFight" ${busy ? 'disabled' : ''}>В бой! · 4 с <kbd>Enter</kbd></button><button class="gbtn" type="button" id="laneExit">Выйти</button></div>`;
    box.querySelectorAll('input[type=radio]').forEach(i => i.onchange = () => { st.groups.find(g => 'lo' + g.id === i.name).order = i.value; render(); });
    $('laneFight').onclick = fight;
    $('laneExit').onclick = onExit;
  }

  function floatAt(id, text, color = '#FFFFFF') {
    const g = svg.querySelector(`.lg[data-id="${id}"]`);
    if (!g) return;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', 0); t.setAttribute('y', -4); t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', 12); t.setAttribute('font-weight', 800); t.setAttribute('fill', color);
    t.textContent = text;
    g.appendChild(t);
    t.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-14px)', opacity: 0 }], { duration: 700 }).onfinish = () => t.remove();
  }

  // Rules resolve the round on the real state; a copy replays it tick by tick so bars move smoothly.
  async function fight() {
    if (busy || st.winner) return;
    busy = true;
    aiOrders(st, 'enemy');
    renderOrders();
    const before = JSON.parse(JSON.stringify(st));
    const frames = playRound(st);
    const after = st;
    st = before;
    for (let i = 0; i < frames.length; i++) {
      tick(st);
      renderBars();
      frames[i].filter(e => e.t === 'dmg').forEach(e => floatAt(e.id, '−' + e.amount));
      frames[i].filter(e => e.t === 'heal').forEach(e => floatAt(e.id, '+' + e.amount, '#C9CED2'));
      await wait(4000 / TICKS);
    }
    st = after;
    busy = false;
    render();
  }

  function renderBars() {
    st.groups.forEach(g => {
      const el = svg.querySelector(`.lg[data-id="${g.id}"]`);
      if (!el) return;
      const y = el.style.transform.match(/,\s*([-\d.]+)px/)[1];
      el.style.transform = `translate(${x(g.pos)}px,${y}px)`;
      el.style.opacity = g.hp > 0 ? 1 : .35;
      const bars = el.querySelectorAll('rect');
      const w = +bars[0].getAttribute('width');
      bars[2].setAttribute('width', (w * Math.max(0, g.hp) / g.maxHp).toFixed(1));
      el.querySelector('text').textContent = `${g.name} ×${g.count}`;
    });
  }

  function onKey(e) {
    if ($('lane').hidden) return;
    if (e.key === 'Enter') { e.preventDefault(); fight(); }
  }
  window.addEventListener('keydown', onKey);
  render();
  return () => window.removeEventListener('keydown', onKey);
}
