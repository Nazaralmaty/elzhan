# Client: ATLAS TOURISM

Umrah and қажылық (hajj) tour operator from Kazakhstan. Runs the ATLAS PODCAST.
YouTube `@Atlastourismm`, WhatsApp +7 702 151 0000. Client and audience language: Kazakh.

Machine values (palette, fonts, voice, music, subtitles, CTA, bans) live in `_ассеты/client.json` — read by `engine/new.sh --client` and `engine/gen/skel.py`; change them there. This file keeps the reasons.

Read **after** `КОНТЕНТ ЗАВОД КЛИЕНТЫ/CLAUDE.md` — this file supplements it, does not replace it.

**Status: lead.** No brief from the client. Everything below comes from their own episodes
(`YH40l5X22jo`, 14.09.2026; `ekGI63wJ9cc`, 28.09.2026; `VAWZ--dNPps`, 19.10.2026) and their descriptions. Nothing beyond that goes on screen.

---

## 0. Where work on this client starts

All podcast material and all experience from three cuts is consolidated in two places. Reel folders
are deleted — do not reference them or search them.

1. **`ПОДКАСТ_01_РАЗБОР.md`** — episode №1: rated chapter map, what's already cut, what's free,
   cut numbers, Kazakh text rules, breakdown of the `reel_002` edit, sound.
   Read **before** `/podcast-reel` and before choosing any chapter. **Episode №2 — `ПОДКАСТ_02_РАЗБОР.md`**:
   who sits where, five shots, audio cut with gate (threshold −60, no lift), stock for 12–13 reels. **Episode №3 —
   `ПОДКАСТ_03_РАЗБОР.md`**: new speaker Райымбек, no recording gate (floor −52…−59), word map from local whisper
   because Scribe is unpaid since 19.10.2026.
2. **`_ассеты/`** — episode audio, its `meta.info.json` (chapters and description — source of facts),
   **`подкаст_01/scribe_words.json` — word-level transcript of the whole episode** (8705 words, `kaz`
   p=1.0, absolute times: source of truth for text and input for subtitles, no need to pay
   again), the full reference edit, ornament, logo, studio frames, generations.

Order for cutting the next reel:

```
ПОДКАСТ_01_РАЗБОР.md → pick a free chapter from §4 → download the video with the command from §1
→ /obrezka (numbers in §5) → **П1 (checkpoint 1): the cuts go to the client as audio only — one folder
`ОБРЕЗКИ_0N_клиенту/` with `NN <Kazakh scene title>.mp3` from each `out/обрезка.wav`; no video, no listening page
(Elzhan, 19.10.2026: «сайт делать не надо — это лишнее, только аудио, клиент послушает и даст ответ»); build nothing until
the «да»** →
/podcast-reel → `cam.sh --no-matte` (our reels have neither `mode:'cut'` nor `behind` — matting wasted
13–33 minutes) → /speaker-canvas, spec via `_ассеты/mech.js` + `geom.js` → **П2: `out/reel.mp4`
with sound**. The contact sheet is the model's eye, not a deliverable.
```

1080p video is intentionally not stored — re-download it, command in breakdown §1. Audio is
local: a chapter can be chosen and transcribed without downloading.

## 1. Required skills

Main entry — **not a commissioned shoot but cuts of their own podcast**:

| Skill | When |
|---|---|
| `/podcast-reel` | always, when the source is their YouTube episode |
| `/speaker-canvas` | montage language for these cuts |
| `/obrezka` | speech cut; on this client it is the main source of defects — numbers in breakdown §5 |
| `engine/cut/fillers.py` | **mandatory before delivery**: «ээ», inhales and exhales. One Scribe call per reel, gaps between words. `--lang kk` |
| `/no-ai-slop` | script, on-screen text, post caption — before build |
| `/grade` | after the first render |

No commissioned shoot with this client yet. If one appears — the standard `/master-pack` fork, unchanged.

**Second entry — a reel with no speaker at all, ram-3d format** (`reel_048_ihram_hal_3d`, 02.10.2026): the topic comes from
their own episode, but a voiceover carries it and no person is in frame — only a museum pedestal, objects, light
and ornament. So the §3 laws (no holy places, no person as қажы) are met by construction, not by policing.
Use this entry for chapters where procedure and terminology matter, not story: cutting such a chapter yields a lecture, 3D yields a diagram.
Engine and pitfalls — `reel_048_ihram_hal_3d/CLAUDE.md`; `/podcast-reel` and `/obrezka` are not involved, voice is
synthesized (`tools/tts_or.py`, voice Achird), speech is checked with one Scribe call, not whisper.

