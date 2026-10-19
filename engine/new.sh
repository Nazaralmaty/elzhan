#!/bin/bash
# engine/new.sh <genre> <reel folder> [--client <id>] [--brand <name>]   — scaffold a reel from the genre example
#   genres: archive code board canvas canvas-pro canvas-vox motion triplex faceless goz limbo orbit speaker speaker-canvas kinetic joe pulse
#   --client: КОНТЕНТ ЗАВОД КЛИЕНТЫ/<id>/_ассеты/client.json (schema engine/gen/client_schema.md) decides what every reel of the
#   client repeats: index.html loads the preset (brand fonts, colour tokens, brand css) instead of a copied <style>; reel.json
#   gets the client's reel_json + music; CLAUDE.md gets the brief-scene table, voice, music, CTA and the client's bans.
#   Footage genres next: engine/cam.sh → engine/gen/skel.py --genre <genre> --client <id> --words assets/vo/words.js
set -eu
G=${1:?genre}; D=${2:?folder}; shift 2
CLIENT=""; BRAND=""
while [ $# -gt 0 ]; do case "$1" in
  --client) CLIENT=${2:?client id}; shift 2 ;;
  --brand) BRAND=${2:?brand}; shift 2 ;;
  *) echo "new.sh: unknown option $1" >&2; exit 2 ;;
esac; done
EX=~/.claude/engine/examples/"$G"
[ -d "$EX" ] || { echo "new.sh: no example '$G' in engine/examples" >&2; exit 2; }
mkdir -p "$D/assets" "$D/work" "$D/out" "$D/renders"
cp -R "$EX"/. "$D"/
ln -sfn ~/.claude/engine "$D/engine"
[ "$G" = essay ] && cp -R ~/.claude/assets/px "$D/assets/px"   # the pixel-object library goes into the reel (it renders offline)

if [ -n "$CLIENT" ]; then
  CJ="${CLIENTS:-$HOME/Documents/Obsidian Vault/КОНТЕНТ ЗАВОД КЛИЕНТЫ}/$CLIENT/_ассеты/client.json"
  [ -f "$CJ" ] || { echo "new.sh: no $CJ" >&2; exit 2; }
  /usr/local/bin/python3 - "$CJ" "$D" "$G" "$BRAND" <<'PY'
import json, os, re, sys
cj, d, genre, brand = sys.argv[1:5]
C = json.load(open(cj)); bid = brand or C.get('brand') or next(iter(C['brands']))
if bid not in C['brands']: sys.exit(f"new.sh: no brand '{bid}' in {cj} (have: {', '.join(C['brands'])})")
B = C['brands'][bid]; cdir = os.path.dirname(os.path.dirname(cj)); cta = B.get('cta') or C.get('cta') or {}
rel = os.path.relpath(cj, os.path.abspath(d))
name = os.path.basename(os.path.abspath(d))

# index.html: the client preset loader replaces the example's brand block
p = os.path.join(d, 'index.html'); h = open(p).read()
loader = f'<script src="engine/gen/client.js" data-client="{rel}" data-brand="{bid}"></script>'
h, n = re.subn(r'<!-- brand:.*?<!-- /brand -->', loader, h, flags=re.S)
if not n: h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + loader, 1)
h = re.sub(r'<html lang="[^"]*">', f'<html lang="{C.get("lang", "ru")}">', h, count=1)
h = re.sub(r'<title>.*?</title>', f'<title>{B.get("name", bid)} · {name} · {genre}</title>', h, count=1)
open(p, 'w').write(h)

# reel.json: example ← client reel_json ← music
p = os.path.join(d, 'reel.json'); R = json.load(open(p)); R.update(C.get('reel_json', {}))
M = C.get('music', {})
if M.get('mode') == 'none': R['bgm'] = ''; [R.pop(k, None) for k in ('music', 'bgm_offset', 'bgm_vol')]
elif M.get('mode') == 'tracks':
    first = M['files'][next(iter(M['files']))]
    R.pop('bgm', None); R['music'] = [{'file': os.path.join(cdir, first), 'from': M.get('from', 0), 'at': 0}]
    R.update(M.get('reel_json', {}))
json.dump(R, open(p, 'w'), ensure_ascii=False)

# the client's standard images (outro photo, ornament, logo) are copied in: a reel renders offline (factory §7)
import shutil
os.makedirs(os.path.join(d, 'assets', 'img'), exist_ok=True)
for a in C.get('assets', []): shutil.copy(os.path.join(cdir, a), os.path.join(d, 'assets', 'img'))

# CLAUDE.md stub: the brief broken into scenes before the spec (factory §1.4) + what this client never allows
V, bans = C.get('voice', {}), C.get('bans', {})
L = [f'# {B.get("name", bid)} · {name}', '',
     f'Client `{C["id"]}` (brand `{bid}`), genre `{genre}`, preset `{os.path.relpath(cj, cdir)}`. Facts and reasons: `../CLAUDE.md`.', '',
     '## Brief → scenes (fill before spec.js; check every row against the master before delivery)', '',
     '| # | Scene / fact from the brief | Beat | In master |', '|---|---|---|---|', '| 1 |  |  |  |', '',
     '## Preset', '',
     f'- voice: {json.dumps(V, ensure_ascii=False)}',
     f'- music: {json.dumps({k: v for k, v in M.items() if k != "reel_json"}, ensure_ascii=False)}',
     f'- CTA: {json.dumps(cta, ensure_ascii=False) if cta else "none — by voice or the platform button"}',
     '- sfx_gain / sfx_max: measured for this reel (/sound §0), never copied from a neighbour', '',
     '## Never (client bans)', '', *[f'- {b}' for b in bans.get('visual', [])], *[f'- word: {b}' for b in bans.get('words', [])], '',
     '## Decisions', '', '']
open(os.path.join(d, 'CLAUDE.md'), 'w').write('\n'.join(L))
print(f'client {C["id"]} · brand {bid} → index.html loader, reel.json, CLAUDE.md')
PY
fi

echo "scaffolded $D from example '$G'. Next:"
case "$G" in
  speaker|speaker-canvas|kinetic|joe)
    echo "  cd \"$D\" && engine/cam.sh work/cut.mp4 && python3 engine/gen/skel.py --genre $G ${CLIENT:+--client $CLIENT }--words assets/vo/words.js && node engine/render.js --sheet 12" ;;
  *)
    echo "  cd \"$D\" && python3 engine/tts_or.py --voice <Voice> && TEMPO=1.07 engine/tts.sh trim && engine/words.sh ru && python3 engine/gen/skel.py --genre <genre> --script script.txt && node engine/render.js --sheet 12" ;;
esac
