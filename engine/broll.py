#!/usr/local/bin/python3
"""engine/broll.py — a b-roll edit under a voiceover: shots.json → work/take.mp4 (the footage genres then run on it as on a take).
Run from the reel folder after engine/cut.py build (work/cut.mp4 = the cut voice).

  shots.json  { "raw": "../_ассеты/raw", "grade": "<-vf>" (optional), "shots": [[t0, clip, src, z, cx, cy, "comment"], …] }
              t0 — second on the cut voice; clip — file stem in raw/ (.MOV); src — second in the clip;
              z — zoom over the 9:16 cover crop (≥ 1.15 leaves slack for the eye-trace shift); cx, cy — crop centre, fractions.
  engine/broll.py sheet    one mid frame per shot → work/shots_sheet.jpg
  engine/broll.py build    shots (grade baked in), concat, mux work/cut.mp4's voice → work/take.mp4; cut times → work/cuts.json, work/cuts.js
  engine/broll.py align    eye-trace (Elzhan's lesson instagram.com/p/DdREsBwvXEt — «каждый новый кадр начинается там, где был
                           взгляд»): raw Vision faces on both sides of every cut of the last take; the incoming crop is shifted so its face
                           lands where the outgoing face was → work/align.json. Then build again; two rounds converge.
  engine/broll.py report   face-to-face jumps per cut, px
Laws: never two shots of the same clip in a row (a cut to the same picture is no change: «меняешь кадр, но он меняется на то же
самое»); the default grade is the soft one Elzhan accepted (grade.py thriller -k 0.35 + a light cool shift, mean luma not below
the source) — the cold v2 with lifted black was rejected («слишком затемнил и увёл в синий»). Grain belongs to the page (fx grain).
qa/face.json cannot serve the eye-trace: it fills faceless frames from neighbours. engine/faces_raw.py is the raw detector."""
import subprocess, sys, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open('shots.json'))
RAW = C.get('raw', '../_ассеты/raw')
GRADE = C.get('grade') or ("colorbalance=rs=-0.063:gs=0.0:bs=0.084:rm=-0.014:gm=0.0:bm=0.014:rh=0.056:gh=0.01:bh=-0.049,"
    "eq=contrast=1.042:saturation=1.018:gamma=0.982,colorbalance=rm=-0.035:bm=0.045:rh=-0.02:bh=0.025,eq=gamma=1.04:saturation=0.97")
S = [tuple(s[:6]) for s in C['shots']]
DUR = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0','work/cut.mp4'],capture_output=True,text=True).stdout)
AL = json.load(open('work/align.json')) if os.path.exists('work/align.json') else {}

def sh(*a): return subprocess.run(a, capture_output=True, text=True, check=True).stdout

def dims(f):
    d = json.loads(sh('ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height:stream_side_data=rotation','-of','json',f))['streams'][0]
    rot = next((int(s.get('rotation',0)) for s in d.get('side_data_list',[]) if 'rotation' in s), 0)
    return (d['height'], d['width']) if rot % 180 else (d['width'], d['height'])

def vf(i, f, z, cx, cy, grade=True):
    W, H = dims(f)
    cw, ch = (H*9/16, H) if W/H > 9/16 else (W, W*16/9)   # cover crop
    cw, ch = cw/z, ch/z
    dx, dy = AL.get(f'{S[i][0]:.2f}', (0, 0))           # eye-trace shift keyed by the shot's time (a shot inserted later shifts no other), output px → source px
    x = min(max(cx*W - cw/2 - dx*cw/1080, 0), W-cw); y = min(max(cy*H - ch/2 - dy*ch/1920, 0), H-ch)
    return f'crop={cw:.0f}:{ch:.0f}:{x:.0f}:{y:.0f},scale=1080:1920:flags=lanczos,setsar=1,fps=30' + (',' + GRADE if grade else '')

def spans():
    for i, (t0, c, s, z, cx, cy) in enumerate(S):
        yield i, t0, (S[i+1][0] if i+1 < len(S) else DUR), f'{RAW}/{c}.MOV', c, s, z, cx, cy