## 2. Positioning

Filled from their own episode, not a brief. **Re-verify with the client before the first sale.**

**What people use instead:** other umrah and қажылық operators from Kazakhstan; a trip
through acquaintances-«ұйымдастырушы»; not going at all — «потом, когда буду готов».

| Property | They have it | Alternatives |
|---|---|---|
| Ұстаз accompanies the group from arrival to departure | yes, named individually | often only a logistics escort |
| Ұстаз explains the place, not just shows it | «көрумен сезіне алмайды, мағлұмат айтылуы керек» | people look on their own |
| Pilgrim's questions covered before the trip | yes, a separate episode topic | — |

| Property | → | What it gives |
|---|---|---|
| ұстаз alongside | → | the person isn't left alone with their first time |
| explaining the place | → | comes back changed, not just photographed |
| preparation in advance | → | doesn't spoil the rite through ignorance |

**Who needs it most:** first-timer, Kazakh-speaking, afraid of doing something wrong;
and someone taking their parents.

**One sentence:**
> For a Kazakhstani going to umrah for the first time and afraid of getting it all wrong, Atlas Tourism
> is the operator whose group travels with a ұстаз who explains every place. Unlike a trip
> «через знакомых», the person comes back not with photos but changed.

**Retention mechanism in the script:** social proof (stories of the қажы themselves) + loss aversion
(what someone going unprepared loses). Both are in their own podcast — nothing to invent.

## 3. Facts — only these may be said on screen

| Fact | Wording |
|---|---|
| What they sell | умра және қажылық турлары |
| Contact | WhatsApp +7 702 151 0000 |
| YouTube | ATLAS TOURISM, `@Atlastourismm` |
| Podcast | ATLAS PODCAST, episode №1 — «Умра сапарына дайындық»; №2 — «Қажылыққа баратындар арабқұл ма?»; №3 — «Умраның қабыл болуына не кедергі?» |
| Speakers | Ақтөре Әліпбайұлы, Алмас Карипов (№1 only), Нұрболат Қуанышбек, Райымбек Жайлау (№3); host Рүстем Рахимов |
| Client CTA verbatim | «Подкасттың толық нұсқасын Atlas tourism YouTube каналынан көріңіз!» |

Chapter timecodes and episode descriptions — `_ассеты/подкаст_0N/meta.info.json` (N = 1, 2, 3).

**What cannot be on screen:**

- prices, dates, group sizes, number of trips — none are stated anywhere;
- **phone number on screen.** The WhatsApp in the facts is a messaging channel, not a caption: the client
  removed the plate from the `reel_005` final card themselves (19.09.2026, «соңында неге номер қойғандарын
  түсінбедім»). One CTA stays on screen — the full episode on their YouTube, verbatim per §3;
- generated images of Қағба, Рауда, әл-Харам or any other holy place:
  that fakes the record. A place is shown as a diagram from the speaker's own words or not at all;
- promises that the rite is accepted («қабыл болады»), guarantees of any kind;
- a stock or generated person as қажы.

## 3.5. «ээ», inhales and exhales — checked by machine, not by ear

Elzhan caught them by ear in three delivered masters (reel_007 «бір рет эээээ» and «VIP ээээ»,
reel_006 at 5 and 12 s, reel_005 at 48 s) — all five were found by the gaps-between-words method.
Before delivery:

```bash
~/ai-local/.venv-f5/bin/python ~/.claude/engine/cut/fillers.py work/voice_raw_breaths.wav --lang kk \
    --words work/scribe_voice16.wav.kk.json --clips work/isl \
    --mute-breaths work/voice16.wav --duck-also work/voice_raw_breaths.wav:assets/vo/voice.wav
```

`FILLER` — cut. `BREATH` — muted in `work/voice_nb.wav` (length unchanged, so frames don't
shift). `UNCLEAR` — listen to clips in `work/isl` and write verdicts to
`work/fillers_reviewed.txt`, otherwise gate `qa/master.py` rejects the master. The word-level
transcript is cached next to the track — re-runs are free.

