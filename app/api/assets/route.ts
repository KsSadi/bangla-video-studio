import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { SAFE_FILE, type AssetItem } from "@/lib/settings";
import { getJob, publicDir, saveJob } from "@/lib/store";

export const runtime = "nodejs";
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const VIDEO = new Set([".mp4", ".webm", ".mov"]);
const MAX = 200 * 1024 * 1024;

const clean = (name: string) => {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name)).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "asset";
  return { base, ext };
};

/** POST multipart { jobId, files[] } -> saves into projects/<id>/public/assets/ and adds them to the project's media list. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const job = getJob(form?.get("jobId"));
  if (!form || !job) return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  const dir = path.join(publicDir(job.id), "assets");
  fs.mkdirSync(dir, { recursive: true });
  const added: AssetItem[] = [];
  for (const f of form.getAll("files")) {
    if (!(f instanceof File)) continue;
    const { base, ext } = clean(f.name);
    const kind = IMAGE.has(ext) ? "image" : VIDEO.has(ext) ? "video" : null;
    if (!kind) return NextResponse.json({ error: `Unsupported file type: ${ext || f.name}. Use png, jpg, webp, gif, mp4, webm or mov.` }, { status: 400 });
    if (f.size > MAX) return NextResponse.json({ error: `${f.name} is larger than 200 MB.` }, { status: 413 });
    let file = `${base}${ext}`;
    for (let i = 2; fs.existsSync(path.join(dir, file)) || job.settings.assets.some((a) => a.file === file); i++) file = `${base}-${i}${ext}`;
    if (!SAFE_FILE.test(file)) continue;
    fs.writeFileSync(path.join(dir, file), Buffer.from(await f.arrayBuffer()));
    added.push({ file, kind, instruction: "" });
  }
  job.settings = { ...job.settings, assets: [...job.settings.assets, ...added].slice(0, 30) };
  saveJob(job);
  return NextResponse.json({ assets: job.settings.assets });
}

/** GET ?id=<jobId>&file=<name> -> the asset (for thumbnails in the panel). DELETE same query -> removes it. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const job = getJob(q.get("id"));
  const file = q.get("file") ?? "";
  if (!job || !SAFE_FILE.test(file) || !job.settings.assets.some((a) => a.file === file)) return new Response("Not found", { status: 404 });
  const p = path.join(publicDir(job.id), "assets", file);
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  const ext = path.extname(file).toLowerCase();
  const type = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : IMAGE.has(ext) ? "image/jpeg" : "video/mp4";
  return new Response(fs.readFileSync(p), { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request) {
  const q = new URL(req.url).searchParams;
  const job = getJob(q.get("id"));
  const file = q.get("file") ?? "";
  if (!job || !SAFE_FILE.test(file)) return NextResponse.json({ error: "Unknown asset." }, { status: 404 });
  fs.rmSync(path.join(publicDir(job.id), "assets", file), { force: true });
  job.settings = { ...job.settings, assets: job.settings.assets.filter((a) => a.file !== file) };
  saveJob(job);
  return NextResponse.json({ assets: job.settings.assets });
}
