#!/usr/local/bin/python3
"""cut.py — raw speaker footage → one clean take, before any montage (the obrezka skill as one command).

  engine/cut.py transcribe SRC.mov [SRC2.mov …] [--lang ru] [--local] [--db -46]
      normalises every source to CFR 30 at the first source's frame size (work/cut/src_N.mp4),
      maps silence PER VOICE on the 20 ms RMS envelope at -46 dB, fragments < 0.06 s apart merged,
      silences < 0.08 s dropped (work/cut/silence_N.txt; the stock -30 dB map stays next to it as
      silence_N_-30db.txt), transcribes per word (AssemblyAI for ru/en when ASSEMBLYAI_API_KEY is in
      ~/.claude/tools/kie/.env; local whisper in chunks cut AT SILENCE otherwise, and always for kk,
      where AssemblyAI runs 25–50 % WER; work/cut/words_N.json, transcript_N.txt), prints it with times,
      long pauses and repeated 5-word runs (duplicate takes). Then YOU choose the keep ranges.
  engine/cut.py build --keep src_1:2.85:69.40 [--keep src_2:0.46:14.30 …] [--hold src_1:T] [--no-fillers]
      keep edges snapped into the nearest silence (≤ 0.40 s away, ≤ limit/2 of it kept); fillers ("ээ") cut where fillers.py
      runs; pauses trimmed to ≤ 0.45 s AS THE GATE HEARS THEM (−40 dB) with ≥ 0.10 s after the last sound; ONE ffmpeg pass → work/cut.mp4
      + work/cut/cut16.wav. Prints a 3-line summary and writes work/cut/review.txt — one line per spot to
      LISTEN to, on the assembled-track timeline with the two words around it. --check adds the slow
      whisper back-transcript (work/cut/check.txt).
  engine/cut.py fix "12.4 обрыв" "убери 30.1-31.0" "верни паузу 18.2"
      Elzhan's timecodes on cut16.wav → source time → new keeps / holds → rebuild.
        A-B (two times)      cut that span out (edges snap into silence)
        T + «ээ/убери»       cut the voiced island ≤ 1 s at T, 0.12 s of its pauses kept (fused → says so)
        T + «пауз…»          give back the trimmed pause / skipped filler at the seam nearest T
        T (anything else)    «обрыв»: widen the seam nearest T — a pause seam is left whole,
                             a keep edge widens to limit/2 of silence (its own pause or the next one)
  engine/cut.py approve      after Elzhan's OK at П1: work/cut/approved.sha («<sha1>  work/cut.mp4»,
                             then the same for cut16.wav). qa/master.py fast tier skips speech gates on it.
  engine/cut.py --self-test  asserts the time mapping and the fix arithmetic.

Speech law (Elzhan): tail after the last sound ≥ 0.10 s, no pause > 0.45 s at the gate, a cut word = a rejected reel.
0.40 on the map read as broken intonation (atlas/reel_007, «речь очень обрывистая»); 0.60 on the map read
0.62–1.00 at the gate and «паузы очень длинные» (icon/reel_067, 068). A broken phrase is still worse than a pause.
What no automation does reliably: laughter/sighs vs speech, which of two clean takes is better, how a
seam FEELS — that is what Elzhan's ear at П1 is for, against review.txt.
Needs: ffmpeg, whisper-cli (~/.claude/tools/whisper/ggml-large-v3-turbo.bin); fillers need ~/ai-local/.venv-f5.
"""
import argparse, json, os, re, subprocess, sys, pathlib, hashlib
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cut'))
import trim_pauses as TP

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.expanduser('~/.claude/tools/whisper/ggml-large-v3-turbo.bin')
ENVFILE = os.path.expanduser('~/.claude/tools/kie/.env')
AAI_LANGS = {'ru', 'en'}   # kk is 25–50 % WER at AssemblyAI — local whisper stays better there
F5 = os.path.expanduser('~/ai-local/.venv-f5/bin/python')
OUT = pathlib.Path('work/cut')
SNAP = 0.40      # how far a keep edge / a fix timecode may travel to reach silence


def sh(*cmd, **kw):
    # errors='replace': whisper-cli streams progress and can split a multibyte glyph
    # across a read boundary — a hard decode killed a whole transcription run
    return subprocess.run(cmd, capture_output=True, text=True, errors='replace', **kw)


def sha1(path):
    with open(path, 'rb') as f: return hashlib.file_digest(f, 'sha1').hexdigest()


def dims(src):
    p = sh('ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation', '-of', 'json', src)
    d = json.loads(p.stdout)['streams'][0]; w, h = d['width'], d['height']
    rot = 0
    for sd in d.get('side_data_list', []): rot = int(sd.get('rotation', 0)) or rot
    return (h, w) if rot % 180 else (w, h)


