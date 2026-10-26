// Kingdom (stage 2): start screen, map controller, city/army panels, battles via the shared skirmish screen.
import { key, unkey, dist } from './core/hex.js';
import { UNITS } from './data/units.js';
import { RES, RES_NAME, BUILDINGS, MAP_SIZES, WALLS_COST } from './data/buildings.js';
import {
  newKingdom, moveArmy, attackOptions, splitUnit, mergeArmies, battleFor, autoResolve, predict, applyBattle,
  endKingdomTurn, serialize, deserialize, SAVE_KEY, FACTION_NAME
} from './rules/kingdom.js';
import { armyReach, reachPath, armyAt, territory, visibleSet } from './rules/map.js';
import {
  cityAt, cityById, buildOptions, build, upgrade, upgradeCost, buildWalls, setWorkers, autoAssign, slotsOf,
  buildingYield, cityYield, housing, idleOf, buildingsOf, recruitOptions, recruit, forecast, marketRate, trade, canPay,
  peasantCheck, hirePeasant, growthNeed, scaled
} from './rules/economy.js';
import { MapView, armyColor } from './view/map-view.js';
import { openBattle } from './view/battle-screen.js';
import { figSVG, MORVEN, tile as tileArt, building as buildingArt } from './view/art.js';

const $ = id => document.getElementById(id);
const BLUE = '#2F6FDB';
const ICON = {
  food: '<svg viewBox="0 0 20 20"><path d="M10 18 V6" stroke="#C99A2E" stroke-width="1.6"/><ellipse cx="10" cy="5" rx="2" ry="3" fill="#F2C14E"/><ellipse cx="7" cy="9" rx="1.8" ry="2.8" fill="#F2C14E" transform="rotate(-30 7 9)"/><ellipse cx="13" cy="9" rx="1.8" ry="2.8" fill="#F2C14E" transform="rotate(30 13 9)"/><ellipse cx="7" cy="13" rx="1.8" ry="2.8" fill="#E2B53E" transform="rotate(-30 7 13)"/><ellipse cx="13" cy="13" rx="1.8" ry="2.8" fill="#E2B53E" transform="rotate(30 13 13)"/></svg>',
  wood: '<svg viewBox="0 0 20 20"><rect x="2" y="7" width="13" height="7" rx="3.5" fill="#A0704A"/><circle cx="15" cy="10.5" r="3.5" fill="#D6AE7E"/><circle cx="15" cy="10.5" r="1.4" fill="#A0704A"/></svg>',
  stone: '<svg viewBox="0 0 20 20"><polygon points="3,15 5,7 11,4 17,8 16,15" fill="#B5BAC1"/><polygon points="11,4 17,8 16,15 11,12" fill="#959BA3"/></svg>',
  gold: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="#F2C14E"/><circle cx="10" cy="10" r="4.8" fill="none" stroke="#C99A2E" stroke-width="1.4"/></svg>',
  iron: '<svg viewBox="0 0 20 20"><polygon points="2,15 5,8 15,8 18,15" fill="#8E98A3"/><polygon points="5,8 15,8 13.5,11 6.5,11" fill="#B4BCC5"/></svg>',
  mana: '<svg viewBox="0 0 20 20"><polygon points="10,1.5 15.5,9 10,18.5 4.5,9" fill="#7B5CFF"/><polygon points="10,1.5 15.5,9 10,10.5" fill="#A28BFF"/></svg>',
  pop: '<svg viewBox="0 0 20 20"><circle cx="10" cy="6" r="3.4" fill="#EAF1F4"/><path d="M3.5 18 Q4 10.5 10 10.5 Q16 10.5 16.5 18 Z" fill="#EAF1F4"/></svg>'
};
const costHTML = (cost, have = true) => Object.entries(cost).filter(([, v]) => v).map(([r, v]) => `<span class="chip ${have && (K.res[r] || 0) < v ? 'short' : ''}">${ICON[r]}${v}</span>`).join('');
const yieldHTML = y => Object.entries(y).filter(([, v]) => v).map(([r, v]) => `<span class="chip">${ICON[r]}+${v}</span>`).join('') || '<span class="muted">ничего</span>';
const isHero = k => !!UNITS[k].hero;
const unitCol = (u, owner, faction) => UNITS[u.kind].undead ? MORVEN : owner === 'player' ? BLUE : faction === 'bandits' ? '#8A6A48' : '#D64545';

