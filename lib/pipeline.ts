/**
 * The studio pipeline. Four entry points, all background jobs that poll via /api/status:
 *   startTranscribe  whisper (skipped when the user uploads an .srt)
 *   startGenerate    prepare -> claude plan -> [record] -> render -> [extras]
 *   startRerender    render the existing code again at another quality (no Claude)
 *   startRevise      claude edits only what the feedback asks -> [re-record] -> render a new version
 * Optional features (voice enhance, BGM, SFX, brand, media, extras) are skipped cleanly when their flag is off.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { brandLogoPath, loadBrand } from "@/lib/brand";
import { PYTHON, claude, ffmpeg, node, remotionBrowserArgs, run, typecheckWithRepair, type RunOpts } from "@/lib/exec";
import { makeExtras } from "@/lib/extras";
import { enhanceVoice, ensureBgm, ensureSfx } from "@/lib/media";
import { buildPrompt, buildRevisePrompt } from "@/lib/prompts";
import { QUALITY_PRESETS, type Quality, type StudioSettings } from "@/lib/settings";
import { ROOT, jobDir, log, publicDir, resetSteps, saveJob, setSrt, setStep, versionFile, versionsDir, type Job, type StepId, type StepState } from "@/lib/store";
import { parseSrt, toSrt, type RecEvent, type VideoProps } from "@/remotion/lib/types";

const GENERATED = path.join(ROOT, "remotion", "generated", "Video.tsx");
const TEMPLATE = path.join(ROOT, "remotion", "template", "Video.tsx");
const REMOTION = path.join("node_modules", "@remotion", "cli", "remotion-cli.js");
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");

export type RunInput = { settings: StudioSettings; srt: string; quality: Quality; password?: string };

// ---------------------------------------------------------------- transcribe
export function startTranscribe(job: Job) {
  job.status = "running";
  job.srt = undefined;
  job.error = undefined;
  setStep(job, "transcribe", "active");
  const audio = path.join(publicDir(job.id), job.audioFile);
  const out = path.join(jobDir(job.id), "subtitles.whisper.srt");
  log(job, "Local Whisper (faster-whisper, language=bn). First run downloads the model once.");
  run(job, PYTHON, [path.join("scripts", "transcribe.py"), audio, out], { env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONWARNINGS: "ignore", HF_HUB_DISABLE_SYMLINKS_WARNING: "1" }, timeoutMs: 60 * 60_000 })
    .then(() => {
      job.subtitlesSource = "whisper";
      setSrt(job, fs.readFileSync(out, "utf8"));
      setStep(job, "transcribe", "done");
      job.status = "idle";
      saveJob(job);
    })
    .catch((err: Error) => fail(job, "transcribe", err));
}

/** The user supplied an .srt: Whisper is skipped entirely. */
export function useUploadedSrt(job: Job, srt: string) {
  job.subtitlesSource = "srt";
  setSrt(job, toSrt(parseSrt(srt)));
  setStep(job, "transcribe", "skipped");
  log(job, "Uploaded .srt loaded; Whisper skipped.");
  saveJob(job);
}

function fail(job: Job, step: StepId, err: Error) {
  setStep(job, step, "error");
  job.status = "error";
  job.error = err.message.slice(0, 2000);
  log(job, `✖ ${job.error}`);
  saveJob(job);
}

// ---------------------------------------------------------------- entry points
type Task = (step: (id: StepId, s: StepState) => void) => Promise<void>;
function launch(job: Job, task: Task) {
  job.status = "running";
  job.error = undefined;
  resetSteps(job);
  let current: StepId = "prepare";
  task((id, state) => {
    if (state === "active") current = id;
    setStep(job, id, state);
  })
    .then(() => {
      job.status = "done";
      job.videoReady = job.versions.length > 0;
      saveJob(job);
      log(job, `✔ v${job.versions[job.versions.length - 1]?.n} ready`);
    })
    .catch((err: Error) => fail(job, current, err));
}

export function startGenerate(job: Job, input: RunInput) {
  launch(job, async (step) => {
    const ctx = await prepare(job, input, step);
    step("plan", "active");
    if (ctx.settings.mode === "tutorial") await inspectPage(job, ctx.settings);
    fs.copyFileSync(TEMPLATE, GENERATED);
    await claude(job, buildPrompt(job.id, { settings: ctx.settings, brand: loadBrand() }, { width: ctx.width, height: ctx.height, fps: ctx.fps, durationSec: ctx.durationSec, cueCount: ctx.cues.length }));
    await typecheckWithRepair(job);
    step("plan", "done");
    await record(job, ctx, step, true);
    await renderAndSave(job, ctx, step, input.quality === "final" ? "Initial render" : "Initial draft");
  });
}

