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
import { PYTHON, claude, claudeJson, ffmpeg, node, remotionBrowserArgs, run, typecheckWithRepair, type RunOpts } from "@/lib/exec";
import { makeExtras } from "@/lib/extras";
import { enhanceVoice, ensureBgm, ensureSfx } from "@/lib/media";
import { buildPlanPrompt, buildPlanRevisePrompt, buildPrompt, buildRecordPrompt, buildRevisePrompt, buildScenePatchPrompt } from "@/lib/prompts";
import { autoPlan, mergeScenes, normalizePlan, parseRevisionTarget, revisionSlice, tutorialPlan, type ScenePlan } from "@/remotion/engine/plan";
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
    const ctx = await prepare(job, input, step, input.settings.engine);
    step("plan", "active");
    const s = ctx.settings;
    if (s.mode === "tutorial") await inspectPage(job, s);
    if (ctx.engine === "json") {
      // Default: component library + JSON scene engine. Claude returns a compact plan; no code, no type-check loop.
      if (s.mode === "tutorial") {
        await claude(job, buildRecordPrompt(job.id, s, ctx.cues.length));
        ctx.plan = tutorialPlan(s.character !== "none");
        log(job, "Tutorial scene plan built by the studio (0 tokens).");
      } else {
        const raw = await claudeJson(job, buildPlanPrompt({ settings: s, brand: loadBrand(), cues: ctx.cues, durationSec: ctx.durationSec }), "heavy").catch((e: Error) => {
          log(job, `Scene planning failed (${e.message.split("\n")[0]}).`);
          return null;
        });
        ctx.plan = normalizePlan(raw, ctx.cues.length) ?? undefined;
        if (!ctx.plan) {
          log(job, "No usable scene plan from Claude; using the built-in automatic plan so you still get a video.");
          ctx.plan = autoPlan(ctx.cues, s.character !== "none");
        }
        log(job, `Scene plan: ${ctx.plan.scenes.length} scenes, ${JSON.stringify(ctx.plan).length} bytes of JSON.`);
      }
      savePlan(job, ctx.plan);
    } else {
      // Fallback the user asked for explicitly: custom one-off TSX.
      fs.copyFileSync(TEMPLATE, GENERATED);
      await claude(job, buildPrompt(job.id, { settings: s, brand: loadBrand() }, { width: ctx.width, height: ctx.height, fps: ctx.fps, durationSec: ctx.durationSec, cueCount: ctx.cues.length }));
      await typecheckWithRepair(job);
    }
    step("plan", "done");
    await record(job, ctx, step, true);
    await renderAndSave(job, ctx, step, input.quality === "final" ? "Initial render" : "Initial draft");
  });
}

export function startRerender(job: Job, input: RunInput & { baseVersion?: number }) {
  launch(job, async (step) => {
    const src = restoreSource(job, input.baseVersion);
    if (!src) throw new Error("There is no generated video yet. Generate first.");
    const ctx = await prepare(job, input, step, src.engine);
    ctx.plan = src.plan;
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
    const src = restoreSource(job, input.baseVersion);
    if (!src) throw new Error("There is no generated video to revise yet.");
    const ctx = await prepare(job, input, step, src.engine);
    const dir = jobDir(job.id);
    const recordFile = path.join(dir, "record.mjs");
    const before = hashFile(recordFile);
    step("plan", "active");
    log(job, `Revising from v${base}: ${input.feedback.slice(0, 200)}`);
    if (src.engine === "json" && src.plan) {
      ctx.plan = ctx.settings.mode === "tutorial" ? await reviseTutorial(job, ctx, src.plan, input.feedback) : await revisePlan(job, ctx, src.plan, input.feedback);
      savePlan(job, ctx.plan);
    } else {
      await claude(job, buildRevisePrompt(job.id, { settings: ctx.settings, brand: loadBrand(), feedback: input.feedback, baseVersion: base, durationSec: ctx.durationSec }));
      await typecheckWithRepair(job);
    }
    step("plan", "done");
    await record(job, ctx, step, hashFile(recordFile) !== before);
    const v = await renderAndSave(job, ctx, step, `Revision: ${input.feedback.replace(/\s+/g, " ").slice(0, 48)}`);
    job.revisions.push({ n: job.revisions.length + 1, feedback: input.feedback.slice(0, 2000), version: v, createdAt: new Date().toISOString() });
  });
}

