import { NextResponse } from "next/server";
import { addClip, deleteClip, readPreview, startShorts, suggestShorts } from "@/lib/shorts";
import type { Quality } from "@/lib/settings";
import { getJob, isBusy, loadJob } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const find = (id: unknown) => getJob(id) ?? (typeof id === "string" ? loadJob(id) : undefined);

/** GET ?id= -> the project's Shorts. */
export async function GET(req: Request) {
  const job = find(new URL(req.url).searchParams.get("id"));
  if (!job) return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  return NextResponse.json({ shorts: job.shorts, ready: !!readPreview(job)?.plan });
}

/**
 * POST { jobId, action }
 *   "suggest"  Option A: one Haiku call reads only the subtitles and returns up to 3 timestamp ranges
 *   "add"      Option B: { start, end, hookTitle? } manual clip, zero tokens
 *   "render"   { ids, quality } slice + render the clips locally (background job)
 *   "delete"   { id }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const job = find(body?.jobId);
  if (!job || !body) return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  const base = readPreview(job);
  if (!base?.plan) return NextResponse.json({ error: "Generate the video first: Shorts are cut from its scene plan." }, { status: 400 });
  if (job.settings.mode === "tutorial") return NextResponse.json({ error: "Shorts are not available for browser-tutorial videos." }, { status: 400 });

  switch (body.action) {
    case "add": {
      const r = addClip(job, base, body.start, body.end, body.hookTitle);
      return typeof r === "string" ? NextResponse.json({ error: r }, { status: 400 }) : NextResponse.json({ clip: r, shorts: job.shorts });
    }
    case "suggest": {
      if (isBusy()) return NextResponse.json({ error: "A job is already running." }, { status: 409 });
      try {
        const clips = await suggestShorts(job, base);
        return NextResponse.json({ clips, shorts: job.shorts });
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message.split("\n")[0] }, { status: 502 });
      }
    }
    case "render": {
      if (isBusy()) return NextResponse.json({ error: "A job is already running." }, { status: 409 });
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
      if (!job.shorts.some((c) => ids.includes(c.id))) return NextResponse.json({ error: "Pick at least one clip." }, { status: 400 });
      startShorts(job, ids, (body.quality === "draft" ? "draft" : "final") as Quality, base);
      return NextResponse.json({ ok: true });
    }
    case "delete": {
      if (isBusy()) return NextResponse.json({ error: "A job is running." }, { status: 409 });
      return typeof body.id === "string" && deleteClip(job, body.id) ? NextResponse.json({ shorts: job.shorts }) : NextResponse.json({ error: "Unknown clip." }, { status: 404 });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
