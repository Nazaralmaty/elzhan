---
name: speaker-canvas
description: Vertical reel over shot footage of a speaker in the /motion-canvas-pro language — the take is an INSERT of the canvas: full frame on a flat camera, a small framed card standing among a brand world's inserts (the full frame shrinks into it and grows back on a matched picture), or the speaker cut out by the matte standing in a world (the park floods away and he stays). Over the take the subtitle line carries the words; pure brand worlds (kinetic type, glass, stickers, dives, stack rows) join by iris / band / tone flood / flash; subtitles run only on the face. Built on engine genre speaker-canvas.js (canvas.js + speaker.js subtitles). Use for "монтаж со спикером в стиле canvas-pro", "дорогой моушн поверх съёмки", "говорящая голова, но как моушн-дизайн", "вырежи спикера и вставь в канвас", and when a /speaker-reel build was rejected as "просто вставки поверх видео".
---

# speaker-canvas

Read `/reel-engine`; look element kinds, seams, dives, stacks, tones and traps up in `/motion-canvas-pro` on demand.
This file adds only what footage changes. Runtime: `~/.claude/engine/genre/speaker-canvas.js`.
Start: `engine/new.sh speaker-canvas <folder> --client <id>` + `engine/gen/skel.py` (clean skeleton, client preset).
Full worked reel for reference: `~/.claude/engine/examples/_archive/speaker-canvas_zawajy_reel024/` (41 s, 11 beats,
5 worlds, two take cards with shrink / grow, two cut-outs, two dives, three floods).

## Pipeline

```bash
engine/new.sh speaker-canvas "<client>/reel_NNN_<topic>"; cd "<client>/reel_NNN_<topic>"
engine/cut.py transcribe raw*.mov → engine/cut.py build --keep …     # exactly as /speaker-reel (cut law, /obrezka)
engine/cam.sh work/cut.mp4 --lang ru                                  # frames, matte, qa/face.json, words.js, voice.wav
# RE-CUT → BOTH derivatives again, never one: frames come from work/cut.mp4 and so does voice.wav.
# Rebuilding work/fr by hand (a per-shot crop, say) while cam.sh is skipped leaves the OLD speech under the NEW picture —
# «видеоряд и аудио не совпадают» (Elzhan, 17.09.2026, on a master whose voice was 95.3 s and whose frames were 83.2 s).
# Gate before every build: durations of the FINAL take (plate.json["src"] — work/take.mov once a CTA tail is glued on, NOT work/cut.mp4), the voice and plate.json["dur"] must agree within 0.05 s, and frames/fps must equal that duration. Enforced in engine/qa/master.py; naming cut.mp4 here used to fail every reel that has a tail (reel_007: take 88.605, cut 83.593).
# reel.json: { "palette": "canvas", "voice": "assets/vo/voice.wav", "bgm": "", "lufs": -14, "lang": "kk" }
#   "lang" обязателен: engine/qa/master.py судит «ээ» и вдохи и язык НЕ угадывает —
#   русская модель на казахской речи выдаёт вердикт, похожий на результат.
# index.html: brand CSS (#stage-prefixed), then work/plate.js, assets/vo/words.js, spec.js
node engine/render.js --sheet 24        # contact sheet within 20 min; READ the console lines it prints (on: misses)
node engine/qa/overlap.js               # canvas gates + HEAD COVERED; exit 0 before the full render
node engine/qa/rows.js                  # the type ladder across acts: one column, 5-6 rows, the cage
caffeinate -i node engine/render.js --workers 7 && caffeinate -i engine/build.sh
```

Re-using a take already cut for another reel: `cp -c -R ../reel_X/work/fr ../reel_X/work/mt work/` (APFS clone) plus `work/plate.js`, `qa/face.json`, `assets/vo/voice.wav`, `assets/vo/words.js`.

## Never tilt or pull back the full frame (Elzhan 15.09.2026, on v1)

v1 made the take a room and tilted it / pulled back from it: «она немного наклоняется и появляются розовые границы — это не
красиво». A full-frame take that shows a sliver of ground around it reads as a mistake, not as a card. The take lives in
three sizes and never in between:

