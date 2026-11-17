import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { claudeJson, node } from "@/lib/exec";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { ROOT, isBusy, type Job } from "@/lib/store";

export const runtime = "nodejs";

/**
 * POST { url, email?, password?, goal? } -> { steps }: scans the site read-only (scripts/explore-site.mjs), then Claude
 * proposes tutorial steps, one per line. Credentials go to the local browser as environment variables only: never saved,
 * never sent to Claude. (Claude does read the page titles / button names of the pages that were scanned.)
 */
export async function POST(req: Request) {
  if (isBusy()) return NextResponse.json({ error: "Another job is running. Wait for it to finish." }, { status: 409 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\/\S+$/.test(url)) return NextResponse.json({ error: "Enter the website URL first (http:// or https://)." }, { status: 400 });
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const goal = str(body?.goal, 1000).trim();
  const stub = { logs: [], steps: [], settings: DEFAULT_SETTINGS } as unknown as Job;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bvs-explore-")), "site-map.json");
  try {
    await node(stub, path.join(ROOT, "scripts", "explore-site.mjs"), [url, out], {
      env: { TUTORIAL_EMAIL: str(body?.email, 200), TUTORIAL_PASSWORD: str(body?.password, 200) },
      timeoutMs: 150_000,
      quiet: true,
    });
    const map = fs.readFileSync(out, "utf8").slice(0, 24_000);
    const prompt = [
      "A website was scanned for a screen-recording tutorial. SITE MAP (pages, headings, buttons, menu links, fields):",
      map,
      "",
      ...(goal ? ["WHAT THE USER WANTS THE TUTORIAL TO SHOW (priority):", goal, ""] : []),
      "Propose 5-8 tutorial steps in the order a new user would follow them.",
      "- One step per line, a short imperative sentence in English that names the real page, button or field from the map. No numbering.",
      "- Only steps that are possible from the map (do not invent pages, buttons or features). Skip logout and destructive actions.",
      "- Start on the first page; end on the most useful page.",
      "",
      'Reply with ONLY {"steps":"<the steps, separated by line breaks>"}',
    ].join("\n");
    const r = (await claudeJson(stub, prompt, "light")) as { steps?: unknown };
    const steps = typeof r?.steps === "string" ? r.steps.trim() : "";
    if (steps.length < 10) throw new Error("The AI returned no steps. Try again or write the steps yourself.");
    return NextResponse.json({ steps: steps.slice(0, 2000) });
  } catch (e) {
    return NextResponse.json({ error: `Could not explore the site: ${(e as Error).message.split("\n")[0]}` }, { status: 502 });
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
}
