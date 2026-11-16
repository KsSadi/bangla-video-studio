import { NextResponse } from "next/server";
import { startGenerate, startRerender, startRevise } from "@/lib/pipeline";
import { sanitizeSettings, type Quality } from "@/lib/settings";
import { getJob, isBusy } from "@/lib/store";

export const runtime = "nodejs";
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * POST JSON { jobId, action, quality, srt, settings, password?, feedback?, baseVersion? }
 *   action "generate": Claude plans + renders a new video (Fast Draft or Final HD)
 *   action "rerender": render the existing code again at `quality` (no Claude), optionally from an older `baseVersion`
 *   action "revise":   Claude edits only what `feedback` asks, then renders a new version
 * Every optional feature is a flag inside `settings`; off means the backend step is skipped.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  const job = getJob(body.jobId);
  if (!job) return NextResponse.json({ error: "Unknown project. Upload the voice file again or reopen it from Recent Projects." }, { status: 404 });
  if (isBusy()) return NextResponse.json({ error: "A job is already running." }, { status: 409 });

  const action = body.action === "rerender" || body.action === "revise" ? body.action : "generate";
  const quality: Quality = body.quality === "final" ? "final" : "draft";
  const settings = sanitizeSettings(body.settings, job.settings);
  const srt = str(body.srt, 500_000) || job.srt || "";
  if (!srt.includes("-->")) return NextResponse.json({ error: "Subtitles are empty." }, { status: 400 });
  if (settings.requireVerified && settings.verification === "unchecked") return NextResponse.json({ error: "Timestamps are not verified. Run the spot-check, or click Skip Check." }, { status: 400 });

  if (settings.mode === "tutorial") {
    let url: URL;
    try {
      url = new URL(settings.tutorialUrl);
    } catch {
      return NextResponse.json({ error: "Enter a valid target URL (https://…)." }, { status: 400 });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return NextResponse.json({ error: "Target URL must be http or https." }, { status: 400 });
    settings.tutorialUrl = url.href;
  }

  const baseVersion = Number.isInteger(body.baseVersion) ? (body.baseVersion as number) : undefined;
  if (baseVersion !== undefined && !job.versions.some((v) => v.n === baseVersion)) return NextResponse.json({ error: "Unknown version." }, { status: 400 });
  const input = { settings, srt, quality, password: str(body.password, 500) };

  if (action === "generate") startGenerate(job, input);
  else if (action === "rerender") {
    if (!job.versions.length) return NextResponse.json({ error: "Generate a video first." }, { status: 400 });
    startRerender(job, { ...input, baseVersion });
  } else {
    const feedback = str(body.feedback, 2000).trim();
    if (!feedback) return NextResponse.json({ error: "Type what you want changed." }, { status: 400 });
    if (!job.versions.length) return NextResponse.json({ error: "Generate a video first." }, { status: 400 });
    startRevise(job, { ...input, feedback, baseVersion });
  }
  return NextResponse.json({ ok: true });
}
