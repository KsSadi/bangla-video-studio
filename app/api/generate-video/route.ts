import { NextResponse } from "next/server";
import { getJob, isBusy, startGenerate, type GenerateInput, type Mode } from "@/lib/jobs";
import type { CharacterId } from "@/remotion/lib/types";

export const runtime = "nodejs";
const MODES: Mode[] = ["cartoon", "motion", "tutorial", "auto"];
const CHARACTERS: CharacterId[] = ["tech-mentor", "storyteller", "friendly-teacher", "auto", "none"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** POST JSON { jobId, srt, mode, character, aspect, url?, email?, password?, hints? } -> starts the pipeline. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  const job = getJob(body.jobId);
  if (!job) return NextResponse.json({ error: "Unknown job. Upload the voice file again." }, { status: 404 });
  if (isBusy()) return NextResponse.json({ error: "A job is already running." }, { status: 409 });

  const mode = body.mode as Mode;
  const character = body.character as CharacterId;
  if (!MODES.includes(mode)) return NextResponse.json({ error: "Invalid video mode." }, { status: 400 });
  if (!CHARACTERS.includes(character)) return NextResponse.json({ error: "Invalid character." }, { status: 400 });
  const srt = str(body.srt, 500_000);
  if (!srt.includes("-->")) return NextResponse.json({ error: "Subtitles are empty." }, { status: 400 });

  const input: GenerateInput = { srt, mode, character, aspect: body.aspect === "9:16" ? "9:16" : "16:9", hints: str(body.hints, 2000) };
  if (mode === "tutorial") {
    let url: URL;
    try {
      url = new URL(str(body.url, 2000));
    } catch {
      return NextResponse.json({ error: "Enter a valid target URL (https://…)." }, { status: 400 });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return NextResponse.json({ error: "Target URL must be http or https." }, { status: 400 });
    input.url = url.href;
    input.email = str(body.email, 320);
    input.password = str(body.password, 500);
  }

  startGenerate(job, input);
  return NextResponse.json({ ok: true });
}