export function startRerender(job: Job, input: RunInput & { baseVersion?: number }) {
  launch(job, async (step) => {
    if (!restoreSource(job, input.baseVersion)) throw new Error("There is no generated video yet. Generate first.");
    const ctx = await prepare(job, input, step);
    step("plan", "skipped");
    // re-record only when rendering an older version whose browser script differs from the current recording
    const older = input.baseVersion !== undefined && input.baseVersion !== job.versions[job.versions.length - 1]?.n;
    await record(job, ctx, step, older);
    await renderAndSave(job, ctx, step, input.quality === "final" ? "Final HD render" : "Draft preview");
  });
}

export function startRevise(job: Job, input: RunInput & { feedback: string; baseVersion?: number }) {
  launch(job, async (step) => {
    const base = input.baseVersion ?? job.versions[job.versions.length - 1]?.n ?? 0;
    if (!restoreSource(job, input.baseVersion)) throw new Error("There is no generated video to revise yet.");
    const ctx = await prepare(job, input, step);
    const dir = jobDir(job.id);
    const recordFile = path.join(dir, "record.mjs");
    const before = hashFile(recordFile);
    step("plan", "active");
    log(job, `Revising from v${base}: ${input.feedback.slice(0, 200)}`);
    await claude(job, buildRevisePrompt(job.id, { settings: ctx.settings, brand: loadBrand(), feedback: input.feedback, baseVersion: base, durationSec: ctx.durationSec }));
    await typecheckWithRepair(job);
    step("plan", "done");
    await record(job, ctx, step, hashFile(recordFile) !== before);
    const v = await renderAndSave(job, ctx, step, `Revision: ${input.feedback.replace(/\s+/g, " ").slice(0, 48)}`);
    job.revisions.push({ n: job.revisions.length + 1, feedback: input.feedback.slice(0, 2000), version: v, createdAt: new Date().toISOString() });
  });
}

// ---------------------------------------------------------------- stages
type Ctx = {
  settings: StudioSettings;
  quality: Quality;
  password?: string;
  cues: ReturnType<typeof parseSrt>;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  extra: Pick<VideoProps, "audioSrc" | "captionStyle" | "brand" | "bgmSrc" | "bgmVolume" | "sfx" | "media">;
  recording: Pick<VideoProps, "recordingSrc" | "events">;
};

const hashFile = (p: string) => (fs.existsSync(p) ? createHash("sha1").update(fs.readFileSync(p)).digest("hex") : "");