def duration(path):
    return float(sh('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path).stdout or 0)


def silence_map(wav, db=-30, d=0.04):
    o = sh('ffmpeg', '-i', wav, '-af', f'silencedetect=n={db}dB:d={d}', '-f', 'null', '-').stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', o)]
    en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', o)]
    if len(en) < len(st): en.append(duration(wav))
    return list(zip(st, en))


def voice_map(wav, db=-46.0, min_len=0.08, merge=0.06):
    """Silence on the 20 ms RMS envelope — the per-voice map. The stock -30 dB map calls a plosive
    tail («-ть» in «искать», −38…−43 dB) silence and the trimmer cuts inside it: the «обрыв» the client
    heard under a clean gate (th/reel_001, reel_002). −46 converged there, −52 lost real pauses.
    Fragments split by < 0.06 s of noise are one pause: judged alone, each is too short to trim."""
    env = TP.envelope(wav)
    if not env: return [], db
    vals = sorted(v for _, v in env)
    # ponytail: a room whose tone sits above −49 lifts the threshold with it (else the map finds nothing);
    # a voice re-gained by +N dB needs --db raised by N by hand
    th = max(db, vals[len(vals) // 10] + 3)
    # surf / wind that swells and falls (healthy_himalaya reel_008–011, beach): the file's p10 sits at −42 but the
    # noise inside a pause rides at −26…−32, 8 dB under the voice — a single threshold found «longest pause 0.04 s»
    # while Elzhan heard 1.3 s ones. So the threshold also rides the local floor: p10 of ±2.5 s + 6 dB, capped at −22.
    # A quiet room's local floor + 6 stays under −46, so nothing changes there.
    lv = [v for _, v in env]
    def floor(i): w = sorted(lv[max(0, i - 125):i + 125]); return w[len(w) // 10]
    loc = {i: floor(i) for i in range(0, len(lv), 25)}
    runs = []
    for j, (t, v) in enumerate(env):
        if v > max(th, min(-22.0, loc[j - j % 25] + 6)): continue
        if runs and t - runs[-1][1] < merge - 1e-6: runs[-1][1] = t + 0.02
        else: runs.append([t, t + 0.02])
    return [(round(s, 3), round(e, 3)) for s, e in runs if e - s >= min_len - 1e-6], th


def gaps(wav, th):
    """Pauses the way qa/master.py measures them: voice islands ≥ 2 frames above th → [(start, length)]."""
    env = TP.envelope(wav); isl, s = [], None
    for j, (_, v) in enumerate(env + [(0, -999)]):
        if v > th and s is None: s = j
        if v <= th and s is not None:
            if j - s >= 2: isl.append((s * .02, j * .02))
            s = None
    return [(q, r - q) for (_, q), (r, _) in zip(isl, isl[1:])]


def whisper_words(wav, lang, base):
    """whisper per word → [{w, t0, t1}] with times relative to the wav start + base"""
    sh('whisper-cli', '-m', MODEL, '-f', wav, '-l', lang, '-ml', '1', '-sow', '-oj', '-of', wav[:-4])
    j = pathlib.Path(wav[:-4] + '.json')
    if not j.exists(): return []
    out = []
    # whisper-cli -ml 1 splits at token level and can write half a multibyte glyph
    # into the last token of a chunk; errors='ignore' drops the orphan byte
    for s in json.loads(j.read_text(errors='ignore')).get('transcription', []):
        w = s['text'].strip()
        if not w: continue
        t0 = base + s['offsets']['from'] / 1000; t1 = base + s['offsets']['to'] / 1000
        if out and not w[0].isalnum() and out[-1]['t1'] > t0 - 0.02: out[-1]['w'] += w; continue
        out.append({'w': w, 't0': round(t0, 3), 't1': round(t1, 3)})
    return out


def whisper_long(wav, lang, sil, tag):
    """Local whisper in 6–12 s chunks cut at the middle of the nearest silence to 9 s. One call on a
    whole track returns only its first ~30 s (th/reel_005 back-transcript stopped at «Аватара»)."""
    dur = duration(wav)
    chunks, start = [], 0.0
    while start < dur - 0.3:
        want = start + 9.0
        win = [(s, e) for s, e in sil if start + 6.0 <= (s + e) / 2 <= start + 12.0]
        # a chunk cut in a 0.1 s gap loses the word next to it («И да, вот этот наклон» vanished) — longest gaps first
        cands = [(s + e) / 2 for s, e in win if e - s >= 0.25] or [(s + e) / 2 for s, e in win]
        end = min(cands, key=lambda m: abs(m - want)) if cands else min(dur, want)
        if dur - end < 3.0: end = dur
        chunks.append((start, end)); start = end
    words = []
    for k, (s, e) in enumerate(chunks):
        cw = OUT / f'chunk_{tag}_{k:03d}.wav'
        sh('ffmpeg', '-nostdin', '-y', '-v', 'error', '-ss', f'{s:.3f}', '-t', f'{e - s:.3f}', '-i', wav, str(cw))
        words += whisper_words(str(cw), lang, s)
        cw.unlink(missing_ok=True); pathlib.Path(str(cw)[:-4] + '.json').unlink(missing_ok=True)
    return words


def report(i, src, dur, sil, words):
    """transcript_i.txt + the printed transcript: sentences split at pauses > 0.35 s"""
    lines, cur = [], []
    for j, w in enumerate(words):
        cur.append(w)
        nx = words[j + 1] if j + 1 < len(words) else None
        # whisper leaves no gaps between its words, so the map's pauses split the line too
        mid = lambda x: (x['t0'] + x['t1']) / 2
        if not nx or nx['t0'] - w['t1'] > 0.35 or re.search(r'[.!?…]$', w['w']) or \
                any(e - s > 0.35 and mid(w) < (s + e) / 2 < mid(nx) for s, e in sil):
            lines.append(f"[{cur[0]['t0']:7.2f}–{cur[-1]['t1']:7.2f}]  " + ' '.join(x['w'] for x in cur)); cur = []
    (OUT / f'transcript_{i}.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'\n=== src_{i}  {os.path.basename(src)}  {dur:.2f} s  ({len(words)} words, {len(sil)} pauses)')
    print('\n'.join(lines))
    long = [(s, e) for s, e in sil if e - s > 0.8]
    if long: print('  long pauses (>0.8 s): ' + ', '.join(f'{s:.2f}–{e:.2f}' for s, e in long[:20]))


def aai_key():
    k = os.environ.get('ASSEMBLYAI_API_KEY')
    if k: return k
    if os.path.exists(ENVFILE):
        for line in open(ENVFILE):
            if line.startswith('ASSEMBLYAI_API_KEY='): return line.split('=', 1)[1].strip().strip('"\'')
    return None


def assembly_words(wav, lang, key):
    """AssemblyAI universal → [{w, t0, t1}] for the WHOLE file. ~30× faster than local whisper
    (88 s of speech: 34 s on the M4 vs ~2 s here) and it leaves the GPU free for FLUX/render."""
    import urllib.request, time, ssl, certifi
    ctx = ssl.create_default_context(cafile=certifi.where())   # this python3 has no CA bundle of its own
    def req(url, data=None, ctype=None):
        r = urllib.request.Request(url, data=data, headers={'authorization': key, **({'content-type': ctype} if ctype else {})})
        return json.load(urllib.request.urlopen(r, context=ctx))
    up = req('https://api.assemblyai.com/v2/upload', open(wav, 'rb').read(), 'application/octet-stream')['upload_url']
    t = req('https://api.assemblyai.com/v2/transcript',
            json.dumps({'audio_url': up, 'language_code': lang, 'speech_model': 'universal',
                        'punctuate': True, 'format_text': True}).encode(), 'application/json')
    while t['status'] not in ('completed', 'error'):
        time.sleep(2); t = req('https://api.assemblyai.com/v2/transcript/' + t['id'])
    if t['status'] == 'error': raise RuntimeError('assemblyai: ' + str(t.get('error')))
    return [{'w': w['text'], 't0': round(w['start'] / 1000, 3), 't1': round(w['end'] / 1000, 3)} for w in t['words']]


def sdr(src, out):
    """iPhone HDR (HLG / PQ, Dolby Vision) → SDR before anything else. Without it the 10-bit HLG
    signal is read as SDR and the take goes white and washed (th/reel_002, 08.10.2026: «в телеграме
    файл какой-то белый»). Apple's own avconvert is the reference — it renders the take the way Elzhan
    sees it in Finder; ffmpeg hable is the fallback and lands close. Returns (input, extra -vf prefix)."""
    trc = sh('ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=color_transfer',
             '-of', 'csv=p=0', src).stdout.strip().split(',')[0]   # side data adds a trailing comma
    if trc not in ('arib-std-b67', 'smpte2084'):
        return src, ''
    print(f'  {os.path.basename(src)}: HDR ({trc}) → SDR')
    if not out.exists() and sh('avconvert', '-s', src, '-p', 'Preset1920x1080', '-o', str(out), '--replace').returncode:
        out.unlink(missing_ok=True)
    if out.exists():
        return str(out), ''
    return src, ('zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,'
                 'zscale=t=bt709:m=bt709:r=tv,format=yuv420p,')


def fmt_sil(sil):
    return ''.join(f'{s:.3f} {e:.3f} {e - s:.3f}\n' for s, e in sil)


def transcribe(a):
    OUT.mkdir(parents=True, exist_ok=True)
    key = None if a.local else aai_key()
    if key and a.lang not in AAI_LANGS:
        print(f'  lang {a.lang}: local whisper (AssemblyAI is inaccurate there)', file=sys.stderr); key = None
    if not key and not a.local: print('  no ASSEMBLYAI_API_KEY in ~/.claude/tools/kie/.env — local whisper', file=sys.stderr)
    W, H = dims(a.src[0])
    print(f'frame {W}×{H} (from {os.path.basename(a.src[0])}), CFR 30')
    all_words = {}
    for i, src in enumerate(a.src, 1):
        mp4 = OUT / f'src_{i}.mp4'; wav = OUT / f'src_{i}.wav'
        if not mp4.exists() or a.force:
            vsrc, tm = sdr(src, OUT / f'sdr_{i}.mp4')   # picture from the SDR copy, sound from the source: timings stay exact
            r = sh('ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', vsrc, '-i', src, '-map', '0:v:0', '-map', '1:a:0',
                   '-vf', f'{tm}scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},setsar=1,fps=30,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
                   '-fps_mode', 'cfr', '-r', '30', '-c:v', 'libx264', '-crf', '16', '-g', '15', '-pix_fmt', 'yuv420p',
                   '-c:a', 'aac', '-ar', '48000', '-ac', '1', str(mp4))
            if r.returncode: sys.exit(r.stderr)
        sh('ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', str(mp4), '-vn', '-ar', '16000', '-ac', '1', str(wav))
        dur = duration(str(mp4))
        (OUT / f'silence_{i}_-30db.txt').write_text(fmt_sil(silence_map(str(wav))))
        sil, th = voice_map(str(wav), a.db)
        (OUT / f'silence_{i}.txt').write_text(fmt_sil(sil))
        print(f'  src_{i}: silence map at {th:.1f} dB RMS ({len(sil)} pauses); stock -30 dB map → silence_{i}_-30db.txt')
        if key:
            try:
                words = assembly_words(str(wav), a.lang, key)
            except Exception as ex:
                print(f'  assemblyai failed ({ex}) — falling back to local whisper', file=sys.stderr); key = None
        if not key: words = whisper_long(str(wav), a.lang, sil, i)
        json.dump(words, open(OUT / f'words_{i}.json', 'w'), ensure_ascii=False)
        all_words[i] = words
        report(i, src, dur, sil, words)
    # duplicate takes: the same 5-word run twice
    norm = lambda w: re.sub(r'[^\w]', '', w['w'].lower())
    seen, dups = {}, []
    for i, words in all_words.items():
        for j in range(len(words) - 4):
            k = ' '.join(norm(x) for x in words[j:j + 5])
            if len(k) < 12: continue
            if k in seen and (seen[k][0] != i or words[j]['t0'] - seen[k][1] > 2.0):
                dups.append(f'  src_{seen[k][0]} {seen[k][1]:.2f} ≈ src_{i} {words[j]["t0"]:.2f}: "{" ".join(x["w"] for x in words[j:j + 5])}"')
            else: seen.setdefault(k, (i, words[j]['t0']))
    if dups: print('\npossible duplicate takes (same 5 words twice):\n' + '\n'.join(dict.fromkeys(dups)))
    print('\nnext: engine/cut.py build --keep src_1:START:END [--keep …]   (times from the transcript above)')


def src_no(src):
    return int(re.search(r'src_(\d+)', src).group(1))


def load_sil(src):
    return [(float(l.split()[0]), float(l.split()[1])) for l in (OUT / f'silence_{src_no(src)}.txt').read_text().splitlines() if l.strip()]


def filler_ranges(i, sil, lang):
    """→ (FILLER removal ranges, UNCLEAR spans, why fillers were not checked or None).

    Removal keeps 0.11 s of the surrounding silence each side; fused fillers stay. The language MUST
    reach fillers.py (its default is ru: Kazakh islands were read by the Russian model until 17.09.2026).
    The verdict file is cached per language and per sha1 of the voice, and ONLY a successful run is
    cached: with ElevenLabs at 0 credits (07.10.2026) the empty stdout of a failed run was cached and
    every later build said «fillers removed 0» on a voice nobody had checked."""
    wav = OUT / f'src_{i}.wav'; txt = OUT / f'fillers_{i}_{lang}.txt'
    if not os.path.exists(F5): return [], [], 'нет ~/ai-local/.venv-f5'
    head = f'# audio {sha1(wav)}'
    lines = txt.read_text().splitlines() if txt.exists() else []
    if lines[:1] != [head]:
        r = subprocess.run([F5, os.path.join(HERE, 'cut', 'fillers.py'), str(wav), '--lang', lang],
                           capture_output=True, text=True)
        if r.returncode:
            err = (r.stderr.strip().splitlines() or [f'код {r.returncode}'])[-1]
            m = re.search(r'"message": "([^".]*)', err)   # ElevenLabs JSON → its first sentence
            return [], [], (f'Scribe: {m.group(1)}' if m else err)[:160]
        txt.write_text(head + '\n' + r.stdout)
        lines = r.stdout.splitlines()
    out, unclear = [], []
    for line in lines:
        p = line.split()
        if len(p) < 3 or line.startswith('#'): continue
        s, e = float(p[0]), float(p[1])
        if p[2] == 'UNCLEAR': unclear.append((s, e, line.split('||')[0].split('UNCLEAR', 1)[1].strip()))
        if p[2] != 'FILLER': continue
        before = next(((a, b) for a, b in sil if abs(b - s) < 0.06), None)
        after = next(((a, b) for a, b in sil if abs(a - e) < 0.06), None)
        if not before or not after or before[1] - before[0] < 0.05 or after[1] - after[0] < 0.05: continue   # fused: leave it, a clipped word is worse
        out.append((before[0] + 0.11, after[1] - 0.11))
    return out, unclear, None


def subtract(keeps, removes):
    out = []
    for src, s, e in keeps:
        segs = [(s, e)]
        for a, b in removes.get(src, []):
            nxt = []
            for x, y in segs:
                if b <= x or a >= y: nxt.append((x, y)); continue
                if a > x: nxt.append((x, a))
                if b < y: nxt.append((b, y))
            segs = nxt
        out += [(src, x, y) for x, y in segs if y - x > 0.05]
    return out


def snap(t, sil, side, reach=SNAP, cap=0.30):
    """A keep edge into silence with ≥ 0.12 s on the speech side (0.20 when the pause allows). Transcript
    times sit on the word, not on its tail — this is the move that was made by hand, seam by seam.
    Nearest pause wins in either direction; none within reach → t unchanged, review.txt names it.
    The silence an edge keeps is capped (limit/2): two keeps meeting inside one long pause keep it whole
    across the seam, where the trimmer never looks (atlas/reel_020: 0.66 + 0.15 = 0.78 s)."""
    P = next((p for p in sil if p[0] <= t <= p[1]), None)
    if not (P and (t - P[0] if side == 'end' else P[1] - t) >= 0.10 - 1e-6):
        cand = [p for p in sil if p[1] - p[0] >= 0.12 and max(p[0] - t, t - p[1], 0) <= reach]
        if not cand: return t
        P = min(cand, key=lambda p: max(p[0] - t, t - p[1], 0))
        m = min(0.20, P[1] - P[0])
        t = P[0] + m if side == 'end' else P[1] - m
    if cap is not None: t = min(t, P[0] + cap) if side == 'end' else max(t, P[1] - cap)
    return round(t, 3)


def black_spans(src):
    """[(start, end)] of black picture in the normalised source, cached in work/cut/black_N.txt."""
    cache = OUT / f'black_{src_no(src)}.txt'
    if not cache.exists():
        r = sh('ffmpeg', '-nostdin', '-i', str(OUT / (src if src.endswith('.mp4') else src + '.mp4')),
               '-vf', 'blackdetect=d=0.03:pix_th=0.10', '-an', '-f', 'null', '-')
        cache.write_text(''.join(f'{x} {y}\n' for x, y in re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', r.stderr)))
    return [tuple(map(float, l.split())) for l in cache.read_text().split('\n') if l]


def black_frames(src):
    """Frame numbers (CFR 30) of the normalised source that are black."""
    return {j for x, y in black_spans(src) for j in range(round(x * 30), round(y * 30))}


def take_to_src(T, pieces):
    """Assembled-track time → (piece index, src, source time). Audio is cut sample-exact, so the
    assembled timeline is the plain sum of piece lengths."""
    acc = 0.0
    for k, (src, s, e) in enumerate(pieces):
        if T < acc + (e - s) or k == len(pieces) - 1:
            return k, src, round(s + min(max(T - acc, 0.0), e - s), 3)
        acc += e - s


def src_to_take(src, t, pieces, edge=0.0):
    """Source time → assembled time, None when that moment was cut out (edge widens the piece bounds)."""
    acc = 0.0
    for s_, s, e in pieces:
        if s_ == src and s - edge <= t <= e + edge: return acc + min(max(t - s, 0.0), e - s)
        acc += e - s
    return None


def seams(pieces):
    """[(assembled time, k)] — the boundary before piece k."""
    out, acc = [], 0.0
    for k, (_, s, e) in enumerate(pieces):
        if k: out.append((acc, k))
        acc += e - s
    return out


def keep_of(src, t, keeps):
    return next((j for j, (s_, s, e) in enumerate(keeps) if s_ == src and s - 1e-3 <= t <= e + 1e-3), None)


def parse_fix(item):
    """«12.4 обрыв» / «убери 30.1–31.0» / «0:25 ээ» / «верни паузу на 0:18.2» → (op, times)"""
    ts = [float(m) * (60 if c else 1) + float(c or 0) for m, c in
          [(x[0], x[1]) for x in re.findall(r'(\d+(?:[.,]\d+)?)(?::(\d+(?:[.,]\d+)?))?', item.replace(',', '.'))]]
    if len(ts) >= 2: return 'cut', ts[:2]
    if not ts: raise SystemExit(f'fix: нет таймкода в «{item}»')
    if re.search(r'пауз|pause', item, re.I): return 'pause', ts
    return ('filler' if re.search(r'ээ|э+м|мм+|филлер|паразит|убери|вырежи|filler', item, re.I) else 'clip'), ts


def apply_fix(items, keeps, holds, pieces, sils, cap=0.30):
    """Pure: Elzhan's assembled-track items → (new keeps, new holds, notes). Every timecode is mapped on
    the CURRENT pieces first, so the items of one message do not move each other."""
    keeps, holds, notes = list(keeps), list(holds), []
    ops = []
    for item in items:
        op, ts = parse_fix(item)
        ops.append((item, op, [take_to_src(t, pieces) for t in ts], ts))
    for item, op, m, ts in ops:
        if op == 'filler':   # the voiced island at T out, 0.12 s (or the whole pause) of silence left on each side
            _, src, t = m[0]
            P = next((p for p in reversed(sils[src]) if p[1] <= t + 0.05), None)
            Q = next((p for p in sils[src] if p[0] >= t - 0.05), None)
            if not P or not Q or Q[0] - P[1] > 1.0:   # islands over ~1 s are phrases, never fillers
                notes.append(f'{item}: у {src} {t:.2f} нет острова ≤ 1 с между паузами — сросся, назови диапазон «убери A-B»'); continue
            op, m = 'cut', [(0, src, round(min(P[0] + 0.12, P[1]), 3)), (0, src, round(max(Q[1] - 0.12, Q[0]), 3))]
        if op == 'cut':
            (ka, sa, ta), (kb, sb, tb) = m
            i, j = keep_of(sa, ta, keeps), keep_of(sb, tb, keeps)
            if i is None or j is None or j < i: notes.append(f'{item}: не нашёл кусков под таймкодами'); continue
            si, s0, e0 = keeps[i]; sj, s1, e1 = keeps[j]
            new = [(si, s0, ta)] if ta - s0 > 0.05 else []
            new += [(sj, tb, e1)] if e1 - tb > 0.05 else []
            keeps[i:j + 1] = new
            notes.append(f'{item}: вырезано {sa} {ta:.2f}–{sb} {tb:.2f} (края встанут в тишину)')
            continue
        T = ts[0]
        near = [(abs(at - T), at, k) for at, k in seams(pieces) if abs(at - T) <= 0.5]
        if not near: notes.append(f'{item}: шва в 0.5 с от {T:.2f} нет — поправь --keep руками'); continue
        _, at, k = min(near)
        (src0, _, e_out), (src1, s_in, _) = pieces[k - 1], pieces[k]
        ko, ki = keep_of(src0, e_out, keeps), keep_of(src1, s_in, keeps)
        if ko == ki:   # a trimmed pause or a cut filler inside one keep: give it back whole
            holds.append(f'{src0}:{(e_out + s_in) / 2:.3f}')
            notes.append(f'{item}: шов {at:.2f} — пауза/филлер на {src0} {e_out:.2f}–{s_in:.2f} возвращается целиком')
            continue
        if op == 'pause':
            notes.append(f'{item}: шов {at:.2f} между дублями — паузу задаёт --keep, правь руками'); continue
        sil0, sil1 = sils[src0], sils[src1]
        P = next((p for p in sil0 if p[1] > e_out + 0.02 and p[0] - e_out <= 0.6), None)
        Q = next((p for p in reversed(sil1) if p[0] < s_in - 0.02 and s_in - p[1] <= 0.6), None)
        s_o, a_o, b_o = keeps[ko]; s_i, a_i, b_i = keeps[ki]
        # widen to the cap on both sides: 2 × limit/2 is the law's ceiling, wider is a new defect
        if P: keeps[ko] = (s_o, a_o, round(min(P[0] + cap, P[1]), 3))
        if Q: keeps[ki] = (s_i, round(max(Q[1] - cap, Q[0]), 3), b_i)
        if (keeps[ko][2], keeps[ki][1]) == (e_out, s_in):
            notes.append(f'{item}: шов {at:.2f} уже на {cap:.2f} с тишины с каждой стороны — шире закона нельзя, слушать исходник'); continue
        notes.append(f'{item}: шов {at:.2f} — конец {s_o} {e_out:.2f}→{keeps[ko][2]:.2f}, '
                     f'начало {s_i} {s_in:.2f}→{keeps[ki][1]:.2f}')
    return keeps, holds, notes


def build(a):
    keeps = [TP.parse_keep(k) for k in a.keep]
    holds = [(h.rsplit(':', 1)[0], float(h.rsplit(':', 1)[1])) for h in (a.hold or [])]
    held = lambda src, x, y: any(hs == src and x - 0.05 <= ht <= y + 0.05 for hs, ht in holds)
    OUT.mkdir(parents=True, exist_ok=True)
    sils, removes, unclear, why = {}, {}, {}, None
    for src in {k[0] for k in keeps}:
        sils[src] = [p for p in load_sil(src) if not held(src, *p)]   # a held pause is not in the map → never trimmed
        if a.no_fillers: continue
        rm, unclear[src], err = filler_ranges(src_no(src), sils[src], a.lang)
        removes[src] = [r for r in rm if not held(src, *r)]
        why = why or err
    if why: print(f'филлеры не проверены: {why}')
    # A client's pre-edited take keeps black timeline gaps between its clips, and under the black the sound
    # is digital zero. Kept as part of a pause it was a hole in the room tone at every seam, heard as
    # «аудио прошлой части обрывается, а в следующей долгая пауза» (icon/reel_067). The gap goes whole.
    for src in sils if not a.keep_black else []:
        removes.setdefault(src, []).extend(black_spans(src))
    # the opening keeps 0.10 s before the first sound; the last edge is not capped (qa wants ≥ 0.3 s of tail)
    snapped = [(src, snap(s, sils[src], 'start', cap=max(a.opening, 0.10) if j == 0 else a.limit / 2),
                snap(e, sils[src], 'end', cap=None if j == len(keeps) - 1 else a.limit / 2))
               for j, (src, s, e) in enumerate(keeps)]
    # a keep never runs past the source PICTURE: a client's export carries 0.05–0.07 s more sound than video, and the
    # last piece then made the cut's sound longer than its frames (icon/reel_068: tracks 71.085 vs 71.033, gate red)
    vd = {src: float(sh('ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0',
                        str(OUT / (src if src.endswith('.mp4') else src + '.mp4'))).stdout or 1e9) for src in sils}
    snapped = [(src, s, min(e, vd[src] - .001)) for src, s, e in snapped]
    nsnap = sum((s, e) != (s2, e2) for (_, s, e), (_, s2, e2) in zip(keeps, snapped))
    # the keeps as built (snapped — snap is idempotent): `fix` maps Elzhan's timecodes onto these
    (OUT / 'build.json').write_text(json.dumps({**{k: v for k, v in vars(a).items() if k != 'cmd'},
                                               'keep': [f'{s}:{x:.3f}:{y:.3f}' for s, x, y in snapped]}, ensure_ascii=False))
    keeps = subtract(snapped, removes)
    nf = sum(len(v) for v in removes.values()) - (0 if a.keep_black else sum(len(black_spans(src)) for src in sils))   # black gaps are not fillers
    hard = []
    import io, contextlib
    for src, s, e in keeps:
        buf = io.StringIO()
        with contextlib.redirect_stderr(buf): TP.warn_hard_cut(src, s, e, sils[src], 0.10)
        hard += re.findall(r'WARN (\S+) (start|end) ([\d.]+): (.*)', buf.getvalue())
    try: pdb = float(json.load(open('reel.json')).get('pause_db', -40))
    except Exception: pdb = -40.0

    def make_pieces(squeeze):
        out = []
        for j, (src, s, e) in enumerate(keeps):
            ns = argparse.Namespace(limit=a.limit, min_tail=0.10, opening_limit=a.opening if j == 0 else None,
                                    tail_out=a.tail_out or None, tail_in=a.tail_in or None, squeeze=squeeze,
                                    edge_in=j > 0, edge_out=j < len(keeps) - 1)   # the opening and the final tail keep their own law
            out += TP.cut(ns, [(src, s, e)], sils[src])
        return out

    # The map trims silence at -46 dB, the ear (and qa/master.py) hears a pause at -40: a word's decay,
    # a breath or a loud room between the two counts as pause, so a pause trimmed to the limit on the
    # map read 0.62–1.00 s (icon/reel_067, 068: «паузы очень длинные»). Measure the assembled audio
    # the gate's way; first squeeze the map pause by the excess (≥ 0.10 s of silence a side), then cut
    # what is left out of the gate gap's middle, limit/2 kept after and before the voice — a breath is
    # not voice (SKILL.md), and limit/2 ≥ 0.2 s still covers a plosive's decay below -40.
    def gate_gaps(pieces):
        wav_q = str(OUT / 'squeeze16.wav'); srcs_ = sorted({p[0] for p in pieces})
        fa = ';'.join(f'[{srcs_.index(src)}:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS[a{n}]'
                      for n, (src, s, e) in enumerate(pieces))
        ins = sum([['-i', str(OUT / (x if x.endswith('.mp4') else x + '.mp4'))] for x in srcs_], [])
        sh('ffmpeg', '-nostdin', '-y', '-v', 'error', *ins, '-filter_complex',
           fa + ';' + ''.join(f'[a{n}]' for n in range(len(pieces))) + f'concat=n={len(pieces)}:v=0:a=1,aresample=16000[a]',
           '-map', '[a]', '-ac', '1', wav_q)
        g = gaps(wav_q, pdb); os.remove(wav_q)
        return [(q, L) for q, L in g if L > aim + 1e-6]

    aim = a.limit - 0.02   # the AAC master reads one 20 ms envelope step longer than this draft wav
    squeeze, pieces = {}, make_pieces({})
    for _ in range(4):
        grew = False
        for q, L in gate_gaps(pieces):
            k, src, t = take_to_src(q + L / 2, pieces)
            # a gap over a seam: the trimmed pause between piece k-1 and k; inside a piece: the pause around t
            for T, kk in seams(pieces):
                if q <= T <= q + L and pieces[kk - 1][0] == pieces[kk][0]:
                    src, t = pieces[kk][0], (pieces[kk - 1][2] + pieces[kk][1]) / 2; break
            p = next((p for p in sils[src] if p[0] - 0.01 <= t <= p[1] + 0.01), None)
            if not p: continue
            key = (src, round(p[0], 3))
            kept = min(squeeze.get(key, a.limit), p[1] - p[0])
            new = max(0.20, kept - (L - aim) - 0.02)
            if new < kept - 1e-3: squeeze[key] = new; grew = True
        if not grew: break
        pieces = make_pieces(squeeze)
    # what the squeeze could not reach: the gate gap itself becomes the pause in the map (voice end to
    # voice start at the gate's threshold, map pauses inside it merged), trimmed like any other
    nwide = 0
    for q, L in gate_gaps(pieces):
        _, s0, x0 = take_to_src(q + 0.001, pieces); _, s1, x1 = take_to_src(q + L - 0.001, pieces)
        if s0 != s1 or x1 - x0 <= aim: continue   # ponytail: a gap across two files stays — not seen yet
        sils[s0] = sorted([p for p in sils[s0] if p[1] < x0 or p[0] > x1] + [(x0, x1)]); nwide += 1
        squeeze[(s0, round(x0, 3))] = aim - 0.02
    if nwide: pieces = make_pieces(squeeze)
    if squeeze or nwide:
        print(f'паузы дожаты по замеру гейта ({pdb:.0f} дБ): {len(squeeze)} по карте тишины, {nwide} по вдоху и шуму комнаты')
    # Звук режется точно, видео — целыми кадрами, подобранными по НАКОПЛЕННОМУ времени звука:
    # синхрон не уходит больше чем на полкадра, а дорожки склеиваются раздельно. Общий
    # concat v+a добивал короткую дорожку куска цифровым нулём — дыры 10–30 мс в тоне комнаты
    # на швах (icon/reel_037: 5 дыр); сетка кадров на краях звука сдвигала рез на ±16 мс,
    # а у сросшегося «ээ» это уже заход в слово.
    vfr, t_acc, f_acc = [], 0.0, 0
    for src, s, e in pieces:
        t_acc += e - s; f1 = round(t_acc * 30); a0 = round(s * 30)
        vfr.append((a0, a0 + f1 - f_acc)); f_acc = f1
    (OUT / 'edl.txt').write_text(''.join(f'{OUT / src}.mp4\t{s:.3f}\t{e:.3f}\n' if not src.endswith('.mp4') else f'{OUT / src}\t{s:.3f}\t{e:.3f}\n' for src, s, e in pieces))
    # one pass: trim + atrim + concat
    srcs = sorted({p[0] for p in pieces}); idx = {s: i for i, s in enumerate(srcs)}
    path = lambda s: str(OUT / (s if s.endswith('.mp4') else s + '.mp4'))
    f = []; cat_v = cat_a = ''
    for n, (src, s, e) in enumerate(pieces):
        i = idx[src]
        # A client's pre-edited take keeps black timeline gaps between its clips, exactly over the pauses
        # (icon/reel_067, 068: 1–3 s of black between takes) — the kept part of the pause showed black at
        # every seam. Those frames hold the edge's nearest live frame instead; the audio stays as cut.
        v0, v1 = vfr[n]; bl = black_frames(src)
        l0, l1 = v0, v1
        while l0 < l1 and l0 in bl: l0 += 1
        while l1 > l0 and l1 - 1 in bl: l1 -= 1
        if l0 == l1: l0, l1 = v0, v1   # ponytail: an all-black piece stays black — none seen yet
        # tpad stamps every clone with one pts; the cfr output then drops them and the picture runs ahead of
        # the sound, more after every seam (icon/reel_067: −1.02 s by the end) — restamp frame by frame
        pad = f',tpad=start_mode=clone:start={l0 - v0}:stop_mode=clone:stop={v1 - l1},setpts=N/(30*TB)' if (l0, l1) != (v0, v1) else ''
        f.append(f'[{i}:v]trim=start_frame={l0}:end_frame={l1},setpts=PTS-STARTPTS{pad}[v{n}]')
        # Затухания на краях КАЖДОГО куска (Елжан, 19.09.2026): рез в тишине всё равно даёт
        # щелчок, а рез, задевший хвост слова, — жёсткий обрыв. Рампа снимает щелчок и делает
        # срезанное окончание похожим на мягкое. Она НЕ возвращает срезанный звук: если гейт
        # швов говорит «рез внутри слова», фейд это прячет, а не чинит. По умолчанию 0 —
        # поведение остальных клиентов не меняется.
        _d = e - s
        _f = min(a.fade, _d / 3) if getattr(a, 'fade', 0) > 0 else 0
        _af = f'[{i}:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS'
        if _f > 0:
            _af += f',afade=t=in:st=0:d={_f:.3f},afade=t=out:st={_d - _f:.3f}:d={_f:.3f}'
        f.append(_af + f'[a{n}]')
        cat_v += f'[v{n}]'; cat_a += f'[a{n}]'
    f.append(f'{cat_v}concat=n={len(pieces)}:v=1:a=0[v]')
    f.append(f'{cat_a}concat=n={len(pieces)}:v=0:a=1[a]')
    cmd = ['ffmpeg', '-nostdin', '-y', '-v', 'error'] + sum([['-i', path(s)] for s in srcs], []) + ['-filter_complex', ';'.join(f), '-map', '[v]', '-map', '[a]',
           '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '1', 'work/cut.mp4']
    (OUT / 'build.sh').write_text(' '.join(f"'{c}'" if ' ' in c or ';' in c else c for c in cmd) + '\n')
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr)
    dur = duration('work/cut.mp4')
    wav16 = str(OUT / 'cut16.wav')
    sh('ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', 'work/cut.mp4', '-vn', '-ar', '16000', '-ac', '1', wav16)

    # ── review.txt: the spots to LISTEN to, on the assembled timeline ──
    words = []   # (assembled mid time, word) from the source transcripts — no ASR on the result
    for src in srcs:
        wj = OUT / f'words_{src_no(src)}.json'
        for w in (json.load(open(wj)) if wj.exists() else []):
            # mid first; an edge only when the mid was cut — a half-kept word is exactly what to hear
            T = next((x for x in (src_to_take(src, t, pieces) for t in ((w['t0'] + w['t1']) / 2, w['t0'] + .04, w['t1'] - .04)) if x is not None), None)
            if T is not None: words.append((T, w['w']))
    words.sort()
    def around(T):
        b = [w for t, w in words if t < T][-1:] or ['—']; c = [w for t, w in words if t >= T][:1] or ['—']
        return f'«{b[0]} | {c[0]}»'
    rows = []
    for src, side, t, msg in hard:
        T = src_to_take(src, float(t), pieces, edge=0.01)
        if T is not None:
            rows.append((T, 'край куска в речи по карте тишины' if 'speech' in msg else f'край куска: {msg}'))
    # Seam verdict on the ASSEMBLED track (TP.warn_seams): a word of the Scribe map plus level ≥ floor + 8 dB.
    # Without word timing it falls back to level, and a level-only line is a «listen», never a reason to recut:
    # th/reel_001 took four recuts in a row chasing it, each moved the verdict to the next word.
    nword = nlevel = 0
    for w in TP.warn_seams(wav16, pieces, lang=a.lang):
        m = re.search(r'шов \d+ на ([\d.]+) с: (.*)', w)
        if not m: rows.append((0.0, w)); continue
        if 'РАЗМЕТКИ НЕТ' in w:
            nlevel += 1; rows.append((float(m.group(1)), 'шов только по уровню — проверить на слух'))
        else:
            nword += 1; rows.append((float(m.group(1)), 'шов по разметке слов: ' + m.group(2)))
    g = gaps(wav16, pdb)
    long = [(q, L) for q, L in g if L > a.limit + 1e-6]
    for q, L in long: rows.append((q, f'пауза {L:.2f} с > {a.limit:.2f} (порог {pdb:.0f} дБ, как у qa/master.py)'))
    for src, lst in unclear.items():
        for s, e, d in lst:
            T = src_to_take(src, s, pieces)
            if T is not None: rows.append((T, f'UNCLEAR {e - s:.2f} с — «ээ» или слово? {d[:60]}'))
    head = [f'# {wav16}  {dur:.2f} s · {len(pieces)} кусков · филлеров вырезано {nf}'
            + (f' · ФИЛЛЕРЫ НЕ ПРОВЕРЕНЫ: {why}' if why else '' if not a.no_fillers else ' · филлеры выключены (--no-fillers)'),
            '# время на cut16.wav · «слово до | слово после» · что слушать. Правки: engine/cut.py fix "12.4 обрыв" "убери 30.1-31.0" "верни паузу 18.2"']
    (OUT / 'review.txt').write_text('\n'.join(head + [f'{T:7.2f}  {around(T)}  {why_}' for T, why_ in sorted(rows)]) + '\n', encoding='utf-8')

    print(f'work/cut.mp4  {dur:.2f} s  {len(pieces)} pieces  fillers removed {nf}' + ('' if not why else ' (fillers NOT checked)'))
    print(f'longest pause {max((L for _, L in g), default=0):.2f} s · pauses > {a.limit:.2f}: {len(long)} · '
          f'seam warnings {nword + nlevel} (by words {nword}, level-only {nlevel}) · keep edges snapped {nsnap}, in speech {len(hard)}')
    print(f'review: {OUT}/review.txt ({len(rows)} spots) — Elzhan listens to {wav16} against it')
    if a.check:
        bw = whisper_long(wav16, a.lang, voice_map(wav16)[0], 'check')
        (OUT / 'check.txt').write_text(' '.join(w['w'] for w in bw) + '\n', encoding='utf-8')
        print('back-transcript → work/cut/check.txt')


def fix(a):
    b = json.load(open(OUT / 'build.json'))
    pieces = [(pathlib.Path(p).stem, float(s), float(e)) for p, s, e in
              (l.split('\t') for l in (OUT / 'edl.txt').read_text().splitlines() if l.strip())]
    keeps = [(pathlib.Path(s).stem, x, y) for s, x, y in map(TP.parse_keep, b['keep'])]
    sils = {src: load_sil(src) for src in {p[0] for p in pieces}}
    k0, h0 = keeps, b.get('hold') or []
    keeps, holds, notes = apply_fix(a.items, k0, h0, pieces, sils, b['limit'] / 2)
    print('\n'.join(notes))
    if (keeps, holds) == (k0, h0): return print('fix: ничего не изменилось — не пересобираю')
    b.update(keep=[f'{s}:{x:.3f}:{y:.3f}' for s, x, y in keeps], hold=holds)
    build(argparse.Namespace(**b))


def approve(a):
    lines = [f'{sha1(p)}  {p}\n' for p in ('work/cut.mp4', str(OUT / 'cut16.wav'))]
    (OUT / 'approved.sha').write_text(''.join(lines))
    print(f'{OUT}/approved.sha:\n' + ''.join(lines), end='')


def self_test():
    pieces = [('src_1', 1.0, 3.0), ('src_1', 3.5, 6.0), ('src_2', 0.5, 2.5)]   # 2.0 + 2.5 + 2.0 s
    assert take_to_src(0.0, pieces) == (0, 'src_1', 1.0)
    assert take_to_src(2.4, pieces) == (1, 'src_1', 3.9)
    assert take_to_src(5.0, pieces) == (2, 'src_2', 1.0)
    assert take_to_src(99, pieces) == (2, 'src_2', 2.5)
    for T in (0.3, 2.4, 4.6, 6.0):   # round trip
        _, src, t = take_to_src(T, pieces); assert abs(src_to_take(src, t, pieces) - T) < 1e-6, T
    assert src_to_take('src_1', 3.2, pieces) is None            # trimmed out
    assert seams(pieces) == [(2.0, 1), (4.5, 2)]
    assert parse_fix('убери 30.1–31,0') == ('cut', [30.1, 31.0])
    assert parse_fix('0:25 ээ') == ('filler', [25.0]) and parse_fix('12.4 обрыв') == ('clip', [12.4])
    assert parse_fix('верни паузу на 18.2') == ('pause', [18.2])
    keeps = [('src_1', 1.0, 6.0), ('src_2', 0.5, 2.5)]
    sils = {'src_1': [(3.0, 3.5), (6.0, 6.8)], 'src_2': [(0.0, 0.5)]}
    k, h, _ = apply_fix(['убери 1.0-2.4'], keeps, [], pieces, sils)        # 1.0 → src_1 2.0, 2.4 → src_1 3.9
    assert k == [('src_1', 1.0, 2.0), ('src_1', 3.9, 6.0), ('src_2', 0.5, 2.5)], k
    k, h, _ = apply_fix(['2.1 пауза'], keeps, [], pieces, sils)            # trim seam inside keep 1 → hold
    assert k == keeps and h == ['src_1:3.250'], (k, h)
    k, h, _ = apply_fix(['4.5 обрыв'], keeps, [], pieces, sils)            # keep edge: both sides widen
    assert k == [('src_1', 1.0, 6.3), ('src_2', 0.2, 2.5)] and not h, k
    k, h, _ = apply_fix(['2.4 ээ'], keeps, [], pieces, {**sils, 'src_1': [(3.0, 3.5), (4.2, 4.6)]})   # island 3.5–4.2
    assert k == [('src_1', 1.0, 3.12), ('src_1', 4.48, 6.0), ('src_2', 0.5, 2.5)], k
    k, h, n = apply_fix(['2.4 ээ'], keeps, [], pieces, sils)                  # next pause 2.5 s away: fused, untouched
    assert k == keeps and 'сросся' in n[0], n
    assert snap(2.95, [(3.0, 3.5)], 'end') == 3.2 and snap(3.3, [(3.0, 3.5)], 'end') == 3.3
    assert snap(4.0, [(3.0, 5.0)], 'end') == 3.3 and snap(4.0, [(3.0, 5.0)], 'start') == 4.7
    assert snap(4.0, [(3.0, 5.0)], 'end', cap=None) == 4.0
    assert snap(3.55, [(3.0, 3.5)], 'start') == 3.3 and snap(9.0, [(3.0, 3.5)], 'end') == 9.0
    print('self-test ok')


def main():
    if '--self-test' in sys.argv: return self_test()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    s = ap.add_subparsers(dest='cmd', required=True)
    x = s.add_parser('transcribe'); x.add_argument('src', nargs='+'); x.add_argument('--lang', default='ru'); x.add_argument('--force', action='store_true')
    x.add_argument('--local', action='store_true', help='local whisper even when an AssemblyAI key is there (offline, no cost)')
    x.add_argument('--db', type=float, default=-46.0, help='silence map threshold, dB RMS (lifted automatically over a loud room)')
    x = s.add_parser('build'); x.add_argument('--keep', action='append', required=True); x.add_argument('--lang', default='ru')
    x.add_argument('--hold', action='append', default=[], help='src_N:T — the pause / filler at source time T stays whole')
    x.add_argument('--keep-black', action='store_true', help='keep a source\'s black timeline gaps (a cut approved before they were removed)')
    x.add_argument('--limit', type=float, default=0.45, help='max pause, measured the way qa/master.py hears it')
    x.add_argument('--tail-out', type=float, default=0.0,
                   help='тишина, оставляемая ПОСЛЕ последнего звука, с (защита окончания слова); 0 — симметрично')
    x.add_argument('--tail-in', type=float, default=0.0,
                   help='тишина ПЕРЕД первым звуком, с; ниже 0.10 только вместе с --fade')
    x.add_argument('--fade', type=float, default=0.0,
                   help='рампа на краях каждого куска, с (0.02–0.04 снимает щелчок шва); 0 — выключено')
    x.add_argument('--no-fillers', action='store_true'); x.add_argument('--opening', type=float, default=0.05)
    x.add_argument('--check', action='store_true', help='also whisper the result back → work/cut/check.txt (slow)')
    x = s.add_parser('fix'); x.add_argument('items', nargs='+', help='"12.4 обрыв" "убери 30.1-31.0" "верни паузу 18.2"')
    s.add_parser('approve')
    a = ap.parse_args()
    {'transcribe': transcribe, 'build': build, 'fix': fix, 'approve': approve}[a.cmd](a)


if __name__ == '__main__':
    main()
