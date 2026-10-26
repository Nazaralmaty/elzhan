// Skirmish screen: input → rules → animated events. Shared by the arena and the kingdom map.
import { key, unkey, neighbor } from '../core/hex.js';
import { ABILITIES } from '../data/units.js';
import {
  reachable, pathTo, opportunityStrikes, zocHexes, canAttack, computeDamage,
  performMove, performAttack, useAbility, endTurn, abilityReady, abilityTargets, chargeLanding, chainTargets,
  fireballArea, fireballDamage, iceWallHexes, unitAt, living, swapDeploy, passable, shieldBonus, ARENA_KINDS
} from '../rules/skirmish.js';
import { aiTurn } from '../ai/skirmish-ai.js';
import { Board, unitColor } from './board.js';
import { figSVG } from './art.js';

const $ = id => document.getElementById(id);

/* ---------- battle state ---------- */
let st = null, sel = null, mode = null, busy = false, hoverHex = null, pointer = { x: 0, y: 0 }, lastBattle = null, ctx = {};
const selU = () => sel && st.units.find(u => u.id === sel && u.hp > 0);
const P = u => [u.r, u.c];
const board = new Board($('board'), {
  click: onClick,
  hover: onHover,
  abilityName: id => ABILITIES[id].name
});

// opts: { title, resultButtons: [{ label, primary, onClick(st) }] }
export function openBattle(battle, opts = {}) {
  st = battle; ctx = opts;
  lastBattle = { playerCount: living(st, 'player').length };
  sel = null; mode = null; busy = false;
  $('battle').hidden = false; $('result').hidden = true;
  $('log').innerHTML = '';
  $('arenaTitle').textContent = opts.title || ('Арена · ' + ARENA_KINDS[st.arena]);
  board.speed = 1;
  board.setBattle(st);
  updateUI();
}

/* ---------- ui ---------- */
function log(text) {
  const box = $('log'), d = document.createElement('div');
  d.textContent = text;
  box.appendChild(d);
  while (box.children.length > 5) box.firstChild.remove();
}
function banner(text) {
  const b = $('banner');
  b.textContent = text; b.classList.add('show');
  clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove('show'), 900);
}

function updateTop() {
  $('roundLbl').textContent = 'Раунд ' + st.round;
  const t = $('turnLbl');
  t.textContent = st.phase === 'deploy' ? 'Расстановка' : st.turn === 'player' ? (st.auto ? 'Автобой' : 'Твой ход') : 'Ход врага';
  t.className = 'turn ' + (st.turn === 'player' ? 'player' : 'enemy');
  $('manaLbl').textContent = st.mana.player;
  $('autoBtn').textContent = st.auto ? 'Взять управление' : 'Автобой';
  $('autoBtn').classList.toggle('on', st.auto);
  $('autoBtn').disabled = st.phase === 'deploy';
  $('deployHint').hidden = st.phase !== 'deploy';
  const myTurn = st.turn === 'player' && !busy && !st.winner;
  $('endBtn').innerHTML = st.phase === 'deploy' ? 'Начать бой <kbd>Enter</kbd>' : 'Конец хода <kbd>Enter</kbd>';
  $('endBtn').disabled = !myTurn || st.auto;
  $('nextBtn').disabled = !myTurn || st.phase === 'deploy' || st.auto;
}

function statLine(u) {
  const sh = shieldBonus(st, u);
  return `<span>ОЗ <b class="num">${u.hp}/${u.maxHp}</b></span><span>Атк <b>${u.atk}${u.magic ? '✦' : ''}</b></span><span>Защ <b>${u.def}${sh ? '+' + sh : ''}</b></span><span>Движ <b>${u.move}</b></span><span>Дальн <b>${u.range}</b></span>`;
}

function attackDesc(u) { return `${u.atk} урона${u.magic ? ' магией' : ''}, ${u.range === 1 ? 'ближний бой' : 'дальность ' + u.range}`; }