**Inhales are muted AFTER `cam.sh`, in TWO files, with ONE command.** `cam.sh` rebuilds
`assets/vo/voice.wav` from the take, so muting done before it silently vanishes; and gate
`qa/master.py` judges inhales on `work/voice16.wav`, so muting one 48 kHz track is not enough. `fillers.py`
makes both tracks itself: input is the untouched original `work/voice_raw_breaths.wav`,
`--mute-breaths work/voice16.wav` writes the 16 kHz gate track, `--duck-also` puts THE SAME spans on
the 48 kHz master track. Order: `cam.sh` → this command → `build.sh`. Manual `volume=enable=between(...)`
across two files is retired: it cost an extra build round on `reel_014` and `reel_015`.

**An inhale is LOWERED TO THE ROOM FLOOR — and only if it already sits close to the floor.** Target is
the 20th percentile of the track's own frames, with margin below the island threshold, computed PER
20 ms frame: one gain for the whole span either leaves loud frames above threshold (gate finds the inhale
again) or drops quiet ones into a hole. The 30 ms fade lies OUTSIDE the span — inside a short
0.16 s inhale two ramps ate a third. Flat muting is banned at both ends: fixed
−30 dB took an inhale to −74 dB with room tone −44 (abat/reel_006 — «кейбір жерде дауыс
естілмеген»), and `volume=0.03` on `atlas/reel_016` put the inhale at 35.58 at −68 dB with floor −45.

**The mute span is trimmed INWARD by measurement, not taken from Scribe as is.** Its bounds
catch the previous word's tail and the next word's attack: measurement `reel_018` 21.09.2026 — frames
−14…−26 dB (tail of «қасиеттілігін», attack of «апарған») dropped to −46 after standard `--mute-breaths`,
i.e. speech was muted. The span is cut down to frames below −33 dB (track floor −42.8), and that is
`work/mute_breaths.py` next to the reel: same math as `duck()`, its own span list.

**An inhale 20+ dB ABOVE the floor is not muted at all — it stays with a verdict.** Lowering it
to the floor removes sound, not the inhale: measurement `reel_016` 21.09.2026 — span 8.46–8.84 (0.38 s)
at −12…−20 dB with floor −45.1 dropped to −46…−48 after standard `--mute-breaths`, and Elzhan
returned the master: «на нескольких местах ты сделал mute на определённых секундах, заглушил звук на
миллисекунды — убери это». Such an inhale sounds like a living person breathing; a dip in its place
sounds like the file cutting out. `qa/master.py` holds the same door for BREATH as for FILLER: either
muted or named INDIVIDUALLY in `work/fillers_reviewed.txt` with measured level and floor.

**A span covering a word from `assets/vo/words.js` is not an inhale.** The method looks for gaps in
Scribe's map, and Scribe loses quiet words — then the «дыра» (gap) is live speech. Measurement
20.09.2026 on `reel_014`: Scribe missed «Жаңа» (14.36–14.56), section 14.38–14.64 went to
BREATH, the word was muted in the master, and Elzhan returned the reel — «на 14–15 секундах непонятный обрыв…
перед словами тұра тұр». A second identical hit in the same reel — «сертификат» at 44.24.
Now `fillers.py` cross-checks against the REEL'S OWN word transcript and prints such spans as
class `SPEECH`; the master leaves them untouched. Two judges, not one.

The `--no-fillers` flag on `cut.py` is NO LONGER set: it is exactly why «ээ» reached delivery.

**«жаңағы» — this episode's filler word, cut wherever the seam law allows**
(Elzhan, 19.09.2026 on `reel_012`: «большинство слов жаңағы можно вырезать полностью, это
слово паразит»). Both ұстаз plug pauses with it 4–7 times per minute. `cut/fillers.py` prints
them as class `PARASITE` with gaps on both sides — those with ≥ 0.10 s silence on BOTH sides
per the reel map are cut; those fused to the neighbouring word stay, and the delivery states this
as a number instead of keeping quiet. Measurement on `reel_012`: of seven «жаңағы», three of the places
Elzhan named came out legally, four sit flush against the next word. «енді» and
«сосын» are judged the same way, but they more often carry a link and are cut only by Elzhan's ear.

