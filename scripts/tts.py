"""Zero-cost Bengali voice-over + exact subtitles with edge-tts (no API key).

Usage: python scripts/tts.py <script.txt> <out.mp3> <out.srt> [--voice V] [--rate +0%]

* One voice for the whole script.
* Word timings come from the neural voice itself, so the .srt matches the audio exactly.
* Prints "PROGRESS <0-100>" and "STAGE <text>" lines that the studio shows live.
Voices: bn-BD-NabanitaNeural (female), bn-BD-PradeepNeural (male).
"""
import argparse
import asyncio
import sys

import edge_tts

SENTENCE_END = ("।", "?", "!", ".", "؟", "…")
SOFT_BREAK = (",", "،", ";", ":")
MAX_WORDS = 10
MAX_CUE_SEC = 4.5
TICKS = 10_000_000  # edge-tts offsets are 100 ns ticks


def ts(sec: float) -> str:
    ms = max(0, round(sec * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def cues_from_words(tokens, words):
    """tokens: whitespace tokens of the script (with punctuation); words: [(start, end, text)] from the voice."""
    use_tokens = len(tokens) == len(words)
    cues, cur = [], []
    for i, (st, en, wtext) in enumerate(words):
        text = tokens[i] if use_tokens else wtext
        cur.append((st, en, text))
        span = en - cur[0][0]
        last = text.rstrip("\"'”’)")
        hard = last.endswith(SENTENCE_END)
        soft = last.endswith(SOFT_BREAK) and len(cur) >= 5
        if hard or soft or len(cur) >= MAX_WORDS or span >= MAX_CUE_SEC or i == len(words) - 1:
            cues.append((cur[0][0], cur[-1][1], " ".join(w[2] for w in cur)))
            cur = []
    # keep cues from overlapping: a cue ends before the next one starts
    fixed = []
    for i, (st, en, text) in enumerate(cues):
        nxt = cues[i + 1][0] if i + 1 < len(cues) else None
        end = min(en + 0.12, nxt) if nxt is not None else en + 0.12
        fixed.append((st, max(end, st + 0.2), text))
    return fixed


async def synth(text, voice, rate, out_mp3, on_word, attempts=5, pitch="+0Hz"):
    """Synthesize `text`; returns [(start_sec, end_sec, word)] and writes the mp3.
    The free service sometimes answers "no audio" for a perfectly valid request, so retry with a short back-off."""
    last = None
    for attempt in range(1, attempts + 1):
        words = []
        try:
            comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
            with open(out_mp3, "wb") as f:
                async for ch in comm.stream():
                    if ch["type"] == "audio":
                        f.write(ch["data"])
                    elif ch["type"] == "WordBoundary":
                        st = ch["offset"] / TICKS
                        words.append((st, st + ch["duration"] / TICKS, ch["text"]))
                        on_word(len(words))
            if words:
                return words
            last = RuntimeError("no word timings received")
        except Exception as e:  # network hiccup / NoAudioReceived
            last = e
        if attempt < attempts:
            print(f"STAGE Voice service hiccup, retrying ({attempt}/{attempts - 1})", flush=True)
            await asyncio.sleep(1.2 * attempt)
    raise RuntimeError(f"The voice service returned no audio after {attempts} tries ({type(last).__name__}). Check your internet connection and try again.")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("out_mp3")
    ap.add_argument("out_srt")
    ap.add_argument("--voice", default="bn-BD-NabanitaNeural")
    ap.add_argument("--rate", default="+0%")
    ap.add_argument("--pitch", default="+0Hz")
    a = ap.parse_args()

    body = " ".join(l.strip() for l in open(a.script, encoding="utf-8").read().splitlines() if l.strip())
    if not body:
        sys.exit("The script is empty.")
    tokens = body.split()
    total_words = max(1, len(tokens))
    step = max(1, total_words // 25)

    def on_word(n):
        if n % step == 0:
            print(f"PROGRESS {min(99, int(n / total_words * 100))}", flush=True)

    print("STAGE Synthesizing Bengali voice", flush=True)
    words = await synth(body, a.voice, a.rate, a.out_mp3, on_word, pitch=a.pitch)
    srt_cues = cues_from_words(tokens, words)

    with open(a.out_srt, "w", encoding="utf-8") as f:
        for i, (st, en, t) in enumerate(srt_cues, 1):
            f.write(f"{i}\n{ts(st)} --> {ts(en)}\n{t}\n\n")
    print(f"OK {len(srt_cues)} cues -> {a.out_mp3}", flush=True)


if __name__ == "__main__":
    assert ts(3661.5) == "01:01:01,500"
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