let K = null, sel = null, hover = null, vis = new Set(), busy = false, queue = [], pointer = { x: 0, y: 0 };
const view = new MapView($('kSvg'), { click: onClick, hover: onHover });

/* ---------- start ---------- */
function rand() { return 10000 + Math.floor(Math.random() * 89999); }
function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? deserialize(s) : null; } catch { return null; } }
function save() { try { if (K) localStorage.setItem(SAVE_KEY, serialize(K)); } catch { /* storage unavailable */ } }
$('kSeed').value = rand();
$('kReseed').onclick = () => { $('kSeed').value = rand(); };
$('kContinue').hidden = !loadSave();
$('kNew').onclick = () => {
  const size = document.querySelector('input[name="ksize"]:checked').value;
  K = newKingdom({ seed: Math.max(1, parseInt($('kSeed').value, 10) || 1), size, hardcore: $('kHard').checked });
  save(); enterMap();
};
$('kContinue').onclick = () => { K = loadSave(); if (K) enterMap(); };

function enterMap() {
  $('kStart').hidden = true; $('kMap').hidden = false;
  sel = null; hover = null; queue = []; busy = false;
  view.setKingdom(K);
  const cap = K.cities.find(c => c.capital) || K.cities[0];
  if (cap) view.centerOn(cap.r, cap.c);
  refresh();
  $('kLog').innerHTML = '';
  logLines(['Ход 1. Кликни по столице (по зданию, не по фигуркам): там найм крестьян за еду, их распределение и найм войск.'].slice(0, K.turn === 1 ? 1 : 0));
}

/* ---------- top bar ---------- */
function updateTop() {
  $('kTurn').textContent = 'Ход ' + K.turn;
  const net = forecast(K), pop = K.cities.reduce((s, c) => s + c.pop, 0);
  $('kRes').innerHTML = RES.map(r => `<span class="res" title="${RES_NAME[r]}">${ICON[r]}<span class="num">${K.res[r]}</span><small class="num ${net[r] < 0 ? 'down' : 'up'}">${net[r] > 0 ? '+' : ''}${net[r] || ''}</small></span>`).join('')
    + `<span class="res" title="Жители">${ICON.pop}<span class="num">${pop}</span></span>`
    + (K.unrest ? '<span class="tag minus">Ропот</span>' : '');
  $('kGoal').textContent = `Логова: ${K.stats.lairs} / ${K.lairsTotal}`;
  $('kMarket').disabled = !marketRate(K);
  $('kEnd').disabled = busy;
}

function refresh() {
  vis = visibleSet(K);
  view.renderAll(vis);
  updateTop();
  updatePanel();
  refreshOverlay();
}

/* ---------- selection helpers ---------- */
const selArmy = () => sel?.type === 'army' ? K.armies.find(a => a.id === sel.id) : null;
const myArmyAt = (r, c) => { const a = armyAt(K, r, c); return a && a.owner === 'player' ? a : null; };
const visibleFoeAt = (r, c) => { const a = armyAt(K, r, c); return a && a.owner !== 'player' && vis.has(key(r, c)) ? a : null; };

function refreshOverlay() {
  const a = selArmy();
  if (a && a.owner === 'player') {
    const reach = armyReach(K, a), atk = attackOptions(K, a).filter(o => vis.has(key(o.target.r, o.target.c)));
    let path = [];
    if (hover) {
      const k = key(...hover);
      if (reach.tiles.has(k)) path = reachPath(reach, k);
      const o = atk.find(x => x.target.r === hover[0] && x.target.c === hover[1]);
      if (o) path = o.path ? [...o.path, [o.target.r, o.target.c]] : [[a.r, a.c], [o.target.r, o.target.c]];
    }
    view.overlay({ reach: [...reach.tiles.keys()].map(unkey), attack: atk.map(o => [o.target.r, o.target.c]), path, sel: [a.r, a.c], hover });
    return;
  }
  if (sel?.type === 'tile') {
    const city = cityAt(K, sel.r, sel.c);
    const buildable = city ? [...territory(K)].filter(([k, id]) => id === city.id && buildOptions(K, ...unkey(k)).list.length).map(([k]) => unkey(k)) : [];
    view.overlay({ sel: [sel.r, sel.c], hover, build: buildable });
    return;
  }
  view.overlay({ sel: sel?.type === 'army' ? [selArmy()?.r, selArmy()?.c] : null, hover });
}