**The cut goes at the DEEPEST sample of the dip, not the first one below threshold.**
Cutting a filler word, it is easy to clip the neighbour's tail: the silence map fires where the
level only began to fall, while decay lasts another 0.2–0.5 s. The gate catches this as a cut inside a
word. Measurement 19.09.2026, five misses in a row: «жүздерін» cut at 67.50 with dip bottom at
67.64, «үйлердің» at 73.80 with bottom 73.98, «бірге» at 25.14 though the floor starts only at
25.46. Order: find word end from the transcript → print the 20 ms envelope around it →
place the cut at the minimum, not at the island edge. If the dip is shallower than 6 dB above floor
(«бір» in `reel_013`: 1.4 dB) — there is no real silence, and the gate verdict reads as
false only together with that number.

**A «рез внутри слова» (cut inside word) verdict is checked on the ASSEMBLED track `work/cut/cut16.wav`, not on the
source: the gate takes level from the INCOMING side of the seam.** Measurement `reel_013` 19.09.2026: gate
gave −34.6 dB with floor −49.2 and called a break, but at the joint itself the level is −64 dB — 15 dB below
floor, i.e. clean silence; the word tail decayed to −44 dB before the cut, and the reported −34.6 lay
0.08 s AFTER the joint and belonged to the next word's attack. Check order: print the
assembled track's envelope around the seam → if the joint level is below floor, the verdict is false.
Same class as the four false seams on `reel_008`.

**A held vowel fused to a word is always cut — Elzhan named all of them** (29.09.2026 on episode №2: «режь все ээ»). Only the word's own stretched sound («сондықтааан», «әрбір») is not cut — told apart by level and centroid measurement, `ПОДКАСТ_02_РАЗБОР.md` §3. **A cut is one scene up to its punchline**: enter on a concrete case, explanation after the punchline is removed (Elzhan, 30.09.2026 on 028–030 — came out 28–48 s; the «чуть больше минуты» yardstick pulled a second conclusion into the reel); inside, repeats, connectors and a second example of the same thought are cut — `ПОДКАСТ_02_РАЗБОР.md` §3. The seam law
forbids a cut without 0.10 s silence on both sides, and by default such a filler stays. But
a named timecode outranks it: the cut goes at the nearest local minimum of the envelope, and the listener
is left 0.02–0.06 s of vowel stuck to the word instead of 0.4–0.7 s of humming. Measurement on
`reel_012` 19.09.2026: «Бірде ммм Шымкент» (3.44→3.94) and «жүздерін жаңағы батысқа»
(67.50→68.12) were removed exactly this way, both by his ear, both bypassing the standard gate.

**`"lang": "kk"` is mandatory in a new reel's `reel.json`.** Gate `qa/master.py` does not
guess the language and rejects the master without this key — a Russian model on Kazakh speech gives a
verdict that looks like a result. The seven existing reels already have the key.

## 4. Language

Kazakh. Subtitles are the speaker's verbatim speech, not a paraphrase. Three readings before screen;
the YouTube track is unusable (Kazakh recognized as Uzbek) — mechanics in breakdown §6.

Fonts: **Oswald** (narrow — Kazakh words are long, `ПАЙҒАМБАРЫМЫЗДЫҢ` is 16 chars) and
**Inter**. Oswald ≈ 0.62 em per uppercase char — measure every line.

## 5. Visual key

**One language for both episodes: the colour and style below hold in №2 too, and the montage within it goes one
step higher** (Elzhan, 29.09.2026: the client's feed is recognized by colour; novelty is in montage
quality, not a change of ground). The ЖОЛ language (`_ассеты/стиль/ПОДКАСТ_02_ЖОЛ.md`, light sandy
ground) is kept in reserve and not used without a new word from Elzhan.

Dark. Key taken from their own studio: shadows go blue-green, skin and lamp are warm.

| Role | Colour |
|---|---|
| Background (speech «мир» — world, a full-frame designed scene) | `#0E1316` … `#171D23` |
| Light world (story turn) | `#EFE7D8` |
| Conclusion / mercy world | `#0E3A31` |
| Accent | `#C9A86A` — same tone as the library's Kazakh ornament |
| Text | `#FFFFFF`, on light `#14181C` |

