import { NextResponse } from "next/server";
import { runChecks, runFix } from "@/lib/doctor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 700;

/** GET -> live environment checks. */
export async function GET() {
  return NextResponse.json({ checks: await runChecks(), at: Date.now() });
}

/** POST { fix } -> run one allow-listed fix, then re-check. */
export async function POST(req: Request) {
  const { fix } = (await req.json().catch(() => ({}))) as { fix?: string };
  if (!fix || !/^[a-z-]+$/.test(fix)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const result = await runFix(fix);
  return NextResponse.json({ result, checks: await runChecks(), at: Date.now() });
}
