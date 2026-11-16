import { NextResponse } from "next/server";
import fs from "node:fs";
import { getJob, previewPath } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?id=<jobId>&from=<logOffset> -> job state + log lines after the offset. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const job = getJob(q.get("id"));
  if (!job) return NextResponse.json({ error: "Unknown job." }, { status: 404 });
  const from = Math.max(0, Number(q.get("from")) || 0);
  return NextResponse.json({
    id: job.id,
    name: job.name,
    status: job.status,
    steps: job.steps,
    logs: job.logs.slice(from),
    logCount: job.logs.length,
    tokens: job.tokens ?? null,
    previewRev: fs.existsSync(previewPath(job.id)) ? Math.floor(fs.statSync(previewPath(job.id)).mtimeMs) : 0,
    shorts: job.shorts,
    now: Date.now(),
    srt: job.srt ?? null,
    subtitlesSource: job.subtitlesSource,
    error: job.error ?? null,
    videoReady: job.videoReady,
    versions: job.versions,
    revisions: job.revisions,
    seo: job.seo ?? null,
    thumbnail: job.thumbnail,
  });
}
