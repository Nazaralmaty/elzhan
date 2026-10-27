// "Казаки": data for the real-time strategy mode. Units move in grid cells per second; one cell is 2 metres.
export const RES = ['food', 'wood', 'stone', 'gold', 'iron', 'coal'];
export const RES_NAME = { food: 'Еда', wood: 'Дерево', stone: 'Камень', gold: 'Золото', iron: 'Железо', coal: 'Уголь' };
export const RES_ICON = { food: '🌾', wood: '🪵', stone: '🪨', gold: '🪙', iron: '⛓', coal: '⚫' };

// shot: ranged attack; melee: hand-to-hand; eat: food per second
export const UNITS = {
  peasant:   { name: 'Крестьянин', hp: 30, armor: 0, melee: { dmg: 3, cd: 1.3, reach: 0.9 }, speed: 1.15, sight: 8, cost: { food: 40 }, time: 7, from: 'townhall', eat: 0.03, r: 0.3, peasant: true, desc: 'Добывает ресурсы и строит' },
  pikeman:   { name: 'Пикинёр', hp: 70, armor: 2, melee: { dmg: 9, cd: 1.2, reach: 1.5 }, speed: 1.0, sight: 9, cost: { food: 30, wood: 20, iron: 5 }, time: 7, from: 'barracks', eat: 0.04, r: 0.3, inf: true, vsCav: 2.5, desc: 'Строй пик, лучший против конницы' },
  musketeer: { name: 'Мушкетёр', hp: 50, armor: 1, melee: { dmg: 4, cd: 1.4, reach: 1.1 }, shot: { dmg: 30, range: 9, reload: 8, cost: { coal: 1 } }, speed: 1.0, sight: 11, cost: { food: 40, wood: 10, iron: 20, gold: 5 }, time: 9, from: 'barracks', eat: 0.04, r: 0.3, inf: true, desc: 'Залп в строю сносит ряды. Выстрел тратит уголь' },
  officer:   { name: 'Офицер', hp: 90, armor: 2, melee: { dmg: 10, cd: 1.0, reach: 1.2 }, speed: 1.1, sight: 12, cost: { food: 50, gold: 60 }, time: 10, from: 'barracks', eat: 0.04, r: 0.3, command: true, desc: 'Нужен, чтобы построить отряд' },
  drummer:   { name: 'Барабанщик', hp: 40, armor: 0, speed: 1.1, sight: 9, cost: { food: 30, gold: 30 }, time: 6, from: 'barracks', eat: 0.04, r: 0.3, command: true, desc: 'Держит мораль отряда' },
  cossack:   { name: 'Казак', hp: 100, armor: 1, melee: { dmg: 11, cd: 1.0, reach: 1.3 }, speed: 2.4, sight: 13, cost: { food: 70, gold: 30, iron: 10 }, time: 11, from: 'stable', eat: 0.07, r: 0.55, cav: true, vsLight: 1.6, desc: 'Быстрый, режет стрелков, пушки и крестьян' },
  dragoon:   { name: 'Драгун', hp: 110, armor: 1, melee: { dmg: 8, cd: 1.2, reach: 1.3 }, shot: { dmg: 24, range: 8, reload: 8, cost: { coal: 1 } }, speed: 2.1, sight: 12, cost: { food: 80, gold: 60, iron: 30 }, time: 13, from: 'stable', eat: 0.07, r: 0.55, cav: true, desc: 'Конный стрелок' },
  reiter:    { name: 'Рейтар', hp: 170, armor: 4, melee: { dmg: 16, cd: 1.2, reach: 1.4 }, speed: 2.0, sight: 10, cost: { food: 90, gold: 70, iron: 40 }, time: 15, from: 'stable', eat: 0.08, r: 0.55, cav: true, charge: 1.8, desc: 'Тяжёлая конница, проламывает строй' },
  cannon:    { name: 'Пушка', hp: 220, armor: 3, shot: { dmg: 70, range: 18, min: 3, reload: 12, splash: 1.8, building: 4, cost: { coal: 3, iron: 1 } }, speed: 0.6, sight: 12, cost: { wood: 150, iron: 150, gold: 100 }, time: 24, from: 'foundry', eat: 0, r: 0.7, art: true, desc: 'Бьёт по площади и ломает здания. Тратит уголь и железо' }
};

