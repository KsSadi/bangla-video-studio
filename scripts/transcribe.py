"""Local Bengali speech -> SRT using faster-whisper. No API keys.

Usage: python scripts/transcribe.py <audio> <out.srt> [model]
Model defaults to $WHISPER_MODEL or "large-v3" (first run downloads it once).
"""
import os
import sys


def ts(sec: float) -> str:
    ms = max(0, round(sec * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    audio, out = sys.argv[1], sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("WHISPER_MODEL", "large-v3")

    # pip-installed CUDA libs (nvidia-cublas-cu12 / nvidia-cudnn-cu12) live under site-packages/nvidia/*/bin
    try:
        import nvidia

        for base in nvidia.__path__:
            for sub in ("cublas", "cudnn"):
                d = os.path.join(base, sub, "bin" if os.name == "nt" else "lib")
                if os.path.isdir(d):
                    if os.name == "nt":
                        os.add_dll_directory(d)
                    os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
    except Exception:
        pass

    from faster_whisper import WhisperModel

    def transcribe(device: str, compute: str):
        print(f"STAGE Loading Whisper model ({device})", flush=True)
        model = WhisperModel(model_name, device=device, compute_type=compute)
        print("STAGE Transcribing audio", flush=True)
        # The Bengali initial_prompt anchors Whisper to Bengali script; without it, smaller
        # models often emit Devanagari (Hindi-looking) text for Bengali speech.
        gen, info = model.transcribe(
            audio, language="bn", task="transcribe", vad_filter=True, beam_size=5,
            initial_prompt="এটি একটি বাংলা ভিডিওর ভয়েসওভার। আমরা পরিষ্কার বাংলায় কথা বলছি।",
            condition_on_previous_text=False,
            temperature=[0.0, 0.2, 0.4],
        )
        out_segments, last = [], -1
        for seg in gen:
            out_segments.append(seg)
            if info.duration:
                pct = min(99, int(seg.end / info.duration * 100))
                if pct != last:
                    last = pct
                    print(f"PROGRESS {pct}", flush=True)
        return out_segments, info

    try:  # GPU if CUDA libs are present, else CPU
        # int8 keeps large-v3 under ~2 GB VRAM and works on older (Pascal, e.g. GTX 1050 Ti)
        # cards, which lack efficient float16 / int8_float16 support.
        segments, info = transcribe("cuda", "int8")
    except Exception:
        segments, info = transcribe("cpu", "int8")

    def to_bengali_script(text: str) -> str:
        # Safety net: Devanagari and Bengali Unicode blocks are laid out in parallel
        # (U+0900.. vs U+0980..), so shifting code points converts the script.
        return "".join(chr(ord(c) + 0x80) if "ऀ" <= c <= "ॿ" else c for c in text)

    with open(out, "w", encoding="utf-8") as f:
        for i, seg in enumerate(segments, 1):
            f.write(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{to_bengali_script(seg.text.strip())}\n\n")
    print(f"OK {len(segments)} cues, {info.duration:.1f}s audio -> {out}", flush=True)


if __name__ == "__main__":
    assert ts(3661.5) == "01:01:01,500" and ts(0) == "00:00:00,000"
    main()
