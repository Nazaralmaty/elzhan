#!/usr/bin/env python3
"""Обратная транскрипция каждой реплики: озвучка обязана совпасть со сценарием.

Зачем это существует. Gemini TTS на kie.ai читает `sample_context` как
инструкцию и на коротких репликах ДОПИСЫВАЕТ текст от себя. На первой сборке
этого ролика реплика 8 («Айкон связывает рекламу с реальными записями»)
пришла длиной 13.6 с вместо 3.5 и содержала выдуманное: «интеграция с CRM
клиники, то есть Яндекс.Директ видит, сколько лидов пришли в клинику».
Ни CRM, ни Яндекс.Директа в ТЗ клиента нет — это готовое ложное обещание
в рекламе медицинской услуги. На слух брак ловится, только если слушать
все реплики целиком; замером — за секунды.

Проверяется два числа:
  1. длина расшифровки против длины реплики (ловит дописанное и оборванное);
  2. доля слов сценария, которые вообще прозвучали (ловит подмену).

whisper-small слышит «Айкон» как «Icon», «приёма» как «приема» — поэтому
сравнение идёт по нормализованным словам и с запасом, а не побуквенно.

  python3 engine/verify_vo.py script.txt work/raw   → отчёт, код 1 при браке
"""
import difflib, os, re, subprocess, sys, unicodedata
from pathlib import Path

MODEL = Path.home() / ".claude/tools/whisper/ggml-large-v3-turbo.bin"   # small misheard "сколиоз", "нейрохирургия" three passes in a row
LEN_MAX = 1.35     # расшифровка длиннее реплики более чем на треть — дописано
LEN_MIN = 0.70     # короче на треть — оборвано или проглочено
HIT_MIN = 0.75     # доля слов сценария, которые обязаны прозвучать


# whisper пишет латинские бренды латиницей, а в сценарии они кириллицей —
# для звука это одно и то же слово. Ловушка на ровном месте: реплика 2
# сошлась по длине 7/7 и была помечена браком из-за «Target» и «SMM».
# Whisper НОРМАЛИЗУЕТ то, что слышит, и это ловушка ровно там, где замер нужен:
# «Эсэмэмщик» он пишет как «СММщик», «таргетолог» — как «Торгетолог». Звучит
# одинаково, а по буквам расходится, и верная реплика уходит в брак по кругу.
TRANSLIT = {"target": "таргет", "smm": "эсэмэм", "icon": "айкон",
            "i": "айкон", "con": "айкон",
            "сммщик": "эсэмэмщик", "смм": "эсэмэм", "смм щик": "эсэмэмщик",
            "торгетолог": "таргетолог", "таргетолог": "таргетолог",
            "айкон": "айкон",
            # whisper writes brands and loanwords in Latin, the script has them in Cyrillic for the TTS
            "speaking": "спикинг", "time": "тайм", "ielts": "айэлтс", "whatsapp": "вотсап", "whats": "вотс", "app": "ап",
            "shymkent": "шымкент", "shimkent": "шымкент", "shemkent": "шымкент", "mia": "миа", "education": "эдьюкейшн",
            "kiberone": "киберуан", "kiber": "кибер", "one": "уан", "roblox": "роблокс", "unity": "юнити", "python": "пайтон",
            "java": "джава", "it": "айти", "sigma": "сигма", "center": "центр", "best": "бест", "kids": "кидс",
            "astrobot": "астробот", "scratch": "скретч", "junior": "джуниор", "lego": "лего", "arduino": "ардуино",
            "skill": "скилл", "matrix": "матрикс", "sat": "эсэйти", "ap": "эйпи", "economics": "экономикс",
            "stanford": "стэнфорд", "brown": "браун", "boston": "бостон", "university": "юниверсити", "king": "кингс",
            "kings": "кингс", "college": "колледж", "london": "лондон", "nus": "энюэс", "bekavto": "бекавто",
            "champion": "чемпион", "fitness": "фитнес", "urbo": "урбо", "coffee": "кофе", "wi": "вай", "fi": "фай",
            "wifi": "вайфай", "nnn": "энэнэн", "detailing": "детейлинг", "kaspi": "каспи", "fragrancia": "фрагранция",
            "deluxe": "делюкс", "premium": "премиум", "oner": "онер", "tis": "тис", "etagi": "этажи", "yandex": "яндекс", "ент": "еэнтэ"}


# whisper writes numbers as digits ("23.40", "35%", "1-3", "30 000"), the script has them as words:
# correct lines were rejected three passes in a row and regenerated for money. Digits are spelled out
# (nominative) and number words are matched by stem, so "тридцати пяти" == "35".
ONES = ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять", "десять",
        "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать",
        "семнадцать", "восемнадцать", "девятнадцать"]
TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
HUND = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]