def faces():   # raw faces on the last frame out and the first frame in of every cut
    ns = [str(round(S[i][0]*30) + d) for i in range(1, len(S)) for d in (-1, 2)]
    return json.loads(sh('python3.13', os.path.join(HERE, 'faces_raw.py'), *ns))

cmd = sys.argv[1] if len(sys.argv) > 1 else 'sheet'
os.makedirs('work/shots', exist_ok=True)
if cmd == 'sheet':
    for i, t0, t1, f, c, s, z, cx, cy in spans():
        sh('ffmpeg','-v','error','-y','-ss',str(s+(t1-t0)/2),'-i',f,'-frames:v','1','-vf',vf(i,f,z,cx,cy)+',scale=216:384',f'work/shots/p_{i:02d}.jpg')
    sh('ffmpeg','-v','error','-y','-i','work/shots/p_%02d.jpg','-vf',f'tile=10x{(len(S)+9)//10}','-frames:v','1','work/shots_sheet.jpg')
    print('work/shots_sheet.jpg', len(S), 'shots')
elif cmd == 'build':
    for i in range(1, len(S)):
        assert S[i][1] != S[i-1][1], f'shot {i}: {S[i][1]} twice in a row — a cut to the same picture is no change'
    for i in range(len(S)):   # a clip back within 8 s reads as the same picture again («5464 выходит несколько раз подряд в самом начале»)
        back = next((S[j] for j in range(i+1, len(S)) if S[j][1] == S[i][1] and S[j][0] - S[i][0] < 8), None)
        if back: print(f'   warning: {S[i][1]} at {S[i][0]} s is back at {back[0]} s — under 8 s (fine only when a world hides one of them)')
    lst = []
    for i, t0, t1, f, c, s, z, cx, cy in spans():
        srcdur = float(sh('ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f))
        assert s + t1 - t0 <= srcdur + 0.01, f'shot {i} {c}: {s}+{t1-t0:.2f} > {srcdur:.2f}'
        o = f'work/shots/s_{i:02d}.mp4'
        nf = round(t1*30) - round(t0*30)   # frame-exact: shot i covers frames round(t0·30) … round(t1·30) of the cut timeline
        sh('ffmpeg','-v','error','-y','-ss',str(s),'-i',f,'-an','-vf',vf(i,f,z,cx,cy),'-frames:v',str(nf),'-c:v','libx264','-crf','12','-preset','fast','-pix_fmt','yuv420p',o)
        lst.append(f"file '{os.path.abspath(o)}'")
    open('work/shots/list.txt','w').write('\n'.join(lst)+'\n')
    sh('ffmpeg','-v','error','-y','-f','concat','-safe','0','-i','work/shots/list.txt','-c','copy','work/broll.mp4')
    sh('ffmpeg','-v','error','-y','-i','work/broll.mp4','-i','work/cut.mp4','-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','256k','-shortest','work/take.mp4')
    cuts = [round(x[0],3) for x in S[1:]]
    json.dump(cuts, open('work/cuts.json','w')); open('work/cuts.js','w').write('window.CUTS=' + json.dumps(cuts) + ';\n')
    print('work/take.mp4', len(S), 'shots; cuts → work/cuts.json + work/cuts.js (spec: cuts: window.CUTS)')
elif cmd in ('align', 'report'):
    FC, out, d = faces(), {}, []
    for i in range(1, len(S)):
        n = round(S[i][0]*30); a, b = FC[str(n-1)], FC[str(n+2)]
        key = f'{S[i][0]:.2f}'; old = AL.get(key, (0, 0))
        if a and b:
            out[key] = (round(old[0] + a[0]-b[0]), round(old[1] + a[1]-b[1]))
            d.append(round(((a[0]-b[0])**2 + (a[1]-b[1])**2) ** .5))
            if cmd == 'report': print(f'{S[i][0]:6.2f} {S[i-1][1]}→{S[i][1]}  {a} → {b}  {d[-1]} px')
        else: out[key] = old   # no face on one side: nothing for the eye to follow
    if cmd == 'align':
        json.dump(out, open('work/align.json','w'), indent=0); print('work/align.json — rebuild, then align once more')
    print('face-to-face cuts', len(d), 'median jump', sorted(d)[len(d)//2] if d else '-', 'px')