| Mode | Spec | Size on screen | Camera |
|---|---|---|---|
| **full** | the room with `footage: true` (plate z 1, `behind: true` z 2, matte z 3, front z 4) | the frame | flat, `z 1.07–1.2`, no `rx/ry`, never under 1.06 |
| **card** | `{ k: 'footage', mode: 'card', id, x, y, w: 300–440, border: 10, r: 34, lift, win, dir }` in any world | 30–40 % of the frame width | anything the world does — dives, floods, truck |
| **strip** | the same card printed as a BAND on a SHEET LARGER THAN THE FRAME: `dir` frames are `pad`-ed to 1620×2880, placed `x: -270, y: -480, w: 1620, h: 2880, border: 0, r: 0, shadow: false`. **One strip per room**: it enters `anim: 'none'`, which has no opacity keys, so every strip is drawn from second 0 — a later beat's opaque sheet sits above an earlier beat's type in the same room and hides it while the DOM says the type is on top (icon/reel_037: «8 ЛЕТ» missing for six rounds) | the band spans the full width, the sheet is never seen | the world's own tilt |
| **cut** | `{ k: 'footage', mode: 'cut', x, y, w: 880–1080, fade: .12–.16, outline: 0 \| 7 }` in any world | the speaker without his park | **no edge of the matte may cross the frame — bottom, left or right** — «нельзя никогда делать так, что границы матте спикера стоят до границ экрана… снизу, справа и слева он вырезан — так не должно быть» (Elzhan, 17.09.2026): a bust that stops mid-frame reads as a man standing on nothing, and a dead straight line down his shoulder reads as a broken export. The rectangle is fixed, so the CAMERA obeys: a 1:1 cut-out (`x: 0, y: 0, w: 1080`) — the one a background drop needs, since it matches the plate and the seam does not move — covers the frame only at **z ≥ 1.06 centred near (540, 960)**; the visible band is 1080/z by 1920/z, so anything under 1.0 lets the edges in. A dropped-into world therefore keeps the close camera of the face beats and puts its type in the lower third; it does not pull back. Pull back only from a cut-out deliberately oversized past the widest band the camera will ever reach (`x: -150, y: -160, w: 1380` for z 0.88) — and that one no longer matches the plate, so pay for it with a cut, not with a flood. **The bottom is the BODY's bottom, not the box's**: a seated speaker's matte ends at the table edge (y 1584–1680 of the plate on icon/reel_039), above the box bottom, so `fade` and the box gate see nothing while the frame shows bare ground under him — «внизу спикера ничего нет и желтый фон стоит там тоже» (Elzhan, 24.09.2026). Measure the lowest body row over the beat's frames (`work/mt`, last opaque row per column inside the visible x range) and keep the frame bottom `camY + 960/z` above it for every key: reel_039 needed z 1.28–1.34 at y 845→822, with world type moved to the x 200 column so the zoom keeps it inside the cage. `qa/take.js` does not measure this. Cannot satisfy this at the size the world needs → drop the cut-out, play the beat **full frame 9:16** and move the graphics into the band under the chin |

All takes play the same frame — **the frame of the current second**. The lips in a card match the word being
spoken, and that is a law: «все вставки спикера вообще не подходят по таймингу, это вообще другие видеоряды,
ровно ровно по таймингу работай» (Elzhan, 17.09.2026, on a build whose cards looped another stretch of the
take). A still is rejected too («вставка не видео, а просто фото, она не двигается») — but the answer is the
live CURRENT frame, never B-roll of the same speaker: a loop replays from its first frame at every appearance,
so the man is visibly saying something else while his voice says this.

**A card is a sheet, and a tilted world projects that sheet wider than its coordinates.** Its white backing and its
two drop shadows used to be welded into the element; at `ry` 9–14 they drew the sheet's own corner and edge across
the frame — «вот таких границ карточки при наклоне не должно быть» (Elzhan, 17.09.2026, on the «8 лет» beat). So a
card now obeys `shadow: false`, `bg` and a free `h`, and the **full-width band is printed on a sheet bigger than the
frame**: the band itself is 1160 px (wider than 1080 — side margins read as a band that has slipped), the sheet
around it 1620×2880 in the world's own ground. A sheet the size of the frame is the defect, not the tilt: shrinking
`ry` only hides it until the next drift. Print the band ≥ 1080 wide and the sheet ≥ 1.5× the frame, and the tilt
is free.

