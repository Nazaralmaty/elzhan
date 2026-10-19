# Репозиторий elzhan

Сайт-резюме (`index.html`), 3D-сцена Байтерека (`astana/`) и — с 19.10.2026 — облачная копия контент-завода для рилсов.

## Контент-завод в облаке

- `engine/` — копия `~/.claude/engine` с Mac (рендер, жанры, qa). На Linux `engine/cloud_setup.sh` (хук SessionStart в
  `.claude/settings.json`) связывает `~/.claude/engine → engine/` и ставит puppeteer; `browser.js` берёт Chromium Playwright.
- `.claude/skills/podcast-reel`, `.claude/skills/speaker-canvas` — скиллы как на Mac (с `tools/` и `examples/`).
- `КОНТЕНТ ЗАВОД КЛИЕНТЫ/atlas_tourism/` — клиент: `CLAUDE.md` (законы), `_ассеты/` (mech.js, geom.js, outro.js,
  client.json, скрипты выпусков), брифы. Пути внутри скиллов и спеков совпадают с Mac (`../_ассеты/mech.js`).
- Текущий рилс: `КОНТЕНТ ЗАВОД КЛИЕНТЫ/atlas_tourism/reel_mekke_ake/CLAUDE.md` — статус и открытые вопросы.

В облаке НЕТ (на Mac есть): macOS Vision (матт, лицо, жесты), whisper/Scribe, FLUX, библиотеки
`~/.claude/assets/sfx`, `bgm`, `assets/flat`, `_ассеты/img`, `_ассеты/img_lib`. Не изображать их работу — сказать, чего не хватает.
