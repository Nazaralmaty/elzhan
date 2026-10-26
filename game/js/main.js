// Arena entry: squad setup screen; battles run in view/battle-screen.js.
import { makeRng } from './core/rng.js';
import { UNITS, ABILITIES, BASIC_UNITS, HEROES } from './data/units.js';
import { createBattle, enemySquad } from './rules/skirmish.js';
import { openBattle, openHelp } from './view/battle-screen.js';
import { figSVG } from './view/art.js';
import { openLane } from './view/lane-view.js';

const $ = id => document.getElementById(id);
const DIF = [{ budget: 13, pen: 0 }, { budget: 17, pen: 0.1 }, { budget: 21, pen: 0.15 }, { budget: 25, pen: 0.2 }];
const STORE = 'aos.arena.setup';
const BLUE = '#2F6FDB';

/* ---------- setup ---------- */
const setup = (() => {
  const d = { hero: 'alden', squad: { swordsman: 2, archer: 1, apprentice: 1 }, foe: 'undead', arena: 'random', dif: 1, seed: rand() };
  try { return { ...d, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return d; }
})();
function rand() { return 10000 + Math.floor(Math.random() * 89999); }
function save() { try { localStorage.setItem(STORE, JSON.stringify(setup)); } catch { /* storage unavailable */ } }
const squadMax = () => setup.hero ? 4 : 5;
const squadCount = () => Object.values(setup.squad).reduce((a, b) => a + b, 0);
const squadList = () => Object.entries(setup.squad).flatMap(([k, n]) => Array(n).fill(k));

function renderSetup() {
  $('heroPick').innerHTML = [...HEROES, null].map(h => {
    const u = h && UNITS[h];
    return `<button type="button" class="pick" data-hero="${h || ''}" aria-pressed="${setup.hero === h}">
      <div class="fig-box">${h ? figSVG(h, BLUE) : '<span style="color:var(--muted);font-weight:800">—</span>'}</div>
      <b>${h ? u.name : 'Без героя'}</b><small>${h ? `${u.branch} · ${ABILITIES[u.abilities[0]].name}, ${ABILITIES[u.abilities[1]].name}` : 'Пятый боец вместо героя'}</small></button>`;
  }).join('');
  const full = squadCount() >= squadMax();
  $('unitPick').innerHTML = BASIC_UNITS.map(k => {
    const u = UNITS[k], n = setup.squad[k] || 0;
    return `<div class="pick"><div class="fig-box">${figSVG(k, BLUE)}</div><b>${u.name}</b>
      <small>ОЗ ${u.hp} · Атк ${u.atk}${u.magic ? '✦' : ''} · Защ ${u.def} · ${u.range > 1 ? 'дальн. ' + u.range : 'ближний'}</small>
      <small>${ABILITIES[u.abilities[0]].name}</small>
      <div class="row"><span class="stepper"><button type="button" data-unit="${k}" data-d="-1" ${n ? '' : 'disabled'} aria-label="Убрать: ${u.name}">−</button><span class="n">${n}</span><button type="button" data-unit="${k}" data-d="1" ${full ? 'disabled' : ''} aria-label="Добавить: ${u.name}">+</button></span></div></div>`;
  }).join('');
  const list = [setup.hero, ...squadList()].filter(Boolean);
  $('squadLine').innerHTML = list.map(k => figSVG(k, BLUE)).join('') + Array(Math.max(0, squadMax() - squadCount())).fill('<span class="empty"></span>').join('');
  $('squadHint').textContent = `· ${squadCount()} из ${squadMax()}`;
  $('start').disabled = squadCount() === 0;
  document.querySelector(`input[name="foe"][value="${setup.foe}"]`).checked = true;
  document.querySelector(`input[name="arena"][value="${setup.arena}"]`).checked = true;
  document.querySelector(`input[name="dif"][value="${setup.dif}"]`).checked = true;
  $('seed').value = setup.seed;
}

$('heroPick').addEventListener('click', e => {
  const b = e.target.closest('[data-hero]'); if (!b) return;
  setup.hero = b.dataset.hero || null;
  while (squadCount() > squadMax()) { const k = Object.keys(setup.squad).find(k => setup.squad[k]); setup.squad[k]--; }
  save(); renderSetup();
});
$('unitPick').addEventListener('click', e => {
  const b = e.target.closest('[data-unit]'); if (!b) return;
  const k = b.dataset.unit, d = +b.dataset.d;
  if (d > 0 && squadCount() >= squadMax()) return;
  setup.squad[k] = Math.max(0, (setup.squad[k] || 0) + d);
  save(); renderSetup();
});
['foe', 'arena', 'dif'].forEach(n => document.querySelectorAll(`input[name="${n}"]`).forEach(i => i.addEventListener('change', () => { setup[n] = n === 'dif' ? +i.value : i.value; save(); })));
$('seed').addEventListener('change', () => { setup.seed = Math.max(1, parseInt($('seed').value, 10) || 1); save(); });
$('reseed').addEventListener('click', () => { setup.seed = rand(); save(); renderSetup(); });
$('start').addEventListener('click', () => startBattle());
let closeLane = null;
$('helpBtn1').addEventListener('click', openHelp);
$('laneBtn').addEventListener('click', () => {
  const player = [setup.hero, ...squadList()].filter(Boolean);
  if (!player.length) return;
  const enemy = enemySquad(makeRng(setup.seed * 7 + 3), setup.foe, DIF[setup.dif].budget);
  $('setup').hidden = true; $('lane').hidden = false;
  closeLane = openLane({ player, enemy, seed: setup.seed, onExit: () => { closeLane?.(); $('lane').hidden = true; $('setup').hidden = false; renderSetup(); } });
});

function startBattle(newSeed) {
  if (newSeed) { setup.seed = rand(); save(); }
  const dif = DIF[setup.dif];
  const enemy = enemySquad(makeRng(setup.seed * 7 + 3), setup.foe, dif.budget);
  const player = [setup.hero, ...squadList()].filter(Boolean);
  if (!player.length) return;
  const st = createBattle({ seed: setup.seed, arena: setup.arena, player, enemy, autoPenalty: dif.pen });
  $('setup').hidden = true;
  openBattle(st, { resultButtons: [
    { label: 'Ещё бой', primary: true, onClick: () => startBattle(true) },
    { label: 'Сменить отряд', onClick: () => { $('setup').hidden = false; renderSetup(); } }
  ] });
}

window.addEventListener('keydown', e => {
  if (e.target.closest('input') || $('setup').hidden || !$('help').hidden) return;
  if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); startBattle(); }
});

renderSetup();
