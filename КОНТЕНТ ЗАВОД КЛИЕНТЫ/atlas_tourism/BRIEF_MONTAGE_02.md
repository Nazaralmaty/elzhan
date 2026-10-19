# Brief — montage of one ATLAS PODCAST №2 reel (agent)

You build ONE finished master `out/reel.mp4` for the reel folder named in your task. The cut is
already approved by Elzhan — do not change which words are in it (only the end-of-reel mechanics below).

## Read first, in this order
1. `КОНТЕНТ ЗАВОД КЛИЕНТЫ/CLAUDE.md` — factory laws.
2. `atlas_tourism/CLAUDE.md` — client laws (colours, plates `band`/`pill` under the head, gold not on the mic,
   no bare text over footage, one shared outro `_ассеты/outro.js`, 0.5 s silence before the outro).
3. `atlas_tourism/ПОДКАСТ_02_РАЗБОР.md` — §2 who sits where, §3 sound, **§6 montage of episode 2** (worlds as
   schemes built from the speaker's own words, ≥ 130 events/min WITHOUT text, seam prices, traps).
4. Your reel's `CLAUDE.md` (source, thought, plans) and `work/keeps_final.txt` (the approved cut).
5. The reference reel: `reel_023_bir_payyz/spec.js` + its `CLAUDE.md` «Дубль и планы», «Монтаж». Also
   `reel_024_perishteler`, `reel_026_komfort`, `reel_035_salem` — the four accepted masters of this episode.
6. Skills: `/speaker-canvas` (genre), `/reel-engine`, `/mnt-meaning` (every insert proves the spoken line).

## Pipeline (same as 023/024/026/035 — copy their commands from their CLAUDE.md and work/ files)
- the cut is built: `work/cut.mp4`, `work/cut/edl.txt`, `work/cut/cut16.wav`, `work/cut/cut16.words.kk.json`, `out/обрезка.wav`.
- end: last piece already ends in the envelope dip after the last word — verify with `../_ассеты/set_end_02.py`
  logic; do not re-cut words.
- take: `../_ассеты/prep_take_02.py … --tail 5.5` (crop per plan and per speaker; read its header) →
  `matte.py --faces-only` → `qa/face.json` → `words_scribe.py work/cut/cut16.words.kk.json --tail 5.0`,
  `cta` token shifted +0.5 s (pause before the outro).
- fillers: `fillers.py` on the voice, verdicts in `work/fillers_reviewed.txt` (one line per candidate, by timecode);
  breaths ducked to the room floor, never deleted.
- spec: `spec.js` through `_ассеты/mech.js` + `geom.js`, outro `outro({ from: 'cta', ep: 2, photo: 'yt_thumb_02.jpg',
  title: 'ҚАЖЫЛЫҚҚА БАРАТЫНДАР АРАБҚҰЛ МА?' })`. Kazakh plate text: the speaker's own words, compressed, never invented.
- `reel.json` like 023 (`"lang": "kk"`, `"pause_db": -55`).

## Render — ONE machine, ONE render at a time
Other agents render in parallel folders. Every heavy step (matte, `render.js`, `build.sh`) runs under the shared lock:

```bash
until mkdir /tmp/atlas02_render.lock 2>/dev/null; do sleep 30; done
caffeinate -i node engine/render.js --workers 7; engine/build.sh; rmdir /tmp/atlas02_render.lock
```
Always `rmdir` the lock, also after a failure. If load average > 12 before starting, wait.

## Gates before you say done
`engine/build.sh` gates (master / overlap / rows) clean; `../_ассеты/density_notext.py` ≥ 130/min;
`../_ассеты/seam_strips.py` → look at `renders/seams_NN.jpg`; `engine/qa/mastersheet.sh` → LOOK at the frames
(face clearance 15 px, plates under the head, nothing cut by the frame edge, no glued numerals).
Ear-level things a machine cannot check — list them, do not claim them.

## Write-up
Rewrite your reel's `CLAUDE.md` in place: «Обрезка» section = the approved cut (keeps, length, what changed vs П1),
add «Дубль и планы» and «Монтаж» like 023. No dated appendices at the bottom. Russian, no AI-slop.
Final report to the orchestrator: master path, length, LUFS, events/min without text, gates, what was not verified.
Do not delete anything outside your reel folder. Do not touch other reel folders.
