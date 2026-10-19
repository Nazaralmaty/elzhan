#!/usr/local/bin/python3
"""engine/qa/source.py [video…] — the source is fit for the 8-bit 9:16 pipeline. Run from the reel folder.
Default: work/cut.mp4 and out/reel.mp4, whichever exist. cam.sh runs it on its input before any
derivative (matte, frames); qa/all.sh runs it on the master.

  HDR left as is   color_transfer arib-std-b67 / smpte2084 → milky picture, saturation 0.15
                   («какой-то белый файл», th/reel_001); tonemap chain — CLAUDE.md завода §5
  rotation tag     a phone writes vertical as a lying raster + rotation=90; ffmpeg turns it before or after
                   the filters, so a tag left in work/ turns the frame twice (byMamyr/reel_003)
  master size      out/reel.mp4 is 1080×1920 unless reel.json "size" names the client's own format
"""
import json, os, subprocess, sys


def probe(f):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-print_format', 'json',
                          '-show_entries', 'stream=width,height,color_transfer:stream_side_data=rotation', f],
                         capture_output=True, text=True).stdout
    return (json.loads(out or '{}').get('streams') or [{}])[0]


files = sys.argv[1:] or [f for f in ('work/cut.mp4', 'out/reel.mp4') if os.path.exists(f)]
size = '1080x1920'
if os.path.exists('reel.json'):
    size = json.load(open('reel.json')).get('size', size)
fail = []
for f in files:
    s = probe(f)
    trc = s.get('color_transfer', '')
    rot = next((int(d['rotation']) for d in s.get('side_data_list', []) if d.get('rotation')), 0)
    print(f'{f}: {s.get("width")}×{s.get("height")} · transfer {trc or "—"} · rotation {rot}')
    if trc in ('arib-std-b67', 'smpte2084'):
        fail.append(f'{f}: HDR ({trc}) не тонмаплен — zscale+tonemap mobius, свод §5')
    if rot:
        fail.append(f'{f}: метка поворота {rot}° — вход с -display_rotation 0 и transpose руками')
    if f.startswith('out/') and f'{s.get("width")}x{s.get("height")}' != size:
        fail.append(f'{f}: {s.get("width")}×{s.get("height")}, а мастер {size}')
for x in fail:
    print('БРАК', x)
sys.exit(1 if fail else 0)