/* ---------- panels ---------- */
function unitRow(u, owner, faction, armyId) {
  const hero = isHero(u.kind);
  return `<div class="urow"><div class="uava">${figSVG(u.kind, unitCol(u, owner, faction), '', owner !== 'player')}</div>
    <div class="uinfo"><b>${UNITS[u.kind].name}${hero ? ` · ур. ${u.level}` : ''}</b>
    <div class="hpbar"><i style="width:${(u.hp / u.maxHp * 100).toFixed(0)}%;${owner !== 'player' ? 'background:var(--bad)' : ''}"></i></div>
    <small class="num">ОЗ ${u.hp}/${u.maxHp}${hero ? ` · опыт ${u.xp}/${3 * u.level}` : ''}</small></div>
    ${armyId ? `<button class="gbtn mini" type="button" data-split="${u.uid}" title="Отделить в новый отряд">Отделить</button>` : ''}</div>`;
}

function updatePanel() {
  const side = $('kSide');
  const a = selArmy();
  if (a) {
    if (a.owner === 'player') {
      const onVillage = K.tiles[a.r][a.c] === 'village' && !cityAt(K, a.r, a.c);
      side.innerHTML = `<h3>Отряд · ${a.units.length}/5</h3><p class="muted">Движение: ${a.mp} · ${a.mp > 0 ? 'кликни гекс — идти, красный гекс — атаковать' : 'ходов не осталось'}</p>
        ${onVillage ? '<p class="note">Закончи ход здесь — деревня станет твоим городом.</p>' : ''}
        ${K.unrest ? '<p class="note bad">Ропот: −25% к атаке, пока армии не хватает припасов.</p>' : ''}
        <div class="ulist">${a.units.map(u => unitRow(u, 'player', null, a.units.length > 1 ? a.id : null)).join('')}</div>
        <p class="muted small">Клик по соседнему своему отряду — объединить (до 5). Здоровье восстанавливается: +3 стоя на месте, +6 в городе.</p>`;
    } else {
      side.innerHTML = `<h3>${FACTION_NAME[a.faction]} · ${a.kind === 'lair' ? 'логово' : 'бродячий отряд'}</h3>
        ${a.reward ? `<p class="muted">Награда: </p><div class="chips">${yieldHTML(a.reward)}</div>` : '<p class="note bad">Идёт к твоим городам.</p>'}
        <div class="ulist">${a.units.map(u => unitRow(u, 'monster', a.faction)).join('')}</div>`;
    }
    return;
  }
  if (sel?.type === 'tile') {
    const { r, c } = sel, k = key(r, c), b = K.buildings[k], city = cityAt(K, r, c);
    if (city) return cityPanel(side, city);
    if (b) return buildingPanel(side, k, b);
    const opts = buildOptions(K, r, c);
    const t = K.tiles[r][c];
    if (opts.city) {
      side.innerHTML = `<h3>Постройка · ${opts.city.name}</h3><p class="muted">${terrainName(t)}</p>
        <div class="blist">${opts.list.length ? opts.list.map(o => `<button class="bopt" type="button" data-build="${o.id}" ${o.why ? 'disabled' : ''}>
          <span class="bico"><svg viewBox="0 0 64 60">${bIcon(o.id, t)}</svg></span><span class="btxt"><b>${o.name}</b><small>${o.note}</small><span class="chips">${costHTML(o.cost)}</span>${o.why ? `<small class="bad">${o.why}</small>` : ''}</span></button>`).join('') : '<p class="muted">Здесь ничего не построить.</p>'}</div>`;
      return;
    }
    side.innerHTML = `<h3>${terrainName(t)}</h3><p class="muted">${K.tiles[r][c] === 'village' ? 'Приведи отряд и закончи на ней ход — деревня станет городом.' : 'Вне твоей территории. Территория растёт с уровнем города, а заставу можно поставить на гекс прямо у границы.'}</p>`;
    return;
  }
  const cities = K.cities.filter(x => x.owner === 'player');
  side.innerHTML = `<h3>Королевство</h3>
    <p class="muted">Цель: зачистить все логова (${K.stats.lairs}/${K.lairsTotal}). Нежить с севера приходит каждые ${MAP_SIZES[K.size].wanderEvery} ходов начиная с 8-го.</p>
    <p class="label">Города</p><div class="clist">${cities.map(x => `<button class="crow" type="button" data-city="${x.id}"><b>${x.name}${x.capital ? ' ★' : ''}</b><span class="num">${x.pop} жит. · ур. ${x.level}</span></button>`).join('')}</div>
    <p class="label">Отряды</p><div class="clist">${K.armies.filter(x => x.owner === 'player').map(x => `<button class="crow" type="button" data-army="${x.id}"><b>${x.units.map(u => UNITS[u.kind].name.split(' ')[0]).slice(0, 3).join(', ')}${x.units.length > 3 ? '…' : ''}</b><span class="num">${x.mp > 0 ? 'ход ' + x.mp : 'стоит'}</span></button>`).join('') || '<p class="muted">Нет отрядов — найми в ратуше.</p>'}</div>
    ${K.wounded.length ? `<p class="muted small">Раненые герои: ${K.wounded.map(w => `${UNITS[w.unit.kind].name} (${w.turns} х.)`).join(', ')}</p>` : ''}`;
}

