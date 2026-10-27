// "Стенка на стенку" v5: real-time battle on a field with depth (x along the lane, z across it).
// States are data (FACTIONS): roster, heroes, academy buildings with their research and auto-skills,
// special rules. Gold comes from the safe mine at the fortress and from veins on the field that have
// to be held by the army. The undead also collect souls from every death on the field.
import { makeRng } from '../core/rng.js';

export const FIELD = 1400, ZW = 130, DT = 0.05, BASE_HP = 4500, POP_CAP = 30, BARRAGE_CD = 45;
export const BASE_FRONT = 70;
export const GROUPS = { inf: 'Пехота', rng: 'Стрелки', cav: 'Конница', art: 'Пушки' };
export const COMMANDS = { attack: 'В атаку', hold: 'Держать линию', retreat: 'Отход', flank: 'Обход' };

// b: academy building that unlocks the unit; souls: extra price for the undead elite
export const ROSTER = {
  miner:       { name: 'Рудокоп',       cost: 50,  train: 3,   hp: 40,  speed: 26, miner: true },
  pikeman:     { name: 'Пикинёр',       cost: 45,  train: 3,   hp: 75,  dmg: 8,  cd: 1.1, range: 34,  speed: 22, group: 'inf', vsMounted: 2.4, armor: 0.1, b: 'barracks', desc: 'Дешёвая стена из пик, рвёт конницу и гулей' },
  musketeer:   { name: 'Мушкетёр',      cost: 70,  train: 4,   hp: 50,  dmg: 24, cd: 4,   range: 250, speed: 21, group: 'rng', gun: true, b: 'school', desc: 'Медленная перезарядка, сильный выстрел' },
  cossack:     { name: 'Казак',         cost: 90,  train: 4.5, hp: 95,  dmg: 11, cd: 1,   range: 30,  speed: 52, group: 'cav', mounted: true, vsRanged: 1.7, armor: 0.1, b: 'stable', desc: 'Быстрый, режет стрелков, пушки и рудокопов' },
  cuirassier:  { name: 'Кирасир',       cost: 160, train: 6,   hp: 190, dmg: 17, cd: 1.2, range: 32,  speed: 40, group: 'cav', mounted: true, charge: 2.2, armor: 0.3, b: 'stable', desc: 'Тяжёлая конница, первый удар ×2.2' },
  cannon:      { name: 'Пушка',         cost: 220, train: 8,   hp: 140, dmg: 42, cd: 7,   range: 300, minRange: 70, speed: 13, group: 'art', splash: 40, vsBase: 3, b: 'foundry', desc: 'Ядро бьёт по площади, ломает стены. Вплотную беззащитна' },
  skeleton:    { name: 'Скелет',        cost: 35,  train: 2.4, hp: 55,  dmg: 8,  cd: 1,   range: 30,  speed: 22, group: 'inf', b: 'crypt', desc: 'Дешёвая пехота, собирается толпой' },
  ghoul:       { name: 'Гуль',          cost: 85,  train: 3.5, hp: 85,  dmg: 12, cd: 0.85, range: 28, speed: 46, group: 'cav', vsRanged: 1.8, b: 'lair', desc: 'Быстрый, охотится на стрелков и рудокопов' },
  acolyte:     { name: 'Послушник',     cost: 90,  train: 4,   hp: 50,  dmg: 10, cd: 2.5, range: 210, speed: 20, group: 'rng', magic: true, raise: 0.04, b: 'shrine', desc: 'Магия сквозь броню, поднимает павших' },
  deathknight: { name: 'Рыцарь смерти', cost: 130, souls: 4, train: 6, hp: 210, dmg: 18, cd: 1.2, range: 32, speed: 38, group: 'cav', mounted: true, charge: 2.2, armor: 0.3, b: 'blackstable', desc: 'Тяжёлый всадник, первый удар ×2.2' },
  bonecaster:  { name: 'Костомёт',      cost: 160, souls: 5, train: 8, hp: 150, dmg: 38, cd: 7, range: 290, minRange: 70, speed: 12, group: 'art', splash: 40, vsBase: 3, b: 'boneworks', desc: 'Метает кости по площади' },
  alden:       { name: 'Сэр Альден',    cost: 260, train: 6,   hp: 480, dmg: 24, cd: 1,   range: 32,  speed: 24, group: 'inf', armor: 0.3, hero: true, desc: 'Стойкий рыцарь с двуручным мечом' },
  irena:       { name: 'Ирена',         cost: 260, train: 6,   hp: 260, dmg: 30, cd: 2.6, range: 260, speed: 22, group: 'rng', magic: true, splash: 55, hero: true, desc: 'Огненный шар по площади' },
  corvin:      { name: 'Корвин',        cost: 260, train: 6,   hp: 300, dmg: 34, cd: 1.8, range: 330, speed: 26, group: 'rng', gun: true, hero: true, desc: 'Меткий дальний стрелок' },
  morven:      { name: 'Морвен',        cost: 280, train: 6,   hp: 300, dmg: 22, cd: 2.4, range: 240, speed: 22, group: 'rng', magic: true, splash: 50, raise: 0.12, hero: true, desc: 'Некромант: мёртвый огонь по площади, поднимает павших пачками' },
  tarn:        { name: 'Тарн',          cost: 240, train: 6,   hp: 250, dmg: 18, cd: 1.6, range: 260, speed: 24, group: 'rng', magic: true, slow: 0.45, hero: true, desc: 'Ученик Морвена: лёд замедляет врага почти вдвое' },
  bonelord:    { name: 'Костяной лорд', cost: 260, train: 6,   hp: 520, dmg: 26, cd: 1.1, range: 32,  speed: 22, group: 'inf', armor: 0.35, aura: 1.35, hero: true, desc: 'Танк в первой шеренге: скелеты рядом бьют на 35% сильнее' }
};

// Academy buildings. pre: stands from the start. ups: research in this building (one at a time per building).
export const BUILDINGS = {
  barracks:    { name: 'Казарма',          icon: '⚔', pre: true, ups: ['longpikes', 'quilted', 'hedgehog'] },
  school:      { name: 'Стрелковая школа', icon: '🎯', cost: 160, time: 22, ups: ['rifled', 'bayonets', 'rankvolley'] },
  stable:      { name: 'Конюшня',          icon: '🐎', cost: 220, time: 26, ups: ['sabres', 'horses', 'raid', 'ram'] },
  foundry:     { name: 'Литейня',          icon: '🔥', cost: 320, time: 34, ups: ['carriages', 'powder', 'grapeshot'] },
  fort:        { name: 'Крепость',         icon: '🏰', pre: true, ups: ['bastions', 'wallguns', 'repair'] },
  office:      { name: 'Рудничная контора', icon: '⛏', cost: 100, time: 16, ups: ['picks', 'carts', 'militia'] },
  crypt:       { name: 'Склеп',            icon: '⚰', pre: true, ups: ['boneblades', 'coffinshields', 'reassemble'] },
  lair:        { name: 'Логово',           icon: '🦴', cost: 150, time: 22, ups: ['claws', 'frenzy', 'devour'] },
  shrine:      { name: 'Капище',           icon: '🕯', cost: 180, time: 24, ups: ['darkpower', 'farcall', 'massraise'] },
  blackstable: { name: 'Чёрная конюшня',   icon: '🐴', cost: 240, time: 28, ups: ['cursedplate', 'ghosthorses', 'dread'] },
  boneworks:   { name: 'Костоломня',       icon: '💀', cost: 300, time: 32, ups: ['heavybones', 'bonewheels', 'plague'] },
  citadel:     { name: 'Цитадель',         icon: '🏯', pre: true, ups: ['blackwalls', 'cryptguns', 'regrow'] },
  gravepit:    { name: 'Могильный двор',   icon: '⛏', cost: 100, time: 16, ups: ['spades', 'bonecarts', 'deadgrip'] }
};

