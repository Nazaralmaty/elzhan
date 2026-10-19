# gate_fillers.py a:b [a:b …]  (run in reel folder, slice times) → --keep list with FILLERs cut at gate dips + silence splices
# A FILLER from work/cut/fillers_1_kk.txt inside a keep is cut only when both its edges reach a dip
# <= DIP dB (gate closing, speech median -16). Seam gap = silence kept left + right; < 0.35 s gets a
# splice of pure gate silence from the same take to 0.40 s. Fused fillers are printed, not cut.
# --all: Elzhan named every «ээ» — a fused edge is cut too, at the deepest 10 ms frame between the
# held vowel and the word (the named-filler rule of /obrezka), and the seam gets its silence splice.
import subprocess, sys, numpy as np
DIP = -50
ALL = '--all' in sys.argv; sys.argv = [x for x in sys.argv if x != '--all']
raw = subprocess.run(['ffmpeg','-v','error','-i','work/cut/src_1.wav','-ac','1','-ar','16000','-f','s16le','-'],capture_output=True).stdout
a = np.frombuffer(raw, dtype=np.int16).astype(np.float32)/32768
k=len(a)//320; env=20*np.log10(np.maximum(np.sqrt((a[:k*320].reshape(k,320)**2).mean(1)),1e-7))
fr = lambda t: min(max(int(round(t/.02)),0),k-1)
k10=len(a)//160; env10=20*np.log10(np.maximum(np.sqrt((a[:k10*160].reshape(k10,160)**2).mean(1)),1e-7))
def deep10(t0,t1):
    r=range(max(0,int(t0/.01)),min(k10,int(t1/.01)+1)); i=min(r,key=lambda i:env10[i]); return i*.01+.005, env10[i]
import re
VOWEL = re.compile(r"чтение '((?:[аәэеуыіоөұүmм]{1,2} ?)+)'", re.I)   # 'а', 'ау', 'а а а
# an UNCLEAR vowel is cut only between two real dips: fused, it may be the first sound of the next
# word (atlas/reel_022: 'а' before «Азия» was the word's own А)
F = [tuple(map(float,l.split()[:2])) + (' FILLER ' in l,) for l in open('work/cut/fillers_1_kk.txt')
     if ' FILLER ' in l or (ALL and ' UNCLEAR ' in l and VOWEL.search(l))]
# SKIP=71.62,… — a FILLER that is the word's own stretched vowel («сондықтааан»): cutting it eats the
# word's last consonant (atlas/reel_025), so it is listed by hand after a centroid check
import os
SKIP = [float(x) for x in os.environ.get('SKIP', '').split(',') if x]
F = [f for f in F if not any(abs(f[0]-x) < 0.05 for x in SKIP)]
# longest run of gate silence (< -90 dB) for splices
best=(0,0); i=0
while i<k:
    if env[i]<-90:
        j=i
        while j+1<k and env[j+1]<-90: j+=1
        if j-i>best[1]-best[0]: best=(i,j)
        i=j+1
    else: i+=1
SIL0 = best[0]*.02+0.02
def deepest(t0,t1):
    r=range(fr(t0),fr(t1)+1); i=min(r,key=lambda i:env[i]); return i*.02+0.01, env[i]
def quiet_run(t, d):   # silence (< -55) kept from t going direction d until sound
    i=fr(t); n=0
    while 0<=i<k and env[i]<-55: n+=1; i+=d
    return n*.02
out=[]; fused=[]; prev=None
for r in sys.argv[1:]:
    s,e=map(float,r.split(':')); cur=s
    if prev is not None:
        ql,qr=quiet_run(prev-0.02,-1),quiet_run(s,1)
        if ql>0.22:   # a seam over 0.44 s between keeps: pull both edges in to 0.22 each
            pe=out[-1].rsplit(':',1); out[-1]=f'{pe[0]}:{float(pe[1])-(ql-0.22):.2f}'; ql=0.22
        if qr>0.22: s+=qr-0.22; cur=s; qr=0.22
        gap=ql+qr
        if gap<0.35: out.append(f'--keep src_1:{SIL0:.2f}:{SIL0+0.40-gap:.2f}')
        print(f'seam {prev:.2f}|{s:.2f} gap {gap:.2f}' + (f' + splice {0.40-gap:.2f}' if gap<0.35 else ''), file=sys.stderr)
    prev=e
    for fs,fe,isf in F:
        if not (s<fs and fe<e): continue
        L,lv=deepest(fs-0.16,fs+0.08); R,rv=deepest(fe-0.10,fe+0.16)
        if (lv>DIP or rv>DIP) and not isf: continue
        if (lv>DIP or rv>DIP) and not ALL: fused.append(f'{fs:.2f}-{fe:.2f} fused (left dip {lv:.0f} dB, right dip {rv:.0f} dB)'); continue
        if lv>DIP: L,lv=deep10(fs-0.06,fs+0.10)
        if rv>DIP: R,rv=deep10(fe-0.10,fe+0.06)
        ql,qr=quiet_run(L-0.02,-1),quiet_run(R,1)
        if ql>0.22: L-=ql-0.22; ql=0.22     # a seam longer than 0.6 s is a hole: keep 0.22 per side
        if qr>0.22: R+=qr-0.22; qr=0.22
        gap=ql+qr
        out.append(f'--keep src_1:{cur:.2f}:{L:.2f}')
        if gap<0.35: out.append(f'--keep src_1:{SIL0:.2f}:{SIL0+0.40-gap:.2f}')
        print(f'cut filler {fs:.2f}-{fe:.2f} at {L:.2f}({lv:.0f})→{R:.2f}({rv:.0f}), gap {gap:.2f}' + (f' + splice {0.40-gap:.2f}' if gap<0.35 else ''), file=sys.stderr)
        cur=R
    out.append(f'--keep src_1:{cur:.2f}:{e:.2f}')
print('\n'.join('LEFT '+x for x in fused), file=sys.stderr)
print(' '.join(out))