const terrainName = t => ({ grass: 'Равнина', forest: 'Лес', hill: 'Холм', mountain: 'Гора', water: 'Вода', ore: 'Рудная жила', gold: 'Золотая жила', mana: 'Источник маны', ruins: 'Руины', village: 'Деревня' }[t]);
const bIcon = (id, t) => tileArt(id === 'farm' ? 'field' : (BUILDINGS[id].tiles[0] || t), 32, 30, 26) + buildingArt(id, 32, 32, 25, BLUE);

function cityPanel(side, city) {
  const y = cityYield(K, city), list = buildingsOf(K, city.id).filter(([, b]) => slotsOf(b) > 0);
  const need = growthNeed(K, city), surplus = y.food - city.pop, house = housing(K, city), hire = peasantCheck(K, city);
  side.innerHTML = `<h3>${city.name}${city.capital ? ' ★' : ''}</h3>
    <div class="popbox">
      <div class="poprow"><span class="popbig num">${ICON.pop}${city.pop}<small>/${house}</small></span><span class="muted small">жителей / мест в домах · свободно: <b class="${idleOf(K, city) ? 'gold' : ''}">${idleOf(K, city)}</b></span></div>
      <button class="gbtn primary" type="button" id="hirePeasant" ${hire.why ? 'disabled' : ''}>+ Крестьянин <span class="chips">${costHTML(hire.cost)}</span></button>
      ${hire.why ? `<small class="bad">${hire.why}</small>` : ''}
      <div class="hpbar"><i style="width:${Math.min(100, city.growth / need * 100).toFixed(0)}%;background:var(--gold)"></i></div>
      <small class="muted num">${city.pop >= house ? 'Сами не растут: нет жилья. Кликни свободный гекс территории → Дом.' : surplus > 0 ? `Сами растут: ${city.growth}/${need}, +${surplus} в ход (излишек еды)` : 'Сами не растут: нет излишка еды — добавь крестьян на ферму.'}</small>
      <small class="muted">Уровень города ${city.level}: на 3-м уровне территория станет больше.</small>
    </div>
    <div class="chips">${yieldHTML(y)}</div>
    <label class="toggle"><input type="checkbox" id="cityAuto" ${city.auto ? 'checked' : ''}> Автораспределение крестьян</label>
    ${list.map(([k, b]) => { const out = buildingYield(K, k, b); return `<div class="brow"><span class="bico small"><svg viewBox="0 0 64 60">${bIcon(b.type, K.tiles[unkey(k)[0]][unkey(k)[1]])}</svg></span>
      <div><b>${BUILDINGS[b.type].name}${b.level > 1 ? ' · ур. ' + b.level : ''}</b><div class="chips">${yieldHTML(out)}</div></div>
      <div class="stepper"><button type="button" data-w="${k}" data-d="-1" aria-label="Убрать крестьянина">−</button><span class="slots">${Array.from({ length: slotsOf(b) }, (_, j) => `<i class="${j < b.workers ? 'on' : ''}"></i>`).join('')}</span><button type="button" data-w="${k}" data-d="1" aria-label="Добавить крестьянина">+</button></div></div>`; }).join('') || '<p class="muted small">Пока нет зданий с крестьянами — построй ферму или лесопилку на гексах территории.</p>'}
    <p class="label">Найм</p>
    <div class="blist">${recruitOptions(K, city).map(o => `<button class="bopt" type="button" data-recruit="${o.kind}" ${o.why ? 'disabled' : ''}>
      <span class="bico unit">${figSVG(o.kind, BLUE)}</span><span class="btxt"><b>${o.name}</b><span class="chips">${costHTML(o.cost)}</span><small class="muted">содержание: ${Object.entries(o.upkeep).map(([r, v]) => `${v} ${RES_NAME[r].toLowerCase()}`).join(', ')}</small>${o.why ? `<small class="bad">${o.why}</small>` : ''}</span></button>`).join('')}</div>
    ${city.walls ? '<p class="muted small">Стены построены: при осаде к горожанам присоединится мечник.</p>' : `<button class="gbtn" type="button" id="buildWalls" ${canPay(K, scaled(K, WALLS_COST)) ? '' : 'disabled'}>Построить стены <span class="chips">${costHTML(scaled(K, WALLS_COST))}</span></button>`}`;
}

