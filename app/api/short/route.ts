import { getJob, loadJob, shortFile } from "@/lib/store";
import { serveFile } from "@/lib/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?id=<jobId>&n=<short number>[&download=1] -> shorts/short-N.mp4 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  const job = getJob(id) ?? loadJob(id ?? "");
  const clip = job?.shorts.find((c) => c.n === Number(q.get("n")) && c.state === "done");
  if (!job || !clip) return new Response("Short not ready", { status: 404 });
  return serveFile(req, shortFile(job.id, clip.n), "video/mp4", q.get("download") ? `${job.id}-short-${clip.n}.mp4` : undefined);
}