function updatePanel() {
  const u = selU() || (hoverHex && unitAt(st, ...hoverHex));
  if (!u) {
    $('who').innerHTML = `<span class="empty-sel">${st.phase === 'deploy' ? 'Выбери бойца, чтобы переставить его.' : 'Выбери бойца. Наведи на врага, чтобы увидеть прогноз урона.'}</span>`;
    $('abil').innerHTML = '';
    return;
  }
  const mine = u.side === 'player' && u.id === sel;
  const statuses = [u.status.shieldWall && 'стена щитов', u.status.spears && 'копья вперёд', u.status.marked && 'метка', u.status.taunt && 'вызов'].filter(Boolean);
  $('who').innerHTML = `<div class="ava">${figSVG(u.kind, unitColor(u), '', u.side === 'enemy')}</div>
    <div class="info"><b>${u.name}</b><div class="stats">${statLine(u)}</div>
    <div class="stats">${u.side === 'player' && st.phase === 'battle' ? `<span class="pips">${[0, 1].map(i => `<i class="${i < u.ap ? '' : 'used'}"></i>`).join('')}</span>` : ''}${statuses.length ? `<span>${statuses.join(', ')}</span>` : ''}</div></div>`;
  if (!mine || st.phase !== 'battle') {
    $('abil').innerHTML = u.abilities.map(id => `<span class="tag">${ABILITIES[id].name}</span>`).join(' ') + (u.abilities.length ? `<span class="empty-sel" style="flex-basis:100%">${u.abilities.map(id => ABILITIES[id].desc).join(' · ')}</span>` : '');
    return;
  }
  const canAct = u.ap > 0 && st.turn === 'player' && !busy && !u.disengage;
  let html = `<button class="gbtn ${mode ? '' : 'on'}" type="button" data-ab="" ${canAct ? '' : 'disabled'}><span>${u.range > 1 ? 'Выстрел' : 'Атака'} <kbd>1</kbd></span><small>${attackDesc(u)}</small></button>`;
  u.abilities.forEach((id, i) => {
    const A = ABILITIES[id], ready = canAct && abilityReady(st, u, id) && abilityTargets(st, u, id).length > 0;
    const extra = [u.cd[id] > 0 ? `ещё ${u.cd[id]} х.` : '', A.mana ? `${A.mana} маны` : ''].filter(Boolean).join(' · ');
    html += `<button class="gbtn ${mode === id ? 'on' : ''}" type="button" data-ab="${id}" ${ready ? '' : 'disabled'}><span>${A.name} <kbd>${i + 2}</kbd></span><small>${A.desc}${extra ? ' · ' + extra : ''}</small></button>`;
  });
  if (u.disengage) html += `<span class="empty-sel">Отход: кликни гекс в пределах 2 — удара вдогонку не будет.</span>`;
  $('abil').innerHTML = html;
}

function updateUI() { if (!st) return; updateTop(); updatePanel(); refreshOverlay(); }

/* ---------- overlay + tooltip ---------- */
function tip(html) {
  const t = $('tip');
  if (!html) { t.hidden = true; return; }
  t.innerHTML = html; t.hidden = false;
  const box = $('stage').getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
  let x = pointer.x - box.left + 18, y = pointer.y - box.top + 18;
  if (x + w > box.width - 8) x = pointer.x - box.left - w - 18;
  if (y + h > box.height - 8) y = pointer.y - box.top - h - 18;
  t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
}
const tags = bonuses => bonuses.length ? `<div class="tags">${bonuses.map(([n, v]) => `<span class="tag ${v >= 0 ? 'plus' : 'minus'}">${n} ${v > 0 ? '+' : ''}${v}%</span>`).join('')}</div>` : '';
function forecastTip(head, f, t, extra = '') {
  const left = Math.max(0, t.hp - f.dmg);
  return `<span class="t-head">${head}</span><span class="t-big num">−${f.dmg}</span>
    <div class="hpbar"><i style="width:${(left / t.maxHp * 100).toFixed(0)}%"></i></div>
    <div class="t-row num"><span>${f.kills ? '<b class="t-warn">Убьёт</b>' : `останется ${left} / ${t.maxHp}`}</span><span>${f.ret ? 'ответ −' + f.ret : 'без ответа'}</span></div>${tags(f.bonuses)}${extra}`;
}