function buildingPanel(side, k, b) {
  const D = BUILDINGS[b.type], up = upgradeCost(b, K), city = cityById(K, b.city);
  side.innerHTML = `<h3>${D.name}${b.level > 1 ? ' · ур. ' + b.level : ''}</h3><p class="muted">${city?.name || ''} · ${D.note}</p>
    ${D.outside ? '<p class="muted small">Земля в радиусе 1 вокруг заставы — твоя, и с неё видно на 2 гекса.</p>' : `<div class="chips">Даёт: ${yieldHTML(buildingYield(K, k, b))}</div>`}
    ${slotsOf(b) ? `<div class="brow"><span></span><div><b>Крестьяне</b><small class="muted">Свободно в городе: ${idleOf(K, city)}</small></div><div class="stepper"><button type="button" data-w="${k}" data-d="-1" aria-label="Убрать крестьянина">−</button><span class="slots">${Array.from({ length: slotsOf(b) }, (_, j) => `<i class="${j < b.workers ? 'on' : ''}"></i>`).join('')}</span><button type="button" data-w="${k}" data-d="1" aria-label="Добавить крестьянина">+</button></div></div>` : ''}
    ${up ? `<button class="gbtn" type="button" id="upgradeB" ${canPay(K, up) ? '' : 'disabled'}>Улучшить до ур. ${b.level + 1} <span class="chips">${costHTML(up)}</span></button>` : D.outside ? '' : '<p class="muted small">Максимальный уровень.</p>'}`;
}

$('kSide').addEventListener('click', e => {
  const t = e.target;
  const w = t.closest('[data-w]');
  if (w) { if (setWorkers(K, w.dataset.w, +w.dataset.d)) refresh(); return; }
  const bb = t.closest('[data-build]');
  if (bb && !bb.disabled && sel?.type === 'tile') { if (build(K, sel.r, sel.c, bb.dataset.build)) { save(); refresh(); } return; }
  const rc = t.closest('[data-recruit]');
  if (rc && !rc.disabled && sel?.type === 'tile') { const city = cityAt(K, sel.r, sel.c); if (city && recruit(K, city, rc.dataset.recruit)) { save(); refresh(); } return; }
  const sp = t.closest('[data-split]');
  if (sp) { const a = selArmy(); if (a && splitUnit(K, a, +sp.dataset.split)) refresh(); return; }
  if (t.closest('#hirePeasant')) { const city = cityAt(K, sel.r, sel.c); if (city && hirePeasant(K, city)) { save(); refresh(); } return; }
  if (t.closest('#upgradeB')) { if (upgrade(K, key(sel.r, sel.c))) { save(); refresh(); } return; }
  if (t.closest('#buildWalls')) { const city = cityAt(K, sel.r, sel.c); if (city && buildWalls(K, city)) { save(); refresh(); } return; }
  const cr = t.closest('[data-city]');
  if (cr) { const city = cityById(K, +cr.dataset.city); sel = { type: 'tile', r: city.r, c: city.c }; view.centerOn(city.r, city.c); refresh(); return; }
  const ar = t.closest('[data-army]');
  if (ar) { const a = K.armies.find(x => x.id === +ar.dataset.army); sel = { type: 'army', id: a.id }; view.centerOn(a.r, a.c); refresh(); }
});
$('kSide').addEventListener('change', e => {
  if (e.target.id === 'cityAuto' && sel?.type === 'tile') {
    const city = cityAt(K, sel.r, sel.c);
    city.auto = e.target.checked;
    if (city.auto) autoAssign(K, city);
    refresh();
  }
});

