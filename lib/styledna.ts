/**
 * Clone Style from Reference Video (backend).
 *   1. FFmpeg (local, zero tokens): 5 representative keyframes, dominant colours, average cut pacing
 *   2. claude -p looks at the keyframes + measurements and describes the aesthetic as a compact style-dna.json
 *      (if Claude is unavailable the measured defaults are used, so the feature never hard-fails)
 *   3. The DNA is saved to data/styles/ so any future project can apply it.
 */
import fs from "node:fs";
import path from "node:path";
import { claude, ffmpeg, run } from "@/lib/exec";
import { launch } from "@/lib/pipeline";
import { DATA_DIR, ROOT, jobDir, log, setProgress, type Job } from "@/lib/store";
import { dnaFromMeasure, dominantColors, normalizeDna, parseCutTimes, parseStoredDna, pacingFromCuts, summarizePalette, type StyleDna, type StyleMeasure } from "@/remotion/engine/styledna";

const STYLES_DIR = path.join(DATA_DIR, "styles");
const FRAMES = 5;
const ID_RE = /^style-[a-z0-9]{3,20}$/;

export type SavedStyle = { id: string; createdAt: string; dna: StyleDna; frames: number };

export const isStyleId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

export function listStyles(): SavedStyle[] {
  if (!fs.existsSync(STYLES_DIR)) return [];
  const out: SavedStyle[] = [];
  for (const f of fs.readdirSync(STYLES_DIR)) {
    const id = f.replace(/\.json$/, "");
    if (!f.endsWith(".json") || !isStyleId(id)) continue;
    const s = getStyle(id);
    if (s) out.push(s);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getStyle(id: string): SavedStyle | null {
  if (!isStyleId(id)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(STYLES_DIR, `${id}.json`), "utf8"));
    const dna = parseStoredDna(raw);
    if (!dna) return null;
    const dir = path.join(STYLES_DIR, id);
    const frames = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^f\d\.jpg$/.test(f)).length : 0;
    return { id, createdAt: String(raw.createdAt ?? ""), dna, frames };
  } catch {
    return null;
  }
}

export const styleFramePath = (id: string, n: number) => (isStyleId(id) && n >= 1 && n <= 9 ? path.join(STYLES_DIR, id, `f${Math.floor(n)}.jpg`) : "");

export function deleteStyle(id: string): boolean {
  if (!isStyleId(id) || !fs.existsSync(path.join(STYLES_DIR, `${id}.json`))) return false;
  fs.rmSync(path.join(STYLES_DIR, `${id}.json`), { force: true });
  fs.rmSync(path.join(STYLES_DIR, id), { recursive: true, force: true });
  return true;
}