def n2w(n):
    if n < 20: return [ONES[n]]
    if n < 100: return [TENS[n // 10]] + ([ONES[n % 10]] if n % 10 else [])
    if n < 1000: return [HUND[n // 100]] + (n2w(n % 100) if n % 100 else [])
    if n < 10 ** 6:
        th = n // 1000
        return (n2w(th) if th > 1 else []) + ["тысяч"] + (n2w(n % 1000) if n % 1000 else [])
    return [str(n)]


def spell(s):
    s = re.sub(r"(?<=\d)[ \u00a0\u202f](?=\d{3}\b)", "", s)          # "30 000" -> "30000"
    s = s.replace("%", " процентов ").replace("млн", " миллионов ")
    return re.sub(r"\d+", lambda m: " " + " ".join(n2w(int(m.group()))) + " ", s)


# ordinals: the script says «этап первый», whisper writes «этап 1» (spelled back as «один»)
ORD = [(r"^перв\w*$", "один"), (r"^втор(ой|ая|ое|ого|ом|ую|ые)$", "два"), (r"^трет\w*$", "три"), (r"^четверт\w*$", "четыре"),
       (r"^пят(ый|ая|ое|ого|ом|ую)$", "пять"), (r"^шест(ой|ая|ое|ого|ом|ую)$", "шесть"), (r"^седьм\w*$", "семь"),
       (r"^восьм\w*$", "восемь"), (r"^девят(ый|ая|ое|ого|ом|ую)$", "девять"), (r"^десят(ый|ая|ое|ого|ом|ую)$", "десять")]


def cardinal(w):
    for pat, rep in ORD:
        if re.match(pat, w): return rep
    return w


def norm(s):
    # "Эс-Эй-Ти" is one word to the ear and to whisper ("SAT"): joined, or the line reads 13 words against 9 and fails on length
    s = re.sub(r"(?<=\w)-(?=\w)", "", unicodedata.normalize("NFC", spell(s).lower()).replace("ё", "е"))
    return [cardinal(TRANSLIT.get(w, w)) for w in re.split(r"[^a-zа-я0-9]+", s) if w]


def same(w, g):
    """a script word counts as heard in g: equal, close spelling, or the same stem (case endings differ)"""
    if w == g: return True
    k = 0
    while k < min(len(w), len(g)) and w[k] == g[k]: k += 1
    return k >= max(3, min(len(w), len(g)) - 2) or difflib.SequenceMatcher(None, w, g).ratio() >= 0.8


def transcribe(wav):
    # Имя с PID и номером файла: фиксированный /tmp/_vv.wav — гонка. Две сборки
    # завода, идущие в соседних папках одновременно, затирали друг другу временный
    # файл, и верная озвучка помечалась браком с чужим текстом в расшифровке.
    tmp = Path(f"/tmp/_vv_{os.getpid()}_{Path(wav).stem}.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ar", "16000",
                    "-ac", "1", str(tmp)], check=True)
    out = subprocess.run(["whisper-cli", "-m", str(MODEL), "-l", "ru", "-nt", str(tmp)],
                         capture_output=True, text=True).stdout
    tmp.unlink(missing_ok=True)
    return " ".join(out.split())


def main(script, raw):
    lines = [l.strip() for l in Path(script).read_text(encoding="utf-8").splitlines() if l.strip()]
    bad = []
    for i, line in enumerate(lines, 1):
        wav = next(Path(raw).glob(f"l_{i:02d}_*.wav"), None)
        if wav is None:
            print(f"{i:02d}  НЕТ ФАЙЛА"); bad.append(i); continue
        heard = transcribe(wav)
        src, got = norm(line), norm(heard)
        ratio = len(got) / max(1, len(src))
        # a script word counts as heard if whisper wrote it, wrote something close ("скалиоз"),
        # or glued it to a neighbour ("айви-терапия" for "ай ви"); words of 1–2 letters are not checkable
        joined = "".join(got)
        heard_w = lambda w: len(w) <= 2 or w in got or w in joined or any(same(w, g) for g in got)
        hit = sum(1 for w in set(src) if heard_w(w)) / max(1, len(set(src)))
        ok = LEN_MIN <= ratio <= LEN_MAX and hit >= HIT_MIN
        print(f"{i:02d}  {'ok ' if ok else 'БРАК'}  слов {len(got)}/{len(src)} "
              f"({ratio:.2f})  совпало {hit:.0%}")
        if not ok:
            print(f"      сценарий: {line}")
            print(f"      слышно:   {heard}")
            bad.append(i)
    print(f"\nбрак: {bad if bad else 'нет'}")
    return 1 if bad else 0


def selftest():
    cases = [("Клиент прислал правку в двадцать три сорок.", "Клиент прислал правку в 23.40."),
             ("Оптовым клиентам — скидка до тридцати пяти процентов.", "Оптовым клиентам скидка до 35%."),
             ("Доставка по Казахстану и СНГ: автобусом за один-три дня, фурой за два-пять.", "Доставка по Казахстану и СНГ. Автобусом за 1-3 дня, фурой за 2-5."),
             ("Открыть точку разливных духов можно с тридцати тысяч тенге.", "Открыть точку разливных духов можно с 30 000 тенге."),
             ("Ай-Элтс, Эс-Эй-Ти, Эй-Пи Экономикс, академическое письмо, портфолио, мотивационные письма.", "IELTS, SAT, AP Economics, академическое письмо, портфолио, мотивационные письма."),
             ("Спикинг Тайм, Шымкент: английский, турецкий, арабский и подготовка к Ай-Элтс.", "Speaking time shimkent. Английский, турецкий, арабский и подготовка к IELTS."),
             ("Этап первый: теория. Этап второй: практика.", "Этап 1. Теория. Этап 2. Практика.")]
    for src, heard in cases:
        a, b = norm(src), norm(heard); joined = "".join(b)
        hit = sum(1 for w in set(a) if len(w) <= 2 or w in b or w in joined or any(same(w, g) for g in b)) / len(set(a))
        assert LEN_MIN <= len(b) / len(a) <= LEN_MAX and hit >= HIT_MIN, (src, b, hit)
    assert not all(same(w, g) for w, g in [("тридцати", "двадцать")]), "different numbers must not match"
    print("verify_vo selftest ok")


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]: selftest(); sys.exit(0)
    sys.exit(main(sys.argv[1], sys.argv[2]))
