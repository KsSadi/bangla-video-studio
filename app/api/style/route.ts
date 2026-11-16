import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { serveFile } from "@/lib/serve";
import { deleteStyle, isStyleId, listStyles, startStyleClone, styleFramePath, styleRefDir } from "@/lib/styledna";
import { getJob, isBusy, loadJob } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v"]);
const MAX_BYTES = 800 * 1024 * 1024;

/** GET -> saved styles. GET ?id=&frame=N -> one keyframe image. DELETE ?id= -> remove a style. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  if (!id) return NextResponse.json({ styles: listStyles() });
  const file = styleFramePath(id, Number(q.get("frame")));
  if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return serveFile(req, file, "image/jpeg");
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!isStyleId(id) || !deleteStyle(id)) return NextResponse.json({ error: "Unknown style." }, { status: 404 });
  return NextResponse.json({ ok: true, styles: listStyles() });
}

/**
 * POST multipart { jobId, name?, video } -> analyse the reference clip (ffmpeg measurements + one Claude look at the
 * keyframes) in the background and save a reusable style-dna.json. Poll /api/status; then GET to list the new style.
 */
export async function POST(req: Request) {
  if (isBusy()) return NextResponse.json({ error: "Another job is running. Wait for it to finish." }, { status: 409 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("video");
  const job = getJob(form?.get("jobId")) ?? loadJob(String(form?.get("jobId") ?? ""));
  if (!job) return NextResponse.json({ error: "Load a voice file first: the analysis runs inside a project." }, { status: 404 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach the reference video in the 'video' field." }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  if (!EXT.has(ext)) return NextResponse.json({ error: "Use an .mp4, .mov, .webm or .mkv reference clip." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "The reference video is larger than 800 MB. Trim it to a short clip." }, { status: 413 });

  const dir = styleRefDir(job.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const video = path.join(dir, `reference${ext}`);
  await pipeline(Readable.fromWeb(file.stream() as unknown as NodeWebStream), fs.createWriteStream(video));
  const rawName = form?.get("name");
  const name = (typeof rawName === "string" && rawName.trim() ? rawName.trim() : file.name.replace(/\.[^.]+$/, "")).slice(0, 60);
  startStyleClone(job, video, name);
  return NextResponse.json({ ok: true, name });
}
