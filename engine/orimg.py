#!/usr/bin/env python3
"""orimg.py — one picture from OpenRouter Gemini image (nano banana), the paid generator for illustrations local FLUX can't reach.
  python3 engine/orimg.py "<prompt, english, no text>" out.png [--ar 4:5] [--edit in.png] [--model google/gemini-3.1-flash-image]
--edit sends in.png with the prompt (a second state of the same picture: same framing, one thing changed).
Key: OPENROUTER_API_KEY in ~/.claude/tools/openrouter/.env. Prints the cost of the call."""
import argparse, base64, json, os, pathlib, sys, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument('prompt'); ap.add_argument('out')
ap.add_argument('--ar', default='4:5'); ap.add_argument('--edit'); ap.add_argument('--model', default='google/gemini-3.1-flash-image')
a = ap.parse_args()
key = next(l.split('=', 1)[1].strip() for l in open(os.path.expanduser('~/.claude/tools/openrouter/.env')) if l.startswith('OPENROUTER_API_KEY='))
content = [{'type': 'text', 'text': a.prompt}]
if a.edit:
    content.append({'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + base64.b64encode(open(a.edit, 'rb').read()).decode()}})
body = {'model': a.model, 'modalities': ['image', 'text'], 'image_config': {'aspect_ratio': a.ar}, 'usage': {'include': True},
        'messages': [{'role': 'user', 'content': content}]}
req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', json.dumps(body).encode(),
                             {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
r = json.load(urllib.request.urlopen(req, timeout=300))
msg = r['choices'][0]['message']
imgs = msg.get('images') or []
if not imgs: sys.exit(f"orimg: no image — {str(msg.get('content'))[:300]}")
pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
open(a.out, 'wb').write(base64.b64decode(imgs[0]['image_url']['url'].split(',', 1)[1]))
print(a.out, 'cost', r.get('usage', {}).get('cost'))
