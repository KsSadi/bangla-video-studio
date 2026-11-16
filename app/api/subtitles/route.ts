import { NextResponse } from "next/server";
import { saveJob, getJob, setSrt } from "@/lib/store";
import { sanitizeSettings } from "@/lib/settings";
import { parseSrt, toSrt } from "@/remotion/lib/types";

export const runtime = "nodejs";

/** POST JSON { jobId, srt, verification? } -> saves the edited subtitles.srt (+ the Timestamps Verified state). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { jobId?: unknown; srt?: unknown; verification?: unknown } | null;
  const job = getJob(body?.jobId);
  if (!job) return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  const cues = typeof body?.srt === "string" ? parseSrt(body.srt) : [];
  if (!cues.length) return NextResponse.json({ error: "Subtitles are empty or invalid." }, { status: 400 });
  setSrt(job, toSrt(cues));
  if (body?.verification !== undefined) job.settings = sanitizeSettings({ verification: body.verification }, job.settings);
  saveJob(job);
  return NextResponse.json({ ok: true, count: cues.length });
}