/* ---------- map input ---------- */
function onHover(h, e) {
  if (e) pointer = { x: e.clientX, y: e.clientY };
  const same = (h && hover && h[0] === hover[0] && h[1] === hover[1]) || (!h && !hover);
  hover = h;
  if (!same) { refreshOverlay(); showTip(); }
}

function showTip() {
  const t = $('kTip');
  if (!hover || busy) { t.hidden = true; return; }
  const [r, c] = hover, k = key(r, c);
  if (!K.explored[k]) { t.hidden = true; return; }
  const foe = visibleFoeAt(r, c), mine = myArmyAt(r, c), city = cityAt(K, r, c), b = K.buildings[k];
  let html = `<b>${terrainName(K.tiles[r][c])}</b>`;
  if (city) html = `<b>${city.name}</b><span class="num">${city.pop} жителей · ур. ${city.level}</span>`;
  else if (b) html += `<span>${BUILDINGS[b.type].name}${b.level > 1 ? ' · ур. ' + b.level : ''}</span>`;
  if (foe) html += `<span class="bad">${FACTION_NAME[foe.faction]}: ${foe.units.length} ${foe.kind === 'lair' ? '· логово' : '· идёт к городам'}</span>`;
  if (mine) html += `<span>Твой отряд: ${mine.units.length}</span>`;
  const ruin = K.ruins[k];
  if (ruin && !ruin.looted) html += '<span class="gold">Можно обыскать руины</span>';
  t.innerHTML = html; t.hidden = false;
  const box = $('kSvg').getBoundingClientRect();
  t.style.left = Math.min(box.width - t.offsetWidth - 8, pointer.x - box.left + 16) + 'px';
  t.style.top = Math.min(box.height - t.offsetHeight - 8, pointer.y - box.top + 16) + 'px';
}

function onClick([r, c], { onArmy = true } = {}) {
  if (busy || K.status !== 'playing') return;
  const a = selArmy(), mine = myArmyAt(r, c), foe = visibleFoeAt(r, c);
  // a click on the town (not on the figures) opens the city even when a garrison stands there
  if (!onArmy && cityAt(K, r, c) && (!a || a.owner !== 'player' || (mine && mine.id === a.id))) { sel = { type: 'tile', r, c }; return refresh(); }
  if (a && a.owner === 'player') {
    if (foe) {
      const o = attackOptions(K, a).find(x => x.target.id === foe.id);
      if (o) return preBattle(a, foe, o.path);
    }
    if (mine && mine.id !== a.id) {
      if (dist([a.r, a.c], [r, c]) === 1 && mergeArmies(K, a, mine)) { sel = { type: 'army', id: mine.id }; return refresh(); }
      sel = { type: 'army', id: mine.id }; return refresh();
    }
    if (mine && mine.id === a.id) { sel = { type: 'tile', r, c }; return refresh(); }
    const reach = armyReach(K, a);
    if (reach.tiles.has(key(r, c))) {
      const log = [];
      moveArmy(K, a, reachPath(reach, key(r, c)), log);
      if (log.length) logLines(log);
      save();
      return refresh();
    }
  }
  if (mine) sel = { type: 'army', id: mine.id };
  else if (foe) sel = { type: 'army', id: foe.id };
  else if (K.explored[key(r, c)]) sel = { type: 'tile', r, c };
  else sel = null;
  refresh();
}