function refreshOverlay() {
  if (!st) return;
  const u = selU();
  if (st.phase === 'deploy') {
    const deploy = [];
    for (let r = 0; r < st.rows; r++) for (const c of [0, 1]) if (passable(st, r, c)) deploy.push([r, c]);
    board.overlay({ deploy, sel: u ? P(u) : null, hover: hoverHex });
    tip(null);
    return;
  }
  if (busy || st.turn !== 'player' || st.winner || st.auto || !u) {
    board.overlay({ hover: busy ? null : hoverHex });
    const h = !busy && hoverHex && unitAt(st, ...hoverHex);
    tip(h && !u && !busy ? `<span class="t-head">${h.side === 'player' ? 'Твой боец' : 'Враг'}</span><b>${h.name}</b><span class="num">ОЗ ${h.hp} / ${h.maxHp}</span>` : null);
    return;
  }
  const here = P(u), hv = hoverHex, ht = hv && unitAt(st, ...hv);
  if (mode) return abilityOverlay(u, mode, hv, ht);
  const reach = u.ap > 0 ? reachable(st, u) : null;
  const targets = u.ap > 0 ? living(st, 'enemy').filter(e => canAttack(st, u, here, e)).map(P) : [];
  const zset = u.disengage ? new Set() : zocHexes(st, 'player');
  const zoc = reach ? [...reach.tiles.keys()].filter(k => zset.has(k)).map(unkey) : [];
  let path = [], tipHtml = null;
  if (hv && reach && reach.tiles.has(key(...hv))) {
    path = pathTo(reach, key(...hv));
    const opp = opportunityStrikes(st, u, path);
    const zstop = zoc.some(([r, c]) => r === hv[0] && c === hv[1]);
    tipHtml = `<span class="t-head">Переход · ${reach.tiles.get(key(...hv)).cost} очк. движения</span>${opp.length ? `<span class="t-warn">Удар вдогонку: −${opp.reduce((s, o) => s + o.dmg, 0)}</span>` : ''}${zstop ? '<span>Зона контроля: здесь остановишься</span>' : ''}${st.cells[hv[0]][hv[1]] === 'hill' && u.range > 1 ? '<span>Холм: +1 к дальности</span>' : ''}`;
  } else if (ht && ht.side === 'enemy' && targets.some(([r, c]) => r === ht.r && c === ht.c)) {
    tipHtml = forecastTip(`${u.name} → ${ht.name}`, computeDamage(st, u, here, ht), ht);
  } else if (ht) {
    tipHtml = `<span class="t-head">${ht.side === 'player' ? 'Твой боец' : 'Враг · вне досягаемости'}</span><b>${ht.name}</b><span class="num">ОЗ ${ht.hp} / ${ht.maxHp}</span>`;
  }
  board.overlay({ reach: reach ? [...reach.tiles.keys()].map(unkey) : [], zoc, targets, path, sel: here, hover: hv });
  tip(tipHtml);
}

function abilityOverlay(u, id, hv, ht) {
  const targets = abilityTargets(st, u, id), here = P(u);
  const valid = hv && targets.some(([r, c]) => r === hv[0] && c === hv[1]);
  let area = [], path = [], html = null;
  if (valid) {
    switch (id) {
      case 'charge': {
        const c = chargeLanding(st, u, ht);
        path = [here]; let p = here;
        for (let i = 1; i < c.n; i++) { p = neighbor(p[0], p[1], c.d); path.push(p); }
        const [r0, c0] = here; u.r = c.landing[0]; u.c = c.landing[1];
        const f = computeDamage(st, u, c.landing, ht, { mult: 1.5, multLabel: 'Таран' });
        u.r = r0; u.c = c0;
        html = forecastTip(`Таран → ${ht.name}`, f, ht, '<span>+ отбрасывание на 1 гекс</span>');
        break;
      }
      case 'aimed': html = forecastTip(`Прицельный выстрел → ${ht.name}`, computeDamage(st, u, here, ht, { ignoreCover: true }), ht); break;
      case 'disengage': html = forecastTip(`Выстрел → ${ht.name}`, computeDamage(st, u, here, ht), ht, '<span>Затем отход на 2 гекса</span>'); break;
      case 'cleave': html = `<span class="t-head">Рассекающий удар</span><span>${ht.name}: −${computeDamage(st, u, here, ht, { noRetaliation: true }).dmg}</span><span>Задевает соседей цели рядом с Альденом</span>`; break;
      case 'chain': {
        const list = chainTargets(st, u, ht);
        html = `<span class="t-head">Цепная молния · 3 маны</span>` + list.map((x, i) => `<span class="num">${x.name}: −${Math.max(1, Math.round(u.atk * [1, .75, .5][i]) - Math.floor((x.def + shieldBonus(st, x)) / 2))}</span>`).join('');
        area = list.map(P);
        break;
      }
      case 'fireball': {
        area = fireballArea(st, hv);
        const hit = area.map(([r, c]) => unitAt(st, r, c)).filter(Boolean);
        html = `<span class="t-head">Огненный шар · 5 маны</span>` + (hit.length ? hit.map(x => `<span class="num" style="color:${x.side === 'player' ? 'var(--bad)' : 'inherit'}">${x.name}: −${fireballDamage(st, x)}${x.side === 'player' ? ' (свой!)' : ''}</span>`).join('') : '<span>Никого не заденет</span>');
        break;
      }
      case 'iceWall': area = iceWallHexes(st, hv); html = '<span class="t-head">Ледяная стена</span><span>Не пройти и не прострелить 2 хода</span>'; break;
      case 'heal': html = `<span class="t-head">Лечение</span><span class="num">${ht.name}: +${Math.min(6, ht.maxHp - ht.hp)} ОЗ</span>`; break;
      case 'mark': html = `<span class="t-head">Метка</span><span>${ht.name} получает +25% урона от всех до конца хода</span>`; break;
    }
  }
  const zone = ['fireball', 'iceWall'].includes(id);
  board.overlay({ targets: zone ? [] : targets, deploy: zone ? targets : [], area, path, sel: here, hover: hv });
  tip(html);
}