export const BUILDINGS = {
  townhall:   { name: 'Ратуша', icon: '🏛', w: 4, h: 4, hp: 4000, cost: { wood: 400, stone: 300, gold: 200 }, time: 90, pop: 20, drop: ['food', 'wood', 'stone', 'gold', 'iron', 'coal'], trains: ['peasant'], sight: 12, desc: 'Нанимает крестьян, принимает все ресурсы' },
  house:      { name: 'Дом', icon: '🏠', w: 2, h: 2, hp: 600, cost: { wood: 80, stone: 20 }, time: 18, pop: 12, sight: 6, desc: '+12 к пределу населения' },
  mill:       { name: 'Мельница', icon: '🌾', w: 3, h: 3, hp: 800, cost: { wood: 150, stone: 50 }, time: 25, farm: 12, sight: 7, desc: 'Поля вокруг: до 12 крестьян дают еду' },
  storehouse: { name: 'Склад', icon: '📦', w: 3, h: 3, hp: 800, cost: { wood: 120 }, time: 15, drop: ['wood', 'stone', 'food'], sight: 7, desc: 'Сюда носят дерево и камень' },
  barracks:   { name: 'Казарма', icon: '⚔', w: 4, h: 3, needs: ['blacksmith'], hp: 2000, cost: { wood: 250, stone: 150 }, time: 45, trains: ['pikeman', 'musketeer', 'officer', 'drummer'], sight: 8, desc: 'Пехота, офицеры и барабанщики' },
  stable:     { name: 'Конюшня', icon: '🐎', w: 4, h: 3, needs: ['barracks'], hp: 2000, cost: { wood: 300, stone: 100, gold: 80 }, time: 50, trains: ['cossack', 'dragoon', 'reiter'], sight: 8, desc: 'Конница' },
  blacksmith: { name: 'Кузница', icon: '⚒', w: 3, h: 3, needs: ['storehouse'], hp: 1200, cost: { wood: 150, stone: 200, gold: 50 }, time: 35, sight: 7, desc: 'Улучшения оружия и брони' },
  foundry:    { name: 'Литейный двор', icon: '💣', w: 4, h: 3, hp: 2000, cost: { wood: 200, stone: 300, iron: 150, gold: 100 }, time: 60, trains: ['cannon'], needs: ['stable'], sight: 8, desc: 'Пушки' },
  mine:       { name: 'Шахта', icon: '⛏', w: 3, h: 3, hp: 1500, cost: { wood: 120, stone: 40 }, time: 30, mine: 5, sight: 6, desc: 'Ставится на месторождение золота, железа, угля или камня. До 5 крестьян внутри, добыча не кончается' },
  tower:      { name: 'Башня', icon: '🗼', w: 2, h: 2, needs: ['barracks'], hp: 1800, cost: { stone: 250, wood: 80 }, time: 40, shot: { dmg: 18, range: 10, reload: 3.5, cost: { coal: 1 } }, sight: 12, desc: 'Стреляет по врагам. Тратит уголь' }
};
export const BUILD_MENU = ['house', 'mill', 'storehouse', 'mine', 'blacksmith', 'barracks', 'stable', 'tower', 'foundry', 'townhall'];
// what has to stand before a building can be placed: storehouse → blacksmith → barracks → stable / tower → foundry
export const TECH_HINT = 'Склад → Кузница → Казарма → Конюшня и Башня → Литейный двор';