// One level each. mods: { kinds, hp, dmg, armor, range, speed, cd, splash } multipliers (+0.2 = +20%) except armor/range (absolute).
// skill: an auto-ability the units use on their own; the same skill id can belong to several states.
const M = (kinds, o) => ({ kinds, ...o });
export const UPGRADES = {
  longpikes:     { name: 'Длинные пики',     icon: '🔱', cost: 140, time: 20, mods: M(['pikeman'], { range: 14, dmg: 0.15 }), desc: 'Пикинёры достают дальше и бьют на 15% сильнее' },
  quilted:       { name: 'Стёганки',         icon: '🧥', cost: 140, time: 20, mods: M(['pikeman'], { armor: 0.12, hp: 0.2 }), desc: 'Пикинёры: броня +12%, здоровье +20%' },
  hedgehog:      { name: 'Ёж',               icon: '🦔', cost: 200, time: 26, skill: 'hedgehog', desc: 'Сами: при виде конницы пикинёры встают в стойку — ×2 урона по всадникам, натиск по ним не проходит, но стоят на месте' },
  rifled:        { name: 'Нарезные стволы',  icon: '🎯', cost: 160, time: 22, mods: M(['musketeer'], { range: 60 }), desc: 'Мушкетёры стреляют дальше и точнее' },
  bayonets:      { name: 'Штыки',            icon: '🗡', cost: 120, time: 18, skill: 'bayonets', desc: 'Сами: если враг вплотную, мушкетёр колет штыком, а не перезаряжает' },
  rankvolley:    { name: 'Залп шеренгой',    icon: '💥', cost: 220, time: 28, skill: 'volley', desc: 'Сами: когда рядом 5+ заряженных мушкетёров, они бьют залпом, +40% урона' },
  sabres:        { name: 'Сабли',            icon: '⚔', cost: 160, time: 22, mods: M(['cossack', 'cuirassier'], { dmg: 0.25 }), desc: 'Конница: урон +25%' },
  horses:        { name: 'Породистые кони',  icon: '🐎', cost: 200, time: 26, mods: M(['cossack', 'cuirassier'], { hp: 0.2, speed: 0.1 }), desc: 'Конница: здоровье +20%, скорость +10%' },
  raid:          { name: 'Набег',            icon: '🏹', cost: 180, time: 24, skill: 'raid', kinds: ['cossack'], desc: 'Сами: казаки срываются на вражеских рудокопов в пределах 350 шагов' },
  ram:           { name: 'Таран',            icon: '🐂', cost: 220, time: 28, skill: 'ram', desc: 'Сами: натиск кирасира проламывает шеренгу — бьёт и отбрасывает всех рядом с целью' },
  carriages:     { name: 'Лафеты',           icon: '🛞', cost: 140, time: 20, mods: M(['cannon'], { speed: 0.5, hp: 0.25 }), desc: 'Пушки: скорость +50%, прочность +25%' },
  powder:        { name: 'Порох',            icon: '🧨', cost: 200, time: 26, mods: M(['cannon', 'musketeer'], { dmg: 0.15, cd: -0.1 }), desc: 'Пушки и мушкетёры: урон +15%, перезарядка −10%' },
  grapeshot:     { name: 'Картечь',          icon: '💣', cost: 220, time: 28, skill: 'grapeshot', desc: 'Сами: если враг подошёл вплотную, пушка бьёт картечью веером' },
  bastions:      { name: 'Бастионы',         icon: '🏰', cost: 200, time: 26, fort: { hp: 600 }, desc: 'Крепость +600 прочности' },
  wallguns:      { name: 'Пушки на стенах',  icon: '🔫', cost: 220, time: 28, fort: { turret: 0.6, reach: 100 }, desc: 'Пушки крепости: урон +60%, бьют на 100 шагов дальше' },
  repair:        { name: 'Ремонт',           icon: '🔨', cost: 180, time: 24, skill: 'repair', desc: 'Сами: стены чинятся по 5 в секунду, пока у крепости нет врагов' },
  picks:         { name: 'Стальные кирки',   icon: '⛏', cost: 120, time: 18, econ: { dig: 0.35 }, desc: 'Рудокопы копают на 35% быстрее — и в руднике, и на жилах' },
  carts:         { name: 'Тачки',            icon: '🛒', cost: 150, time: 20, econ: { carry: 0.5, safe: 2 }, desc: 'Рудокоп несёт +50%, в руднике у крепости +2 места' },
  militia:       { name: 'Ополчение',        icon: '⚒', cost: 160, time: 22, skill: 'militia', desc: 'Сами: рудокопы отбиваются кирками от одного-двух налётчиков, а не бегут' },
  boneblades:    { name: 'Костяные клинки',  icon: '🗡', cost: 120, time: 18, mods: M(['skeleton'], { dmg: 0.25 }), desc: 'Скелеты: урон +25%' },
  coffinshields: { name: 'Гробовые щиты',    icon: '🛡', cost: 140, time: 20, mods: M(['skeleton'], { armor: 0.15, hp: 0.2 }), desc: 'Скелеты: броня +15%, здоровье +20%' },
  reassemble:    { name: 'Собраться снова',  icon: '☠', cost: 200, time: 26, skill: 'reassemble', desc: 'Сами: павший скелет с шансом 30% встаёт снова с половиной здоровья' },
  claws:         { name: 'Когти',            icon: '🩸', cost: 150, time: 22, mods: M(['ghoul'], { dmg: 0.25 }), desc: 'Гули: урон +25%' },
  frenzy:        { name: 'Жажда',            icon: '💨', cost: 160, time: 22, mods: M(['ghoul'], { speed: 0.15, hp: 0.15 }), desc: 'Гули: скорость +15%, здоровье +15%' },
  devour:        { name: 'Пожирание',        icon: '🍖', cost: 180, time: 24, skill: 'devour', desc: 'Сами: гуль, убив врага, лечит 40% здоровья и даёт лишнюю душу' },
  darkpower:     { name: 'Тёмная сила',      icon: '🌑', cost: 160, time: 22, mods: M(['acolyte'], { dmg: 0.25 }), desc: 'Послушники: урон +25%' },
  farcall:       { name: 'Дальний зов',      icon: '📿', cost: 140, time: 20, mods: M(['acolyte'], { range: 50 }), desc: 'Послушники бьют на 50 шагов дальше' },
  massraise:     { name: 'Великий подъём',   icon: '⚰', cost: 220, time: 28, skill: 'massraise', desc: 'Сами: послушники поднимают павших втрое чаще' },
  cursedplate:   { name: 'Проклятые латы',   icon: '🛡', cost: 200, time: 26, mods: M(['deathknight'], { armor: 0.1, hp: 0.2 }), desc: 'Рыцари смерти: броня +10%, здоровье +20%' },
  ghosthorses:   { name: 'Призрачные кони',  icon: '👻', cost: 200, time: 26, mods: M(['deathknight'], { speed: 0.15, dmg: 0.15 }), desc: 'Рыцари смерти: скорость и урон +15%' },
  dread:         { name: 'Аура ужаса',       icon: '😱', cost: 220, time: 28, skill: 'dread', desc: 'Сами: враги рядом с рыцарем смерти бьют на 20% слабее' },
  heavybones:    { name: 'Тяжёлые кости',    icon: '🦴', cost: 200, time: 26, mods: M(['bonecaster'], { dmg: 0.2, splash: 0.2 }), desc: 'Костомёты: урон и площадь +20%' },
  bonewheels:    { name: 'Костяные колёса',  icon: '🛞', cost: 140, time: 20, mods: M(['bonecaster'], { speed: 0.5, hp: 0.25 }), desc: 'Костомёты: скорость +50%, прочность +25%' },
  plague:        { name: 'Мор',              icon: '☣', cost: 220, time: 28, skill: 'plague', desc: 'Сами: там, куда упали кости, 4 секунды висит мор и жжёт врагов сквозь броню' },
  blackwalls:    { name: 'Чёрные стены',     icon: '🏯', cost: 200, time: 26, fort: { hp: 600 }, desc: 'Цитадель +600 прочности' },
  cryptguns:     { name: 'Глаза склепа',     icon: '👁', cost: 220, time: 28, fort: { turret: 0.6, reach: 100 }, desc: 'Цитадель бьёт на 60% сильнее и на 100 шагов дальше' },
  regrow:        { name: 'Срастание',        icon: '🔮', cost: 180, time: 24, skill: 'repair', desc: 'Сами: стены цитадели срастаются по 5 в секунду, пока рядом нет врагов' },
  spades:        { name: 'Лопаты',           icon: '⛏', cost: 120, time: 18, econ: { dig: 0.35 }, desc: 'Могильщики копают на 35% быстрее' },
  bonecarts:     { name: 'Костяные тачки',   icon: '🛒', cost: 150, time: 20, econ: { carry: 0.5, safe: 2 }, desc: 'Могильщик несёт +50%, у цитадели +2 места' },
  deadgrip:      { name: 'Мёртвая хватка',   icon: '✋', cost: 160, time: 22, skill: 'militia', desc: 'Сами: могильщики отбиваются от одного-двух налётчиков' }
};
// research takes a while: a battle affords about two thirds of the tree
for (const U of Object.values(UPGRADES)) U.time = Math.round(U.time * 1.2);
for (const [k, B] of Object.entries(BUILDINGS)) for (const u of B.ups) UPGRADES[u].at = k;

