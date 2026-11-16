import path from "node:path";
import { getJob, loadJob, publicDir } from "@/lib/store";
import { serveFile } from "@/lib/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ttf": "font/ttf",
};

/**
 * GET /api/pub/<jobId>/<file...> -> a file from the project's public/ folder (audio, fonts, B-roll, recordings).
 * The live Remotion Player points staticFile() here (window.remotion_staticBase), so previews use the same assets as renders.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; file: string[] }> }) {
  const { id, file } = await ctx.params;
  const job = getJob(id) ?? loadJob(id);
  if (!job) return new Response("Not found", { status: 404 });
  const root = publicDir(job.id);
  const full = path.resolve(root, ...file.map((p) => decodeURIComponent(p)));
  const type = TYPES[path.extname(full).toLowerCase()];
  if (!type || (full !== root && !full.startsWith(root + path.sep))) return new Response("Not found", { status: 404 });
  return serveFile(req, full, type);
}
