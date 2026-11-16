import fs from "node:fs";
import { Readable } from "node:stream";
import { getJob, videoPath } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?id=<jobId>[&download=1] -> final-video.mp4 with Range support (needed for seeking in <video>). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const job = getJob(q.get("id"));
  if (!job?.videoReady) return new Response("Video not ready", { status: 404 });
  const file = videoPath(job.id);
  const size = fs.statSync(file).size;
  const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  if (q.get("download")) headers["Content-Disposition"] = 'attachment; filename="final-video.mp4"';

  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}
