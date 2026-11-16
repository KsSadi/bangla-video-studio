import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { createJob, isBusy, publicDir, startTranscribe } from "@/lib/jobs";

export const runtime = "nodejs";
const ALLOWED = new Set([".mp3", ".wav", ".m4a"]);
const MAX_BYTES = 500 * 1024 * 1024;

/** POST multipart { audio } -> { jobId }. Transcription runs in the background; poll /api/status. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach an audio file in the 'audio' field." }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED.has(ext)) return NextResponse.json({ error: "Only .mp3, .wav and .m4a are supported." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Audio file is larger than 500 MB." }, { status: 413 });
  if (isBusy()) return NextResponse.json({ error: "Another job is running. Wait for it to finish." }, { status: 409 });

  const job = createJob(ext); // file is saved under a generated name; the client's file name is never used as a path
  await pipeline(Readable.fromWeb(file.stream() as unknown as NodeWebStream), fs.createWriteStream(path.join(publicDir(job.id), job.audioFile)));
  startTranscribe(job);
  return NextResponse.json({ jobId: job.id });
}
