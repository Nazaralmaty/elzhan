---
name: podcast-reel
description: One vertical reel cut out of a long recording someone else made — a podcast, an interview, a stream, a client's own YouTube episode. Covers what a long foreign source adds on top of the montage: pulling the file, picking the fragment by the client's own chapters, a multicam take, a cut you cannot verify by ear, and a subtitle track when an ASR is the only reader (Kazakh, Uzbek, Kyrgyz, mixed speech), and the montage of podcast reels: every phrase shown by an illustration assembled on the speaker's words, a through-object, torso caption clusters instead of a subtitle stack, an event every 0.6–0.8 s (abat and atlas episode 2 rules, without the paper / vox look) on the /speaker-canvas engine. Use for "нарежь подкаст в рилс", "возьми это видео и сделай рилс", "сделай нарезку с YouTube", "клип из интервью", and whenever the input is a link to an hour of someone talking.
---

# podcast-reel — build card: an hour of someone else's footage → one reel

Read `/reel-engine`, then `/speaker-canvas` (the engine: rooms, beats, shrink / grow, dives, floods). `/obrezka` is the law
this skill implements on a source you did not shoot and a language you may not read. Two things get rejected here: the
cut — v1 of atlas/reel_002: «обрезка ужасная… первые 0.4 секунды убрать… много обрывов в словах» — and a montage that is
plain speaker-canvas with subtitles: the sales demos built from `skel.py` came out «слабовато» (Elzhan, 12.10.2026),
while atlas episode 2 and abat 037–041 were accepted. §Montage is their rules of showing and pace.
Measurements and incidents behind every line: `references/field-notes.md` (§ numbers below point into it).

## Working order

1. **Pull** (YouTube SABR-blocks the plain call):
   `yt-dlp --cookies-from-browser chrome -F "<url>"` → `-f 137 -o pod1080.mp4` (1080p AVC, VIDEO ONLY) → `-f 140 -o pod_a.m4a`
   → `--skip-download --write-info-json --ignore-no-formats-error -o "meta.%(ext)s"`. Check `ffprobe -select_streams a` on
   the take before anything else. The info JSON's `chapters` + description are the only sanctioned source of facts. (§1)
2. **Pick** inside one chapter: hook, turn, payoff line, something the CTA can point at (a story has all four; a rule or list
   has no turn). Must stand alone for a cold viewer: no outside referent («он», «это», «там»), no «как я говорил», no lead-in
   before the hook, no ending before the payoff. Rank chapters by the hook. If another agent works the source:
   `ls <other>/work/src/ch`, write your chapter into the reel's `CLAUDE.md`, re-check at delivery. (§2)
3. **Transcribe the candidate chapters only** — Scribe with `timestamps_granularity=word` where there is a key, three
   readers (table below) where there is not.
4. **Take:** scene-detect the fragment (`select='gt(scene,0.2)'`); one fixed crop `608:1080:x:0` → 1080×1920 lanczos on the
   close-ups; wide shots get a canvas world, landing on the podcast's own cut; mux with the real audio; `cut.py transcribe`
   (maps per voice at −46 dB by default). (§3)
5. **Cut:** `python3 ~/.claude/skills/podcast-reel/tools/islands.py raw1.mp4 > work/islands.txt` → every keep boundary from
   the energy map, never from whisper → `engine/cut.py build --limit 0.36 --opening 0.12 --no-fillers --keep src_1:a:b …`
   → **0 seam warnings**, back-transcript reads as whole sentences. Gated source (digital-zero pauses): `--db -60`,
   `tools/gate_edges.py`, `tools/gate_fillers.py` [`--all` when Elzhan says «режь все ээ»]. (§4)
6. **P1 — STOP.** First `python3 engine/p1check.py work/cut/cut16.wav --words <scribe or whisper words json> --lang kk|ru
   --max 60` (length, «ээ», falling pitch on the last phrase, last word not a connective, first words not an intro phrase);
   exit 1 = fix the cut, do not send. Then the cut goes out as audio only: a batch is one folder of
   `NN <scene title>.mp3` (from `out/обрезка.wav`) the client listens to, plus a short table for Elzhan in chat — no
   video, no HTML listening page («сайт делать не надо — это лишнее, только аудио», 19.10.2026). Rejections are about MEANING («куча слов-паразитов», «можно короче до минуты»); a re-cut now costs one
   `cut.py build`, after `cam.sh` three hours. Build nothing until yes.
7. **Tail + matte:** append the CTA tail to `work/cut.mp4` — the episode's YouTube thumbnail
   (`i.ytimg.com/vi/<id>/maxresdefault.jpg`) as a 16:9 card with a play mark, title in the podcast's words, subscribe, the
   channel handle (a tail without the preview was rejected twice: «нет превью ютуб ролика»). Then `cam.sh --no-matte`
   unless the spec needs `mode:'cut'` / `behind: true` (`--spans a-b,c-d` when only in places); with a matte, run
   `tools/fill_mic.py` (copy to `work/tools/`, set its box) after EVERY `cam.sh`.