/* ---------- battles ---------- */
function preBattle(attacker, defender, path, onDone) {
  const mine = attacker.owner === 'player' ? attacker : defender, foe = mine === attacker ? defender : attacker;
  const playerAttacks = attacker.owner === 'player';
  let guess;
  if (playerAttacks && path) {
    // estimate from the hex we would attack from
    const saved = [mine.r, mine.c];
    const end = path[path.length - 1];
    mine.r = end[0]; mine.c = end[1];
    guess = predict(K, attacker, defender);
    [mine.r, mine.c] = saved;
  } else guess = predict(K, attacker, defender);
  const side = (army, owner) => `<div class="kb-side"><p class="label">${owner === 'player' ? 'Твой отряд' : FACTION_NAME[army.faction]}</p><div class="kb-figs">${army.units.map(u => `<div class="kb-u">${figSVG(u.kind, unitCol(u, army.owner, army.faction), '', owner !== 'player')}<small class="num">${u.hp}/${u.maxHp}</small></div>`).join('')}</div></div>`;
  $('kBattleBody').innerHTML = `<h2 id="kbTitle">${playerAttacks ? 'Атака' : 'На тебя напали'}</h2>
    <div class="kb-vs">${side(mine, 'player')}${side(foe, 'monster')}</div>
    <p>Прогноз автобоя: <b class="${guess.win ? 'win' : 'loss'}">${guess.win ? 'победа' : 'поражение'}</b>${guess.win ? `, потери ≈ ${guess.lost}` : ''}. Сам сыграешь лучше — у автобоя штраф 10% к урону.</p>
    ${foe.reward ? `<p class="muted">Награда за логово: </p><div class="chips">${yieldHTML(foe.reward)}</div>` : ''}
    <div class="row"><button class="gbtn primary" type="button" id="kbFight">Сражаться самому</button><button class="gbtn" type="button" id="kbAuto">Автобой</button>${playerAttacks ? '<button class="gbtn" type="button" id="kbCancel">Отмена</button>' : ''}</div>`;
  $('kBattle').hidden = false;
  busy = true;
  const go = manual => {
    $('kBattle').hidden = true;
    if (playerAttacks && path) moveArmy(K, attacker, path);
    const st = battleFor(K, attacker, defender);
    const finish = done => {
      const log = [];
      const res = applyBattle(K, done, log);
      logLines([res.win ? 'Победа в бою' : 'Поражение в бою', ...log]);
      busy = false;
      sel = mine.units.length ? { type: 'army', id: mine.id } : null;
      if (!K.armies.includes(mine)) sel = null;
      save(); refresh();
      checkEnd();
      onDone?.();
    };
    if (!manual) return finish(autoResolve(st));
    $('kMap').hidden = true;
    openBattle(st, {
      title: `Стычка · ${FACTION_NAME[foe.faction]}`,
      resultButtons: [{ label: 'Вернуться на карту', primary: true, onClick: done => { $('kMap').hidden = false; view.applyCam(); finish(done); } }]
    });
  };
  $('kbFight').onclick = () => go(true);
  $('kbAuto').onclick = () => go(false);
  if ($('kbCancel')) $('kbCancel').onclick = () => { $('kBattle').hidden = true; busy = false; refresh(); };
}

/* ---------- turn ---------- */
function logLines(lines) {
  const box = $('kLog');
  lines.forEach(t => { const d = document.createElement('div'); d.textContent = t; box.appendChild(d); });
  while (box.children.length > 7) box.firstChild.remove();
  clearTimeout(logLines.t);
  logLines.t = setTimeout(() => { box.innerHTML = ''; }, 9000);
}

function endTurnClick() {
  if (busy || !K || K.status !== 'playing') return;
  const { log, battles } = endKingdomTurn(K);
  $('kLog').innerHTML = '';
  logLines([`Ход ${K.turn}`, ...log]);
  queue = battles.slice();
  save(); refresh();
  nextQueued();
}

function nextQueued() {
  if (checkEnd()) return;
  const b = queue.shift();
  if (!b) { save(); return; }
  const atk = K.armies.find(x => x.id === b.attacker), def = K.armies.find(x => x.id === b.defender);
  if (!atk || !def) return nextQueued();
  view.centerOn(def.r, def.c);
  preBattle(atk, def, null, nextQueued);
}

