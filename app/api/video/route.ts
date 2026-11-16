import { getJob, versionFile } from "@/lib/store";
import { serveFile } from "@/lib/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?id=<jobId>[&v=<version>][&download=1] -> versions/v<N>.mp4 (default: latest). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const job = getJob(q.get("id"));
  if (!job?.versions.length) return new Response("Video not ready", { status: 404 });
  const wanted = Number(q.get("v"));
  const ver = job.versions.find((x) => x.n === wanted) ?? job.versions[job.versions.length - 1];
  return serveFile(req, versionFile(job.id, ver.n), "video/mp4", q.get("download") ? `${job.id}-v${ver.n}-${ver.quality}.mp4` : undefined);
}
