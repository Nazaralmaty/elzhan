#!/usr/bin/env python3
"""engine/qa/gemwatch.py — a video model watches the reel at full frame rate WITH sound (Gemini 4 via OpenRouter).

  python3 engine/qa/gemwatch.py ref.mp4 [--vs our.mp4] [--ask prompt.txt | --mode study|critique] [--out file.md]
                                        [--model google/gemini-4-argon] [--note "constraint the critic must respect"]

Why: our own frame strips are stills at 2–10 fps — easing, motion blur, speed ramps and what a sound sits on are guessed,
and three builds in a row were judged from stills («небо и земля», 22.09.2026). One call ≈ 300 tokens per second of
video, ~$0.03 for 40 s. --mode study: a frame-accurate motion / sound breakdown of one reel. --mode critique with --vs:
the reference and our master side by side, a blunt list of what makes ours weaker, ordered by how much it costs.
--note: what ours could not have (e.g. «ours is cut from ONE static take of the speaker; extra camera angles, locations
and props are not available — judge only the edit»): without it the critic scores the shoot, not the montage
(pulse v2, 19.10.2026: 2/10 twice for «один план вместо пяти ракурсов» of a multi-location reference).
Key: ~/.claude/tools/openrouter/.env (OPENROUTER_API_KEY). The video goes as base64, downscaled to 540 px if larger.
"""
import base64, json, os, subprocess, sys, tempfile, urllib.request
from pathlib import Path

a = sys.argv[1:]
if not a or a[0].startswith('-'): sys.exit(__doc__)
opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
VIDEO, VS, ASK, MODE = a[0], opt('--vs'), opt('--ask'), opt('--mode', 'critique' if '--vs' in a else 'study')
MODEL, OUT, NOTE = opt('--model', 'google/gemini-4-argon'), opt('--out'), opt('--note')

STUDY = """You are a senior motion designer and sound designer. Watch this vertical reel frame by frame WITH its sound.
Write in Russian. Do not describe what is in the frame in general — describe HOW things move and change.
1. Timeline: one row per event, timecode to 0.1 s: what moves, from where to where, how long (frames at 30 fps), easing
   (linear / ease-out / overshoot / spring), motion blur yes/no, camera move (push, pull, whip, tilt, shake), and the exact
   sound on it (whoosh, hit, click, riser, music accent, silence).
2. The 6–10 techniques that make this reel feel expensive, each with measured numbers (durations, scale %, speed,
   cuts per minute, events per 4 s window, how many layers are in motion at once).
3. Sound: music genre and bpm, where the music drops or hits, how SFX are layered and how loud vs the voice.
4. What a viewer feels in the first 1.5 s and why they keep watching at 5 s and 10 s."""

CRITIQUE = """You are a harsh senior motion designer reviewing a junior's reel against the reference it copies.
The FIRST video is the reference, the SECOND is ours. Watch both frame by frame WITH sound. Write in Russian, blunt.
1. Verdict in one line: how far ours is from the reference (0–10) and the single biggest reason.
2. Ordered list (biggest loss first, max 10): what exactly in OUR reel looks cheap, static, amateur or off-rhythm,
   with timecodes in ours, and what the reference does instead at its timecodes — concrete motion, timing, easing,
   layering, camera, typography, sound. No generic advice ("add more dynamics") — every point must be buildable.
3. What ours does well and must keep.
4. The three changes that would raise ours the most, as a build list."""


def prep(p):
    """≤ 540 px wide h264 + aac so the upload stays small; the reel is short, fps is kept."""
    w = int(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width', '-of', 'csv=p=0', p],
                           capture_output=True, text=True).stdout.split()[0])
    if w <= 540 and p.endswith('.mp4') and os.path.getsize(p) < 12e6: return Path(p).read_bytes()
    t = tempfile.mktemp(suffix='.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-vf', 'scale=540:-2', '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast',
                    '-c:a', 'aac', '-b:a', '96k', t], check=True)
    b = Path(t).read_bytes(); os.remove(t); return b


key = next((l.split('=', 1)[1].strip().strip('"') for l in (Path.home() / '.claude/tools/openrouter/.env').read_text().splitlines()
            if l.startswith('OPENROUTER_API_KEY=')), None) or sys.exit('gemwatch: no OPENROUTER_API_KEY')
prompt = Path(ASK).read_text() if ASK else (CRITIQUE if MODE == 'critique' else STUDY)
if NOTE: prompt += f"\n\nConstraint of OUR reel — do not penalise it, judge only what is buildable within it: {NOTE}"
content = [{'type': 'text', 'text': prompt}]
for v in [VIDEO] + ([VS] if VS else []):
    content.append({'type': 'video_url', 'video_url': {'url': 'data:video/mp4;base64,' + base64.b64encode(prep(v)).decode()}})
req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', method='POST',
                             headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
                             data=json.dumps({'model': MODEL, 'messages': [{'role': 'user', 'content': content}]}).encode())
import time
for attempt in range(4):   # a DNS blip or a 5xx mid-render killed one run (01:20 19.10.2026): retry with backoff
    try:
        r = json.load(urllib.request.urlopen(req, timeout=600)); break
    except urllib.error.HTTPError as e:
        if e.code < 500 or attempt == 3: sys.exit(f'gemwatch: HTTP {e.code}: {e.read().decode()[:400]}')
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        if attempt == 3: sys.exit(f'gemwatch: network: {e}')
    time.sleep(10 * (attempt + 1))
if 'choices' not in r: sys.exit(f'gemwatch: {json.dumps(r)[:400]}')
text = r['choices'][0]['message']['content']
u = r.get('usage', {})
text += f"\n\n<!-- gemwatch {MODEL} · tokens in {u.get('prompt_tokens')} out {u.get('completion_tokens')} -->\n"
if OUT: Path(OUT).write_text(text); print(f'gemwatch → {OUT} ({u.get("prompt_tokens")} tokens in)')
else: print(text)
