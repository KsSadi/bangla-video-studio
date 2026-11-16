"""Local Bengali speech -> SRT using faster-whisper. No API keys.

Usage: python scripts/transcribe.py <audio> <out.srt> [model]
Model defaults to $WHISPER_MODEL or "medium" (first run downloads it once).
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
    model_name = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("WHISPER_MODEL", "medium")

    from faster_whisper import WhisperModel

    try:  # GPU if CUDA libs are present, else CPU
        model = WhisperModel(model_name, device="cuda", compute_type="float16")
        segments, info = model.transcribe(audio, language="bn", vad_filter=True, beam_size=5)
        segments = list(segments)
    except Exception:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments, info = model.transcribe(audio, language="bn", vad_filter=True, beam_size=5)
        segments = list(segments)

    with open(out, "w", encoding="utf-8") as f:
        for i, seg in enumerate(segments, 1):
            f.write(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{seg.text.strip()}\n\n")
    print(f"OK {len(segments)} cues, {info.duration:.1f}s audio -> {out}", flush=True)


if __name__ == "__main__":
    assert ts(3661.5) == "01:01:01,500" and ts(0) == "00:00:00,000"
    main()
