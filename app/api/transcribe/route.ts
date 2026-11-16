import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { startTranscribe, useUploadedSrt } from "@/lib/pipeline";
import { createJob, getJob, isBusy, publicDir, saveJob } from "@/lib/store";
import { parseSrt } from "@/remotion/lib/types";

export const runtime = "nodejs";
const ALLOWED = new Set([".mp3", ".wav", ".m4a"]);
const MAX_BYTES = 500 * 1024 * 1024;

/**
 * POST multipart { audio, srt?, name? } -> { jobId, subtitlesSource }.
 *   With a valid .srt: Whisper is skipped and the parsed subtitles are returned immediately.
 *   Without: Whisper runs in the background; poll /api/status.
 * POST JSON { jobId, action: "whisper" } -> re-run Whisper on the project's audio (the "Re-generate with Whisper" button).
 */
export async function POST(req: Request) {
  if (isBusy()) return NextResponse.json({ error: "Another job is running. Wait for it to finish." }, { status: 409 });

  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { jobId?: unknown; action?: unknown } | null;
    const job = getJob(body?.jobId);
    if (!job || body?.action !== "whisper") return NextResponse.json({ error: "Unknown project." }, { status: 404 });
    startTranscribe(job);
    return NextResponse.json({ jobId: job.id, subtitlesSource: "whisper" });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach an audio file in the 'audio' field." }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED.has(ext)) return NextResponse.json({ error: "Only .mp3, .wav and .m4a are supported." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Audio file is larger than 500 MB." }, { status: 413 });

  const srtFile = form?.get("srt");
  let srt = "";
  if (srtFile instanceof File && srtFile.size > 0) {
    if (srtFile.size > 2_000_000) return NextResponse.json({ error: ".srt file is too large." }, { status: 413 });
    srt = await srtFile.text();
    if (!parseSrt(srt).length) return NextResponse.json({ error: "That .srt file has no valid subtitle cues." }, { status: 400 });
  }

  const rawName = form?.get("name");
  const job = createJob(ext, typeof rawName === "string" && rawName.trim() ? rawName : file.name.replace(/\.[^.]+$/, ""));
  await pipeline(Readable.fromWeb(file.stream() as unknown as NodeWebStream), fs.createWriteStream(path.join(publicDir(job.id), job.audioFile)));
  if (srt) useUploadedSrt(job, srt);
  else startTranscribe(job);
  saveJob(job);
  return NextResponse.json({ jobId: job.id, subtitlesSource: srt ? "srt" : "whisper", srt: job.srt ?? null, name: job.name });
}