Under a world the plate is usually the wide shot, so a plain card there shows an unusable 9:16 crop of the whole
table. **That is what `dir` is for**: a second full-length track cut from `work/cut.mp4` with a crop per plan span
— the normal crop on close-ups, a crop around the speaker on wides (in a wide he does not sit centre). The index
stays the current frame, so sync follows from construction and needs no tuning. `win: [t0, t1]` loops a chosen
window instead and breaks sync by design — it is not used for an insert of a speaker who is talking.

Every take has its own head marker, so the head gate works on a card and a cut-out too.

## The spec — canvas spec plus these keys

```js
import { mount } from './engine/genre/speaker-canvas.js';
mount({
  subs: { y: 255, size: 60, words: 3, hits: ['никах'] },   // screen space; only in footage-room beats unless a beat says subs: true
  rooms: [
    { id: 'face', x: 0, y: 0, footage: true },
    { id: 'news', x: 6000, y: 0, w: 1080, h: 2700, top: 700, bg: 'peri' },   // worlds ≥ 2·bleed apart
  ],
  beats: [
    { room: 'face', cam: [{ at: 0, x: 540, y: 930, z: 1.07 }, { at: .95, x: 540, y: 940, z: 1.1 }] },   // subtitles only
    { from: 'но#2', room: 'news', shrink: 'tk1', grow: 'tk1',          // full frame → card, and card → the next beat's full frame
      cam: [{ at: .24, x: 540, y: 960, z: 1.0 }, { at: .84, x: 555, y: 990, z: 1.03 }],
      add: [ { k: 'footage', mode: 'card', id: 'tk1', x: 70, y: 300, w: 420, at: -.3, anim: 'none', until: 1.2 },
             { k: 'photo', src: 'wedding.jpg', x: 470, y: 470, w: 520, rot: 4, on: 'новость', until: 1.2 } ] },
    { from: 'это#2', room: 'face', cam: [{ at: 0, x: 540, y: 930, z: 1.07 }, …] },
    { from: 'он', room: 'people', cut: { kind: 'tone', color: '#ED2066', dur: .8 },   // the park floods away, the cut-out stays in place
      cam: [{ at: 0, x: 540, y: 940, z: 1.1 }, { at: .42, x: 540, y: 1010, z: .84 }],
      add: [ { k: 'footage', mode: 'cut', x: 0, y: 0, w: 1080, at: -.3, anim: 'none', fade: .12, outline: 7, until: 1.0 } ] },
  ] });
```

- **`from`** = the first spoken word of the beat (normalized prefix, searched after the previous beat's start; `#2` =
  second hit). Beat 0 starts at 0.
  **`on:` is NOT normalized the way `from:` is — write it already stripped.** `speaker-canvas` builds the word
  track with `norm()` (letters and digits only), while `canvas.js`'s `wordAt` lowercases the query and replaces
  `ё` only. So a hyphenated or punctuated query never matches its own word: `on: 'Зәм-зәмді'` missed silently and
  fell back to `at`, visible only as `warn: on: word … not found` in the render log. Write `on: 'зәмзәмді'`.
  Same trap with a different cause on `k: 'grid'`, where `on` means the number of lit cells, not a word — time a
  grid with `at: '12.34s'`. Beats ARE the lines: the canvas timeline (VO / WORDS / LINES) is built from the take's
  own whisper words, so `on:`, `aim`, `truck` work as in canvas-pro. **Short words hit early** — `'но'` matched «…никах,
  **но** его удалили» and swallowed half of the hook. Print the table: `node engine/qa/lines.js`.
- **`shrink: 'id'`** puts a first camera key that frames the card exactly as the previous full-frame key framed the plate
  (zoom = z·1080/card width, +4 % overscan — the drift is multiplied by the zoom and showed the card edge), with a hard cut:
  the same picture on both sides, then the camera pulls back and the world appears around him. The card must be rot 0,
  `anim: 'none'`, `at` < 0. **`grow: 'id'`** is the reverse on the beat's last key (`growHold` .72); the next beat must be in
  the footage room and starts with a plain full-frame key.
- **Background drop**: a `cut` take at `x 0, y 0, w 1080` in a new world, the beat's first key equal to the previous
  full-frame key, `cut: tone`. The flood sweeps the park away under a speaker who does not move; then pull back.
