/**
 * Long -> Shorts clipper (backend). Two ways to get clips:
 *   AI    suggestShorts(): ONE tiny Haiku call that only reads the subtitles and returns timestamp ranges (JSON)
 *   manual addClip(): the user types start/end; ZERO tokens
 * Both then go through the same deterministic path: slice scene-plan + audio (remotion/engine/slice.ts + ffmpeg),
 * switch to 9:16 with the safe zones from .claude/skills/reels-shorts.md, and render locally with Remotion.
 */
import fs from "node:fs";
import path from "node:path";
import { ffmpeg, node, claudeJson, remotionBrowserArgs } from "@/lib/exec";
import { launch } from "@/lib/pipeline";
import { REMOTION, renderLine } from "@/lib/render-util";
import { QUALITY_PRESETS, type Quality, type ShortClip } from "@/lib/settings";
import { ROOT, log, previewPath, publicDir, saveJob, setProgress, shortFile, shortsDir, type Job } from "@/lib/store";
import { compactCues } from "@/remotion/engine/plan";
import { clampClip, normalizeClips, sliceShort, type ClipDraft } from "@/remotion/engine/slice";
import type { SafeZone, VideoProps } from "@/remotion/lib/types";

export const HAIKU = "claude-haiku-4-5";
const DEFAULT_SAFE: SafeZone = { top: 0.1, bottom: 0.22, left: 0.07, right: 0.14 };

/** Safe-zone numbers come from the skill file so they can be tuned without touching code. */
export function loadSafeZone(): SafeZone {
  try {
    const md = fs.readFileSync(path.join(ROOT, ".claude", "skills", "reels-shorts.md"), "utf8");
    const m = md.match(/```json safe-zone\s*([\s\S]*?)```/);
    const j = m ? JSON.parse(m[1]) : {};
    const f = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v < 0.4 ? v : d);
    return { top: f(j.top, DEFAULT_SAFE.top), bottom: f(j.bottom, DEFAULT_SAFE.bottom), left: f(j.left, DEFAULT_SAFE.left), right: f(j.right, DEFAULT_SAFE.right) };
  } catch {
    return DEFAULT_SAFE;
  }
}

/** The props of the last planned video (written next to the plan). Null until a scene plan exists. */
export function readPreview(job: Job): VideoProps | null {
  try {
    return JSON.parse(fs.readFileSync(previewPath(job.id), "utf8")) as VideoProps;
  } catch {
    return null;
  }
}

const nextN = (job: Job) => Math.max(0, ...job.shorts.map((c) => c.n)) + 1;

function pushClips(job: Job, drafts: ClipDraft[], source: ShortClip["source"]): ShortClip[] {
  const added: ShortClip[] = [];
  for (const d of drafts) {
    const n = nextN(job);
    const clip: ShortClip = { id: `short-${n}`, n, start: d.start, end: d.end, hookTitle: d.hookTitle, source, state: "ready", createdAt: new Date().toISOString() };
    job.shorts.push(clip);
    added.push(clip);
  }
  saveJob(job);
  return added;
}

/** Option B: manual timestamps. No AI. */
export function addClip(job: Job, base: VideoProps, start: unknown, end: unknown, hookTitle: unknown): ShortClip | string {
  const draft = clampClip(start, end, base.durationSec, hookTitle);
  if (!draft) return "Enter valid start and end times (for example 01:10 and 01:45), at least 5 seconds apart and inside the video.";
  return pushClips(job, [draft], "manual")[0];
}

/** Option A: ONE Haiku call. Claude only sees the subtitles and returns timestamp ranges; it never writes plans or code. */
export async function suggestShorts(job: Job, base: VideoProps): Promise<ShortClip[]> {
  const prompt = [
    "Pick the 3 best moments of this Bengali video for vertical Shorts / Reels / TikTok.",
    "Each moment: 20-60 seconds, self-contained (makes sense without the rest), starting on a strong hook (surprising fact, question, emotional or funny beat, clear tip). No overlaps.",
    'Reply with ONLY: {"clips":[{"start":"mm:ss","end":"mm:ss","hookTitle":"punchy Bengali hook, max 8 words"}]}',
    "",
    "NARRATION (cue number|start second|Bengali text):",
    compactCues(base.cues),
  ].join("\n");
  const raw = await claudeJson(job, prompt, "light", HAIKU);
  const drafts = normalizeClips(raw, base.cues, base.durationSec, 3);
  if (!drafts.length) throw new Error("Claude did not return usable moments. Try again, or add timestamps manually.");
  return pushClips(job, drafts, "ai");
}

