import { NextResponse } from "next/server";
import { readPreview } from "@/lib/shorts";
import { getJob, loadJob } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?id= -> the props of the last planned video, for the in-browser Remotion Player (no MP4 needed). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const job = getJob(id) ?? loadJob(id ?? "");
  const props = job ? readPreview(job) : null;
  if (!job || !props?.plan) return NextResponse.json({ error: "No scene plan yet." }, { status: 404 });
  return NextResponse.json(props, { headers: { "Cache-Control": "no-store" } });
}
