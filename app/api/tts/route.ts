import { NextResponse } from "next/server";
import { TTS_VOICES, startTts, type TtsVoice } from "@/lib/pipeline";
import { createJob, isBusy, saveJob } from "@/lib/store";

export const runtime = "nodejs";

const voice = (v: unknown, d: TtsVoice): TtsVoice => (typeof v === "string" && v in TTS_VOICES ? (v as TtsVoice) : d);

/**
 * POST { text, voice?, voiceB?, rate?, name? } -> creates a project whose audio is a Bengali neural voice (edge-tts)
 * and whose subtitles come from the voice's own word timings. Poll /api/status like a Whisper job.
 */
export async function POST(req: Request) {
  if (isBusy()) return NextResponse.json({ error: "Another job is running. Wait for it to finish." }, { status: 409 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = typeof body?.text === "string" ? body.text.replace(/\r/g, "").trim() : "";
  if (text.length < 2) return NextResponse.json({ error: "Write or paste the Bengali script first." }, { status: 400 });
  if (text.length > 30000) return NextResponse.json({ error: "The script is too long (max 30,000 characters)." }, { status: 413 });
  const pct = Math.max(-50, Math.min(50, Math.round(Number(body?.rate ?? 0)) || 0));
  const hz = Math.max(-30, Math.min(30, Math.round(Number(body?.pitch ?? 0)) || 0));
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : text.split(/\s+/).slice(0, 4).join(" ");
  const job = createJob(".mp3", name);
  job.subtitlesSource = "tts";
  saveJob(job);
  startTts(job, { text, voice: voice(body?.voice, "bn-BD-NabanitaNeural"), voiceB: voice(body?.voiceB, "bn-BD-PradeepNeural"), rate: `${pct >= 0 ? "+" : "-"}${Math.abs(pct)}%`, pitch: `${hz >= 0 ? "+" : "-"}${Math.abs(hz)}Hz` });
  return NextResponse.json({ jobId: job.id, name: job.name, subtitlesSource: "tts" });
}