8. **Words** (after `cam.sh` — it overwrites `words.js`): `engine/words_scribe.py work/scribe_<track>.<lang>.json`;
   `work/segments.txt` → `engine/words_manual.py` only with no key and no map. Full stop on the last word of every beat.
9. **Music:** if the client's music is baked into the source, `python3 engine/stem.py work/cut.mp4 --hits` (writes
   `work/_music.wav`, `assets/vo/hits.js`, `assets/vo/beats.js`; canvas-based cuts snap to `window.BEATS` themselves).
   Religious / pilgrimage client: no music bed, palette `canvas`, `bgm: ""`, say so in the reel's `CLAUDE.md`.
10. **Spec** on the engine genre `speaker-canvas.js` in the client's palette (`brand_scan.py` / client `CLAUDE.md`), by
    §Montage below. Read `examples/atlas_023.spec.js` + `.notes.md` first (worlds as schemes, speaker window, seams);
    for building objects on words also `~/.claude/skills/abat-reel/examples/reel_041.spec.js`, `.notes.md` and
    `.make_svg.mjs` — its timing and assembly, not its paper look. `skel.py` may give the beat timing, never the spec:
    its output is the generic montage that was rejected. `reel.json` gets `"notext": 130`. Then `qa/lines.js` →
    `render.js --sheet 24` → `qa/overlap.js` exit 0.
11. **Voice level** (podcast audio is mastered, loudnorm lands at −15 vs −14): `cp assets/vo/voice.wav work/voice_raw.wav`, then
    `ffmpeg -y -i work/voice_raw.wav -af "acompressor=threshold=-18dB:ratio=2.5:attack=6:release=120:makeup=2,alimiter=limit=0.85:level=disabled" -ar 48000 -ac 1 assets/vo/voice.wav`.
    A quiet source lifted by gain (hiss, «с / ш» to 14 kHz): `afftdn=nr=10:nf=-45:tn=1,deesser=i=0.75,deesser=i=0.5,highshelf=f=6500:g=-4`
    first, compare 15 s spectrograms. (§7)
12. Full render, `build.sh`, `engine/qa/master.py` exit 0, `engine/qa/all.sh --final` (includes `notext`), then
    `engine/qa/seams.py` and LOOK at `renders/seams_NN.jpg`. A log saying «done» is not a measurement.
13. Reel `CLAUDE.md`: chapter, keeps in source time, what was dropped, what no machine checked, and «does the client agree
    to this chapter going out» as a question for Elzhan.


## Montage — show every phrase with an illustration, keep it moving

Taken from abat 037–041 (illustration and dynamics) and atlas episode 2 (schemes), both accepted. **Not their surface**:
no torn paper, kraft or cream paper grounds, paper circles under objects, gobo, grain, newsprint, litho cut-outs,
marker scribbles, italic-serif script voice — that is abat's identity and `/motion-canvas-vox`. Grounds, plates and
type come from the client's brand and the speaker-canvas genre (gradient and glass worlds, clean plates, one accent).

**Illustration**
- **Every phrase gets a picture that proves it**; a visual that proves nothing, or text alone on a ground, is a defect.
  On screen only what he says: no invented numbers, results, logos he does not name.
- **A world is ONE object assembled on his words**, each part landing on its own word: rows of cards fill → counter;
  a rail draws, a wagon drops on it and rides off; tubes drop, coins fall, liquid rises; a cursor clicks a blank board
  into a result; a magnifier scans. Schemes when he speaks in numbers and places: number → counter or grid; place → pin +
  dashed route; path → arc with a moving mark; contrast → two-node axis; document → sheet whose lines and ticks draw.
- **It closes on a verdict**: a ring round the winner, crosses on the losers that fade, then the next state.
- **Through-object**: one sign from the meaning returns 2–4 times in new states; its miniature is the face icon and
  changes state there too (check, medal, focus brackets). Spec header: the through-object and «что нового» against the
  client's last three reels; never swap words in an old spec.
- **Objects are flat illustrations in one style per reel**: library first (`КОНТЕНТ ЗАВОД КЛИЕНТЫ/assets/flat/index.json`),
  otherwise drawn as SVG in code (`work/make_svg.mjs`) or local FLUX with transparent padding cut by alpha. A library
  object only if named aloud.
- **Face beat = caption cluster on the torso, no subtitle stack**, each part on its own word: lead-in appears word by
  word → key word on a clean accent plate → icon ~120 px right of it → a mark drawn on the key word (`under`, `circle`,
  `arrow`, strike, `stamp` cross). Parts leave separately or swap in place while the plate holds; the cluster exits by
  a 0.25 s blur before the seam. Nothing above the mic or behind the head; head too high → `subs: false`, big type.

**Dynamics**
- **A new event every 0.6–0.8 s, a new beat every ~3 s, a seam every 4–6 s.** A beat is 3–6 events, each on its own
  spoken word — never one text that sits. An empty frame > 1.5 s is a defect. Gate: `qa/notext.py` (≥ 130/min without text).