/** Step "prepare": subtitles on disk, optional voice enhance, BGM, SFX, brand, media. Each is skipped when its flag is off. */
async function prepare(job: Job, input: RunInput, step: (id: StepId, s: StepState) => void): Promise<Ctx> {
  const s = input.settings;
  const dir = jobDir(job.id);
  const pub = publicDir(job.id);
  const cues = parseSrt(input.srt);
  if (!cues.length) throw new Error("Subtitles are empty or not valid SRT.");
  job.settings = s;
  setSrt(job, toSrt(cues));
  saveJob(job);

  step("prepare", "active");
  fs.cpSync(path.join(ROOT, "public", "fonts"), path.join(pub, "fonts"), { recursive: true });

  let audioSrc = job.audioFile;
  if (s.enhanceVoice) audioSrc = await enhanceVoice(job);
  else log(job, "Voice enhancer OFF: using the uploaded audio untouched.");

  const bgmSrc = s.bgm !== "none" ? await ensureBgm(job, s.bgm) : undefined;
  if (!bgmSrc) log(job, "Background music OFF.");
  if (s.sfx) await ensureSfx(job);

  const brandKit = loadBrand();
  let brand: VideoProps["brand"];
  if (s.showLogo || s.outro) {
    let logoSrc: string | undefined;
    if (brandKit.hasLogo) {
      fs.mkdirSync(path.join(pub, "brand"), { recursive: true });
      fs.copyFileSync(brandLogoPath(), path.join(pub, "brand", "logo.png"));
      logoSrc = "brand/logo.png";
    }
    if (!logoSrc && !brandKit.channelName) log(job, "Brand features are ON but the Brand Kit has no logo or channel name yet; the overlay will be mostly empty.");
    brand = { channelName: brandKit.channelName, primary: brandKit.primary, secondary: brandKit.secondary, logoSrc, showLogo: s.showLogo, outro: s.outro };
  } else log(job, "Logo watermark and outro OFF.");

  const media = s.assets
    .filter((a) => fs.existsSync(path.join(pub, "assets", a.file)))
    .map((a) => ({ src: `assets/${a.file}`, kind: a.kind, instruction: a.instruction }));
  if (!media.length) log(job, "No extra media assets: skipping B-roll.");

  const audioSec = Number(await run(job, "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(pub, audioSrc)], { quiet: true }).catch(() => "0"));
  const durationSec = Math.ceil(Math.max(audioSec || 0, cues[cues.length - 1].end + 0.5) * 10) / 10;
  const q = QUALITY_PRESETS[input.quality];
  const [w, h] = s.aspect === "9:16" ? [q.short, Math.round((q.short * 16) / 9 / 2) * 2] : [Math.round((q.short * 16) / 9 / 2) * 2, q.short];
  step("prepare", "done");
  fs.mkdirSync(dir, { recursive: true });
  return {
    settings: s,
    quality: input.quality,
    password: input.password,
    cues,
    width: w,
    height: h,
    fps: q.fps,
    durationSec,
    extra: { audioSrc, captionStyle: s.captions, brand, bgmSrc, bgmVolume: s.bgmVolume, sfx: s.sfx || undefined, media: media.length ? media : undefined },
    recording: {},
  };
}

async function inspectPage(job: Job, s: StudioSettings) {
  log(job, `Inspecting ${s.tutorialUrl} for selectors…`);
  await node(job, path.join("scripts", "inspect-page.mjs"), [s.tutorialUrl, path.join(jobDir(job.id), "page-map.json")], { timeoutMs: 90_000 }).catch((e: Error) =>
    log(job, `Page inspection failed (continuing with text locators): ${e.message.split("\n")[0]}`),
  );
}

/** Browser recording for tutorial mode. `fresh=false` reuses an existing recording. */
async function record(job: Job, ctx: Ctx, step: (id: StepId, s: StepState) => void, fresh: boolean) {
  const dir = jobDir(job.id);
  const pub = publicDir(job.id);
  const recMp4 = path.join(pub, "recording.mp4");
  const eventsFile = path.join(dir, "events.json");
  if (ctx.settings.mode !== "tutorial") return step("record", "skipped");
  const readEvents = () => {
    ctx.recording = { recordingSrc: "recording.mp4", events: JSON.parse(fs.readFileSync(eventsFile, "utf8")) as RecEvent[] };
  };
  if (!fresh && fs.existsSync(recMp4) && fs.existsSync(eventsFile)) {
    log(job, "Reusing the existing browser recording.");
    readEvents();
    return step("record", "skipped");
  }
  step("record", "active");
  const script = path.join(dir, "record.mjs");
  if (!fs.existsSync(script)) throw new Error(`Claude did not write ${rel(script)}`);
  const recEnv = {
    TUTORIAL_URL: ctx.settings.tutorialUrl,
    TUTORIAL_EMAIL: ctx.settings.tutorialEmail,
    TUTORIAL_PASSWORD: ctx.password ?? "", // env only: never written to disk or sent to the model
    JOB_DIR: dir,
    DURATION: String(ctx.durationSec),
  };
  const rec = () => node(job, script, [], { env: recEnv, timeoutMs: (ctx.durationSec + 120) * 1000 });
  await rec().catch(async (err: Error) => {
    log(job, "Recording script failed; asking Claude to fix it…");
    await claude(job, `The Playwright script ${rel(script)} failed. Fix it (keep using scripts/recorder.mjs helpers, read .claude/skills/browser-tutorial.md). Only edit that file.\n\nError:\n${err.message.slice(-3000)}`);
    await rec();
  });
  log(job, "Converting recording to MP4…");
  await ffmpeg(job, ["-i", path.join(dir, "recording.webm"), "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-r", "30", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", recMp4]);
  readEvents();
  step("record", "done");
}

/** Render the composition to versions/vN.mp4, snapshot its source, then run optional extras (final renders only). Returns N. */
async function renderAndSave(job: Job, ctx: Ctx, step: (id: StepId, s: StepState) => void, label: string): Promise<number> {
  const dir = jobDir(job.id);
  const pub = publicDir(job.id);
  const n = (job.versions[job.versions.length - 1]?.n ?? 0) + 1;
  fs.mkdirSync(versionsDir(job.id), { recursive: true });
  const out = versionFile(job.id, n);
  const q = QUALITY_PRESETS[ctx.quality];
  const props: VideoProps = { cues: ctx.cues, durationSec: ctx.durationSec, width: ctx.width, height: ctx.height, character: ctx.settings.character, fps: q.fps, ...ctx.extra, ...ctx.recording };
  const propsFile = path.join(dir, "props.json");
  fs.writeFileSync(propsFile, JSON.stringify(props));

  step("render", "active");
  log(job, `${q.label}: ${ctx.width}x${ctx.height} @ ${q.fps}fps`);
  const render = () => {
    let last = "";
    const opts: RunOpts = {
      timeoutMs: 60 * 60_000,
      onLine: (line) => {
        // collapse the per-frame progress spam to one log line per 10%
        const m = line.match(/(\d+)%/);
        const frac = line.match(/(\d+)\/(\d+)/);
        const pct = m ? Number(m[1]) : frac ? (Number(frac[1]) / Math.max(1, Number(frac[2]))) * 100 : -1;
        const key = pct >= 0 ? `${line.replace(/[\d.,/]+/g, "").slice(0, 12)}${Math.floor(pct / 10)}` : line;
        if (key !== last) log(job, line);
        last = key;
      },
    };
    return node(job, REMOTION, ["render", "remotion/index.ts", "Main", out, `--props=${propsFile}`, `--public-dir=${pub}`, `--crf=${q.crf}`, "--log=info", ...remotionBrowserArgs()], opts);
  };
  await render().catch(async (err: Error) => {
    log(job, "Render failed; asking Claude to fix the composition…");
    await claude(job, `Rendering remotion/generated/Video.tsx failed. Fix it (re-read .claude/skills/remotion-core.md). Only edit that file; keep the GeneratedVideo export contract.\n\nError:\n${err.message.slice(-3000)}`);
    await typecheckWithRepair(job);
    await render();
  });

  // keep the source that produced this version (current + per-version snapshot for compare/revert)
  fs.copyFileSync(GENERATED, path.join(dir, "Video.tsx"));
  fs.copyFileSync(GENERATED, path.join(versionsDir(job.id), `v${n}.Video.tsx`));
  const rec = path.join(dir, "record.mjs");
  if (fs.existsSync(rec)) fs.copyFileSync(rec, path.join(versionsDir(job.id), `v${n}.record.mjs`));
  job.versions.push({ n, quality: ctx.quality, label, createdAt: new Date().toISOString(), size: fs.statSync(out).size });
  job.videoReady = true;
  saveJob(job);
  step("render", "done");

  const wantExtras = ctx.settings.thumbnail || ctx.settings.metadata;
  if (wantExtras && ctx.quality === "final") {
    step("extras", "active");
    await makeExtras(job, { settings: ctx.settings, cues: ctx.cues, durationSec: ctx.durationSec, videoFile: out }).catch((e: Error) => log(job, `Extras failed (video is fine): ${e.message.split("\n")[0]}`));
    step("extras", "done");
  } else {
    if (wantExtras) log(job, "Thumbnail / YouTube pack run on Final HD renders only; skipped for this draft.");
    step("extras", "skipped");
  }
  return n;
}

/** Put the source of version `n` (default: latest) back where the renderer and Claude expect it. */
function restoreSource(job: Job, n?: number): boolean {
  const dir = jobDir(job.id);
  const snap = n ? path.join(versionsDir(job.id), `v${n}.Video.tsx`) : path.join(dir, "Video.tsx");
  if (!fs.existsSync(snap)) return false;
  fs.mkdirSync(path.dirname(GENERATED), { recursive: true });
  fs.copyFileSync(snap, GENERATED);
  fs.copyFileSync(snap, path.join(dir, "Video.tsx"));
  if (n) {
    const recSnap = path.join(versionsDir(job.id), `v${n}.record.mjs`);
    if (fs.existsSync(recSnap)) fs.copyFileSync(recSnap, path.join(dir, "record.mjs"));
  }
  return true;
}
