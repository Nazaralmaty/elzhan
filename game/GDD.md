# Awakening of the Sources — GDD (agent notes)

Owner plays solo on MacBook trackpad, browser, GitHub Pages (`/game/`). UI language: Russian. All numbers are starting values, tune after playtests. Principle: solid base first, details after playtests; simplify RPG/graphics, never tactics/economy.

## Pillars
- Map = core (~70%), Polytopia-like, hex, turn-based.
- Economy = Cossacks logic, turn-based.
- Skirmish = small-squad hex tactics (Legend of the Void / Battle Brothers). Positioning is the point.
- Lane battle (Stick War) = greybox prototype only.
- Tribe prologue (Spore) = greybox prototype only.

## Controls
Click everything, no required right-click. Two-finger swipe or WASD pan; pinch or Q/E zoom; Enter end turn; Tab next idle unit; Esc cancel; 1/2/3 abilities; hover = path, damage forecast, tile yield. No precision drag. Targets ≥32px. Autosave every turn + 3 slots + file export/import (localStorage).

## Game settings (independent)
Length: short 12×12 map, 1 AI, 6 villages, 3 mana sources, 4–5 events, buildings −30%, growth ×1.5 · medium 20×20, 2–3 AI, 14 villages, 6 sources, 8–12 events · long 30×30, 4–5 AI, 26 villages, 10 sources, 15+ events.
Difficulty (same AI, different bonuses): Squire/Knight/Lord/King → AI income −25/0/+25/+50%; first AI attack turn ≥25/15/10/6; AI gang up on leader no/no/sometimes/yes; Morven growth ×0.7/1/1.2/1.5; player autobattle damage penalty 0/10/15/20%.
Hardcore checkbox: losing hero dies. Seed field.

## Map
Pointy-top hex, axial (q,r), slight vertical squash. Fog of war. Seeded gen: equidistant capitals, Morven on north edge, each capital has forest+hill+1 mana source within 4.
Terrain (move): plain 1, forest 2 (blocks sight), hill 2 (+1 sight), mountain ∞, water ∞, ore vein (hill) 2, gold vein (hill) 2, mana source 1, ruins 1 (story), neutral village 1.
Cities: capture neutral village by standing 1 turn. Territory radius 1 (7), radius 2 at city lvl 3. City lvl by pop: 8/15/25. Captured city keeps buildings at −1 level.

## Economy
Resources (kingdom-wide, no logistics): food, wood, stone, gold, iron, mana.
Peasants: pop = peasants, each eats 1 food/turn. Production buildings have slots 2/4/6 (lvl1–3, upgrade costs wood+stone). Manual +/− or per-city auto (priority: no starvation → upkeep shortfall → even). Idle peasant +1 food.
Growth: surplus food → city growth store; at `10 + 2×pop` → +1 pop, needs housing (town hall 4, house +4 / lvl2 +6). Starving: no growth, −1 pop/turn in largest city.
Upkeep per turn. Shortfall: turn 1 "unrest" −25% atk; then 1 unit deserts per turn (most expensive unpaid).
Market: any→any 3:1, lvl2 2:1. Mana not tradeable.
Start: capital pop 3, town hall + farm, 1 hero, 2 militia; food 20, wood 15, stone 5, gold 10.

Buildings (cost wood/stone/gold · tile · effect · adjacency):
- Town hall · center · +2 food +1 gold, housing 4, recruits militia
- House 8/2/0 · plain,hill · housing +4
- Farm 6/0/0 · plain · +2 food/peasant · +1 per adjacent mill
- Mill 10/6/0 · plain · no slots
- Sawmill 4/0/0 · forest · +2 wood/peasant · +1 if ≥2 adjacent forest
- Quarry 8/0/0 · hill · +2 stone/peasant
- Iron mine 10/6/0 · ore · +1 iron/peasant · +1 if adjacent forge
- Gold mine 10/8/0 · gold vein · +1 gold/peasant
- Market (1/city) 12/8/0 · plain · trade · +1 gold per adjacent house
- Barracks 12/6/0 · plain · swordsman, archer
- Forge 10/10/0 · any · required for swordsman/knight · next to iron mine: steel recruit −25% iron
- Stable 14/4/4 · plain, must touch farm · knight
- Mage tower 8/12/4 · mana source · +3 mana, 2 adept slots (+2 each), apprentice; lvl2 battle mage · +1 per adjacent source
- Walls (town hall upgrade) 0/20/0 · skirmish walls on arena edge, defenders +2 def
- Tavern (1/kingdom) 10/4/10 · new hero candidate every 8 turns

