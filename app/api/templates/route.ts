import { NextResponse } from "next/server";
import { deleteTemplate, getTemplate, isTemplateId, listTemplates, saveTemplate } from "@/lib/templates";
import { getJob, loadJob } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> template summaries; GET ?id= -> the full template (settings to apply). POST { jobId, name } -> save a finished project as a template. DELETE ?id= */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ templates: listTemplates() });
  const t = isTemplateId(id) ? getTemplate(id) : null;
  return t ? NextResponse.json({ template: t }) : NextResponse.json({ error: "Unknown template." }, { status: 404 });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { jobId?: unknown; name?: unknown } | null;
  const job = getJob(body?.jobId) ?? loadJob(String(body?.jobId ?? ""));
  if (!job) return NextResponse.json({ error: "Unknown project." }, { status: 404 });
  if (!job.versions.length) return NextResponse.json({ error: "Render a video first, then save it as a template." }, { status: 400 });
  const r = saveTemplate(job, body?.name);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ template: { id: r.id, name: r.name }, templates: listTemplates() });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!deleteTemplate(id)) return NextResponse.json({ error: "Unknown template." }, { status: 404 });
  return NextResponse.json({ ok: true, templates: listTemplates() });
}