/* ---------- input ---------- */
function onHover(h, e) {
  if (e) pointer = { x: e.clientX, y: e.clientY };
  const same = (h && hoverHex && h[0] === hoverHex[0] && h[1] === hoverHex[1]) || (!h && !hoverHex);
  hoverHex = h;
  if (!same) { refreshOverlay(); if (!sel) updatePanel(); }
  else if (!$('tip').hidden) tip($('tip').innerHTML);
}

async function act(fn) {
  busy = true; tip(null); board.overlay({}); updateTop();
  const ev = fn();
  await board.play(ev, st, log);
  board.sync();
  busy = false;
  const u = selU();
  if (!u || u.ap <= 0) sel = null;
  mode = null;
  if (st.winner) return finish();
  updateUI();
}

function onClick([r, c]) {
  if (!st || busy || st.winner) return;
  const u = selU(), t = unitAt(st, r, c);
  if (st.phase === 'deploy') {
    if (u && (!t || t.side === 'player') && !(t && t.id === u.id)) {
      if (swapDeploy(st, u, r, c)) { board.sync(); sel = null; }
      else if (t && t.side === 'player') sel = t.id;
    } else sel = t && t.side === 'player' ? (t.id === sel ? null : t.id) : null;
    return updateUI();
  }
  if (st.turn !== 'player' || st.auto) return;
  if (mode && u) {
    if (abilityTargets(st, u, mode).some(h => h[0] === r && h[1] === c)) { const id = mode; return act(() => useAbility(st, u, id, [r, c])); }
    mode = null;
    if (t && t.side === 'player') sel = t.id;
    return updateUI();
  }
  if (t && t.side === 'player') { sel = t.id === sel && !u?.disengage ? null : t.id; mode = null; return updateUI(); }
  if (u && t && t.side === 'enemy' && u.ap > 0 && !u.disengage && canAttack(st, u, P(u), t)) return act(() => performAttack(st, u, t));
  if (u && !t && u.ap > 0) {
    const reach = reachable(st, u);
    if (reach.tiles.has(key(r, c))) return act(() => performMove(st, u, pathTo(reach, key(r, c))));
  }
  if (!u?.disengage) sel = null;
  updateUI();
}

function chooseAbility(i) {
  const u = selU();
  if (!u || busy || st.turn !== 'player' || st.phase !== 'battle' || u.ap <= 0 || u.disengage) return;
  if (i === 0) { mode = null; return updateUI(); }
  const id = u.abilities[i - 1];
  if (!id || !abilityReady(st, u, id) || !abilityTargets(st, u, id).length) return;
  if (ABILITIES[id].target === 'self') return act(() => useAbility(st, u, id, P(u)));
  mode = mode === id ? null : id;
  updateUI();
}

$('abil').addEventListener('click', e => {
  const b = e.target.closest('[data-ab]'); if (!b || b.disabled) return;
  const u = selU(); if (!u) return;
  chooseAbility(b.dataset.ab ? u.abilities.indexOf(b.dataset.ab) + 1 : 0);
});

function nextUnit() {
  if (!st || st.phase !== 'battle' || st.turn !== 'player' || busy) return;
  const ready = living(st, 'player').filter(u => u.ap > 0);
  if (!ready.length) return;
  const i = ready.findIndex(u => u.id === sel);
  sel = ready[(i + 1) % ready.length].id; mode = null;
  updateUI();
}

/* ---------- turns ---------- */
async function runAi(side) {
  for (const b of aiTurn(st, side)) {
    await board.play(b.ev, st, log);
    board.sync(); updateTop();
    if (side === 'player' && !st.auto) break;
    if (st.winner) break;
  }
}