## Units
| unit | branch | HP | atk | def | move | rng | cost | upkeep |
|---|---|---|---|---|---|---|---|---|
| Militia | steel | 15 | 5 | 1 | 3 | 1 | 10f 4w | 1f |
| Swordsman | steel | 20 | 7 | 4 | 3 | 1 | 12f 8i | 1f 1i |
| Knight | steel | 22 | 9 | 3 | 5 | 1 | 15f 10g 8i | 2f 1g 1i |
| Archer | mana | 12 | 6 | 0 | 3 | 4 | 10f 8w | 1f |
| Apprentice | mana | 11 | 5m | 0 | 3 | 3 | 10f 8mana | 1f 1mana |
| Battle mage | mana | 12 | 8m | 0 | 3 | 3 | 10g 15mana | 1g 2mana |
m = magic: halves target def (floor). RPS: knight > archer/mage, shield-wall swordsman > knight, mages > swordsman blobs.
Abilities (cd): Militia "Spears forward" (2) opportunity strike ×1.5, ×2 vs knights · Swordsman "Shield wall" (2) +2 def self+adjacent allies, knockback immune, knights deal half · Knight "Charge" (3) straight 2–4 hexes, ignores ZoC, ×1.5 + knockback · Archer "Aimed shot" (2) +1 range, ignores cover · Apprentice "Heal" (2) ally r2 +6 · Battle mage "Fireball" (3) rng 4, hex+6 neighbors, 7 magic dmg incl. allies, costs 5 kingdom mana.
Map: stack ≤5 per hex (hero+4 or 5 units). Move: infantry/mages 2, knights 3, stack = slowest. Enter enemy hex/city → skirmish.

## Heroes
No equipment. 1 at start, max 3 (tavern, events). XP: +1 kill, +2 win, +1 participation; next lvl = 3×lvl; cap 8. Per lvl +3 HP +1 atk; lvls 3/5/7 pick 1 of 2 abilities. Defeat → wounded, back to capital 4 turns (hardcore: dies).
- Sir Alden (knight-commander) 26/8/3, mv4 r1: Challenge (enemies r2 must attack him), Cleave (3 adjacent arc). L3: Banner (+1 atk neighbors) / Unbreakable (+3 def below half HP).
- Irena (battle mage) 16/7m/0, mv3 r3: Ice wall (3 hexes line, 2 turns, blocks move+sight), Chain lightning (3 targets ≤2 apart, 3 mana). L3: Biting frost / Wellspring (−1 mana cost).
- Corvin (ranger) 18/7/1, mv4 r4: Disengage (after shot move 2, no opportunity), Mark (+25% dmg taken this turn). L3: Double shot / Trap.