// States. Adding one = a new entry here plus its units/buildings/upgrades above (and models in the view).
export const FACTIONS = {
  human: {
    name: 'Королевство', fortress: 'Крепость', miner: 'Рудокоп', barrage: 'Залп крепости', heal: 7,
    roster: ['pikeman', 'musketeer', 'cossack', 'cuirassier', 'cannon'], heroes: ['alden', 'irena', 'corvin'],
    buildings: ['barracks', 'school', 'stable', 'foundry', 'office', 'fort']
  },
  undead: {
    name: 'Нежить Морвена', fortress: 'Цитадель', miner: 'Могильщик', barrage: 'Костяной дождь', heal: 0, souls: true,
    roster: ['skeleton', 'ghoul', 'acolyte', 'deathknight', 'bonecaster'], heroes: ['morven', 'tarn', 'bonelord'],
    buildings: ['crypt', 'lair', 'shrine', 'blackstable', 'boneworks', 'gravepit', 'citadel']
  }
};
export const ROSTERS = Object.fromEntries(Object.entries(FACTIONS).map(([k, F]) => [k, F.roster]));

// Veins on the field (player-side x); the safe mine sits at each fortress.
export const VEINS = [
  { id: 0, x: 440, z: 85, cap: 3, rate: 0.85, name: 'Ближняя жила' },
  { id: 1, x: 700, z: 92, cap: 4, rate: 1.2, name: 'Богатая жила' },
  { id: 2, x: 960, z: 85, cap: 3, rate: 0.85, name: 'Дальняя жила' }
];
const START_GOLD = 260, INCOME = 2, CARRY = 10, MINE_TIME = 4.2, SAFE_CAP = 6;

// AI levels: reaction time, chance to answer the player's army, income, aggression 0..3
export const AI_LEVELS = [
  { name: 'Оруженосец', react: 4.5, counter: 0, income: 0.8, aggr: 0 },
  { name: 'Рыцарь', react: 2.5, counter: 0.5, income: 1, aggr: 1 },
  { name: 'Лорд', react: 1, counter: 1, income: 1, aggr: 2 },
  { name: 'Король', react: 0.25, counter: 1, income: 1.1, aggr: 3, anticipate: true }
];

const dirOf = side => side === 'player' ? 1 : -1;
export const foe = side => side === 'player' ? 'enemy' : 'player';
export const baseX = side => side === 'player' ? 0 : FIELD;
export const mineAt = side => ({ x: side === 'player' ? 150 : FIELD - 150, z: -100 });
export const dropAt = side => ({ x: side === 'player' ? 55 : FIELD - 55, z: -40 });
export const veinAt = (v, side) => ({ x: side === 'player' ? v.x : FIELD - v.x, z: v.z });
const fromBase = (side, d) => side === 'player' ? d : FIELD - d;
const DEFAULT_LINE = { inf: 400, rng: 340, cav: 290, art: 250 };

function makeSide(faction, hero, income, ai) {
  const F = FACTIONS[faction];
  return {
    faction, gold: START_GOLD, souls: 0, baseHp: BASE_HP, baseMax: BASE_HP, queue: [], train: 0, roster: F.roster, hero, heroBought: false, incomeMult: income, ai,
    cmd: { inf: 'hold', rng: 'hold', cav: 'hold', art: 'hold' }, line: { ...DEFAULT_LINE },
    bld: Object.fromEntries(F.buildings.map(k => [k, BUILDINGS[k].pre ? { done: true } : null])),
    up: {}, research: {}, skills: new Set(), stat: {}, econ: { dig: 0, carry: 0, safe: 0 }, fort: { turret: 0, reach: 0 },
    barrageCd: 15, turretCd: 0, mined: 0, kills: 0, losses: 0, aiT: 0
  };
}

// player / enemy: faction keys; ai: AI level index per side (null = human player)
export function createLane({ player = 'human', enemy = 'undead', hero = null, enemyHero = null, seed = 1, enemyLevel = 1, playerLevel = null } = {}) {
  const lvl = i => i == null ? null : AI_LEVELS[i];
  const st = {
    t: 0, over: null, units: [], shots: [], clouds: [], nextId: 1, events: [], rng: makeRng(seed),
    sides: {
      player: makeSide(player, hero, lvl(playerLevel)?.income ?? 1, lvl(playerLevel)),
      enemy: makeSide(enemy, enemyHero, lvl(enemyLevel)?.income ?? 1, lvl(enemyLevel))
    },
    faction: { player, enemy }, slotTimer: 0, mineTimer: 0
  };
  for (const side of ['player', 'enemy']) for (let i = 0; i < 2; i++) spawn(st, side, 'miner');
  return st;
}

export const alive = (st, side) => st.units.filter(u => u.hp > 0 && (!side || u.side === side));
export const miners = (st, side) => alive(st, side).filter(u => ROSTER[u.kind].miner);
export const fighters = (st, side) => alive(st, side).filter(u => !ROSTER[u.kind].miner);
export const safeCap = S => SAFE_CAP + S.econ.safe;
export const maxMiners = S => safeCap(S) + VEINS.reduce((a, v) => a + v.cap, 0);
export const maxQueue = () => 5;
export const income = (st, side) => INCOME * st.sides[side].incomeMult;
export const carryOf = S => Math.round(CARRY * (1 + S.econ.carry));
export const mineTime = S => MINE_TIME / (1 + S.econ.dig);
export const trainTime = (S, kind) => ROSTER[kind].train;
export const hasSkill = (S, skill) => S.skills.has(skill);
export const built = (S, b) => !!S.bld[b]?.done;
export const unlocked = (S, kind) => !ROSTER[kind].b || built(S, ROSTER[kind].b);
const veinRate = (S, v) => v.rate * (1 + S.econ.dig) * S.incomeMult;
// estimated gold per second: passive + miners at the safe mine + miners on veins
export function goldRate(st, side) {
  const S = st.sides[side], m = mineAt(side), d = dropAt(side);
  const trip = 2 * Math.hypot(m.x - d.x, m.z - d.z) / ROSTER.miner.speed + mineTime(S);
  let r = income(st, side);
  for (const u of miners(st, side)) r += u.vein != null ? (u.state === 'vdig' ? veinRate(S, VEINS[u.vein]) : 0) : carryOf(S) * S.incomeMult / trip;
  return r;
}

/* ---------- unit stats with research ---------- */
function stat(S, kind) {
  let s = S.stat[kind];
  if (s) return s;
  const R = ROSTER[kind];
  s = { hp: R.hp || 0, dmg: R.dmg || 0, armor: R.armor || 0, range: R.range || 0, speed: R.speed, cd: R.cd || 1, splash: R.splash || 0 };
  for (const k of Object.keys(S.up)) {
    const m = UPGRADES[k].mods;
    if (!m || !m.kinds.includes(kind)) continue;
    if (m.hp) s.hp *= 1 + m.hp;
    if (m.dmg) s.dmg *= 1 + m.dmg;
    if (m.armor) s.armor += m.armor;
    if (m.range) s.range += m.range;
    if (m.speed) s.speed *= 1 + m.speed;
    if (m.cd) s.cd *= 1 + m.cd;
    if (m.splash) s.splash *= 1 + m.splash;
  }
  s.hp = Math.round(s.hp); s.armor = Math.min(0.75, s.armor);
  return (S.stat[kind] = s);
}
export const statOf = (st, side, kind) => stat(st.sides[side], kind);

