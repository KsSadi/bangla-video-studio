import { getJob, thumbnailPath } from "@/lib/store";
import { serveFile } from "@/lib/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?id=<jobId>[&download=1] -> thumbnail.png */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const job = getJob(q.get("id"));
  if (!job?.thumbnail) return new Response("No thumbnail", { status: 404 });
  return serveFile(req, thumbnailPath(job.id), "image/png", q.get("download") ? "thumbnail.png" : undefined);
}