**The outro is the same for all reels and lives in `_ассеты/outro.js`** (Elzhan, 20.09.2026: «конец сделай
таким же, какой был на остальных рилсах, один единый аутро для всех рилсов»). Dark ground,
ATLAS PODCAST mark, «Подкасттың толық нұсқасы —», episode title, studio photo on
tape, YouTube button with a camera dive, channel label, ATLAS ghost. In the spec it is one line
`outro({ from: 'cta' })`; the reel draws no finale of its own. The outro beat needs five seconds, taken
by a synthetic word in `assets/vo/words.js`: `{"w": "cta", "t0": <конец речи + 0.5>, "t1": <конец речи + 5.5>}` — without it the beat fractions squeeze into the last spoken word. **Between the last word and the
outro — 0.5 s of silence** (Elzhan, 30.09.2026 on `reel_024` and `reel_026`: «в конце немного обрыв»): an iris and its lead-in
on the very end of a word cut the phrase off audibly. The last cut piece ends in the envelope dip after the word, not in a
closure inside it — the recording gate drops the «т» in «ұмыт|па» to zero, and the П1 cut there gave «ұмыт» instead of «ұмытпа» (`reel_026`). Outro rows
are declared in the `geom.js` ladder, not with their own numbers: the `qa/rows.js` ceiling is 6 rows per reel.
The print sits at y 670, not 780 (Elzhan, 21.09.2026 on `reel_017`: «вставка с ютубом atlas
tourism затмевает слова atlas podcast»): the button reaches its row after the print and
covered its caption «ATLAS PODCAST · №1» — screen measurement: print bottom 1145, button top
1069. Gap between them kept ≥ 40 px.

The accent works as gold: HIT fill with gradient `#F6E7BE → #7C5C2A`. **The gradient background must extend under the
line** (`padding:.08em 0 .26em; margin:-.08em 0 -.26em` on `.gold .ae-u`, template `_ассеты/стиль/speaker_canvas.index.html`):
`background-clip:text` paints only the line box, and at `line-height:.9` the tails of «Қ Ң У Д» and the comma stay
transparent — in masters 023–035 «ДҰҒАҢДЫ ҚЫЛ» read as «ДҰҒАНДЫ КЫЛ», «СУ» as «СV». No gate sees this, only a close-up frame.
**Gold is not placed over the microphone.** Both speakers' mic sits in the lower third of the frame,
black foam, and the lower half of each letter (`#7C5C2A`) disappears in it: measurement on `reel_007`
17.09.2026 — of «ӘР ІСІМІЗ» on the foam only «ӘР ІС» read; the middle of the line
«ЕКІ САҒАТ ДЕП АЙТПАЙСЫҢ БА?» vanished entirely. White `voice: 'hit'` in the same frames reads
fully. But white has the mirror problem: **both speakers wear light shirts, and white type disappears on
them just like gold on the foam.** Measurement 18.09.2026 on the `reel_007` payoff: the line
«ЖАЗАСЫН АЛАСЫҢ» read only where it fell on the dark mic («АЛАСЫҢ»), and the word
«ЖАЗАСЫН» on the shirt vanished entirely — and that is the reel's main line.

**So there is no bare text over footage at all — neither large nor small.** The threshold
«ниже y 1250» was a one-frame measurement and is wrong: per `qa/face.json` the head in close-up
ends at y 1168, and below it is that light shirt, so white type disappears on the WHOLE
lower half of the frame. Measurement 20.09.2026 on `reel_014`: the service line `kicker` (44 px,
white 78 %) on row 1150 did not read at all — that is where Elzhan started («что это за новый вид
субтитров, он вообще не красивый»), — and the first rebuild showed the large `hit` on
row 1210 vanishing the same way: «КӨПШІЛІГІ» at 28.0 s and «ҰШАТЫН КҮНІ» at 50.2 s disappeared
entirely. Hence only plates go on the face, exactly two:

| Role | What | Row |
|---|---|---|
| `band` | large line, Oswald caps, gold plate | 1386 |
| `pill` | supporting line, Inter lowercase, gold plate | 1404 / 1496 |

**Type sits UNDER THE HEAD, not wherever it has the width** (Elzhan, 21.09.2026 on
`reel_017`: «субтитры стоят высоко и моментами закрывают рот спикера… пусть даже бороду
не закрывают»). The old row 1230 was chosen by plate width, and screen measurement of the delivered
master (`window.FOOT.heads`) showed the head bottom on face beats reaching **y 1359**:
the plate 1226–1343 lay on the beard in six places. The gate passed it not by mistake —
with `cam.sh --no-matte` the head box is declared unreliable and `qa/overlap.js` prints
a warning instead of failing; so a reel without matte is measured by hand (`window.FOOT.heads`)
before render, not by eye after.

