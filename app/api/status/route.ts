import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";

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
    status: job.status,
    steps: job.steps,
    logs: job.logs.slice(from),
    logCount: job.logs.length,
    srt: job.srt ?? null,
    error: job.error ?? null,
    videoReady: job.videoReady,
  });
}