// research: at which building, cost, seconds, requirement
export const UPGRADES = {
  axes:      { name: 'Топоры', icon: '🪓', at: 'townhall', cost: { food: 200, gold: 100 }, time: 40, desc: 'Рубка леса +30%' },
  stonecut:  { name: 'Каменотёсы', icon: '🪨', at: 'townhall', cost: { food: 250, gold: 150 }, time: 40, desc: 'Добыча камня +30%' },
  carts:     { name: 'Тачки', icon: '🛒', at: 'townhall', cost: { wood: 300, gold: 150 }, time: 45, desc: 'Крестьянин несёт +50%' },
  scythe:    { name: 'Косы', icon: '🌾', at: 'mill', cost: { wood: 250, gold: 100 }, time: 40, desc: 'Урожай +25%' },
  threefield:{ name: 'Трёхполье', icon: '🌻', at: 'mill', cost: { wood: 400, gold: 250 }, time: 60, needs: 'scythe', desc: 'Урожай ещё +35%' },
  picks:     { name: 'Кирки', icon: '⛏', at: 'blacksmith', cost: { wood: 300, iron: 100, gold: 150 }, time: 45, desc: 'Шахты дают +30%' },
  deepmines: { name: 'Глубокие штольни', icon: '🕳', at: 'blacksmith', cost: { wood: 400, stone: 200, gold: 200 }, time: 60, needs: 'picks', desc: 'В шахту помещается 10 крестьян' },
  pikes:     { name: 'Закалённые пики', icon: '🔱', at: 'blacksmith', cost: { iron: 150, gold: 100 }, time: 45, desc: 'Пикинёры и офицеры +30% урона' },
  barrels:   { name: 'Нарезные стволы', icon: '🎯', at: 'blacksmith', cost: { iron: 250, gold: 200 }, time: 60, desc: 'Мушкетёры и драгуны +25% урона, точнее' },
  bayonets:  { name: 'Штыки', icon: '🗡', at: 'blacksmith', cost: { iron: 120, gold: 80 }, time: 35, desc: 'Мушкетёры вдвое сильнее в рукопашной' },
  armor:     { name: 'Кирасы', icon: '🛡', at: 'blacksmith', cost: { iron: 300, gold: 200 }, time: 60, desc: 'Броня всех бойцов +2' },
  sabres:    { name: 'Дамасские сабли', icon: '⚔', at: 'stable', cost: { iron: 200, gold: 200 }, time: 50, desc: 'Конница +25% урона' },
  horses:    { name: 'Породистые кони', icon: '🐎', at: 'stable', cost: { food: 400, gold: 250 }, time: 60, desc: 'Конница +25% здоровья и +10% скорости' },
  drill:     { name: 'Муштра', icon: '🥁', at: 'barracks', cost: { food: 300, gold: 200 }, time: 50, desc: 'Найм в казарме и конюшне на 30% быстрее' },
  volley:    { name: 'Плутонговый огонь', icon: '💥', at: 'barracks', cost: { gold: 300, coal: 100 }, time: 60, desc: 'Перезарядка мушкетов −25%' },
  grape:     { name: 'Картечь', icon: '💣', at: 'foundry', cost: { iron: 200, gold: 200, coal: 100 }, time: 50, desc: 'Ядра бьют по площади +40%' },
  gunnery:   { name: 'Артиллерийская школа', icon: '🧨', at: 'foundry', cost: { iron: 200, gold: 400 }, time: 60, desc: 'Пушки заряжают на 25% быстрее' }
};

export const FORMATION_SIZES = [15, 36];
export const SHAPES = { line: 'Линия', column: 'Колонна', square: 'Каре' };
export const GATHER = { wood: 0.55, stone: 0.4, food: 0.42, mine: 0.32 }; // units per second of work
export const CARRY = 10, TREE_WOOD = 80, ROCK_STONE = 300, POP_MAX = 400;
export const START_RES = { food: 800, wood: 600, stone: 400, gold: 300, iron: 150, coal: 150 };
export const SIDE_COLORS = ['#2F6FDB', '#C93A3A', '#E0A526', '#3BA55C'];
export const SIDE_NAMES = ['Синие', 'Красные', 'Жёлтые', 'Зелёные'];

export function costText(cost) {
  return Object.entries(cost).map(([r, n]) => `${n} ${RES_NAME[r].toLowerCase()}`).join(', ');
}