Law: plate top ≥ head bottom + 15 px across the WHOLE reel. Below the head remains 1374…1590
(bottom edge of the cage) — TWO rows, plate and supporting line; physically there is no third, and a beat with a
large line puts its supporting line on the second row (`mech.js` does this itself). Below 1348
the narrow Instagram cage applies (right edge ≤ 858), so `band` size is computed from
it: `s ≈ 1020 / знаков`, ceiling 54, floor 40. A line longer than ~20 chars does not
live on this row — it splits into plate and supporting line («ӘРАФА КҮНІ ҮЛГЕРМЕЙ ҚАЛҒАН» → plate
«ҮЛГЕРМЕЙ ҚАЛҒАН» + supporting line «Құнанбай бабамыз Әрафа күні») or compresses into a count
(«БІРІНШІСІ — УАҚЫТ» → «1 · УАҚЫТ», §5.5 «счёт вместо слова»). Roles `kicker` and `hit` are
bare text and never go over footage; in «полотно» canvases (full-frame designed scenes without footage) and on dark worlds, where the type sits on an even background, they stay.
Gold LETTER FILL — only in canvases; it lives nowhere on footage, while a gold
plate under dark letters lives everywhere and is the main carrier of type. Ornament —
`_ассеты/img/orn_*.svg`, dimmed to 0.2–0.3. No Islamic symbolism beyond
geometry and ornament.

## 5.5. What fills a canvas

Elzhan's correction 18.09.2026 on `reel_011`: «полотно огромное — вставок малые и странные… ты просто
вставляешь рандомные слова спикера… что вообще за жеңгеміз и стрелка күйеуі». Hence the canvas laws
for this client:

- **A metaphor is not proof** (Elzhan, 18.09.2026, second round on `reel_011`: «картинки не
  к месту… только то что подходит по смыслу — то и оставь. Поставить вставку просто так —
  неправильно»). Knot for habit, envelope for request, keys for «не в твоих руках»,
  bridge for «себеп» — none of these objects is in the speech, and the viewer spends attention
  decoding a rebus. An insert goes in only if it shows the very thing being talked about:
  the place where the scene happens; a count, if a number is named; an object the speaker names aloud.
- **Count instead of word.** «Бес уақыт» reads as five clock faces in a row, «шектен тыс» as scales
  tipping over: scales are about measure, which is the word's literal meaning, not a metaphor.
