import { NextResponse } from "next/server";
import { loadDictionary, saveDictionary } from "@/lib/dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> saved rules. PUT { rules } -> replace them (validated). Applied automatically after every Whisper run. */
export async function GET() {
  return NextResponse.json({ rules: loadDictionary() });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as { rules?: unknown } | null;
  return NextResponse.json({ rules: saveDictionary(body?.rules) });
}
