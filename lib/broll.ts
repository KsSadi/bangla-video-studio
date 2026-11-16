/**
 * Optional B-roll auto-fetcher: public-domain / CC0 photos from the Wikimedia Commons API (free, no API key).
 * Claude only supplies a 1-3 word English query per scene (`scene.photo`); everything else is deterministic.
 * Never throws: a failed search just means that scene stays pure vector motion graphics.
 */
import fs from "node:fs";
import path from "node:path";
import type { MediaAsset } from "@/remotion/lib/types";
import type { PlanElement, ScenePlan } from "@/remotion/engine/plan";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "BanglaVideoStudio/1.0 (local open-source video tool)"; // generic client name; no personal details
const MAX_PHOTOS = 4;
const MAX_BYTES = 6_000_000;

export type BrollCredit = { file: string; sceneId: string; query: string; title: string; license: string; page: string };

type Page = {
  title?: string;
  imageinfo?: { url?: string; thumburl?: string; thumbwidth?: number; width?: number; height?: number; mime?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[];
};

/** CC0 / public domain only (so the video needs no attribution). */
export const isFreeLicense = (name: string) => /^(cc0|cc[- ]?zero|public domain|pd\b|pdm)/i.test(name.trim());

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  return res.json();
}

async function searchPhoto(query: string): Promise<{ url: string; title: string; license: string; page: string; ext: string } | null> {
  const qs = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1280",
  });
  const data = (await getJson(`${API}?${qs}`)) as { query?: { pages?: Record<string, Page> } };
  const pages = Object.values(data.query?.pages ?? {});
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info?.url || !/^image\/(jpeg|png)$/.test(info.mime ?? "")) continue;
    if ((info.width ?? 0) < 900 || (info.height ?? 0) < 500) continue;
    const license = info.extmetadata?.LicenseShortName?.value ?? "";
    if (!isFreeLicense(license)) continue;
    return { url: info.thumburl ?? info.url, title: (p.title ?? "").replace(/^File:/, ""), license, page: info.descriptionurl ?? "", ext: info.mime === "image/png" ? ".png" : ".jpg" };
  }
  return null;
}

async function download(url: string, dest: string): Promise<boolean> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return false;
  fs.writeFileSync(dest, buf);
  return true;
}

/**
 * For each scene with `photo`: search, download into <pub>/assets/ and add a `media` element.
 * Mutates `plan`; returns the media list to merge into VideoProps.media plus credits.
 */
export async function applyBroll(plan: ScenePlan, pubDir: string, jobDir: string, log: (line: string) => void): Promise<MediaAsset[]> {
  const wanted = plan.scenes.filter((s) => s.photo).slice(0, MAX_PHOTOS);
  if (!wanted.length) {
    log("Auto B-roll is ON but Claude did not ask for a photo in any scene.");
    return [];
  }
  fs.mkdirSync(path.join(pubDir, "assets"), { recursive: true });
  const media: MediaAsset[] = [];
  const credits: BrollCredit[] = [];
  for (const scene of wanted) {
    const q = scene.photo!;
    try {
      const hit = await searchPhoto(q);
      if (!hit) {
        log(`B-roll "${q}": no public-domain/CC0 match on Wikimedia Commons; scene stays vector.`);
        continue;
      }
      const file = `broll-${scene.id.replace(/[^A-Za-z0-9_-]/g, "")}${hit.ext}`;
      if (!(await download(hit.url, path.join(pubDir, "assets", file)))) {
        log(`B-roll "${q}": download failed; scene stays vector.`);
        continue;
      }
      const src = `assets/${file}`;
      if (scene.elements.length < 3) {
        const el: PlanElement = { type: "media", src, frame: credits.length % 2 ? "card" : "polaroid" };
        scene.elements.push(el);
      } else {
        const idx = scene.elements.findIndex((e) => e.type !== "title");
        if (idx >= 0) scene.elements[idx] = { type: "media", src, frame: "polaroid" };
      }
      media.push({ src, kind: "image", instruction: `B-roll for "${q}"` });
      credits.push({ file, sceneId: scene.id, query: q, title: hit.title, license: hit.license, page: hit.page });
      log(`B-roll "${q}": ${hit.title} (${hit.license})`);
    } catch (e) {
      log(`B-roll "${q}" skipped: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  if (credits.length) fs.writeFileSync(path.join(jobDir, "broll-credits.json"), JSON.stringify(credits, null, 2));
  return media;
}

/** B-roll files already downloaded for this project (so re-renders and revisions keep showing them). */
export function existingBroll(pubDir: string): MediaAsset[] {
  const dir = path.join(pubDir, "assets");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^broll-[A-Za-z0-9_-]+\.(jpg|png)$/.test(f))
    .map((f) => ({ src: `assets/${f}`, kind: "image" as const, instruction: "B-roll" }));
}