async function endPlayerTurn() {
  if (!st || busy || st.winner) return;
  if (st.phase === 'deploy') { st.phase = 'battle'; sel = null; banner('Твой ход'); return updateUI(); }
  if (st.turn !== 'player') return;
  busy = true; sel = null; mode = null; tip(null); updateUI();
  await board.play(endTurn(st), st, log);
  board.sync(); updateTop(); banner('Ход врага');
  await new Promise(r => setTimeout(r, 500 * board.speed));
  await runAi('enemy');
  if (!st.winner) { await board.play(endTurn(st), st, log); board.sync(); banner(st.auto ? 'Автобой' : 'Твой ход'); }
  busy = false;
  if (st.winner) return finish();
  updateUI();
  if (st.auto) autoTurn();
}

async function autoTurn() {
  if (busy || st.winner || st.turn !== 'player') return;
  busy = true; updateUI();
  await runAi('player');
  busy = false;
  if (st.winner) return finish();
  if (st.auto) endPlayerTurn(); else updateUI();
}

$('endBtn').addEventListener('click', endPlayerTurn);
$('nextBtn').addEventListener('click', nextUnit);
$('autoBtn').addEventListener('click', () => {
  if (!st || st.phase !== 'battle') return;
  st.auto = !st.auto;
  board.speed = st.auto ? 0.45 : 1;
  sel = null; mode = null;
  updateUI();
  if (st.auto && st.turn === 'player' && !busy) autoTurn();
});
$('retreatBtn').addEventListener('click', () => {
  if (!st || st.winner) return;
  if ($('retreatBtn').dataset.confirm) { st.winner = 'enemy'; st.retreated = true; finish(); return; }
  $('retreatBtn').dataset.confirm = '1'; $('retreatBtn').textContent = 'Точно отступить?';
  setTimeout(() => { delete $('retreatBtn').dataset.confirm; $('retreatBtn').textContent = 'Отступить'; }, 2500);
});

function finish() {
  busy = false; tip(null); board.overlay({}); updateTop();
  const win = st.winner === 'player';
  const lost = lastBattle.playerCount - living(st, 'player').length;
  const killed = st.units.filter(u => u.side === 'enemy' && u.hp <= 0).length;
  $('resTitle').textContent = win ? 'Победа' : st.retreated ? 'Отступление' : 'Поражение';
  $('resTitle').className = win ? 'win' : 'loss';
  $('resText').textContent = win
    ? (lost ? 'Поле за тобой, но не без потерь.' : 'Чистая победа: ни одного павшего.')
    : st.retreated ? 'Отряд отошёл. В кампании это стоило бы одного бойца.' : 'Отряд пал. Попробуй другую расстановку или состав.';
  $('resStats').innerHTML = `<div><b class="num">${st.round}</b><span>раундов</span></div><div><b class="num">${killed}</b><span>врагов повержено</span></div><div><b class="num">${lost}</b><span>своих потеряно</span></div>`;
  $('resButtons').innerHTML = (ctx.resultButtons || [{ label: 'Закрыть', primary: true }]).map((x, i) => `<button class="gbtn ${x.primary ? 'primary' : ''}" type="button" data-i="${i}">${x.label}</button>`).join('');
  setTimeout(() => { $('result').hidden = false; $('resButtons').querySelector('button')?.focus(); }, 500);
}
$('resButtons').addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const x = (ctx.resultButtons || [])[+b.dataset.i];
  $('result').hidden = true; $('battle').hidden = true;
  const done = st; st = null;
  x?.onClick?.(done);
});

/* ---------- help + keys ---------- */
export const openHelp = () => { $('help').hidden = false; $('helpClose').focus(); };
$('helpBtn').addEventListener('click', openHelp);
$('helpClose').addEventListener('click', () => { $('help').hidden = true; });

window.addEventListener('keydown', e => {
  if (e.target.closest('input')) return;
  if (!$('help').hidden) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); $('help').hidden = true; } return; }
  if ($('battle').hidden || !$('result').hidden) return;
  if (e.key === 'Enter') { e.preventDefault(); endPlayerTurn(); }
  else if (e.key === 'Tab') { e.preventDefault(); nextUnit(); }
  else if (e.key === 'Escape') { if (mode) mode = null; else if (!selU()?.disengage) sel = null; updateUI(); }
  else if (['1', '2', '3'].includes(e.key)) chooseAbility(+e.key - 1);
});