export function canBuy(st, side, kind) {
  const S = st.sides[side], R = ROSTER[kind];
  if (!R || st.over) return 'Бой окончен';
  if (kind !== 'miner' && !S.roster.includes(kind) && kind !== S.hero) return 'Недоступно';
  if (!unlocked(S, kind)) return `Нужно здание «${BUILDINGS[R.b].name}»`;
  if (kind === S.hero && (S.heroBought || S.queue.includes(kind))) return 'Герой уже в бою';
  if (kind === 'miner' && miners(st, side).length + S.queue.filter(k => k === 'miner').length >= maxMiners(S)) return 'Все места в руднике и на жилах заняты';
  if (S.queue.length >= maxQueue(S)) return 'Очередь полна';
  if (kind !== 'miner' && fighters(st, side).length + S.queue.filter(k => k !== 'miner').length >= POP_CAP) return 'Армия на пределе';
  if (S.gold < R.cost) return 'Мало золота';
  if (R.souls && S.souls < R.souls) return 'Мало душ';
  return '';
}

export function buy(st, side, kind) {
  if (canBuy(st, side, kind)) return false;
  const S = st.sides[side];
  S.gold -= ROSTER[kind].cost;
  S.souls -= ROSTER[kind].souls || 0;
  S.queue.push(kind);
  if (kind === S.hero) S.heroBought = true;
  return true;
}

/* ---------- buildings and research ---------- */
export function canBuild(st, side, key) {
  const S = st.sides[side], B = BUILDINGS[key];
  if (st.over) return 'Бой окончен';
  if (!B || !(key in S.bld)) return 'Недоступно';
  if (S.bld[key]?.done) return 'Уже построено';
  if (S.bld[key]) return 'Строится';
  if (S.gold < B.cost) return 'Мало золота';
  return '';
}
export function build(st, side, key) {
  if (canBuild(st, side, key)) return false;
  const S = st.sides[side];
  S.gold -= BUILDINGS[key].cost;
  S.bld[key] = { t: 0, T: BUILDINGS[key].time };
  return true;
}
export function upgradeCost(S, key) {
  const U = UPGRADES[key];
  return S.up[key] ? null : { gold: U.cost, time: U.time };
}
export function canResearch(st, side, key) {
  const S = st.sides[side], U = UPGRADES[key];
  if (st.over) return 'Бой окончен';
  if (!U || !(U.at in S.bld)) return 'Недоступно';
  if (S.up[key]) return 'Изучено';
  if (!built(S, U.at)) return `Нужно здание «${BUILDINGS[U.at].name}»`;
  if (S.research[U.at]) return S.research[U.at].key === key ? 'Изучается' : 'Здание занято другим исследованием';
  if (S.gold < U.cost) return 'Мало золота';
  return '';
}
export function research(st, side, key) {
  if (canResearch(st, side, key)) return false;
  const S = st.sides[side], U = UPGRADES[key];
  S.gold -= U.cost;
  S.research[U.at] = { key, t: 0, T: U.time };
  return true;
}
function applyUpgrade(st, side, key) {
  const S = st.sides[side], U = UPGRADES[key];
  S.up[key] = 1;
  S.stat = {};
  if (U.skill) S.skills.add(U.skill);
  if (U.econ) for (const k in U.econ) S.econ[k] += U.econ[k];
  if (U.fort?.hp) { S.baseMax += U.fort.hp; S.baseHp += U.fort.hp; }
  if (U.fort?.turret) { S.fort.turret += U.fort.turret; S.fort.reach += U.fort.reach; }
  // living units of the improved kinds get the new health at once
  if (U.mods?.hp) for (const u of alive(st, side)) if (U.mods.kinds.includes(u.kind)) { const k = 1 + U.mods.hp; u.maxHp = Math.round(u.maxHp * k); u.hp *= k; }
  st.events.push({ t: 'upgrade', side, key });
}

export function setCommand(st, side, group, cmd) {
  const S = st.sides[side];
  if (!COMMANDS[cmd] || (cmd === 'flank' && group !== 'cav')) return false;
  for (const g of group === 'all' ? Object.keys(GROUPS) : [group]) S.cmd[g] = cmd === 'flank' && g !== 'cav' ? 'attack' : cmd;
  return true;
}

// x in field coordinates; the line is kept between the own fortress and well past the middle of the field
export function setLine(st, side, group, x) {
  const S = st.sides[side], d = side === 'player' ? x : FIELD - x;
  for (const g of group === 'all' ? Object.keys(GROUPS) : [group]) {
    S.line[g] = Math.max(140, Math.min(FIELD * 0.72, d - (group === 'all' ? DEFAULT_LINE.inf - DEFAULT_LINE[g] : 0)));
    S.cmd[g] = 'hold';
  }
}

function spawn(st, side, kind) {
  const R = ROSTER[kind], S = st.sides[side];
  const x = fromBase(side, R.miner ? 60 : 80 + st.rng.next() * 20), z = R.miner ? -50 + st.rng.next() * 20 : -40 + st.rng.next() * 80;
  const hp = R.miner ? R.hp : stat(S, kind).hp;
  const u = { id: st.nextId++, kind, side, x, z, hp, maxHp: hp, cd: 0, facing: dirOf(side) > 0 ? 0 : Math.PI, moving: false, charged: true, idle: 0, slotZ: z, rank: 0, carry: 0, work: 0, vein: null, state: R.miner ? 'toMine' : 'fight' };
  st.units.push(u);
  st.events.push({ t: 'spawn', id: u.id });
  return u;
}

/* ---------- combat ---------- */
function near(st, x, z, r, f) { for (const o of st.units) if (o.hp > 0 && f(o) && Math.abs(o.x - x) <= r && Math.hypot(o.x - x, o.z - z) <= r) return o; return null; }
function countNear(st, x, z, r, f) { let n = 0; for (const o of st.units) if (o.hp > 0 && f(o) && Math.abs(o.x - x) <= r && Math.hypot(o.x - x, o.z - z) <= r) n++; return n; }

function hurt(st, u, dmg, attacker) {
  const S = st.sides[u.side];
  let d = dmg;
  const magic = attacker && (attacker.magic || ROSTER[attacker.kind]?.magic);
  if (!magic && !ROSTER[u.kind].miner) d *= 1 - stat(S, u.kind).armor;
  // dread: attackers standing near an enemy death knight hit weaker
  if (attacker?.id && hasSkill(S, 'dread') && near(st, attacker.x, attacker.z, 70, o => o.side === u.side && o.kind === 'deathknight')) d *= 0.8;
  u.hp -= d;
  if (attacker) { u.lastHitBy = attacker.side; u.lastHitKind = attacker.kind; u.lastHitId = attacker.id; }
  st.events.push({ t: 'hit', id: u.id, dmg: Math.round(d) });
}

function damageOf(st, u, target) {
  const R = ROSTER[u.kind], S = st.sides[u.side];
  let dmg = stat(S, u.kind).dmg;
  if (target && !target.base) {
    const T = ROSTER[target.kind];
    if (R.vsMounted && T.group === 'cav') dmg *= R.vsMounted * (u.brace ? 2 : 1);
    if (R.vsRanged && (T.group === 'rng' || T.group === 'art')) dmg *= R.vsRanged;
  }
  // the bone lord drives nearby skeletons
  if (u.kind === 'skeleton' && near(st, u.x, u.z, 110, o => o.side === u.side && ROSTER[o.kind].aura)) dmg *= ROSTER.bonelord.aura;
  return dmg;
}