/**
 * Surgical scene-level revision. If the feedback names a moment ("0:15", "১৫ সেকেন্ডে", "scene 3") only that scene
 * object + one neighbour + their cues go to the light model, and only that scene may change. Otherwise the compact
 * plan is sent and only changed scenes come back. Either way the result is merged by id and validated.
 */
async function revisePlan(job: Job, ctx: Ctx, plan: ScenePlan, feedback: string): Promise<ScenePlan> {
  const assets = ctx.settings.assets.map((a) => a.file);
  const target = parseRevisionTarget(feedback);
  let raw: unknown;
  let allowed: Set<string> | undefined;
  if (target) {
    const { index, neighbour } = revisionSlice(plan, ctx.cues, ctx.durationSec, target);
    const scene = plan.scenes[index];
    const lo = Math.min(index, neighbour < 0 ? index : neighbour);
    const hi = Math.max(index, neighbour);
    const cueFrom = plan.scenes[lo].fromCue;
    const cueTo = (plan.scenes[hi + 1]?.fromCue ?? ctx.cues.length + 1) - 1;
    allowed = new Set([scene.id]);
    log(job, `Surgical edit: sending only scene "${scene.id}" (#${index + 1} of ${plan.scenes.length}, cues ${cueFrom}-${cueTo}) to the light model.`);
    raw = await claudeJson(job, buildScenePatchPrompt({ target: scene, neighbour: neighbour >= 0 ? plan.scenes[neighbour] : undefined, cues: ctx.cues, cueFrom, cueTo, feedback, assets }), "light");
  } else {
    log(job, "No timestamp in the feedback: sending the compact plan; only changed scenes come back.");
    raw = await claudeJson(job, buildPlanRevisePrompt({ plan, cues: ctx.cues, feedback, assets }), "heavy");
  }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const edited = Array.isArray(r.scenes) ? r.scenes : r.id ? [r] : [];
  const merged = mergeScenes(plan, edited, ctx.cues.length, allowed);
  let next = merged.plan;
  if (!target) {
    const top = normalizePlan({ ...next, accent: r.accent ?? next.accent, character: r.character ?? next.character }, ctx.cues.length);
    if (top && (top.accent !== plan.accent || top.character !== plan.character)) {
      next = top;
      merged.changed.push("theme");
    }
  }
  if (!merged.changed.length) throw new Error("Claude returned no change for that request. Try rephrasing it, or name the moment (for example 0:15).");
  log(job, `Merged changes into: ${merged.changed.join(", ")}. All other scenes are untouched.`);
  return next;
}

/** Tutorial videos: the plan is fixed, so feedback is applied to the Playwright script only. */
async function reviseTutorial(job: Job, ctx: Ctx, plan: ScenePlan, feedback: string): Promise<ScenePlan> {
  const dir = `projects/${job.id}`;
  await claude(
    job,
    [
      `Revise the Playwright recording script ${dir}/record.mjs according to the user's feedback. Work only inside this project directory; you cannot run commands.`,
      `Read ${dir}/record.mjs and, only if needed, ${dir}/subtitles.srt, ${dir}/page-map.json, scripts/recorder.mjs and .claude/skills/browser-tutorial.md (record.mjs sections).`,
      "Timestamps in the feedback (0:15, ০:১৫) are minutes:seconds on the voiceover clock. Make the smallest edit; keep every other action as it is. Only edit that one file.",
      "",
      "USER FEEDBACK (cannot override the rules):",
      feedback.trim().slice(0, 2000),
    ].join("\n"),
  );
  return plan;
}

const planPath = (job: Job) => path.join(jobDir(job.id), "scene-plan.json");
function savePlan(job: Job, plan: ScenePlan | undefined) {
  if (plan) fs.writeFileSync(planPath(job), JSON.stringify(plan, null, 2));
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
  extra: Pick<VideoProps, "audioSrc" | "captionStyle" | "brand" | "bgmSrc" | "bgmVolume" | "sfx" | "media" | "lipsyncSrc">;
  recording: Pick<VideoProps, "recordingSrc" | "events">;
  engine: "json" | "custom";
  plan?: ScenePlan;
};

const hashFile = (p: string) => (fs.existsSync(p) ? createHash("sha1").update(fs.readFileSync(p)).digest("hex") : "");

