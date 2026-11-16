import { NextResponse } from "next/server";
import { deletePreset, listPresets, savePreset } from "@/lib/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> presets. POST { name, settings } -> save/update (same name overwrites). DELETE ?id= -> remove. */
export async function GET() {
  return NextResponse.json({ presets: listPresets() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: unknown; settings?: unknown } | null;
  if (!body?.settings) return NextResponse.json({ error: "Missing settings." }, { status: 400 });
  return NextResponse.json({ preset: savePreset(body.name, body.settings), presets: listPresets() });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^p-[a-z0-9]{3,24}$/.test(id) || !deletePreset(id)) return NextResponse.json({ error: "Unknown preset." }, { status: 404 });
  return NextResponse.json({ ok: true, presets: listPresets() });
}