function strike(st, u, target, dist) {
  const R = ROSTER[u.kind], S = st.sides[u.side], s = stat(S, u.kind);
  u.cd = s.cd * (0.9 + st.rng.next() * 0.2);
  u.facing = Math.atan2(-(target.z - u.z), target.x - u.x);
  u.fired = st.t;
  if (R.splash) {
    // projectile: lands after a flight, scatter grows with distance
    const spread = R.hero ? 6 : 10 + dist * 0.05;
    const tx = target.x + (st.rng.next() - 0.5) * spread * 2, tz = target.z + (st.rng.next() - 0.5) * spread * 2;
    const T = R.hero ? dist / 380 : 0.45 + dist / 340;
    st.shots.push({ id: st.nextId++, from: u.id, side: u.side, kind: u.kind, x0: u.x, z0: u.z, x: tx, z: tz, t: 0, T, dmg: damageOf(st, u, null), r: s.splash, vsBase: R.vsBase || 1, magic: !!R.magic, plague: u.kind === 'bonecaster' && hasSkill(S, 'plague') });
    st.events.push({ t: 'shoot', id: u.id, kind: u.kind, x: tx, z: tz, T });
    return;
  }
  if (target.base) {
    st.sides[target.side].baseHp -= damageOf(st, u, target) * (R.vsBase || 1) * (R.gun || R.magic ? 0.6 : 0.5);
    st.events.push({ t: 'baseHit', side: target.side, by: u.id, ranged: !!(R.gun || R.magic), magic: !!R.magic });
    return;
  }
  if (R.gun) {
    let dmg = damageOf(st, u, target);
    // rank volley: five loaded muskets side by side fire together
    if (u.kind === 'musketeer' && hasSkill(S, 'volley') && countNear(st, u.x, u.z, 140, o => o.side === u.side && o.kind === 'musketeer' && o.cd < 0.6) >= 5) { dmg *= 1.4; st.events.push({ t: 'volley', id: u.id }); }
    const hit = st.rng.next() < (S.up.rifled ? 0.97 : 0.93) - 0.45 * Math.min(1, dist / s.range);
    st.events.push({ t: 'fire', id: u.id, to: target.id, hit });
    if (hit) hurt(st, target, dmg, u);
    return;
  }
  let dmg = damageOf(st, u, target);
  const braced = target.brace && ROSTER[u.kind].group === 'cav';
  if (R.charge && u.charged && !braced) {
    dmg *= R.charge;
    st.events.push({ t: 'charge', id: u.id });
    // ram: the charge breaks the rank around the target and throws it back
    if (u.kind === 'cuirassier' && hasSkill(S, 'ram')) {
      const dir = dirOf(u.side);
      for (const o of st.units) if (o.hp > 0 && o.side !== u.side && o !== target && !ROSTER[o.kind].miner && Math.hypot(o.x - target.x, o.z - target.z) < 30) { hurt(st, o, dmg * 0.5, u); o.x += dir * 14; }
      target.x += dir * 18;
    }
  }
  u.charged = false;
  st.events.push({ t: R.magic ? 'bolt' : 'melee', id: u.id, to: target.id });
  hurt(st, target, dmg, u);
  if (R.slow) target.slowT = 3;
}

// bayonet or grapeshot at close range instead of the normal attack
function closeQuarters(st, u, S) {
  if (u.cd > 0) return false;
  if (u.kind === 'musketeer' && hasSkill(S, 'bayonets')) {
    const e = near(st, u.x, u.z, 40, o => o.side !== u.side && o.state !== 'garrison' && !o.hidden);
    if (!e) return false;
    u.cd = 1.2; u.facing = Math.atan2(-(e.z - u.z), e.x - u.x);
    st.events.push({ t: 'melee', id: u.id, to: e.id });
    hurt(st, e, 12, u);
    return true;
  }
  if (u.kind === 'cannon' && hasSkill(S, 'grapeshot')) {
    const dir = dirOf(u.side);
    const e = near(st, u.x, u.z, 110, o => o.side !== u.side && o.state !== 'garrison' && !ROSTER[o.kind].miner && (o.x - u.x) * dir > -10);
    if (!e) return false;
    u.cd = 3.5; u.facing = dir > 0 ? 0 : Math.PI; u.fired = st.t;
    for (const o of st.units) if (o.hp > 0 && o.side !== u.side && (o.x - u.x) * dir > -10 && Math.hypot(o.x - u.x, o.z - u.z) < 120 && Math.abs(o.z - u.z) < 70) hurt(st, o, 24, u);
    st.events.push({ t: 'grape', id: u.id, x: u.x + dir * 60, z: u.z });
    return true;
  }
  return false;
}

function landShot(st, s) {
  const enemies = alive(st, foe(s.side));
  st.events.push({ t: 'boom', x: s.x, z: s.z, r: s.r, kind: s.kind, magic: s.magic });
  for (const o of enemies) {
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d <= s.r) hurt(st, o, s.dmg * (1 - 0.5 * d / s.r), { kind: s.kind, side: s.side, magic: s.magic });
  }
  if (s.plague) st.clouds.push({ side: s.side, x: s.x, z: s.z, r: 40, t: 4 });
  const bx = baseX(foe(s.side));
  if (Math.abs(s.x - bx) < BASE_FRONT + s.r * 0.5 && Math.abs(s.z) < 90) {
    st.sides[foe(s.side)].baseHp -= s.dmg * s.vsBase * 0.6;
    st.events.push({ t: 'baseHit', side: foe(s.side), ranged: true });
  }
}

// Closest enemy within reach; cavalry that flanks or hunts prefers shooters and guns, raiders prefer miners.
function pickTarget(st, u, reach, raid) {
  const R = ROSTER[u.kind], S = st.sides[u.side], hunt = S.cmd.cav === 'flank' && R.group === 'cav' || R.vsRanged;
  let best = null, bs = Infinity;
  for (const o of st.units) {
    if (o.hp <= 0 || o.side === u.side || o.state === 'garrison' || o.hidden) continue;
    const d = Math.hypot(o.x - u.x, o.z - u.z);
    const O = ROSTER[o.kind];
    if (d > (raid && O.miner ? 350 : reach)) continue;
    let score = d;
    if (hunt && (O.group === 'rng' || O.group === 'art')) score -= 120;
    if (raid && O.miner) score -= 400;
    if (R.minRange && d < R.minRange) continue;
    if (score < bs) { bs = score; best = o; }
  }
  return best;
}

function baseTarget(st, u) {
  const bx = baseX(foe(u.side)), d = Math.max(0, Math.abs(u.x - bx) - BASE_FRONT) + Math.max(0, Math.abs(u.z) - 80) * 0.5;
  return { base: true, side: foe(u.side), x: bx - dirOf(u.side) * BASE_FRONT, z: Math.max(-60, Math.min(60, u.z)), d };
}

function speedOf(st, u) {
  const R = ROSTER[u.kind];
  return (R.miner ? R.speed : stat(st.sides[u.side], u.kind).speed) * (u.slowT > 0 ? 0.55 : 1);
}
function moveToward(st, u, tx, tz, speedMul = 1) {
  const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
  if (d < 2) return false;
  const v = speedOf(st, u) * speedMul * DT;
  const k = Math.min(1, v / d);
  u.x += dx * k; u.z += dz * k;
  u.facing = Math.atan2(-dz, dx);
  u.moving = true;
  return true;
}

function separate(st) {
  const list = st.units.filter(u => u.hp > 0 && u.state !== 'garrison' && u.state !== 'inMine' && !u.hidden);
  for (let i = 0; i < list.length; i++) {
    const a = list[i], ra = ROSTER[a.kind].mounted || ROSTER[a.kind].group === 'art' ? 13 : 9;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], rb = ROSTER[b.kind].mounted || ROSTER[b.kind].group === 'art' ? 13 : 9;
      const dx = b.x - a.x, dz = b.z - a.z, min = ra + rb;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d >= min) continue;
      const push = (min - d) * 0.25, nx = dx / d, nz = dz / d;
      const wa = ROSTER[a.kind].miner || a.brace ? 0.2 : 1, wb = ROSTER[b.kind].miner || b.brace ? 0.2 : 1;
      a.x -= nx * push * wb; a.z -= nz * push * wb; b.x += nx * push * wa; b.z += nz * push * wa;
    }
  }
  for (const u of list) { u.z = Math.max(-ZW, Math.min(ZW, u.z)); u.x = Math.max(10, Math.min(FIELD - 10, u.x)); }
}

