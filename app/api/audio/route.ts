import path from "node:path";
import { AUDIO_TYPES, serveFile } from "@/lib/serve";
import { getJob, loadJob, publicDir } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?id=<jobId> -> the originally uploaded voice file (used by the sync checker when a project is reopened). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const job = getJob(id) ?? loadJob(String(id));
  if (!job) return new Response("Unknown project", { status: 404 });
  return serveFile(req, path.join(publicDir(job.id), job.audioFile), AUDIO_TYPES[path.extname(job.audioFile)] ?? "audio/mpeg");
}