## Skirmish (stage 1 focus)
Arena 8×6 hex, template by map terrain (field, forest, hills, ruins, village, walled city) + seeded obstacles. Deploy in own 2 columns.
Cells: grass 1; forest 2, −25% ranged/magic taken; hill 2, shooter +1 range, melee/ranged downhill +25%; rock (low cover) impassable, shoot over, target directly behind rock −50%; cliff/wall impassable, blocks LOS; water impassable.
Turns by side (XCOM). 2 actions/fighter: move+attack, move+move, move+ability; attack and ability exclusive per turn.
Positioning: (1) ZoC: entering adjacent-to-enemy hex ends move; leaving provokes 50% atk from each such enemy (Charge, Disengage ignore). (2) Flank: +25% per other ally adjacent to target (max +50%), pincer (opposite sides) +25%. (3) Cover as above. (4) Height. (5) Knockback 1 hex; blocked → +4 dmg target, +2 to unit hit. Facing deferred.
Damage: `max(1, round(atk × (1+bonuses) × (1−cover)) − def)`. Deterministic, no misses. Melee retaliation 50% atk once per enemy turn (ranged/mages don't). Hover forecast shows dmg, remaining HP, retaliation, bonus icons.
End: all enemies dead/fled; retreat = move back 1 hex, lose 1 unit. Wounds persist; heal +3/turn idle, +6 in own city.
Autobattle: same sim, AI for both sides, player dmg penalty by difficulty, pre-battle outcome estimate.
Skirmish AI: score moves = dmg dealt − taken + kill bonus + flank/pincer + mage protection − ZoC exits − exposed shooters; focus wounded, mages first.

## Lane war (1b) — v3, Age of War / Stick War Empires style (owner rejected round-based versions twice)
Real-time 1D lane, `js/rules/war.js` + `js/view/war-view.js`, pause/×2. Bases at both ends (600 HP, turret 9 dmg/s +4 per garrisoned ranged), mines next to bases. Gold: 150 start, passive 4/s growing +1 per 40 s (cap +8), miners +3/s each (50 gold, max 8, killable at the mine). Buy units into a training queue (max 5), army cap 20. Commands for the whole army: attack / defend (hold line ~290 from base, meet raiders) / garrison (retreat into base, heal 6/s). Ability: rain of arrows (cd 25 s, 30 dmg in ±130 around the enemy front unit). Unit traits: knight/death knight first hit ×2.2 after 1.2 s of not fighting, militia ×2.2 vs mounted, ghoul ×1.7 vs ranged, armour % (magic ignores), battlemage/Irena splash, apprentice heals, acolyte 35% raise skeleton from nearby deaths. Chosen hero = special unit (220, max 1). Enemy AI: miners first (saves for them), counters (spears vs mounted, fast vs ranged), attacks when army full or stronger, retreats below 50% value, casts rain on clusters. Difficulty → enemy income ×0.8/1/1.15/1.3. AI-vs-AI: all wars end, avg ~3.8 min, ~even.

## Lane war v4 (owner: "too fast, too simple, too 2D, needs upgrades")
`lane.html`, `js/rules/lane.js`, `js/view/lane-view.js`; v3 2D stays in the Arena. Field 1400×±130 (x, z depth), shown in 3D (1 world m = 10 sim units). Fortresses 1200 HP + guns 15 dmg/1.5 s (+5 per garrisoned shooter, +50%/bastion lvl). Miners walk mine↔fortress carrying 10 gold (2 at start, cap 6, +4 vein). Passive 2/s. 11 upgrades, one research at a time: picks, carts, vein, treasury, drill, forge, armor, powder, horses (unlocks cuirassier/death knight), foundry (unlocks cannon/bonecaster), walls. Humans: pikeman, musketeer, cossack, cuirassier, cannon; undead: skeleton, ghoul, acolyte (raise 8%), death knight, bonecaster; heroes Alden/Irena/Corvin. Per-branch commands (inf/rng/cav/art): attack, hold line (click field sets it), retreat (heals), flank (cav rides the edge to the enemy rear). Barrage ability 7 balls, cd 45 s. AI vs AI: 8–29 min, avg ~15, undead/humans ≈ even.
Artifact: claude.ai/artifact/HAPxjn4SxoR6K1mhhkh7aF (entry = lane.html without skeleton, root game/).

## Cossacks mode (owner: "closer to Cossacks: Back to War, strategy and tactics, better graphics")
`rts.html`, `js/rts/{data,map,path,sim,ai,main}.js`, `js/rts/view/world3d.js`, tests `tests/rts.test.js`. Real time, 10 Hz sim, cell = 2 m, maps 96/128/160, 1–3 AI, peace time, start normal/rich/army. Resources food/wood/stone/gold/iron/coal; everyone eats food, starvation kills; musket/tower shot 1 coal, cannon 3 coal + 1 iron. Peasants chop/quarry and carry to town hall or storehouse, farm 12 plots around a mill, work inside mines (5, 10 with deep mines) placed on deposits. Buildings: town hall, house, mill, storehouse, barracks, stable, blacksmith, foundry, mine, tower. Units: peasant, pikeman, musketeer, officer, drummer, cossack, dragoon, reiter, cannon. 17 upgrades. Formations: officer + drummer + 15/36 of one kind; line/column/square; volleys; morale (losses, officer/drummer death, cannon hits) → rout below 20. Cossacks capture: undefended peasants and buildings (not towers) switch sides. Defeat = no town hall and no peasants. Fog of war (player only, AI omniscient). Controls: click/box/double-click select, click or right-click orders, right-drag faces a formation, grid hotkeys QWERT/ASDFG/ZXCVB, arrows/swipe pan, pinch or +/- zoom, ,/. rotate.
Artifact: claude.ai/artifact/RRGGrWDUuVZmN5kVycsjwh.

## 3D engine (`js/gfx/`)
Three.js r170 vendored in `game/vendor/three`, import map. kit (pieces with vertex colour + tint mask, world-space grain, shared fog of war), models (low-poly rigs facing +X), crowd (instanced parts posed on CPU), fx (billboard smoke/glow, projectiles), scenery (terrain, props, backdrop), structures (buildings). Dev stand: `dev/models.html?m=…&a=…`.

## Tribe prologue greybox (3b)
Small fogged map, tent, chief, 3–4 tribesmen, food+wood only. 3–4 tribes, unify by peace (gifts, fire ritual minigame, request quest) or force (skirmish, clubs/slings). All unified → found kingdom. Peace-lean: mana recruit −20%, mages +2 HP. Force-lean: iron recruit −20%, steel +1 atk. Even: balanced.

## Rivals
AI kingdoms same rules. Relation −100..100; states war/peace/trade/alliance. Personalities: Conqueror, Merchant, Sorcerer.
Morven: no diplomacy. Power = 1 + mana sources held. Every 10 turns (× difficulty) spawns undead army sized by power, targets sources then cities. Undead: no food, no unrest, no healing. Skeleton (militia), Ghoul (mv5, low def, hunts shooters), Death knight (Charge), Necro-acolyte (Raise dead: fallen adjacent fighter of any side → skeleton).

## Victory / defeat
Story (main): event chain + take Morven's citadel. Conquest: all AI capitals (Morven must still fall). Alliance: ally all surviving kingdoms + take citadel. Defeat: capital lost or Morven holds half of all mana sources.

## Story (spoilers, owner wants surprise — don't show in UI copy prematurely)
Magic slept 100 years; sources reawaken. Morven, exiled court mage, raises dead in north. Advisor Meir narrates events. Twist: Meir framed Morven; Morven learned sources drain the land's life force; Meir hid it to keep magic and power. Exiled, Morven became the necromancer he was accused of being.
Chain (★ = short game): 1★ Light in stone (t3: build tower hint, −30% first tower / +10 stone) · 2★ Wounded messenger (t8: reveal Morven lands / neighbor +20) · 3 Northern refugees (t12: +3 pop −15 food / nearest AI takes them) · 4 Envoy's price (alliance for a mana source / −15 rel / 30 gold peace) · 5 Morven's apprentice Tarn (t18: hero Tarn w/ Raise dead / execute +10 all AI / release) · 6★ Academy ruins (story skirmish: skeletons + Stone guardian; +30 mana + Morven's diary) · 7★ North awakens (t30: Morven marches, power meter shown) · 8 Meir's confession (after 6: execute −1 gold/turn, Tarn loyal / forgive / hand to Morven: 10 turns safe, all AI −20) · 9 Tarn's choice (t40: if Meir forgiven Tarn defects with 2 units; else ritual 3 skeletons AI −10 / refuse Tarn +2 lvl) · 10 Council of kings (power ≥4: alliance with rel ≥20, unlocks alliance win) · 11 Drained source (Morven 3rd source: −1 food to my buildings near his sources) · 12★ Citadel (gate skirmish, throne skirmish).
Morven boss: 60 HP, 9m atk, 3 def, mv3, r3. Raise dead each turn; Ice crown (adjacent move ×2); phase 2 at <30 HP: 2 sources open on arena, heal 4/turn while lit, occupy to stop.
Epilogue choice: seal sources (magic sleeps, land heals) / keep (magic stays, land darkens, sequel hint). One line each on Meir, Tarn, each kingdom.
Side events (long): wandering knight duel → free hero; famine; wolves at sawmill; fair (1.5:1 market 3 turns); source heresy; old map → treasure ruins; mage duel; defector sells city.
Random small events all lengths: harvest, mine collapse, trader 2:1 once, gifted child +1 xp, sawmill fire, treasure.

## Visual
Flat minimal (Polytopia, Dorfromantik, Bad North, Islanders). All game graphics SVG in code, faction-recolorable. No gradients/textures, soft flat shadow, rounded shapes.
Palette: plain #E9DFC4, grass #7FB069, forest #3E7C59, hill #B9A27A, mountain #8A8F98, water #5AA9E6, mana #7B5CFF. Factions: player #2F6FDB, AI #D64545 #E0A526 #3BA55C #8E44AD, Morven #1F2A2E + #7CFFB2.
Figures: 5–8 parts (torso, head, helm/hood, weapon arm, shield/staff arm, stub legs) on pivots; faction color = tabard + flag. Tween anims: idle bob, hop between hexes, attack windup+lunge, hit flinch + floating number, death tip over + fade, cast arms up + ring.
Illustrations (events, hero portraits, title): flat SVG placeholders now, later Flux (see below). Mockup: `game/mockup/index.html`.

## Tech
Plain SVG DOM + CSS/WAAPI animations (switched from Phaser: reuses mockup art 1:1, no vendor, enough perf). ES modules, no build (keeps Pages branch deploy; don't touch resume/astana). Rules = pure functions over state returning event lists; view plays events. Tests: `node --test game/tests/*.test.js` (`game/package.json` type=module). Seeded RNG. Local: `python3 -m http.server 8000` → `/game/`.
Built (stage 1): `index.html`, `css/game.css`, `js/{main.js, core/{hex,rng}.js, data/units.js, rules/skirmish.js, ai/skirmish-ai.js, view/{board,art}.js}`, `tests/skirmish.test.js`. Arena artifact: claude.ai/artifact/9aTYKegqhJqCXSiqt4uHzA (entry page = index.html without skeleton, root game/). Mockup artifact: claude.ai/artifact/P8odCGBipo3HdAXZi1z62p.
Arena specifics: player squad = hero + 4 (or 5 without hero); enemy by budget per difficulty 13/17/21/25, red mirror budget ×0.8; attack/ability ends unit turn (except Disengage → free 2-hex move); ZoC only from melee units; corpses enable Raise dead; arena mana 20 per side. AI-vs-AI balance at budget 17: undead ~68% player win, red 53–83%.
Stage 2 built: `kingdom.html`, `js/kingdom-main.js`, `js/rules/{map,economy,kingdom}.js`, `js/data/buildings.js`, `js/view/{map-view,battle-screen}.js` (battle screen shared with arena), `tests/kingdom.test.js`. Kingdom artifact: claude.ai/artifact/XiDX8pitnBe3ENNqmUDpqf. Debug handle `window.__kingdom`.
Stage 2 territory/iron (owner: "no iron, territory useless"): radius = min(4, level) + 1 for capital; levels at pop 6/12/20; outpost building (12 wood 6 stone) only on explored hexes adjacent to the border, claims radius 1 for the neighbouring city and gives sight 2; generator guarantees ore within 2 and gold within 3 of capital, 25% of hills become ore/gold; iron mine +2/worker; steel upkeep is food+gold only (swordsman 1f 1g, knight 2f 2g); start iron 10.
Stage 2 peasants: town hall hires a peasant for 12 food (scaled) if housing free; growth need = ceil((6+pop)/growthMult) (short 1.5, medium 1.2); town hall housing 6, house 5/8; start res food 30 wood 25 stone 10 gold 15; short map costs ×0.7. Click on town tile (not figures) opens city; garrison drawn offset.
Stage 2 decisions: capital territory radius 2 from start (generator guarantees forest/hill/mana within 2); sandbox goal = clear all lairs; lairs passive, tiered by distance (undead or bandits), rewards; wandering undead from north every N turns from turn 8 (size table), target nearest city/army; empty city raises temp militia (2 + pop/4, +swordsman if walls/capital), loss razes city, capital razed = defeat; village captured when army ends turn on it; heroes level from battles (+3 HP +1 atk), ability picks at 3/5/7 deferred; wounded hero returns to capital after 4 turns (hardcore: dies); autobattle from map uses same AI, 10% penalty; skirmish arena from defender tile; save in localStorage `aos.kingdom.save`.
Later stages: add `rules/{diplomacy,events}.js`, `ai/{kingdom,morven}-ai.js`, `data/{buildings,terrain,heroes,events,art-manifest}.js`.

## Stages (each ends with a playable Pages link + owner feedback)
1. Arena: pick squad vs AI, all units/heroes, all skirmish rules, forecast, autobattle, animated figures. Done = 10 fights in a row feel positional, AI not dumb.
1b. Lane battle greybox.
2. Map + economy, neutral monsters, map→skirmish. Done = 50 turns of building + fighting.
3. Full game (beta): AI kingdoms, diplomacy, Morven, events, 3 wins, settings, saves, menu.
3b. Tribe greybox.
Deferred: facing, roads/caravans/logistics, handcrafted campaign, mobile, audio, full lane battles/prologue.

## Flux handoff (after stage 3)
Owner runs local Claude Code on the MacBook with Flux (no ComfyUI). Give it a self-contained prompt: locate Flux runner (mflux / diffusers / Draw Things), ask owner if not found, no installs without consent; read `js/data/art-manifest.js` (id, path, size, scene); style prefix "flat vector illustration, minimalist, Polytopia + Dorfromantik, palette above, soft flat shadows, no gradients, no text"; portraits bust on #E9DFC4; 3 test images first, wait for OK; then all, webp q85 (events 1024×576, portraits 512×512, title 1920×1080), variant -b; only flip `ready:true` in manifest; commit, don't push.