// Spread each branch into ranks across the depth of the field.
function assignSlots(st) {
  for (const side of ['player', 'enemy']) for (const g of Object.keys(GROUPS)) {
    const list = fighters(st, side).filter(u => ROSTER[u.kind].group === g).sort((a, b) => a.z - b.z || a.id - b.id);
    const perRank = g === 'cav' ? 8 : g === 'art' ? 6 : 11;
    list.forEach((u, i) => {
      const rank = Math.floor(i / perRank), inRank = Math.min(perRank, list.length - rank * perRank), k = i % perRank;
      const gap = g === 'cav' || g === 'art' ? 28 : 21;
      u.slotZ = (k - (inRank - 1) / 2) * gap + (rank % 2 ? gap / 2 : 0);
      u.rank = rank;
    });
  }
}

/* ---------- veins ---------- */
// A vein is safe for a side when no enemy soldier stands near it and the side's line or soldiers cover it.
export function veinSafe(st, side, v) {
  const p = veinAt(v, side), S = st.sides[side];
  if (near(st, p.x, p.z, 170, o => o.side !== side && !ROSTER[o.kind].miner && o.state !== 'garrison')) return false;
  const lineCovers = S.line.inf >= v.x - 60 && S.cmd.inf !== 'retreat';
  return lineCovers || S.cmd.inf === 'attack' || !!near(st, p.x, p.z, 240, o => o.side === side && !ROSTER[o.kind].miner && o.state !== 'garrison');
}
// Miners fill the safe mine first, then the richest safe veins; the rest wait at the fortress.
function assignMiners(st, side) {
  const S = st.sides[side], list = miners(st, side).sort((a, b) => a.id - b.id);
  const slots = [];
  for (let i = 0; i < safeCap(S); i++) slots.push(null);
  for (const v of [...VEINS].sort((a, b) => b.rate - a.rate || a.x - b.x)) if (veinSafe(st, side, v)) for (let i = 0; i < v.cap; i++) slots.push(v.id);
  // keep miners where they already work, then fill the free places in order
  const pool = [...list], out = new Map(), filled = slots.map(() => false);
  slots.forEach((v, i) => { const k = pool.findIndex(u => u.vein === v && u.state !== 'idle'); if (k >= 0) { out.set(pool.splice(k, 1)[0], v); filled[i] = true; } });
  slots.forEach((v, i) => { if (!filled[i] && pool.length) out.set(pool.shift(), v); });
  for (const u of list) {
    const want = out.has(u) ? out.get(u) : 'wait';
    if (want === 'wait') { if (u.state !== 'flee') { u.vein = null; u.state = 'idle'; } continue; }
    if (u.vein !== want || u.state === 'idle') {
      u.vein = want;
      if (u.state !== 'flee') u.state = want == null ? (u.carry ? 'toBase' : 'toMine') : 'toVein';
    }
  }
}

function stepMiner(st, u) {
  const S = st.sides[u.side], m = mineAt(u.side), d = dropAt(u.side);
  const enemies = countNear(st, u.x, u.z, 90, o => o.side !== u.side && !ROSTER[o.kind].miner && o.state !== 'garrison');
  // militia: miners fight one or two raiders instead of running
  if (enemies && hasSkill(S, 'militia') && enemies <= 2 && u.state !== 'flee') {
    u.cd = (u.cd || 0) - DT;
    const e = near(st, u.x, u.z, 30, o => o.side !== u.side && !ROSTER[o.kind].miner);
    if (e) { if (u.cd <= 0) { u.cd = 1.2; u.facing = Math.atan2(-(e.z - u.z), e.x - u.x); st.events.push({ t: 'melee', id: u.id, to: e.id }); hurt(st, e, 6, u); } return; }
  } else if (enemies && u.state !== 'inMine') u.state = 'flee';
  u.digging = false;
  if (u.state === 'flee') {
    if (!moveToward(st, u, fromBase(u.side, 25), -20, 1.2)) { u.hidden = true; if (!enemies) { u.hidden = false; u.state = u.vein != null ? 'toVein' : 'toMine'; } }
    else u.hidden = false;
    return;
  }
  u.hidden = false;
  if (u.state === 'idle') { moveToward(st, u, fromBase(u.side, 70), -60 + (u.id % 5) * 8, 0.7); return; }
  if (u.vein != null) {
    const v = VEINS[u.vein], p = veinAt(v, u.side);
    if (u.state === 'toVein' || u.state === 'toMine' || u.state === 'toBase') {
      if (!moveToward(st, u, p.x + (u.id % 4 - 1.5) * 9, p.z - 14 + (u.id % 2) * 8)) { u.state = 'vdig'; u.work = 0; }
    } else if (u.state === 'vdig') {
      u.digging = true;
      const g = veinRate(S, v) * DT;
      S.gold += g; S.mined += g; u.work += g;
      if (u.work >= 10) { st.events.push({ t: 'gold', id: u.id, side: u.side, n: Math.round(u.work) }); u.work = 0; }
    }
    return;
  }
  if (u.state === 'toMine' || u.state === 'toVein' || u.state === 'vdig') {
    if (!moveToward(st, u, m.x + (u.id % 5 - 2) * 8, m.z + 18)) { u.state = 'dig'; u.work = 0; }
  } else if (u.state === 'dig') {
    u.work += DT;
    u.digging = true;
    if (u.work >= mineTime(S)) { u.carry = carryOf(S); u.state = 'toBase'; u.digging = false; }
  } else if (u.state === 'toBase') {
    if (!moveToward(st, u, d.x, d.z + (u.id % 3 - 1) * 8)) {
      const g = u.carry * S.incomeMult;
      S.gold += g; S.mined += g; u.carry = 0; u.state = 'toMine';
      st.events.push({ t: 'gold', id: u.id, side: u.side, n: Math.round(g) });
    }
  }
}

function stepFighter(st, u) {
  const R = ROSTER[u.kind], S = st.sides[u.side], s = stat(S, u.kind), g = R.group, cmd = S.cmd[g], dir = dirOf(u.side);
  u.cd -= DT;
  if (u.slowT > 0) u.slowT -= DT;
  u.brace = false;
  if (cmd === 'retreat') {
    const gx = fromBase(u.side, 30), gz = Math.max(-50, Math.min(50, u.slotZ * 0.4));
    if (u.state === 'garrison' || !moveToward(st, u, gx, gz, 1.1)) {
      u.state = 'garrison';
      u.hp = Math.min(u.maxHp, u.hp + FACTIONS[S.faction].heal * DT);
    }
    u.idle += DT;
    if (u.idle > 1.5) u.charged = true;
    return;
  }
  u.state = 'fight';
  // hedgehog: pikemen brace against cavalry and stand their ground
  if (u.kind === 'pikeman' && hasSkill(S, 'hedgehog') && near(st, u.x, u.z, 110, o => o.side !== u.side && ROSTER[o.kind].group === 'cav' && o.state !== 'garrison')) u.brace = true;
  if (closeQuarters(st, u, S)) { u.moving = false; return; }
  const raid = u.kind === 'cossack' && hasSkill(S, 'raid');
  const lineX = fromBase(u.side, S.line[g] - u.rank * (g === 'cav' ? 26 : 20));
  const aggro = cmd === 'hold' ? s.range + 110 : cmd === 'flank' ? 200 : Math.max(260, s.range + 60);
  let target = pickTarget(st, u, Math.max(aggro, s.range + 12), raid);
  // holding troops don't chase far past their line (raiders go after miners anyway)
  if (target && cmd === 'hold' && !(raid && ROSTER[target.kind].miner) && (target.x - lineX) * dir > 160 + s.range) target = null;
  const bt = baseTarget(st, u);
  let dist = target ? Math.hypot(target.x - u.x, target.z - u.z) : Infinity;
  if (bt.d < dist && (cmd !== 'hold' || bt.d <= s.range)) { target = bt; dist = bt.d; }
  const reach = s.range + (target && !target.base && ROSTER[target.kind].mounted ? 6 : 0);
  if (target && dist <= reach && !(R.minRange && !target.base && dist < R.minRange)) {
    u.moving = false;
    u.idle = 0;
    u.facing = Math.atan2(-(target.z - u.z), target.x - u.x);
    if (u.cd <= 0) strike(st, u, target, dist);
    return;
  }
  u.moving = false;
  if (u.brace) { if (target && !target.base) u.facing = Math.atan2(-(target.z - u.z), target.x - u.x); return; }
  if (target && !target.base) {
    if (R.minRange && dist < R.minRange) moveToward(st, u, u.x - dir * 30, u.z);
    else moveToward(st, u, target.x, target.z);
  } else if (cmd === 'hold') {
    moveToward(st, u, lineX, u.slotZ, 0.8);
  } else if (cmd === 'flank') {
    // ride along the edge of the field past the enemy line, then turn into their rear
    const edge = (u.slotZ >= 0 ? 1 : -1) * (ZW - 15), behind = enemyRearX(st, u.side);
    if ((behind - u.x) * dir > 40) moveToward(st, u, behind, edge);
    else moveToward(st, u, bt.x, bt.z);
  } else {
    moveToward(st, u, bt.x - dir * u.rank * 18, bt.z * 0.3 + u.slotZ * 0.7);
  }
  if (u.moving) { u.idle += DT; if (u.idle > 1.5) u.charged = true; }
}

