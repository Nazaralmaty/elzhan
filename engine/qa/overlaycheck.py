#!/usr/bin/env python3
"""overlaycheck — графика, которая должна быть в кадре, обязана быть в кадре.

Зачем. При наложении последовательности PNG (`image2`) на видео `overlay`
недетерминированно пропускает кадры вторичного входа: в готовом ролике
полноэкранная вставка мигает по 7–10 кадров. Число кадров при этом
СОВПАДАЕТ, поэтому счётчик кадров такой брак не ловит — ловит только
сравнение содержимого.

Лечится не проверкой, а сборкой: кадры графики сначала кодируются в видео с
альфой, и накладывается видео на видео.

    ffmpeg -framerate 30 -i renders/frames/f_%04d.png -c:v qtrle -pix_fmt argb -r 30 work/ov.mov
    ffmpeg -i work/base.mov -i work/ov.mov -filter_complex \
      "[0:v][1:v]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]" ...

Проверка: где слой графики непрозрачен, композит обязан отличаться от основы.

    python3 engine/qa/overlaycheck.py work/base.mov work/ov.mov work/_video.mov
"""
import subprocess, sys

S = 32
def gray(path):
    raw = subprocess.run(["ffmpeg","-v","error","-i",path,"-vf",f"scale={S}:{S},format=gray",
                          "-fps_mode","passthrough","-f","rawvideo","-"],
                         capture_output=True).stdout
    n = S*S
    return [sum(raw[i*n:(i+1)*n])/n for i in range(len(raw)//n)]

def alpha(path):
    raw = subprocess.run(["ffmpeg","-v","error","-i",path,"-vf",f"scale={S}:{S},format=rgba",
                          "-fps_mode","passthrough","-f","rawvideo","-"],
                         capture_output=True).stdout
    n = S*S*4
    return [sum(raw[i*n+3:(i+1)*n:4])/(S*S) for i in range(len(raw)//n)]

base, ov, out = sys.argv[1], sys.argv[2], sys.argv[3]
b, o, c = gray(base), alpha(ov), gray(out)
N = min(len(b), len(o), len(c))
if not (len(b) == len(o) == len(c)):
    print(f"overlaycheck: разное число кадров — основа {len(b)}, графика {len(o)}, композит {len(c)}")
    sys.exit(1)

bad = [i for i in range(N) if o[i] > 250 and abs(c[i] - b[i]) < 8]
print(f"overlaycheck: {N} кадров, полноэкранной графики {sum(1 for x in o if x > 250)}")
if bad:
    runs, start = [], bad[0]
    for i in range(1, len(bad)):
        if bad[i] != bad[i-1] + 1:
            runs.append((start, bad[i-1])); start = bad[i]
    runs.append((start, bad[-1]))
    print(f"overlaycheck: БРАК — графика пропала на {len(bad)} кадрах:")
    for a, z in runs:
        print(f"  кадры {a}–{z}  ({a/30:.2f}–{z/30:.2f} c)")
    print("overlaycheck: так вставка мигает. Собирай графику в видео с альфой, а не PNG в overlay.")
    sys.exit(1)
print("overlaycheck: ок, графика на месте во всех кадрах")