- **Canvas density is paid with background mass, not another picture**: place plate, ornament,
  ghost typography, speaker card. An extra object is not neutral — it costs viewer attention.
  The world's standard background mass is a horizon rule `{ k: 'rule', x: 120, y: 1040, w: 840 }` under
  the type (on cream ground `color: 'rgba(20,24,28,.45)'`, gold doesn't read there): otherwise an
  empty 400 px strip hangs between title and inserts. **The visible room strip at
  `top: 700` is roughly y 95…1905**; below that an element simply is not in frame, and no gate
  catches it: `overlap.js` measures only x.
- **The speaker card is in EVERY canvas, and it is a duty, not decoration** (Elzhan,
  20.09.2026 on `reel_015`: «добавь на полноэкранные вставки окошко 9 на 16 с оригинальным
  видеорядом спикера, как в остальных рилсах»). The 300×533 window plays the CURRENT frame of `work/fr` —
  the same timecode as the audio. Without it the canvas turns into a sheet of text, and footage
  disappears in 5–10 s chunks: measurement `reel_014` — 9.5 s in a row, `reel_015` — 34 s of 82.
  `mech.js` places it itself (`geom.js CARD`, corner x 660 / y 1150, one for the whole reel);
  `card: false` is written only where the card is physically impossible, with the reason
  next to it. An insert that needs that corner moves to the left column, not the other way round.
  **Under a wide shot the window takes the SECOND track `work/fr2`** (`cardDir`), cropped to the
  speaker: the standard `cam.sh` crop cuts 16:9 at center, and on the wide shot the window gets
  the neighbour at the table, not the speaker. Who speaks on the wide is measured, not guessed
  (mouth crop per `qa/face.json` + `tblend=difference,signalstats`: silent 0.06–0.18 vs
  0.45–1.43 speaking). `reel_017` did not need the track — the speaker falls within the
  standard crop; in `reel_016` he sits far left, and the window is shifted −1166 px over his spans.
  The only legitimate `card: false` is a world sitting on a shot where the speaker is not in frame
  at all (someone else's close-up): no lip sync there under any crop. **The corner is still
  not left empty**: a 330 px `orn_shanirak_dim.svg` medallion takes the window's place, and the frame
  composition keeps the same shape as in worlds with a window. Without it the world reads as a blank sheet —
  measurement `reel_016` 21.09.2026, beat 17: «на 1:03 полноэкранная но пустая вставка, нет ни
  спикера, ни нормальных визуальных элементов».
- **Material sources in order**: **the client's own library `_ассеты/img_lib/png/`** — made
  for this client and goes first in montage (Elzhan, 19.09.2026): 56 alpha cutouts,
  14 sets by episode meaning, inventory `_ассеты/img_lib/index.json` (field `what` — what is in the picture,
  `w`/`h` — size, `fill` — opaque fraction). Full-frame place plates — `_ассеты/img_lib/plates/`
  (departure hall, night road, house window, dastarkhan). Then the factory library
  `assets/litho` and `assets/flat` → local FLUX (`engine/flux.sh`, seed in the reel's `CLAUDE.md`)
  → nothing. Do not generate holy places or pilgrim people (§3): a place plate is a departure
  hall, road, dastarkhan, window.
- **The client library was built from kie 2×2 grids** (18.09.2026, correction «в атлас туризм вставок нет,
  тут только текст»): 20 generations × 4 objects = 80 inserts in one key — ground `#0E1316`,
  matte clay, gold `#C9A86A` reflection, no text, no people, no holy places.
  Order script — `_ассеты/img_lib/gen.sh` (model `gpt-image-2-text-to-image`, 2048×2048), slicing into
  alpha inserts — `_ассеты/img_lib/split.py`, inventory — `_ассеты/img_lib/index.json`.
  Sets by episode meaning: preparation, knowledge, intention, time, duty, door, water, light, change,
  heaviness, home, word, path, group, connection, mistake, acceptance, ornament, night.
  Background is removed by a flood fill FROM THE quadrant EDGE plus a tight threshold on ground colour: the objects
  here are dark themselves, and a brightness threshold would eat the door along with the background, while the fill
  does not reach holes inside an object (glasses lenses).
- **Lithography takes the ground colour; the client library does not.** Black cutouts in `assets/litho`
  are made for light grounds, and on a dark world they need a white version
  (`lutrgb=r=negval:g=negval:b=negval`, file `*_w.png`); the silhouette must be recognizable by outline —
  a white door reads as an empty plate, a bridge as a bridge. **`_ассеты/img_lib` objects are already
  made for ground `#0E1316`** (matte clay, gold reflection), and inversion ruins them: measurement
  `reel_018` 21.09.2026 — a white stone read as an egg with a blue rim; the original sits on
  dark and green worlds as is.
- **A picture either fills the WHOLE frame or is not there at all** (Elzhan, 18.09.2026, on `reel_010`:
  «они или полноэкранные — или их не должно быть вообще»). A photo placed as a 600–800 px block
  inside a world brings its own background, and you get a snapshot glued onto paper:
  on the cream world the dark rectangle of the cliff (жартас) read exactly like that.
  Small in frame lives only what has no background by construction — alpha cutout,
  ornament, speaker card. Anything shot or generated as a frame (place plate, photo,
  scene) goes full-frame and holds it alone: type on it only as plates
  (`pill` / `band`); no bare text on a photo — gate `TEXT OVER TEXT / IMAGE` fails it.
  For the same reason `_ассеты/img/door.png`, `tea.png`, `tea_tower.png`, `road.png`,
  `dawn.png` were deleted — they only worked as a block inside a world.
- **A caption is not born before the first word of ITS phrase** (Elzhan, 21.09.2026 on `reel_018`:
  «некоторые твои субтитры выходят заметно раньше, чем об этом повествуется»). A build with
  world titles on beat fractions (`at: .06….16`) ran ahead of speech by 2.1–2.8 s, and it is
  audible: the viewer reads the conclusion before it is spoken. Rule: `on:` on its own word, at
  worst on the first word of the same phrase, beat fractions — never.
- **An empty world entrance is closed by BACKGROUND MASS, not by text or insert size.** It also fixes
  «полотно пустое» (measurement `reel_018`, density 122 → 131 events/min): medallion
  `orn_shanirak_dim` 240 px top right at `at: -.05`, a SECOND rule y 980 w 520 under
  the top one, ghost raised from y 1580 to 1220 and enlarged, speaker card 300 → 340. The object
  itself stays small: Elzhan in the same review — «вставки камней и других элементов сделай их
  меньше, они огромные; сохраняй геометрию, композицию», stone 420 → 280, house 360 → 210.
- **Density is not padded by repeating a neighbouring line.** `qa/master.py` requires 120–150 events/min,
  and when short the hand reaches for one more caption — and the easiest one turns out to be the one
  that repeats its own beat's title. To gates these are two elements, to the viewer the same
  text twice. Measurement 20.09.2026: `reel_015` collected three such pairs
  («іш киім де шешіледі» under «ІШ КИІМ ДЕ ШЕШІЛЕДІ», etc.), all three found only by watching.
  An event is added by a camera move (five keys is this client's norm, `geom.js CAM`), an insert by the
  literal meaning of the speech, or a NEW phrase from the same chunk; a repeat is a defect.
- **Two lines declared on the SAME world row overlap, and no gate catches it.**
  `rows.js` judges the ladder, `overlap.js` element visibility; nobody checks row collisions.
  A large title (size ≥ 110) also takes TWO rows of height and covers the neighbour.
  Before adding a line to a world, check which rows are taken: ROW.world = top / title / script /
  item1 / item2 / item3. Measurement 20.09.2026: one such overlap each in `reel_014` (18–20 s) and
  `reel_015` (61–64 s), both gates silent.
- **A face beat has at most TWO lines** — strip 1340 and plate 1450. A third makes mush: the
  previous line's fade lasts ~0.3 s after `until` and overlaps the new one, and `overlap.js` does not
  see it even at step 0.04 — it judges element visibility, not how the block reads.
  Measurement: master frames 8.5 and 29.0 s.
- **Jump cuts are softened only on the face, world transitions never** (Elzhan's correction 19.09.2026 on
  `reel_005`: «обрывы сделай мягче», the reverse-fade idea). A speech splice with footage on both sides
  and a jump in the speaker's pose is feathered over **3 frames (0.100 s)** with a copy shifted by
  4 frames: duration and audio unchanged, sync intact. With 4 frames of feathering a still shows
  a double image, with 3 it does not. **But a POSE change is feathered, not an ANGLE change**: if
  the speaker turned his head between pieces, three frames draw two faces, and a hard cut reads better than a ghost
  (measurement `reel_020` 22.09.2026 — two seams on the face, frame difference 10.9× and 12.4× the local median,
  feathering removed after viewing frames). Flash, band, iris and tone floods are not softened: they
  are placed to hit, and a feathered transition reads as dirt. **A seam covered by a flash is cut
  on the frame number at its peak** — a dissolve started before the peak averages the flash with a dark frame and
  gives a dip to black instead of a hit (first build of this correction).
- **Seams are found by measurement, not by eye**: frame difference of the upper part of the frame
  (`crop=1080:900:0:120,tblend=difference,signalstats`), spike above 3.5× the local median.
  A real cut is **1–3 frames**; camera movement and animation give a gentle rise over 5–10 frames.
  On `reel_005` of 14 candidates five were cuts: 24.03, 42.03, 47.13, 47.27, 53.47.

## 6. Texts

Everything the client or its audience will read passes `/no-ai-slop` before delivery.
Additionally banned for this client:

- «духовное преображение», «сакральное путешествие», «прикоснуться к истории» — tourist
  gloss over a rite;
- «тур мечты», «незабываемые впечатления», «путешествие всей жизни»;
- any wording promising the outcome of the rite.

## 7. Lead magnet and offer ladder

| What we give free | Format | What we get | Where it leads |
|---|---|---|---|
| the podcast itself | YouTube episode | a view | cuts in the feed |

The client has no step between «посмотрел подкаст» and «купил тур». The first thing worth
proposing on entry: an umrah preparation checklist based on their own episode, in exchange for WhatsApp.
Elzhan's call — not proposed yet.

## 8. Publications

`reel_002` went out 15.09.2026 on Elzhan's showcase, not on the client's account:
Instagram `@content_portfolio_ea` — `https://www.instagram.com/reel/DdUL1ozlGkk/`,
Threads — `https://www.threads.com/@elzhan_makhsot/post/DdUMI30DWjk`.
The feed gets a CRF 23 level 4.0 copy (~14 MB): Instagram won't fetch the 32 MB master through the free
tunnel; recipe in `_инструменты/ПУБЛИКАЦИЯ.md`. Atlas Tourism accounts are not
connected — publishing on their behalf needs their token and Elzhan's explicit «да».