function enemyRearX(st, side) {
  const xs = fighters(st, foe(side)).filter(o => ['rng', 'art'].includes(ROSTER[o.kind].group)).map(o => o.x);
  const dir = dirOf(side);
  if (!xs.length) return baseX(foe(side)) - dir * 260;
  return dir > 0 ? Math.max(...xs) + 40 : Math.min(...xs) - 40;
}

// Fortress guns and the barrage ability.
export function castBarrage(st, side) {
  const S = st.sides[side];
  if (S.barrageCd > 0 || st.over) return false;
  const foes = fighters(st, foe(side)).filter(o => o.state !== 'garrison');
  if (!foes.length) return false;
  // aim at the densest enemy cluster
  let best = foes[0], bn = -1;
  for (const a of foes) { const n = foes.filter(b => Math.hypot(a.x - b.x, a.z - b.z) < 70).length; if (n > bn) { bn = n; best = a; } }
  for (let i = 0; i < 7; i++) {
    const tx = best.x + (st.rng.next() - 0.5) * 120, tz = best.z + (st.rng.next() - 0.5) * 120;
    const x0 = fromBase(side, 20);
    st.shots.push({ id: st.nextId++, side, kind: 'barrage', x0, z0: 0, x: tx, z: tz, t: -i * 0.18, T: 0.6 + Math.abs(tx - x0) / 600, dmg: 34, r: 40, vsBase: 1, magic: false });
  }
  S.barrageCd = BARRAGE_CD;
  st.events.push({ t: 'barrage', side, x: best.x, z: best.z });
  return true;
}

function onDeath(st, u) {
  const R = ROSTER[u.kind], S = st.sides[u.side];
  // reassemble: a fallen skeleton may stand up again, once
  if (u.kind === 'skeleton' && hasSkill(S, 'reassemble') && !u.again && st.rng.next() < 0.3) {
    u.hp = u.maxHp * 0.5; u.again = true;
    st.events.push({ t: 'raise', id: u.id });
    return false;
  }
  u.dead = true; u.deadAt = st.t;
  S.losses++;
  if (u.lastHitBy) st.sides[u.lastHitBy].kills++;
  st.events.push({ t: 'death', id: u.id });
  if (R.miner) return true;
  // souls: every death on the field feeds the undead
  for (const side of ['player', 'enemy']) if (FACTIONS[st.sides[side].faction].souls) st.sides[side].souls++;
  const killer = u.lastHitId && st.units.find(o => o.id === u.lastHitId && o.hp > 0);
  if (killer?.kind === 'ghoul' && hasSkill(st.sides[killer.side], 'devour')) { killer.hp = Math.min(killer.maxHp, killer.hp + killer.maxHp * 0.4); st.sides[killer.side].souls++; st.events.push({ t: 'devour', id: killer.id }); }
  for (const a of alive(st)) {
    let raise = ROSTER[a.kind].raise;
    if (!raise) continue;
    if (a.kind === 'acolyte' && hasSkill(st.sides[a.side], 'massraise')) raise = 0.12;
    if (Math.hypot(a.x - u.x, a.z - u.z) <= 220 && st.rng.next() < raise && fighters(st, a.side).length < POP_CAP) {
      const s = spawn(st, a.side, 'skeleton');
      s.x = u.x; s.z = u.z;
      st.events.push({ t: 'raise', id: s.id });
      break;
    }
  }
  return true;
}

export function step(st, dt = DT) {
  if (st.over) return;
  st.t += dt;
  for (const side of ['player', 'enemy']) {
    const S = st.sides[side];
    S.gold += income(st, side) * dt;
    S.barrageCd = Math.max(0, S.barrageCd - dt);
    if (S.queue.length) {
      S.train += dt;
      if (S.train >= trainTime(S, S.queue[0])) { spawn(st, side, S.queue.shift()); S.train = 0; }
    }
    for (const [k, b] of Object.entries(S.bld)) if (b && !b.done) { b.t += dt; if (b.t >= b.T) { S.bld[k] = { done: true }; st.events.push({ t: 'built', side, key: k }); } }
    for (const [k, r] of Object.entries(S.research)) {
      if (!r) continue;
      r.t += dt;
      if (r.t >= r.T) { S.research[k] = null; applyUpgrade(st, side, r.key); }
    }
    // repair: walls mend while no enemy is near
    if (hasSkill(S, 'repair') && S.baseHp < S.baseMax && !near(st, baseX(side), 0, 350, o => o.side !== side && !ROSTER[o.kind].miner)) S.baseHp = Math.min(S.baseMax, S.baseHp + 5 * dt);
  }
  st.slotTimer -= dt;
  if (st.slotTimer <= 0) { assignSlots(st); st.slotTimer = 1; }
  st.mineTimer -= dt;
  if (st.mineTimer <= 0) { assignMiners(st, 'player'); assignMiners(st, 'enemy'); st.mineTimer = 1; }
  for (const u of st.units) {
    if (u.hp <= 0) continue;
    u.moving = false;
    if (ROSTER[u.kind].miner) stepMiner(st, u); else stepFighter(st, u);
  }
  separate(st);
  // projectiles
  for (const s of st.shots) { s.t += dt; if (s.t >= s.T && !s.done) { s.done = true; landShot(st, s); } }
  st.shots = st.shots.filter(s => !s.done);
  // plague clouds burn through armour
  for (const c of st.clouds) {
    c.t -= dt;
    for (const o of st.units) if (o.hp > 0 && o.side !== c.side && Math.hypot(o.x - c.x, o.z - c.z) < c.r) { o.hp -= 8 * dt; o.lastHitBy = c.side; }
  }
  st.clouds = st.clouds.filter(c => c.t > 0);
  // fortress guns, stronger with research and garrisoned shooters
  for (const side of ['player', 'enemy']) {
    const S = st.sides[side];
    S.turretCd -= dt;
    if (S.turretCd > 0) continue;
    const bx = baseX(side), reach = 300 + S.fort.reach;
    const t = alive(st, foe(side)).filter(u => Math.abs(u.x - bx) <= reach && !u.hidden).sort((a, b) => Math.abs(a.x - bx) - Math.abs(b.x - bx))[0];
    if (!t) continue;
    const garrison = fighters(st, side).filter(u => u.state === 'garrison' && ['rng', 'art'].includes(ROSTER[u.kind].group)).length;
    hurt(st, t, (30 + 6 * garrison) * (1 + S.fort.turret), null);
    st.events.push({ t: 'turret', side, to: t.id });
    S.turretCd = 1.5;
  }
  for (const u of st.units) if (u.hp <= 0 && !u.dead) onDeath(st, u);
  st.units = st.units.filter(u => !u.dead || st.t - u.deadAt < 8);
  for (const side of ['player', 'enemy']) if (st.sides[side].baseHp <= 0) st.over = foe(side);
}