function checkEnd() {
  if (!K || K.status === 'playing') return false;
  const won = K.status === 'won';
  $('kEndBody').innerHTML = `<h2 id="keTitle" class="${won ? 'win' : 'loss'}">${won ? 'Все логова зачищены' : 'Столица пала'}</h2>
    <p>${won ? 'Земли королевства свободны от чудовищ. На этапе 3 здесь появятся соседние королевства и сам Морвен.' : 'Нежить разорила столицу. Держи армию у городов и строй стены.'}</p>
    <div class="result-stats"><div><b class="num">${K.turn}</b><span>ходов</span></div><div><b class="num">${K.cities.length}</b><span>городов</span></div><div><b class="num">${K.stats.lairs}</b><span>логов зачищено</span></div></div>
    <div class="row"><button class="gbtn primary" type="button" id="keNew">Новая партия</button>${won ? '<button class="gbtn" type="button" id="keStay">Остаться на карте</button>' : ''}</div>`;
  $('kEndDlg').hidden = false;
  $('keNew').onclick = () => { $('kEndDlg').hidden = true; try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } location.reload(); };
  if ($('keStay')) $('keStay').onclick = () => { $('kEndDlg').hidden = true; K.status = 'playing'; K.lairsTotal = Infinity; save(); refresh(); };
  return true;
}

/* ---------- market ---------- */
let mk = { give: 'wood', get: 'gold', n: 1 };
function marketDlg() {
  const rate = marketRate(K);
  if (!rate) return;
  const tradeable = RES.filter(r => r !== 'mana');
  const pick = (name, cur) => `<div class="seg">${tradeable.map(r => `<label><input type="radio" name="${name}" value="${r}" ${cur === r ? 'checked' : ''}>${ICON[r]}<small>${K.res[r]}</small></label>`).join('')}</div>`;
  const cost = mk.n * rate, ok = mk.give !== mk.get && K.res[mk.give] >= cost;
  $('kMarketBody').innerHTML = `<h2 id="kmTitle">Рынок · ${rate}:1</h2>
    <p class="label">Отдать</p>${pick('mgive', mk.give)}<p class="label">Получить</p>${pick('mget', mk.get)}
    <div class="row" style="align-items:center"><span class="stepper"><button type="button" id="mMinus">−</button><span class="n num">${mk.n}</span><button type="button" id="mPlus">+</button></span>
    <span>Отдашь <b class="num">${cost}</b> ${RES_NAME[mk.give].toLowerCase()} → получишь <b class="num">${mk.n}</b> ${RES_NAME[mk.get].toLowerCase()}</span></div>
    <div class="row"><button class="gbtn primary" type="button" id="mDo" ${ok ? '' : 'disabled'}>Обменять</button><button class="gbtn" type="button" id="mClose">Закрыть</button></div>`;
  $('kMarketDlg').hidden = false;
  $('kMarketBody').querySelectorAll('input').forEach(i => i.onchange = () => { mk[i.name === 'mgive' ? 'give' : 'get'] = i.value; marketDlg(); });
  $('mMinus').onclick = () => { mk.n = Math.max(1, mk.n - 1); marketDlg(); };
  $('mPlus').onclick = () => { mk.n++; marketDlg(); };
  $('mDo').onclick = () => { if (trade(K, mk.give, mk.get, mk.n)) { save(); refresh(); marketDlg(); } };
  $('mClose').onclick = () => { $('kMarketDlg').hidden = true; };
}

$('kEnd').onclick = endTurnClick;
$('kMarket').onclick = marketDlg;
$('kMenu').onclick = () => { save(); $('kMap').hidden = true; $('kStart').hidden = false; $('kContinue').hidden = false; };

window.addEventListener('keydown', e => {
  if (e.target.closest('input') || $('kMap').hidden) return;
  if (!$('kMarketDlg').hidden) { if (e.key === 'Escape') $('kMarketDlg').hidden = true; return; }
  if (!$('kBattle').hidden || !$('kEndDlg').hidden) return;
  if (e.key === 'Enter') { e.preventDefault(); endTurnClick(); }
  else if (e.key === 'Escape') { sel = null; refresh(); }
  else if (e.key === 'Tab') {
    e.preventDefault();
    const ready = K.armies.filter(a => a.owner === 'player' && a.mp > 0);
    if (!ready.length) return;
    const i = ready.findIndex(a => a.id === sel?.id);
    const a = ready[(i + 1) % ready.length];
    sel = { type: 'army', id: a.id }; view.centerOn(a.r, a.c); refresh();
  }
});

// debug handle for automated checks
window.__kingdom = { get K() { return K; }, onClick: h => onClick(h), endTurn: endTurnClick, select: s => { sel = s; refresh(); } };