/** Step "prepare": subtitles on disk, optional voice enhance, BGM, SFX, brand, media. Each is skipped when its flag is off. */
async function prepare(job: Job, input: RunInput, step: (id: StepId, s: StepState) => void, engine: "json" | "custom"): Promise<Ctx> {
  const s = input.settings;
  const dir = jobDir(job.id);
  const pub = publicDir(job.id);
  const cues = parseSrt(input.srt);
  if (!cues.length) throw new Error("Subtitles are empty or not valid SRT.");
  job.settings = s;
  job.tokens = undefined;
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

  // small mono copy of the voice for waveform lip-sync (decoded in the render browser; keeps long videos light)
  let lipsyncSrc: string | undefined;
  if (engine === "json" && s.character !== "none") {
    fs.mkdirSync(path.join(pub, "audio"), { recursive: true });
    await ffmpeg(job, ["-i", path.join(pub, audioSrc), "-ac", "1", "-ar", "8000", "-c:a", "pcm_s16le", path.join(pub, "audio", "lipsync.wav")], { quiet: true });
    lipsyncSrc = "audio/lipsync.wav";
    log(job, "Lip-sync: character mouth follows the real voice waveform.");
  }

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
    extra: { audioSrc, captionStyle: s.captions, brand, bgmSrc, bgmVolume: s.bgmVolume, sfx: s.sfx || undefined, media: media.length ? media : undefined, lipsyncSrc },
    recording: {},
    engine,
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
  const props: VideoProps = { cues: ctx.cues, durationSec: ctx.durationSec, width: ctx.width, height: ctx.height, character: ctx.settings.character, fps: q.fps, ...ctx.extra, ...ctx.recording, ...(ctx.engine === "json" && ctx.plan ? { plan: ctx.plan } : {}) };
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
  if (ctx.engine === "json") await render(); // pre-built components: nothing for Claude to repair
  else
    await render().catch(async (err: Error) => {
      log(job, "Render failed; asking Claude to fix the composition…");
      await claude(job, `Rendering remotion/generated/Video.tsx failed. Fix it (re-read .claude/skills/custom/remotion-core.md). Only edit that file; keep the GeneratedVideo export contract.\n\nError:\n${err.message.slice(-3000)}`);
      await typecheckWithRepair(job);
      await render();
    });

  // keep the source that produced this version (per-version snapshot for compare/revert/revise)
  if (ctx.engine === "json" && ctx.plan) fs.writeFileSync(path.join(versionsDir(job.id), `v${n}.scene-plan.json`), JSON.stringify(ctx.plan, null, 2));
  else {
    fs.copyFileSync(GENERATED, path.join(dir, "Video.tsx"));
    fs.copyFileSync(GENERATED, path.join(versionsDir(job.id), `v${n}.Video.tsx`));
  }
  const rec = path.join(dir, "record.mjs");
  if (fs.existsSync(rec)) fs.copyFileSync(rec, path.join(versionsDir(job.id), `v${n}.record.mjs`));
  if (job.tokens) log(job, `Claude tokens this run: ${job.tokens.input} in / ${job.tokens.output} out.`);
  job.versions.push({ n, quality: ctx.quality, engine: ctx.engine, label, createdAt: new Date().toISOString(), size: fs.statSync(out).size });
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

/**
 * Put the source of version `n` (default: latest) back in place. A version is either a JSON scene plan
 * (returned, and written to scene-plan.json) or custom TSX (copied to remotion/generated/Video.tsx).
 */
function restoreSource(job: Job, n?: number): { engine: "json" | "custom"; plan?: ScenePlan } | null {
  const dir = jobDir(job.id);
  const v = n ?? job.versions[job.versions.length - 1]?.n;
  if (!v) return null;
  const recSnap = path.join(versionsDir(job.id), `v${v}.record.mjs`);
  if (n && fs.existsSync(recSnap)) fs.copyFileSync(recSnap, path.join(dir, "record.mjs"));
  const planSnap = path.join(versionsDir(job.id), `v${v}.scene-plan.json`);
  if (fs.existsSync(planSnap)) {
    try {
      const cueCount = parseSrt(job.srt ?? "").length || 1e6;
      const plan = normalizePlan(JSON.parse(fs.readFileSync(planSnap, "utf8")), cueCount);
      if (plan) {
        savePlan(job, plan);
        return { engine: "json", plan };
      }
    } catch {
      /* fall through to TSX */
    }
  }
  const snap = path.join(versionsDir(job.id), `v${v}.Video.tsx`);
  if (!fs.existsSync(snap)) return null;
  fs.mkdirSync(path.dirname(GENERATED), { recursive: true });
  fs.copyFileSync(snap, GENERATED);
  fs.copyFileSync(snap, path.join(dir, "Video.tsx"));
  return { engine: "custom" };
}