/* ---------- AI ---------- */
const value = list => list.reduce((s, u) => s + (ROSTER[u.kind].cost + 25 * (ROSTER[u.kind].souls || 0)) * (u.hp / u.maxHp), 0);
// build order and research plan per state; economy first, then the branches the army uses
const AI_PLAN = {
  human: { build: ['office', 'school', 'stable', 'foundry'], research: ['picks', 'longpikes', 'rifled', 'carts', 'quilted', 'sabres', 'hedgehog', 'raid', 'rankvolley', 'horses', 'bayonets', 'repair', 'powder', 'carriages', 'grapeshot', 'ram', 'militia', 'bastions', 'wallguns'] },
  undead: { build: ['gravepit', 'shrine', 'lair', 'blackstable', 'boneworks'], research: ['spades', 'boneblades', 'darkpower', 'coffinshields', 'claws', 'bonecarts', 'reassemble', 'massraise', 'frenzy', 'devour', 'farcall', 'cursedplate', 'dread', 'regrow', 'ghosthorses', 'heavybones', 'plague', 'bonewheels', 'deadgrip', 'blackwalls', 'cryptguns'] }
};
const MIX = { inf: 0.38, rng: 0.3, cav: 0.2, art: 0.12 };

export function aiThink(st, side, dt = DT) {
  const S = st.sides[side], L = S.ai || AI_LEVELS[1];
  S.aiT += dt;
  if (S.aiT < L.react) return;
  S.aiT = 0;
  const other = foe(side), O = st.sides[other];
  const mine = fighters(st, side), theirs = fighters(st, other).filter(u => u.state !== 'garrison');
  const near = theirs.filter(u => Math.abs(u.x - baseX(side)) < 520);
  const has = k => S.roster.includes(k) && unlocked(S, k);
  const mvNow = value(mine), tvNow = value(theirs);
  const calm = near.length < 3;
  const plan = AI_PLAN[S.faction];
  // economy: miners for the safe mine plus every vein the army holds
  const held = VEINS.filter(v => veinSafe(st, side, v)).reduce((a, v) => a + v.cap, 0);
  const minerGoal = Math.min(maxMiners(S), safeCap(S) + held, 3 + Math.floor(st.t / 25));
  const minerCount = miners(st, side).length + S.queue.filter(k => k === 'miner').length;
  if (minerCount < minerGoal && S.queue.length < 2 && calm) buy(st, side, 'miner');
  // buildings, then research in every idle building; save while the army is outmatched
  // the army grows with time; academies and research only once it is in shape (or gold piles up)
  const armyTarget = Math.min(POP_CAP - 2, 8 + st.t / 12);
  const armyOk = mvNow >= tvNow * 0.75 && mine.length >= armyTarget * 0.6;
  const rich = S.gold > 600;
  let reserve = 0;
  const nextBuild = plan.build.find(k => !S.bld[k]);
  // academies open the other branches, so they come early: as soon as a few soldiers guard the line
  let saveFor = 0;
  if (nextBuild && calm && mine.length >= 5) {
    const c = BUILDINGS[nextBuild].cost;
    if (S.gold >= c) build(st, side, nextBuild); else saveFor = reserve = c;
  }
  if (calm && (armyOk || rich)) {
    for (const key of plan.research) {
      const U = UPGRADES[key];
      if (S.up[key] || !built(S, U.at) || S.research[U.at]) continue;
      if (S.gold - reserve - (armyOk ? 0 : 450) >= U.cost) { research(st, side, key); continue; }
      reserve = Math.max(reserve, U.cost);
      if (mine.length >= armyTarget * 0.75) saveFor = Math.max(saveFor, U.cost);
      break;
    }
  }
  // soldiers: keep the mix, answer the enemy composition (and their academies on the top level)
  const saving = (minerCount < minerGoal && S.gold < ROSTER.miner.cost || saveFor > 0 && S.gold < saveFor + 40) && near.length < 2 && mine.length >= 5;
  // with spare gold the AI hires two at a time so the army keeps up with the income
  for (let n = S.gold > 300 ? 2 : 1; n > 0 && S.queue.length < 4 && !saving; n--) {
    const count = f => theirs.filter(f).length;
    const mounted = count(u => ROSTER[u.kind].group === 'cav'), ranged = count(u => ['rng', 'art'].includes(ROSTER[u.kind].group));
    const theirCav = mounted + (L.anticipate && (O.bld.stable?.done || O.bld.blackstable?.done) ? 3 : 0);
    const theirRng = ranged + (L.anticipate && (O.bld.school?.done || O.bld.shrine?.done || O.bld.foundry?.done || O.bld.boneworks?.done) ? 3 : 0);
    const by = g => S.roster.filter(k => ROSTER[k].group === g && has(k));
    const answer = st.rng.next() < L.counter;
    let pick = null;
    if (S.hero && !S.heroBought && S.gold >= ROSTER[S.hero].cost && st.t > 120) pick = S.hero;
    else if (answer && theirCav >= 3 && mine.filter(u => ROSTER[u.kind].vsMounted).length < theirCav * 1.5 && by('inf').some(k => ROSTER[k].vsMounted)) pick = by('inf').find(k => ROSTER[k].vsMounted);
    else if (answer && theirRng >= 4 && by('cav').length) pick = by('cav').find(k => ROSTER[k].vsRanged) || by('cav')[0];
    else {
      const have = g => mine.filter(u => ROSTER[u.kind].group === g).length / Math.max(1, mine.length);
      const g = Object.keys(MIX).filter(g => by(g).length).sort((a, b) => (have(a) - MIX[a]) - (have(b) - MIX[b]))[0];
      const opts = g ? by(g).filter(k => ROSTER[k].cost <= S.gold && (ROSTER[k].souls || 0) <= S.souls) : [];
      pick = opts.length ? opts[opts.length - 1] : null;
      if (!pick && g && S.gold > 150) pick = by(g)[0];
    }
    if (pick) buy(st, side, pick);
  }
  // army: where to hold, when to strike, when to fall back
  const mv = mvNow, tv = tvNow, F = FACTIONS[S.faction];
  const attacking = S.cmd.inf === 'attack';
  if (attacking && mv < tv * 0.5) {
    if (F.heal > 0) setCommand(st, side, 'all', 'retreat');
    else { setCommand(st, side, 'all', 'hold'); setLine(st, side, 'all', fromBase(side, 300)); }
  }
  if (S.cmd.inf === 'retreat' && (mine.every(u => u.hp > u.maxHp * 0.75) || !theirs.length)) setCommand(st, side, 'all', 'hold');
  if (!attacking && S.cmd.inf !== 'retreat') {
    // hold line: home / near vein / rich vein, depending on aggression and strength
    const lines = [320, VEINS[0].x - 20, VEINS[1].x - 30];
    const want = L.aggr === 0 ? lines[0] : L.aggr === 1 ? (mv >= tv * 0.8 ? lines[1] : lines[0]) : (mv >= tv * (L.aggr >= 3 ? 0.8 : 0.95) ? lines[2] : lines[1]);
    if (Math.abs(S.line.inf - want) > 30) setLine(st, side, 'all', fromBase(side, want));
  }
  // raiders: send the cavalry around the edge when the enemy mines the veins
  const theirVeinMiners = miners(st, other).filter(u => u.vein != null && u.state === 'vdig').length;
  if (L.aggr >= 2 && !attacking && theirVeinMiners >= 2 && mine.filter(u => ROSTER[u.kind].group === 'cav').length >= 3) setCommand(st, side, 'cav', 'flank');
  else if (S.cmd.cav === 'flank' && !attacking && theirVeinMiners === 0) setCommand(st, side, 'cav', 'hold');
  // a full army that waits too long attacks anyway, so mirror matches don't stall
  S.fullT = mine.length >= POP_CAP - 4 && !attacking ? (S.fullT || 0) + L.react : 0;
  const push = [1.8, 1.4, 1.25, 1.15][L.aggr];
  if (!attacking && S.cmd.inf !== 'retreat' && mine.length >= 14 && (S.fullT > 45 || mv > tv * push + 150 || (st.t > 480 && mv >= tv * (push - 0.3)) || (st.t > 840 && mv >= tv * 0.7))) {
    setCommand(st, side, 'all', 'attack');
    if (theirs.filter(u => ['rng', 'art'].includes(ROSTER[u.kind].group)).length >= 3) setCommand(st, side, 'cav', 'flank');
  }
  if (S.barrageCd <= 0) {
    const cluster = L.aggr >= 2 ? theirs.some(a => theirs.filter(b => Math.hypot(a.x - b.x, a.z - b.z) < 70).length >= 6) : false;
    if (near.length >= 5 || cluster) castBarrage(st, side);
  }
}
