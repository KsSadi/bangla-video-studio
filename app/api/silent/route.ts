import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { extractDirections, mapDirections } from "@/lib/directions";
import { useUploadedSrt } from "@/lib/pipeline";
import { cuesFromLines } from "@/lib/silent";
import { createJob, isBusy, jobDir, publicDir, saveJob } from "@/lib/store";
import { toSrt } from "@/remotion/lib/types";

export const runtime = "nodejs";
const run = promisify(execFile);

/**
 * POST { text, name? } -> { jobId, name, srt }: a project with NO voice. One subtitle per line, timed by reading speed,
 * over a silent audio track (so the whole pipeline works unchanged; background music comes from the BGM setting).
 */
export async function POST(req: Request) {
  if (isBusy()) return NextResponse.json({ error: "Another job is running. Wait for it to finish." }, { status: 409 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (text.length > 30000) return NextResponse.json({ error: "The text is too long (max 30,000 characters)." }, { status: 413 });
  // [দৃশ্য ...] lines are scene directions: not shown as subtitles, handed to the scene planner instead
  const { spoken, marks } = extractDirections(text);
  const minSec = Math.min(20, Math.max(2.5, Number(body?.minSec) || 2.5)); // tutorials give each step more time
  const cues = cuesFromLines(spoken, minSec);
  if (!cues.length) return NextResponse.json({ error: "Write the subtitle lines first (one line = one subtitle)." }, { status: 400 });
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : cues[0].text.split(/\s+/).slice(0, 4).join(" ");
  const job = createJob(".mp3", name);
  const seconds = Math.ceil(cues[cues.length - 1].end + 1);
  try {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(seconds), "-c:a", "libmp3lame", "-q:a", "9", path.join(publicDir(job.id), job.audioFile)], { windowsHide: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not create the silent track (is ffmpeg installed?): ${(e as Error).message.split("\n")[0]}` }, { status: 500 });
  }
  if (marks.length) fs.writeFileSync(path.join(jobDir(job.id), "directions.json"), JSON.stringify(mapDirections(marks, cues.map((c) => c.text))), "utf8");
  const srt = toSrt(cues);
  useUploadedSrt(job, srt);
  job.subtitlesSource = "srt";
  saveJob(job);
  return NextResponse.json({ jobId: job.id, name: job.name, srt });
}