- `outline: 7` = white sticker stroke (the client's Figma stickers carry one). Use it on a light or pink ground; on dark
  the drop shadow alone.
- Defaults for footage: `wig: 0`, `drift` halved.

## Composition — measured on the example

- **Subtitles live in one zone; inserts go anywhere** (Elzhan, 24.09.2026, icon/reel_037: «именно субтитры не должны
  появляться везде, а другие вставки, картинки, видеоряд — могут быть по-разному в нескольких местах»). Over the take
  the words are carried by the subtitle line alone, emphasis through `subs.hits` — no kicker or pill repeating the
  speech. Photos, litho cut-outs, clips and cards stand wherever the frame needs them, over the take too (clear of the
  head). **A full-screen world of type alone is a defect** («эти кадры практически полностью пустые»): it always
  carries an object or photo that proves the line — `assets/litho` before a new FLUX. An infographic is designed, not a
  bare `bars`/`num`: a metaphor in the brand's style (reel_037: a tape measure for «time with the client»), laid out
  in HTML and captured frame by frame into a `seq`.
- **One hero per world, everything else smaller**: wedding photo 520 wide over a 420 take card; cut-out speaker 1000
  wide against 88 px type. Two equal cards side by side read as a slide.
- **The card's position is set by her gesture, not by a default corner**: pointing up → the card sits low and the
  object lands above it; an open palm to a side → the object lands on that side, so a card at the frame edge cannot
  answer a gesture towards that edge (eto/reel_001_uip: palm right in a card at the right edge, checklist left of a
  finger pointing up — the client's correction). Spans come from `engine/gesture.py` (`qa/gestures.json`), held by `qa/gesture.js`.
- **Take card upper-left third, hero overlapping its lower-right corner, one text row in the lower third**
  (y 1330–1600). The first 1–2 s after the shrink must already hold the hero: it lands on the first content word,
  not on the line's last one.
- **Cut-out speaker on the right half**, head at x 650–890, y 900–1170; the text column left (x 80–640):
  one text block (the claim) in that column — not a kicker/HIT/pill stack. The crop line of the cut-out
  lies below the frame bottom for the whole camera path, and its side edges stay outside it too; `fade` hides the rest.
- **A take card among dark-world inserts**: card upper-right (w ≈ 320, rot 4, lift 80), logo mid-left, one headline
  lower-left, a sticker lower-right clear of it. When the next line lands in the same world,
  keep the camera near the same band and put its inserts where the last line's words left — do not glide to an empty
  lower half.
- **`behind: true` type** (a word in the headroom) competes with the subtitle line right above it — rare, and only
  between the subtitle line and the head top (`qa/face.json`), never over the body, which is opaque and hides it.
- Face full frame ≥ 50 % of the reel counting the cut-out beats as face.

## Laws that stay prose

- **A beat boundary in the footage room is set by the CUT IN THE SOURCE, not by the end of the phrase.** The moment the
  take cuts to anyone but the speaker (a second camera, the host, a wide of the table), the footage room is illegal —
  even for half a second, even mid-sentence. Put the world beat's `from` on the last word BEFORE that cut and let the
  headline land later on its own word (`on:`). Widening the seam does not help: a bigger `lead` moves only the cover,
  while the camera returns to the plate until the new beat's first key — measured on a build, the host came back for
  0.6 s and read worse than before. When the world now opens earlier than its hook, carry the previous beat's verdict
  in as a band: `ghost`, `beam` and `glass` do not count as content and `EMPTY FRAME` fires.

- Factory speaker laws hold: head incl. hair untouchable by front graphics (≥ 15 px), no background geometry (beam,
  glow, grid) over the full-frame take — those live in worlds, around cards and cut-outs; grade `-k ≤ 0.35`, split 20–35°, `grade.py match` exit 0.
- **A lifted element (`lift`, needed by a dive's `aim`) sits above every element of the world and `TEXT COVERED` does not see it**: its box must clear the world's text rows by itself — icon/reel_039 put a 640-wide print over its own band «семья с детьми» («картинки стоят сверху текстов», Elzhan 24.09.2026); 560 wide at y 500 with the band on 1430 fixed it.
- **Every lifted element and every element of a beat that shares its room with the next gets `until`** (a lifted
  element lives on the root and outlives every cut). A take card may run across two beats: `until: '35.9s'`.
- Subtitles at y 255–290 over the head are the one text zone of the take. In worlds the line is carried by type and inserts.
- **Anything in front of the take is SCREEN space, and the genre puts it there itself** (`screen: true`): a beat's zoom
  (1.06…1.30) multiplies the distance from the frame centre, and reel_008's four per-role rows became 21 on screen
  («субтитры появляются все время в разных местах», 17.09.2026). With the subtitle law the words in that front layer
  are the subtitle line alone; pictures and footage are free. Type in a world keeps the world's coordinates and one ladder for the reel: one column, rows
  flush or 40+ px apart, a band's y carrying its rotation bulge (≈ w·sin(rot)/2). `node engine/qa/rows.js`;
  reasoning in `/frame-geometry`.
- The first world after an iris / band / flood cut carries content at the cut (`at: -.06…-.3`).
- **A seam is paid for out of the PREVIOUS beat, so the kind is chosen by arithmetic, not by taste.**
  Subtitles and elements must die `lead + cover` before the beat starts: a tone flood costs
  `lead + dur` ≈ **0.96 s**, a band `lead + dur/2` ≈ 0.41, an iris `lead + in` ≈ 0.38, a flash ≈ 0.20,
  a hard cut ≈ 0.12. On 1–2 s beats a tone flood therefore eats the whole line under it — measured on
  atlas reel_013: six inserts in a row fell under the reading law, and the fix was the seam, not the
  text. Pick seams after the reading-law pass (`max(1.2, chars/13 + 0.6) + dur`), keep one tone flood
  for the beat that is long enough to pay for it, and never let two world changes share a kind.

## Gates

`node engine/qa/take.js` — the two laws about the take itself, measured on the rendered
page (17.09.2026). Separate from `overlap.js` on purpose: that file has five early
returns (camera moving, tilt, tone flood, blur) and a matte edge shows up exactly during
a pull-back, so it has to be sampled on every frame.

- **OPENS WITHOUT A FACE** — by 0.30 s a take must stand in frame and not as a small
  card (≥ 700 px). A wide shot gives no face at any crop, so the order of the pieces
  obeys this law and not the chronology.
- **MATTE EDGE VISIBLE** — for a `mode: 'cut'`, a **visible** edge is the defect: the
  box edge lying inside the frame means the body was already cut by the source frame,
  and shrinking that cut-out into a world draws that cut as a straight line down his
  side. An edge that runs off past the frame is fine — nobody sees it. The bottom is
  exempt when it carries a mask (`fade`, default .16). Verified both ways on reel_006:
  its cut-out sits at x 130 w 900, the box lands ~104 px inside the left border, and the
  matte's own alpha bbox reaches x 6 of 1080 — the body is cut at the source, so the line
  is real. The first version of this gate had the condition inverted and failed the
  deliberately faded bottom instead; the box is a proxy, checked against matte pixels.

**A card that shows the plate is only legal while the full frame is collapsing into
it.** A card with no `dir` renders as `img.fp` — the plate — and under a world the plate
crop is a close-up, so on a wide shot the card catches the middle of the table. That is
the desync Elzhan rejected three times in a row. The exemption is real, though: on a beat
with `shrink`/`grow` naming that card's own id, the card IS the full frame shrinking, and
the plate is exactly what belongs inside it. Checked across atlas 17.09.2026 — every
plate-card is covered (reel_006 `tk1` under `shrink`, reel_005 `tk1` under `shrink`+`grow`,
reel_002 `tk1`/`tk2`), so there is no live violation to gate against; the rejected shapes
(`k: 'seq'` loop, `win` window, a still) survive only in reel_001, which predates the law.
No gate was written for this: a rule with an exemption the runtime cannot see, and nothing
to validate it on, ships as law and not as code.

## Layout gates (all in `qa/overlap.js`, exit 1 on any)

- Canvas gates unchanged (OUT OF FRAME, TEXT OVER TEXT, TEXT COVERED, STAGE VISIBLE, EMPTY FRAME, HOOK DIMMED).
  The plate and matte carry `.footage` and are excluded from image / occluder tests; the plate counts as content.
- **HEAD COVERED** (new, 15.09.2026): with `qa/face.json` present, any front word, subtitle unit, card, photo, sticker
  or lifted insert within 15 px of the head box (projected through the camera, tilts included) fails. Skipped during a
  tone flood (the take is projected, not seen) and for elements of other rooms. It caught subtitles touching the head
  while they entered from below during a dive — fixed by the camera (`y` of the first key), not by the gate.
- **Nothing inside one `html` / SVG layer is gated.** `qa/overlap.js` measures the layer's box, never the
  glyphs or shapes within it, so a beat's tilt (`rx` / `ry`) can drop an internal frame onto internal text and
  every gate still reports clean. Compute internal clearances by hand and confirm them on a rendered frame —
  a schematic that reads fine flat can collide at `ry 15`.
- **`qa/rows.js`** (new, 17.09.2026): the ladder across acts — RIDES THE CAMERA (front lettering left inside the
  footage room), NEAR ROWS / COLUMNS, TOO MANY ROWS / COLUMNS, OUT OF CAGE. The cage (x 71…1012, y 235…1590,
  right ≤ 858 below 1348) is measured by nothing else here: `qa/bounds.js` looks for the faceless genres' class
  names and `qa/overlap.js` knows the frame edge (all four sides since 22.09.2026), not the cage — bands at y 1660 passed it.
- `qa/speaker.js` does NOT apply (it expects the speaker genre's plate layers); chiron is not measured.
- The line table: `node engine/qa/lines.js` prints every beat's window and text plus console warnings. Also
  read the render log: since 15.09.2026 `render.js` prints `console.warn` (it filtered `warning`, puppeteer says
  `warn` — every `on:` miss in every genre used to be silent).

## Working order

1. Cut FIRST, and stop: `cut.py build` → **P1, Elzhan hears `work/cut/cut16.wav`** and sends timecodes. Only on his
   yes: `cam.sh`. Pass `--no-matte` unless the spec asks for `mode:'cut'` or `behind: true` — the matte layer otherwise
   lays a frame's own pixels back over itself and costs 14-33 min (measured: 823 s / 933 s / 1862 s / 2007 s on four
   reels that used neither). Needs it in places only → `--spans` over those acts. Word track comes from the episode's
   own ASR via `engine/cut/words_take.py`, not from whisper. Then split into beats by sentence; `node engine/qa/lines.js`.
2. Plan per line: full face (claims, reactions, CTA), take card among inserts (a proof that needs the face beside it),
   cut-out speaker in a world (a line about people or purpose), pure world (review, list, path). Face ≥ 50 %, a device
   change every 4–9 s, **a new visual hook every 3 s** — split any beat longer than ~4 s into 2–4 s beats, each with
   its own camera move, and open every world on an element (`at: -.05`), never on bare ground. Match seams
   (shrink / grow, background drop) where the picture can continue.
3. Brand layer: the client's grounds, font, stickers, logo, their own posts as `photo` inserts (never a faked UI).
4. Spec from the client's mechanics (`КЛИЕНТ/_ассеты/mech.js` + `geom.js`): the reel declares text, anchor word,
   role and row NAME; rows, sizes, colours, bound decoration and camera presets come from the client's constants.
   Then `--sheet 24` → `overlap.js` → `--at` on every shrink / grow / drop (the frame after the cut must show no card
   edge) → full render → `build.sh` (its last step `qa/all.sh` runs every gate) → watch at 1× against `ПРИЁМКА.md` →
   send `out/reel.mp4` with sound. The first sheet goes to Elzhan within 20 minutes; it does not replace watching the master.
   A visual-only fix re-renders its act alone: `--only <a>-<b> --out renders/frames`, bounded by act edges, with no
   element living across the boundary.
5. Reel `CLAUDE.md`: references borrowed, what to confirm.

## What breaks the language

Everything in `/motion-canvas-pro`'s list, plus: a full-frame take tilted or pulled back so its edge or the ground shows;
a take card over 45 % of the frame width; a cut-out any of whose own edges — bottom, left or right — crosses the frame; a master built while work/cut.mp4, assets/vo/voice.wav and work/plate.json disagree in length; a lifted insert without
`until`; type in front of the head; a beam or glow over the full-frame take; subtitles running over a world; two
equal-sized inserts side by side; a world that opens empty for more than a second; the face under 50 % of the reel;
a `from` on a one- or two-letter word without `#N`;
**`chars: 'type'` on a word that does not fit its line** — the letters are held in one unbreakable span, so `wrap`
cannot save them and the tail is cut by the frame edge while every gate stays silent. Measured 17.09.2026: 11 glyphs
at `s` 92 gave «ОДИНОЧЕСТ», 8 at `s` 92 gave «НЕ РЯДО». Keep `chars × s × 0.58 ≤ wrap`, or drop `chars` and let the
word wrap — the per-letter events it buys back are not worth a clipped headline.