export function deleteClip(job: Job, id: string): boolean {
  const clip = job.shorts.find((c) => c.id === id);
  if (!clip) return false;
  job.shorts = job.shorts.filter((c) => c.id !== id);
  fs.rmSync(shortFile(job.id, clip.n), { force: true });
  saveJob(job);
  return true;
}

/** Render the chosen clips one after another (background job; progress shows in the live monitor). */
export function startShorts(job: Job, ids: string[], quality: Quality, base: VideoProps) {
  const clips = job.shorts.filter((c) => ids.includes(c.id));
  const q = QUALITY_PRESETS[quality];
  const safeZone = loadSafeZone();
  let rendered = 0;
  launch(
    job,
    async (step) => {
      const pub = publicDir(job.id);
      step("prepare", "active");
      fs.mkdirSync(path.join(pub, "shorts"), { recursive: true });
      fs.mkdirSync(shortsDir(job.id), { recursive: true });
      step("prepare", "done");
      step("plan", "skipped");
      step("record", "skipped");
      step("extras", "skipped");
      step("render", "active");
      const [w, h] = [q.short, Math.round((q.short * 16) / 9 / 2) * 2];
      for (const [i, clip] of clips.entries()) {
        clip.state = "rendering";
        clip.error = undefined;
        const tag = `Short ${i + 1}/${clips.length}`;
        setProgress(job, "render", (i / clips.length) * 100, `${tag} · slicing`);
        try {
          if (!base.plan) throw new Error("No scene plan yet. Generate the video first.");
          const cut = sliceShort(base.plan, base.cues, base.durationSec, clip.start, clip.end);
          const audio = `shorts/short-${clip.n}.mp3`;
          const len = String(cut.durationSec);
          await ffmpeg(job, ["-ss", String(clip.start), "-t", len, "-i", path.join(pub, base.audioSrc), "-c:a", "libmp3lame", "-q:a", "3", path.join(pub, audio)], { quiet: true });
          const props: VideoProps = {
            ...base,
            width: w,
            height: h,
            fps: q.fps,
            audioSrc: audio,
            cues: cut.cues,
            plan: cut.plan,
            durationSec: cut.durationSec,
            safeZone,
            hookTitle: clip.hookTitle || undefined,
            recordingSrc: undefined,
            events: undefined,
            brand: base.brand ? { ...base.brand, outro: false } : undefined,
          };
          const propsFile = path.join(shortsDir(job.id), `short-${clip.n}.props.json`);
          fs.writeFileSync(propsFile, JSON.stringify(props));
          log(job, `${tag}: ${clip.start.toFixed(1)}s-${clip.end.toFixed(1)}s -> ${w}x${h} @ ${q.fps}fps`);
          const out = shortFile(job.id, clip.n);
          const onLine = renderLine(job, (pct, label) => setProgress(job, "render", ((i + pct / 100) / clips.length) * 100, `${tag} · ${label}`));
          await node(job, REMOTION, ["render", "remotion/index.ts", "Main", out, `--props=${propsFile}`, `--public-dir=${pub}`, `--crf=${q.crf}`, "--log=info", ...remotionBrowserArgs()], { timeoutMs: 30 * 60_000, onLine });
          clip.state = "done";
          clip.quality = quality;
          clip.size = fs.statSync(out).size;
          rendered++;
        } catch (e) {
          clip.state = "error";
          clip.error = (e as Error).message.split("\n").slice(0, 3).join(" ").slice(0, 300);
          log(job, `✖ ${tag} failed: ${clip.error}`);
        }
        saveJob(job);
      }
      step("render", "done");
      if (!rendered) throw new Error("No Short could be rendered. See the log above.");
    },
    () => `${rendered}/${clips.length} Short${clips.length === 1 ? "" : "s"} ready`,
  );
}
