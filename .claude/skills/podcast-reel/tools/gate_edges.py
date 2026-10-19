# gate_edges.py OFFSET a:b …  (run in reel folder; a/b = episode time of first word start / last word end)
# start = deepest 20 ms frame in [a-0.30, a+0.03]; end = deepest in [b-0.03, b+0.30]; prints dB and text
import json, subprocess, sys, numpy as np
off=float(sys.argv[1])
raw = subprocess.run(['ffmpeg','-v','error','-i','work/cut/src_1.wav','-ac','1','-ar','16000','-f','s16le','-'],capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.int16).astype(np.float32)/32768
k=len(x)//320; env=20*np.log10(np.maximum(np.sqrt((x[:k*320].reshape(k,320)**2).mean(1)),1e-7))
W=json.load(open('work/cut/words_1.json'))
def deep(t0,t1,prefer):   # deepest frame; ties → the one nearest the word
    r=list(range(max(0,int(t0/.02)),min(k,int(t1/.02)+1)))
    m=min(env[i] for i in r); c=[i for i in r if env[i]<=m+3]
    i=c[-1] if prefer=='late' else c[0]
    return i*.02+.01, env[i]
ks=[]
for r in sys.argv[2:]:
    if r.startswith('='):   # '=s:e' — exact SLICE times measured by hand (a vowel→consonant edge by centroid)
        s,e=map(float,r[1:].split(':')); print(f'{s:.2f} → {e:.2f} exact', file=sys.stderr)
        ks.append(f'--keep src_1:{s:.2f}:{e:.2f}'); continue
    a,b=(float(v)-off for v in r.split(':'))
    s,sl=deep(a-0.30,a+0.03,'late'); e,el=deep(b-0.03,b+0.30,'early')
    flag=' !!' if sl>-50 or el>-50 else ''
    txt=' '.join(w['w'] for w in W if w['t0']>=s-0.02 and w['t1']<=e+0.05)
    print(f'{s:.2f}({sl:.0f}) → {e:.2f}({el:.0f}){flag}  {txt[:90]} … {txt[-50:]}', file=sys.stderr)
    ks.append(f'--keep src_1:{s:.2f}:{e:.2f}')
print(' '.join(ks))
