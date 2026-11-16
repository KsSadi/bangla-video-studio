import { NextResponse } from "next/server";
import { deleteCharacter, listCharacters, saveCharacter } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> saved custom characters. POST { id?, name, look } -> save/update one. DELETE ?id= -> remove. */
export async function GET() {
  return NextResponse.json({ characters: listCharacters() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown; name?: unknown; look?: unknown } | null;
  if (!body?.look) return NextResponse.json({ error: "Missing character look." }, { status: 400 });
  const id = typeof body.id === "string" && /^[a-z0-9-]{3,40}$/.test(body.id) ? body.id : undefined;
  return NextResponse.json({ character: saveCharacter({ id, name: body.name, look: body.look }) });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9-]{3,40}$/.test(id) || !deleteCharacter(id)) return NextResponse.json({ error: "Unknown character." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
