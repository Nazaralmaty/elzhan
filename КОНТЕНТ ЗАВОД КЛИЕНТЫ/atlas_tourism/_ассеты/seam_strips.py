#!/usr/bin/env python3
"""Полосы кадров мастера вокруг каждого шва бита — движение, а не стоп-кадр (свод §2).
Запуск из папки ролика после build.sh: ../_ассеты/seam_strips.py → renders/seams_NN.jpg (по 6 швов на лист,
у каждого шва 8 кадров: от −0.5 до +0.5 с). Швы берутся из work/els.json (acts)."""
import json, subprocess, os
M = 'out/reel.mp4'
acts = json.load(open('work/els.json'))['acts']
ts = sorted({round(a['t0'] if isinstance(a, dict) else a[0], 2) for a in acts})[1:]
os.makedirs('renders', exist_ok=True)
for k in range(0, len(ts), 6):
    rows = []
    for j, t in enumerate(ts[k:k + 6]):
        out = f'/tmp/_seam_{j}.jpg'
        s = max(0, t - 0.5)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{s:.2f}', '-i', M, '-frames:v', '1', '-vf',
                        f"fps=8,scale=180:320,drawtext=text='{t:.2f}':x=4:y=4:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,tile=8x1",
                        '-update', '1', out], check=True)
        rows.append(out)
    args = sum([['-i', r] for r in rows], [])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args, '-filter_complex', f'vstack=inputs={len(rows)}' if len(rows) > 1 else 'null',
                    f'renders/seams_{k // 6:02d}.jpg'], check=True)
    print(f'renders/seams_{k // 6:02d}.jpg', ' '.join(f'{t:.2f}' for t in ts[k:k + 6]))
