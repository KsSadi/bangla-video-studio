/**
 * Optional post-render extras. Each is independent and skipped when its checkbox is off:
 *  - YouTube/social SEO pack (Claude writes copy; chapter timestamps are computed here from the SRT, never by the model)
 *  - auto-thumbnail (a frame of the video + bold Bengali headline, rendered as a Remotion still)
 */
import fs from "node:fs";
import path from "node:path";
import { brandLogoPath, loadBrand } from "@/lib/brand";
import { claudeJson, ffmpeg, node, remotionBrowserArgs } from "@/lib/exec";
import type { SeoPack, StudioSettings } from "@/lib/settings";
import { buildChapters } from "@/lib/chapters";
import { buildSeoPrompt } from "@/lib/prompts";
import { jobDir, log, publicDir, setProgress, thumbnailPath, type Job } from "@/lib/store";
import type { Cue } from "@/remotion/lib/types";

const strList = (v: unknown, max: number, len = 200) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, len)).slice(0, max) : []);
const str = (v: unknown, len: number) => (typeof v === "string" ? v.trim().slice(0, len) : "");

export async function makeExtras(job: Job, o: { settings: StudioSettings; cues: Cue[]; durationSec: number; videoFile: string }) {
  const dir = jobDir(job.id);
  const pub = publicDir(job.id);
  const brand = loadBrand();
  let raw: Record<string, unknown> = {};
  setProgress(job, "extras", undefined, "Writing titles, description and chapters");
  try {
    // light task: one no-tools turn on the light model (Haiku in Token Saver mode)
    raw = (await claudeJson(job, buildSeoPrompt(o.cues), "light")) as Record<string, unknown>;
  } catch (e) {
    log(job, `YouTube pack: Claude step failed (${(e as Error).message.split("\n")[0]}); using script-based fallbacks.`);
  }
  const fallbackHeadline = (o.cues[0]?.text ?? job.name).split(/\s+/).slice(0, 5).join(" ");
  const headline = str(raw.headline, 80) || fallbackHeadline;

  if (o.settings.metadata) {
    const picks = Array.isArray(raw.chapters) ? (raw.chapters as { cue?: unknown; title?: unknown }[]).map((c) => ({ cue: Number(c.cue), title: str(c.title, 80) })) : [];
    const chapters = buildChapters(picks, o.cues);
    const pack: SeoPack = {
      titlesBn: strList(raw.titlesBn, 5, 100),
      titlesEn: strList(raw.titlesEn, 5, 100),
      descriptionBn: str(raw.descriptionBn, 4000),
      descriptionEn: str(raw.descriptionEn, 4000),
      hashtags: strList(raw.hashtags, 15, 40).map((h) => (h.startsWith("#") ? h : `#${h}`)),
      headline,
      chapters,
    };
    job.seo = pack;
    fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(pack, null, 2));
    log(job, `YouTube pack ready (${chapters.length} chapters).`);
  }

  if (o.settings.thumbnail) {
    setProgress(job, "extras", undefined, "Rendering thumbnail.png");
    const frame = path.join(pub, "thumb-frame.jpg");
    await ffmpeg(job, ["-ss", String(Math.max(0.5, o.durationSec * 0.35)), "-i", o.videoFile, "-frames:v", "1", "-q:v", "2", frame], { quiet: true });
    let logoSrc: string | undefined;
    if (brand.hasLogo) {
      fs.mkdirSync(path.join(pub, "brand"), { recursive: true });
      fs.copyFileSync(brandLogoPath(), path.join(pub, "brand", "logo.png"));
      logoSrc = "brand/logo.png";
    }
    const propsFile = path.join(dir, "thumb-props.json");
    fs.writeFileSync(propsFile, JSON.stringify({ frameSrc: "thumb-frame.jpg", headline, channelName: brand.channelName, logoSrc, primary: brand.primary, secondary: brand.secondary }));
    await node(job, path.join("node_modules", "@remotion", "cli", "remotion-cli.js"), ["still", "remotion/index.ts", "Thumbnail", thumbnailPath(job.id), `--props=${propsFile}`, `--public-dir=${pub}`, "--log=error", ...remotionBrowserArgs()], { timeoutMs: 10 * 60_000, quiet: true });
    job.thumbnail = true;
    log(job, "thumbnail.png ready.");
  }
}