function saveStyle(dna: StyleDna, framesDir: string): SavedStyle {
  fs.mkdirSync(STYLES_DIR, { recursive: true });
  const id = `style-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const dest = path.join(STYLES_DIR, id);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(framesDir).filter((x) => /^f\d\.jpg$/.test(x))) fs.copyFileSync(path.join(framesDir, f), path.join(dest, f));
  const createdAt = new Date().toISOString();
  fs.writeFileSync(path.join(STYLES_DIR, `${id}.json`), JSON.stringify({ ...dna, id, createdAt }, null, 2));
  return { id, createdAt, dna, frames: FRAMES };
}

/** Measure the reference with ffmpeg: size, 5 keyframes, dominant colours, scene-cut pacing. No AI. */
async function measure(job: Job, video: string, framesDir: string): Promise<StyleMeasure> {
  const probe = JSON.parse(await run(job, "ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", video], { quiet: true }));
  const durationSec = Number(probe.format?.duration) || 0;
  const width = Number(probe.streams?.[0]?.width) || 0;
  const height = Number(probe.streams?.[0]?.height) || 0;
  if (!durationSec) throw new Error("Could not read the reference video (is it a valid .mp4?).");

  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const pixels: Buffer[] = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = ((i + 0.5) / FRAMES) * durationSec;
    setProgress(job, "prepare", ((i + 1) / (FRAMES + 2)) * 100, `Extracting keyframe ${i + 1}/${FRAMES}`);
    await ffmpeg(job, ["-ss", t.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", path.join(framesDir, `f${i + 1}.jpg`)], { quiet: true });
    const raw = path.join(framesDir, `f${i + 1}.rgb`);
    await ffmpeg(job, ["-ss", t.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale=48:-2", "-f", "rawvideo", "-pix_fmt", "rgb24", raw], { quiet: true });
    pixels.push(fs.readFileSync(raw));
    fs.rmSync(raw, { force: true });
  }
  setProgress(job, "prepare", (FRAMES / (FRAMES + 2)) * 100, "Colour palette");
  const sum = summarizePalette(dominantColors(Buffer.concat(pixels), 5));

  setProgress(job, "prepare", ((FRAMES + 1) / (FRAMES + 2)) * 100, "Detecting cuts (pacing)");
  const lines: string[] = [];
  const scanSec = Math.min(durationSec, 180);
  await run(job, "ffmpeg", ["-hide_banner", "-nostats", "-i", video, "-t", String(scanSec), "-vf", "select='gt(scene,0.32)',showinfo", "-an", "-f", "null", "-"], { onLine: (l) => lines.push(l), timeoutMs: 10 * 60_000 });
  const pace = pacingFromCuts(parseCutTimes(lines), scanSec);
  return { durationSec: Math.round(durationSec * 10) / 10, width, height, ...pace, ...sum };
}

function buildStylePrompt(id: string, m: StyleMeasure) {
  const dir = `projects/${id}`;
  return [
    "You are a motion-design art director. Describe a reference video's look so another video can copy it exactly.",
    `1. Use the Read tool to look at these keyframes (evenly spaced through the video): ${Array.from({ length: FRAMES }, (_, i) => `${dir}/style-ref/f${i + 1}.jpg`).join(", ")}.`,
    `2. Measured by ffmpeg: palette (dark to light) ${m.palette.join(" ")}; ${m.brightness}, ${m.saturation}; ${m.cuts} cuts in ${Math.min(m.durationSec, 180)}s (average shot ${m.avgShotSec}s = ${m.pacing} pacing); frame ${m.width}x${m.height}.`,
    `3. Write ${dir}/style-dna.draft.json containing ONLY this JSON object and nothing else (no other file):`,
    '{ "vibe": "the aesthetic in one short line", "colors": ["#dark","#mid","#glow"], "accent": "#RRGGBB",',
    '  "bgs": ["gradient|particles|grid", ...], "transitions": ["fade|slide-left|slide-up|zoom|wipe", ...], "transitionSpeed": "fast|medium|slow",',
    '  "textPlacement": "top|center|bottom", "characterSide": "left|right|center|null", "captionStyle": "kinetic|pill|glow|classic", "captionPosition": "bottom|center",',
    '  "sceneSeconds": <typical seconds per scene>, "zoomStyle": "none|gentle|punchy", "notes": "layout / framing / text-placement hints, max 200 characters" }',
    "Rules: colors and accent must echo the real palette (dark first; on-screen text will be white). Pick transitions that match the cut style you see and the measured pacing. Do not run commands.",
  ].join("\n");
}

/** Background job: analyse `video`, save the style, delete the (large) reference file. */
export function startStyleClone(job: Job, video: string, name: string) {
  const dir = jobDir(job.id);
  const framesDir = path.join(dir, "style-ref");
  let saved: SavedStyle | null = null;
  launch(
    job,
    async (step) => {
      for (const id of ["record", "render", "extras"] as const) step(id, "skipped");
      step("prepare", "active");
      const m = await measure(job, video, framesDir);
      log(job, `Reference: ${m.durationSec}s ${m.width}x${m.height}, ${m.cuts} cuts (avg shot ${m.avgShotSec}s, ${m.pacing}), palette ${m.palette.join(" ")}, ${m.brightness}/${m.saturation}.`);
      step("prepare", "done");

      step("plan", "active");
      let dna: StyleDna = dnaFromMeasure(name, m);
      const draft = path.join(dir, "style-dna.draft.json");
      fs.rmSync(draft, { force: true });
      try {
        await claude(job, buildStylePrompt(job.id, m), "heavy");
        const raw = JSON.parse(fs.readFileSync(draft, "utf8"));
        dna = normalizeDna(raw, name, m);
        log(job, `Claude's read of the style: ${dna.look.vibe}`);
      } catch (e) {
        log(job, `Claude's aesthetic analysis was skipped (${(e as Error).message.split("\n")[0]}); using the measured style (palette + pacing).`);
      }
      fs.rmSync(draft, { force: true });
      fs.writeFileSync(path.join(dir, "style-dna.json"), JSON.stringify(dna, null, 2));
      saved = saveStyle(dna, framesDir);
      step("plan", "done");
      fs.rmSync(path.dirname(video), { recursive: true, force: true });
      fs.rmSync(framesDir, { recursive: true, force: true });
    },
    () => `Style "${saved?.dna.name ?? name}" saved (${saved?.id}).`,
  );
}

/** Where the uploaded reference clip is stored while it is analysed (kept apart from the extracted keyframes in style-ref/). */
export const styleRefDir = (jobId: string) => path.join(ROOT, "projects", jobId, "style-src");
