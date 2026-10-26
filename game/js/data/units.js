// Starting numbers from GDD; tune after playtests.
export const UNITS = {
  militia:    { name: 'Ополченец',  branch: 'Сталь', hp: 15, atk: 5, def: 1, move: 3, range: 1, value: 2,   abilities: ['spears'] },
  swordsman:  { name: 'Мечник',     branch: 'Сталь', hp: 20, atk: 7, def: 4, move: 3, range: 1, value: 3,   abilities: ['shieldWall'] },
  knight:     { name: 'Рыцарь',     branch: 'Сталь', hp: 22, atk: 9, def: 3, move: 5, range: 1, value: 4,   abilities: ['charge'], mounted: true },
  archer:     { name: 'Лучник',     branch: 'Мана',  hp: 12, atk: 6, def: 0, move: 3, range: 4, value: 2.5, abilities: ['aimed'] },
  apprentice: { name: 'Ученик-маг', branch: 'Мана',  hp: 11, atk: 5, def: 0, move: 3, range: 3, value: 3,   abilities: ['heal'], magic: true },
  battlemage: { name: 'Боевой маг', branch: 'Мана',  hp: 12, atk: 8, def: 0, move: 3, range: 3, value: 4,   abilities: ['fireball'], magic: true },

  alden:  { name: 'Сэр Альден', branch: 'Рыцарь-командор',  hp: 26, atk: 8, def: 3, move: 4, range: 1, value: 6, abilities: ['challenge', 'cleave'], hero: true },
  irena:  { name: 'Ирена',      branch: 'Боевая чародейка', hp: 16, atk: 7, def: 0, move: 3, range: 3, value: 6, abilities: ['iceWall', 'chain'], hero: true, magic: true },
  corvin: { name: 'Корвин',     branch: 'Следопыт',         hp: 18, atk: 7, def: 1, move: 4, range: 4, value: 6, abilities: ['disengage', 'mark'], hero: true },

  skeleton:    { name: 'Скелет',              branch: 'Нежить', hp: 15, atk: 5, def: 1, move: 3, range: 1, value: 2, abilities: [], undead: true },
  ghoul:       { name: 'Гуль',                branch: 'Нежить', hp: 14, atk: 6, def: 0, move: 5, range: 1, value: 3, abilities: [], undead: true },
  deathknight: { name: 'Рыцарь смерти',       branch: 'Нежить', hp: 24, atk: 9, def: 3, move: 5, range: 1, value: 4, abilities: ['charge'], undead: true, mounted: true },
  acolyte:     { name: 'Некромант-послушник', branch: 'Нежить', hp: 11, atk: 5, def: 0, move: 3, range: 3, value: 4, abilities: ['raise'], undead: true, magic: true }
};

// target: self | enemy | ally | hex | corpse | charge
export const ABILITIES = {
  spears:     { name: 'Копья вперёд',       cd: 2, target: 'self',  desc: 'До своего хода: удар вдогонку ×1.5, по рыцарям ×2' },
  shieldWall: { name: 'Стена щитов',        cd: 2, target: 'self',  desc: '+2 Защ себе и соседям, иммунитет к отбрасыванию, рыцари бьют вдвое слабее' },
  charge:     { name: 'Таран',              cd: 3, target: 'charge', range: 4, desc: 'Рывок по прямой на 2–4 гекса сквозь зону контроля, удар ×1.5 и отбрасывание' },
  aimed:      { name: 'Прицельный выстрел', cd: 2, target: 'enemy', range: 1, desc: '+1 дальность, игнорирует укрытие' },
  heal:       { name: 'Лечение',            cd: 2, target: 'ally',  range: 2, desc: 'Союзник в радиусе 2: +6 ОЗ' },
  fireball:   { name: 'Огненный шар',       cd: 3, target: 'hex',   range: 4, mana: 5, desc: '7 магического урона по гексу и 6 соседям, своим тоже' },
  challenge:  { name: 'Вызов',              cd: 3, target: 'self',  desc: 'Враги в радиусе 2 в свой ход обязаны атаковать Альдена' },
  cleave:     { name: 'Рассекающий удар',   cd: 2, target: 'enemy', range: 0, desc: 'Удар дугой: цель и два гекса рядом с ней' },
  iceWall:    { name: 'Ледяная стена',      cd: 3, target: 'hex',   range: 3, desc: '3 гекса льда в линию на 2 хода: не пройти и не прострелить' },
  chain:      { name: 'Цепная молния',      cd: 2, target: 'enemy', range: 0, mana: 3, desc: 'До 3 целей подряд: 100% / 75% / 50% урона' },
  disengage:  { name: 'Выстрел и отход',    cd: 2, target: 'enemy', range: 0, desc: 'Выстрел, затем отход на 2 гекса без ударов вдогонку' },
  mark:       { name: 'Метка',              cd: 3, target: 'enemy', range: 0, desc: 'До конца хода цель получает +25% урона от всех' },
  raise:      { name: 'Поднять мёртвых',    cd: 2, target: 'corpse', range: 2, desc: 'Павший рядом встаёт скелетом' }
};

export const BASIC_UNITS = ['militia', 'swordsman', 'knight', 'archer', 'apprentice', 'battlemage'];
export const HEROES = ['alden', 'irena', 'corvin'];
export const UNDEAD = ['skeleton', 'ghoul', 'deathknight', 'acolyte'];