- **Camera never stands**: slow push 1.00→1.05 with drift, depth by blur; 5 keys per beat, an `aim` dive per world —
  never on an element landing on the beat's first word (no run-up, the world slides).
- **Seams never the same kind twice running, best born from an element**: `tone` to white · shrink into the live speaker card
  / grow back with motion blur · `band` · flash · `zoom` blur through the mic · `iris` from a meaningful point · diagonal
  band with the phrase in giant type · `focus` pull · `blink` card with his question · an arrow sweeping off-frame into `push` · one tone
  flood per reel on the story's turn. Elements may cross a seam and keep their place.
- **The speaker stays alive**: a long world keeps him as a live card playing the current second; wide shots of the
  source carry worlds, close-ups the face; face 40–50 % of speech.
- **Triple hook by picture** (his text is never rewritten): topic plate from 0.0, lean and jolt as inserts on his words.
- Read time `max(1.2, chars/13 + 0.6)`; `until` in absolute seconds; too long → thin out, never stretch.

## Hard laws

| Law | Held by |
|---|---|
| First sound < 0.25 s (first window of the master above −40 dB) | `engine/qa/master.py` |
| No clipped word: keep edges from the energy map, ≥ 0.12 s silence both sides (law 0.10 + 20 ms window); a stumble fused < 0.10 s to the next word is kept | `cut.py build` seam warnings = 0 |
| Map at −46 dB per voice (−47 leaves breaths, −42 eats «түсінбейді»); gated source `--db -60`; a clipped tail at P1 → re-map lower, don't chase seams | `cut.py transcribe --db` |
| Pause ≤ 0.45 s at the gate inside a piece; `--limit 0.36` | `cut.py build`, `qa/master.py` |
| P1 before montage: length, «ээ», ending pitch, connective last word, intro first words | `engine/p1check.py` exit 1 = not to Elzhan |
| Subtitles: two ASR windows agree within 0.3 s; spelling rests on three readers, never one | — by hand (§5) |
| A world change lands on one of the source's own cuts; no 9:16 crop of a wide shot; camera zoom on the take ≤ ~1.3 | scene-detect times; — eyes |
| Picture cut to music like to voice (when the reel has music): ≥ 60 % events on grid and above chance, ≥ 60 % strong hits answered | `qa/musicsync.py` in `engine/qa/all.sh --final` |
| Sound: 150–180 events/min, audible share ~50 %; −14 LUFS | `qa/master.py`, `build.sh` |
| Picture events WITHOUT text ≥ 130/min, no hole > 3 s — plates and subtitles don't count («иначе все события станут субтитрами и визуал бедный») | `qa/notext.py` in `all.sh` (`"notext"` in reel.json) |
| Facts, numbers, handles, CTA only from the episode's description and speech; a holy place / shrine / rite is never generated (draw it as the speaker defines it) | — eyes |

## Three readers when no Scribe key (§5)

| Reader | Good for | Lies |
|---|---|---|
| `whisper-cli -l <lang> -mc 0 -ml 1 -sow`, 6–8 s windows | word times inside a window | pins the window's first token; `-mc 0` mandatory or «және және» loops |
| YouTube ASR (`--write-auto-subs`) | a second engine | check the ORIGINAL track's language: Kazakh episodes carried `uz-orig`, `ru-orig` — on a Kazakh source, do not open it |
| same audio `atempo=0.8`, `volume=4dB`, one phrase | a disputed ending | two slow reads that agree are a fact |

## Traps that cost a rebuild

- `-f 137` has no audio; muxing a silent track costs an hour.
- Whisper pins a window's first word to its first sample («Ағамыз» 3.03 vs 4.26 real) → reel opened on 1.4 s of room tone.
- A phrase missing from the back-transcript = a keep boundary ate it, not whisper.
- `cam.sh` rewrites `work/mt` and `words.js`: redo `fill_mic.py` and the word map after every run.
- Never `cut.py transcribe` on `work/cut.mp4`.
- Head high (< 250 px above the crown): `subs: false`, big type of his words carries the beats; `behind` type one line in `y 246…360`, size ≤ 104.
- Oswald ≈ 0.62 em per caps char (900 px usable); `wrap ≤ 840`; size a `chars: 'type'` HIT for 1.35×.
- At a cut: previous last key ≥ 0.3 s before it, `shrink`/`grow` take `lead: -.03`; `aim` needs runway; `shrink` ~1 s (`at: .28`), `growHold: .42`; zoom 1.10–1.12 with a left HIT + right card.
- Hand-spread words (`words_manual.py`) drift median 0.56 s, max 2.61 s — fallback only.

## When to open the references

`references/field-notes.md` — §0 the five failures, §1 yt-dlp options that don't work, §3 multicam and the desk-mic hole,
§4 gated sources and filler cuts with spectral checks, §5 readers and word maps, §6 montage numbers, §7 sound, §8 facts,
the old working order and the reject list. Open the section when its step misbehaves or Elzhan rejects that step.
