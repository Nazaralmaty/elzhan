#!/usr/bin/env python3
"""engine/tts_or.py — production voice through OpenRouter, Gemini 3.8 Flash Lite TTS: one request per line
of script.txt, every take back-transcribed (whisper-cli) and re-rolled up to --tries times; the take closest
to the text wins. Writes work/raw/l_NN_000.wav (48 kHz mono), which `engine/tts.sh trim` turns into
assets/vo/vo_NN.wav + vo.js; then `engine/words.sh` rebuilds the word timing.

  python3 ~/.claude/engine/tts_or.py [--lang ru|kk] [--voice Achird] [--style ad|story|calm|"free text"]
                                     [--lines 1,3] [--tries 1] [--model …flash-tts] [--out work/raw] [--name l]

Before the first paid request script.txt goes through the no-ai-slop lint; a client's own text
(ТЗ, testimonial) skips it with SLOP=skip. Voices are already auditioned (assets/voices/gemini) —
`--say` is for a single line, not for new auditions.
Key: OPENROUTER_API_KEY in ~/.claude/tools/openrouter/.env (never in the reel folder).
Lived as a copy in a dozen reel folders until 11.10.2026; reel folders get purged, so it lives here.
"""
import argparse, json, os, re, subprocess, sys, urllib.request, difflib, tempfile

ENV = os.path.expanduser("~/.claude/tools/openrouter/.env")
WHISPER = os.path.expanduser("~/.claude/tools/whisper/ggml-large-v3-turbo.bin")
SLOP = os.path.expanduser("~/.claude/skills/no-ai-slop/lint.py")
STRESS = os.path.join(os.path.dirname(os.path.realpath(__file__)), "stress.txt")
STYLES = {
    "ru": {
        "ad": ("Brisk, confident Russian-language ad voiceover, starting at full energy on the very first word, like telling a colleague "
               "about a pain he knows. Native Russian pronunciation, fast pace, irritation on the problem, a smile on the solution, no pathos, no shouting."),
        "story": ("Russian-language documentary storyteller for a short vertical video: fast, lively, a hint of a grin, leaning in on numbers and names, "
                  "a sharp drop in tone on the twist. Native Russian pronunciation, no pauses between phrases, no radio pathos, no shouting."),
        "calm": "Calm, warm Russian-language explainer voice, medium pace, clear diction, friendly, no pathos.",
    },
    # Elzhan 29.09.2026: the reel opens on the hook at full speed, no run-up — so the read is fast from the first word
    "kk": {
        "ad": ("Fast, punchy, high-energy Kazakh-language ad, starting at full energy on the very first word. "
               "Native Kazakh pronunciation, rapid confident pace, a smile in the voice, no pauses between phrases, no pathos, no shouting."),
        "calm": "Calm, warm Kazakh-language explainer voice, medium pace, clear diction, native Kazakh pronunciation, no pathos.",
    },
}


def key():
    for l in open(ENV, encoding="utf-8"):
        if l.startswith("OPENROUTER_API_KEY=") and l.split("=", 1)[1].strip():
            return l.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f"нет ключа: впиши OPENROUTER_API_KEY в {ENV}")


def speak(text, a, out_wav, k):
    body = {"model": a.model, "input": text, "voice": a.voice, "response_format": "pcm",
            "provider": {"options": {"google-ai-studio": {"speech_metadata": {"style": a.style}}}}}
    req = urllib.request.Request("https://openrouter.ai/api/v1/audio/speech", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {k}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        ctype, data = r.headers.get("Content-Type", ""), r.read()
    raw = out_wav + ".raw"
    open(raw, "wb").write(data)
    fmt = ["-f", "s16le", "-ar", "24000", "-ac", "1"] if "pcm" in ctype or "octet" in ctype else []
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *fmt, "-i", raw, "-ar", "48000", "-ac", "1", out_wav], check=True)
    os.remove(raw)


def stress(text):
    """Stress marks from engine/stress.txt (Elzhan's corrections: тАргет, Айкон, Нур Отан…)."""
    for l in open(STRESS, encoding="utf-8"):
        if l.startswith("#") or "\t" not in l: continue
        plain, said = l.rstrip("\n").split("\t")
        text = re.sub(rf"(?<!\w){re.escape(plain)}(?!\w)",
                      lambda m: (said[0].upper() if m.group()[0].isupper() else said[0].lower()) + said[1:], text, flags=re.I)
    return text


def norm(s):
    return re.sub(r"[^а-яәғқңөұүһі0-9]+", "", s.lower().replace("ё", "е"))


def heard(wav, lang):
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", wav, "-ar", "16000", "-ac", "1", t.name], check=True)
        return subprocess.run(["whisper-cli", "-m", WHISPER, "-l", lang, "-nt", "-f", t.name],
                              capture_output=True, text=True).stdout.strip()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--lang", default="ru", choices=["ru", "kk"])
    p.add_argument("--voice", default="Achird"); p.add_argument("--style", default="ad")
    p.add_argument("--model", default="google/gemini-3.8-flash-lite-tts")
    p.add_argument("--lines"); p.add_argument("--tries", type=int, default=1)  # paid: one take, re-roll only a broken line
    p.add_argument("--script", default="script.txt"); p.add_argument("--say", help="speak only this text")
    p.add_argument("--out", default="work/raw"); p.add_argument("--name", default="l")
    a = p.parse_args()
    a.style = STYLES[a.lang].get(a.style, a.style)
    # the TTS text: numbers already as words in script.txt; a line may carry "screen | tts" — tts part is spoken
    lines = [a.say] if a.say else [l.split("|")[-1].strip() for l in open(a.script, encoding="utf-8") if l.strip()]
    # Latin in the spoken part is read with an English accent (icon/reel_076: «Jacobs», «I-CON») — a Russian
    # transcription goes after "|": «Jacobs» → «Джейкобс»
    latin = [f"{n}: {l}" for n, l in enumerate(lines, 1) if re.search(r"[A-Za-z]", l)]
    if latin:
        sys.exit("латиница в тексте для голоса — впиши русскую транскрипцию после «|»:\n" + "\n".join(latin))
    lines = [stress(l) for l in lines]
    if a.lang == "ru" and os.environ.get("SLOP") != "skip":
        r = subprocess.run([sys.executable, SLOP, "-"], input="\n".join(lines), capture_output=True, text=True)
        if r.returncode:
            sys.exit(r.stdout + "озвучка не запущена: каждый дубль платный, текст сначала чистится")
    k = key(); os.makedirs(a.out, exist_ok=True)
    todo = [int(x) for x in a.lines.split(",")] if a.lines else range(1, len(lines) + 1)
    report = {}
    for n in todo:
        text, best = lines[n - 1], None
        for t in range(a.tries):
            f = os.path.join(a.out, f"{a.name}_{n:02d}_try{t}.wav")
            speak(text, a, f, k)
            h = heard(f, a.lang); score = difflib.SequenceMatcher(None, norm(text), norm(h)).ratio()
            print(f"{n:02d} try{t} {score:.2f}  {h}", flush=True)
            if not best or score > best[0]: best = (score, f, h)
            if score >= 0.93: break
        os.replace(best[1], os.path.join(a.out, f"{a.name}_{n:02d}_000.wav"))
        for f in os.listdir(a.out):
            if re.match(rf"{a.name}_{n:02d}_try\d\.wav", f): os.remove(os.path.join(a.out, f))
        report[n] = {"score": round(best[0], 3), "heard": best[2], "voice": a.voice}
    json.dump(report, open(os.path.join(a.out, f"{a.name}_report.json"), "w"), ensure_ascii=False, indent=1)


main()
