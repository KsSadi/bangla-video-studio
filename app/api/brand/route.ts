import fs from "node:fs";
import { NextResponse } from "next/server";
import { brandLogoPath, loadBrand, saveBrand } from "@/lib/brand";
import { DEFAULT_BRAND, isHexColor } from "@/lib/settings";

export const runtime = "nodejs";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** GET -> brand kit JSON. GET ?logo=1 -> logo.png. */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("logo")) {
    if (!fs.existsSync(brandLogoPath())) return new Response("No logo", { status: 404 });
    return new Response(fs.readFileSync(brandLogoPath()), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  }
  return NextResponse.json(loadBrand());
}

/** POST multipart { channelName, primary, secondary, logo? (PNG), removeLogo? } -> saved brand kit (persistent across projects). */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form." }, { status: 400 });
  const name = String(form.get("channelName") ?? "").trim().slice(0, 80);
  const primary = String(form.get("primary") ?? "");
  const secondary = String(form.get("secondary") ?? "");
  let logo: Buffer | "remove" | undefined;
  const f = form.get("logo");
  if (f instanceof File && f.size > 0) {
    if (f.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Logo must be under 5 MB." }, { status: 413 });
    const buf = Buffer.from(await f.arrayBuffer());
    if (!buf.subarray(0, 4).equals(PNG)) return NextResponse.json({ error: "Logo must be a PNG file." }, { status: 400 });
    logo = buf;
  } else if (form.get("removeLogo") === "1") logo = "remove";
  saveBrand({ channelName: name, primary: isHexColor(primary) ? primary : DEFAULT_BRAND.primary, secondary: isHexColor(secondary) ? secondary : DEFAULT_BRAND.secondary }, logo);
  return NextResponse.json(loadBrand());
}
