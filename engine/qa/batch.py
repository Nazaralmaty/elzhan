#!/usr/local/bin/python3
"""engine/qa/batch.py <dir> [<dir> ...] — one row per finished reel: length, loudness,
true peak, level, VideoToolbox decode errors, cover. Run from the factory root.
    python3 ~/.claude/engine/qa/batch.py $(cat list.txt)
Also writes a contact sheet of the covers next to the first directory: out/covers.jpg
"""
import json, subprocess, sys, pathlib, re

def sh(*a):
    return subprocess.run(a, capture_output=True, text=True).stdout

rows, covers = [], []
for d in sys.argv[1:]:
    p = pathlib.Path(d); m = p / 'out' / 'reel.mp4'
    if not m.exists():
        rows.append((p.name, '—', '', '', '', 'нет мастера')); continue
    pr = sh('ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-show_entries', 'stream=width,height,level,codec_type', '-of', 'json', str(m))
    j = json.loads(pr or '{}')
    dur = float(j.get('format', {}).get('duration', 0))
    v = next((s for s in j.get('streams', []) if s.get('codec_type') == 'video'), {})
    eb = sh('ffmpeg', '-hide_banner', '-nostats', '-i', str(m), '-af',
            'ebur128=peak=true:framelog=quiet', '-f', 'null', '-')
    eb += subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(m), '-af',
                          'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    I = re.findall(r'I:\s+(-?\d+\.\d+) LUFS', eb)
    peak = re.findall(r'Peak:\s+(-?\d+\.\d+) dBFS', eb)
    dec = subprocess.run(['ffmpeg', '-v', 'warning', '-hwaccel', 'videotoolbox', '-i', str(m),
                          '-f', 'null', '-'], capture_output=True, text=True).stderr.count('failed to decode')
    rows.append((str(p), f'{dur:.1f} с', (I[-1] + ' LUFS') if I else '?',
                 (peak[-1] + ' dBFS') if peak else '?',
                 f"{v.get('width')}×{v.get('height')} lvl {v.get('level')}", str(dec)))
    c = p / 'out' / 'cover.jpg'
    if c.exists(): covers.append(str(c))

w = [max(len(str(r[i])) for r in rows) for i in range(6)]
hdr = ('ролик', 'длина', 'громкость', 'пик', 'кадр', 'ошибки')
print('  '.join(h.ljust(w[i]) for i, h in enumerate(hdr)))
for r in rows:
    print('  '.join(str(x).ljust(w[i]) for i, x in enumerate(r)))

if covers:
    out = pathlib.Path(sys.argv[1]).parent / 'covers.jpg'
    cols = 6
    ins = [x for c in covers for x in ('-i', c)]
    fc = ';'.join(f'[{i}:v]scale=300:533[v{i}]' for i in range(len(covers)))
    fc += ';' + ''.join(f'[v{i}]' for i in range(len(covers)))
    fc += (f'xstack=inputs={len(covers)}:layout=' +
           '|'.join(f'{(i % cols) * 300}_{(i // cols) * 533}' for i in range(len(covers))) +
           ':fill=black[o]')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *ins, '-filter_complex', fc,
                    '-map', '[o]', '-q:v', '3', str(out)], check=False)
    print(f'\nобложки → {out}  ({len(covers)} шт.)')
