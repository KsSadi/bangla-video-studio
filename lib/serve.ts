import fs from "node:fs";
import { Readable } from "node:stream";

/** Stream a file with HTTP Range support (needed for seeking in <video>/<audio>). */
export function serveFile(req: Request, file: string, contentType: string, downloadName?: string): Response {
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  const size = fs.statSync(file).size;
  const headers: Record<string, string> = { "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  if (downloadName) headers["Content-Disposition"] = `attachment; filename="${downloadName}"`;
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

export const AUDIO_TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4" };
