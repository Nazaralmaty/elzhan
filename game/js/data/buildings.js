// Map terrain and city buildings (GDD numbers). Costs: { food, wood, stone, gold, iron, mana }.
export const RES = ['food', 'wood', 'stone', 'gold', 'iron', 'mana'];
export const RES_NAME = { food: 'Еда', wood: 'Дерево', stone: 'Камень', gold: 'Золото', iron: 'Железо', mana: 'Мана' };

export const TERRAIN = {
  grass:    { name: 'Равнина',       move: 1 },
  forest:   { name: 'Лес',           move: 2, blocksSight: true },
  hill:     { name: 'Холм',          move: 2, sight: 1 },
  mountain: { name: 'Гора',          move: Infinity },
  water:    { name: 'Вода',          move: Infinity },
  ore:      { name: 'Рудная жила',   move: 2 },
  gold:     { name: 'Золотая жила',  move: 2 },
  mana:     { name: 'Источник маны', move: 1 },
  ruins:    { name: 'Руины',         move: 1 },
  village:  { name: 'Деревня',       move: 1 }
};

const ANY = ['grass', 'forest', 'hill'];
const PROD_UP = [{ wood: 6, stone: 6 }, { wood: 10, stone: 12 }];

export const BUILDINGS = {
  townhall: { name: 'Ратуша',         tiles: [],          cost: {},                              housing: [4],    note: '+2 еды, +1 золото, найм ополченцев' },
  house:    { name: 'Дом',            tiles: ['grass', 'hill'], cost: { wood: 8, stone: 2 },     housing: [4, 6], up: [{ wood: 8, stone: 6 }], note: 'Жильё +4 (ур. 2: +6)' },
  farm:     { name: 'Ферма',          tiles: ['grass'],   cost: { wood: 6 },                     slots: [2, 4, 6], per: { food: 2 }, up: PROD_UP, note: '+2 еды за крестьянина, +1 за соседнюю мельницу' },
  mill:     { name: 'Мельница',       tiles: ['grass'],   cost: { wood: 10, stone: 6 },          note: 'Соседние фермы дают +1 еды' },
  sawmill:  { name: 'Лесопилка',      tiles: ['forest'],  cost: { wood: 4 },                     slots: [2, 4, 6], per: { wood: 2 }, up: PROD_UP, note: '+2 дерева за крестьянина, +1 если рядом 2 леса' },
  quarry:   { name: 'Каменоломня',    tiles: ['hill'],    cost: { wood: 8 },                     slots: [2, 4, 6], per: { stone: 2 }, up: PROD_UP, note: '+2 камня за крестьянина' },
  iron:     { name: 'Шахта железа',   tiles: ['ore'],     cost: { wood: 10, stone: 6 },          slots: [2, 4, 6], per: { iron: 1 }, up: PROD_UP, note: '+1 железо за крестьянина, +1 рядом с кузницей' },
  goldmine: { name: 'Золотой рудник', tiles: ['gold'],    cost: { wood: 10, stone: 8 },          slots: [2, 4, 6], per: { gold: 1 }, up: PROD_UP, note: '+1 золото за крестьянина' },
  market:   { name: 'Рынок',          tiles: ['grass'],   cost: { wood: 12, stone: 8 },          up: [{ wood: 10, stone: 10, gold: 10 }], perCity: 1, note: 'Обмен 3:1 (ур. 2: 2:1), +1 золото за соседний дом' },
  barracks: { name: 'Казарма',        tiles: ['grass'],   cost: { wood: 12, stone: 6 },          note: 'Найм мечников и лучников' },
  forge:    { name: 'Кузница',        tiles: ANY,         cost: { wood: 10, stone: 10 },         note: 'Нужна для мечников и рыцарей; у шахты железа — сталь дешевле' },
  stable:   { name: 'Конюшня',        tiles: ['grass'],   cost: { wood: 14, stone: 4, gold: 4 }, needsAdj: 'farm', note: 'Найм рыцарей; только рядом с фермой' },
  tower:    { name: 'Башня магов',    tiles: ['mana'],    cost: { wood: 8, stone: 12, gold: 4 }, slots: [2, 2], per: { mana: 2 }, up: [{ stone: 12, gold: 10 }], note: '+3 маны, адепты +2; ур. 2 — боевые маги' },
  tavern:   { name: 'Таверна',        tiles: ANY,         cost: { wood: 10, stone: 4, gold: 10 }, perKingdom: 1, note: 'Найм героев' }
};
export const BUILD_ORDER = ['farm', 'mill', 'house', 'sawmill', 'quarry', 'iron', 'goldmine', 'market', 'barracks', 'forge', 'stable', 'tower', 'tavern'];
export const WALLS_COST = { stone: 20 };

// Recruitment: unit kind → requirement and cost/upkeep per turn.
export const RECRUIT = {
  militia:    { cost: { food: 10, wood: 4 },             upkeep: { food: 1 },                    needs: 'townhall' },
  swordsman:  { cost: { food: 12, iron: 8 },             upkeep: { food: 1, iron: 1 },           needs: 'barracks', forge: true },
  archer:     { cost: { food: 10, wood: 8 },             upkeep: { food: 1 },                    needs: 'barracks' },
  knight:     { cost: { food: 15, gold: 10, iron: 8 },   upkeep: { food: 2, gold: 1, iron: 1 },  needs: 'stable', forge: true },
  apprentice: { cost: { food: 10, mana: 8 },             upkeep: { food: 1, mana: 1 },           needs: 'tower' },
  battlemage: { cost: { gold: 10, mana: 15 },            upkeep: { gold: 1, mana: 2 },           needs: 'tower', level: 2 },
  alden:      { cost: { gold: 30 },                      upkeep: { food: 1, gold: 1 },           needs: 'tavern', hero: true },
  irena:      { cost: { gold: 30 },                      upkeep: { food: 1, gold: 1 },           needs: 'tavern', hero: true },
  corvin:     { cost: { gold: 30 },                      upkeep: { food: 1, gold: 1 },           needs: 'tavern', hero: true }
};
export const UPKEEP_MONSTER = {};

export const CITY_NAMES = ['Белый Брод', 'Каменный Яр', 'Ольховка', 'Тихая Заводь', 'Сосновый Дол', 'Медвежий Угол', 'Светлогорье', 'Речной Двор', 'Вересковка', 'Дубравка', 'Ясный Холм', 'Ковыльное', 'Сторожевая', 'Липовый Луг'];

export const MAP_SIZES = {
  short:  { name: 'Короткая', w: 12, h: 12, villages: 6,  mana: 3,  lairs: 4,  wanderEvery: 12 },
  medium: { name: 'Средняя',  w: 20, h: 20, villages: 14, mana: 6,  lairs: 9,  wanderEvery: 10 },
  long:   { name: 'Длинная',  w: 30, h: 30, villages: 26, mana: 10, lairs: 16, wanderEvery: 9 }
};
