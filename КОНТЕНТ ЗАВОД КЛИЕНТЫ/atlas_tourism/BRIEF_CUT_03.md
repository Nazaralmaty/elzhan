# Brief — П1 cuts of ATLAS PODCAST №3 scenes (agent)

Same job as `BRIEF_CUT_02.md` — read it first, every rule there holds (what П1 is, no derivatives, accepted vs rejected
shape: a live case with a person and an event, not reference material; one scene up to its punch line; every «ээ» cut;
the reel `CLAUDE.md` shape; the report block). This file lists only what differs on episode 3. These cuts go to the
client for approval, so the arc must stand alone for a cold viewer.

## Episode 3
- `VAWZ--dNPps` — «Умраның қабыл болуына не кедергі? | ATLAS PODCAST #3», 19.10.2026, 83:23 (5003 s), 25 fps.
- Speakers: **Ақтөре Әліпбайұлы**, **Райымбек Жайлау** (new); host **Рүстем Рахимов**. Chapters and description —
  `_ассеты/подкаст_03/meta.info.json`, the only source of facts.
- Video `atlas_tourism/pod3_1080.mp4` (format 137, no sound), audio `_ассеты/подкаст_03/audio.m4a`.

## Who sits where (by frame, never by transcript)
| Shot | Who | How to tell |
|---|---|---|
| CU host Рүстем | grey jacket, white shirt, **tablet and boom mic**, beige wall with a floor lamp and dry branches | frame 143 s («Ақтөре ұстаз, өзіңізден бастасақ») |
| CU Ақтөре | plump, dark jacket, black shirt, **dark wall, palm**, seen in three-quarter | frame 185 s (his answer) |
| CU Райымбек | **brown shirt**, desk mic on a tripod, **palm on the left, bookshelves with blue light** | frame 392 s |
| WIDE | host left, Райымбек centre, Ақтөре right, patterned carpet | `_ассеты/img/pod3_wide.jpg` (980 s) |

## Sound — NOT like episode 2
No recording gate: pauses sit on a room floor of **−52…−59 dB** (20 ms frames), not digital zero; loudness −22.7 LUFS,
no lift needed. So the episode-2 numbers (map −60, «dip ≤ −50 dB is silence») do not apply:
- Silence map threshold is measured per speaker, as in `ПОДКАСТ_01_РАЗБОР.md` §5: start at −46
  (`new_reel_03.sh … START END -46`), check with `islands.py work/cut/src_1.wav --at <word end> --window 1.6`; the right
  number sits 1–2 dB below the quietest speech tail and above the floor; real pauses come out 0.5–0.8 s, not 0.1 s.
- A seam is legal when its dip reaches **floor + 6 dB or lower**; `gate_edges.py` / `gate_fillers.py` flag at −50, which
  on this floor is roughly right — read their `!!` against the measured floor of your slice, not as an absolute.
- `cut.py build --lang kk --limit 0.44 --opening 0.12 --fade 0.02`, `"pause_db": -40` in `reel.json` (the factory gate's
  threshold): at episode 2's −55 the floor hides every pause, and the first 065–068 cuts reported 0.36 s while they held
  0.82 s at −40. Silence inserts for short seams are taken from the room floor of the same take (not digital zero —
  there is none), so `gate_recut.sh` / `gate_fillers.py` do not fit this episode: seams are placed by the envelope by hand.

## Words — whisper, not Scribe
ElevenLabs Scribe is unavailable (payment issue, 19.10.2026). The episode word map is local mlx whisper-large-v3:
`_ассеты/подкаст_03/whisper_words.json` (absolute times), readable `whisper_segments.txt` and `транскрипт_kk.txt`
(by chapter). About a quarter of the words are misspelt — meaning reads, spelling does not. Consequences:
- `new_reel_03.sh` shifts this map into the slice and writes `fillers_1_kk.txt` from it (sha1 header — `cut.py build`
  uses it). Do not run anything that calls Scribe; a «Scribe не дал разметку» line is expected, not a failure to fix.
- Seam gate: after the first `build`, run `python3 ../_ассеты/words_cut16_03.py` in the reel folder (remaps the slice
  map through `edl.txt` into `work/cut/cut16.words.kk.json`), then rebuild with the same keeps — the verdict becomes
  «по разметке слов». Delete that cache before a rebuild with changed keeps.
- Whisper glues words together and swallows held vowels into the neighbouring word, so the gap method misses «ээ».
  On top of `fillers.py`, scan every pause and every word edge of your arc acoustically: a held «ээ / ммм» is a flat
  20 ms envelope at −20…−35 dB for ≥ 0.25 s with centroid ~0.5–1 kHz (vowel) or ~200 Hz (hum), no consonant jumps.
- «Текст обрезки» in the reel `CLAUDE.md` is whisper's reading; mark it so, and correct only the words you can
  establish from context (names, terms, the chapter title).

## Material
`./_ассеты/new_reel_03.sh reel_NNN_тема START END [DB]` from `atlas_tourism/`, then the episode-2 procedure with
`gate_edges.py` for edges and `cut.py build` directly (see Sound).

## Do not
- touch any folder but your own new ones; delete nothing outside them;
- put a fact on record the episode does not say; a doubtful fact is named in the reel `CLAUDE.md`;
- take politics, other religions, or a scene that names a price, date, group size or promises the rite is accepted
  (client `CLAUDE.md` §3).
