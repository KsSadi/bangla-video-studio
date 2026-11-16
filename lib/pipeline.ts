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
import { applyBroll, existingBroll } from "@/lib/broll";
import { REMOTION, renderLine } from "@/lib/render-util";
import { chunkSettings, renderChunked } from "@/lib/chunks";
import { getCharacterLook } from "@/lib/characters";
import { applyToCues } from "@/lib/dictionary-core";
import { extractDirections, mapDirections, type Direction } from "@/lib/directions";
import { getStyle } from "@/lib/styledna";
import { getTemplate } from "@/lib/templates";
import { loadDictionary } from "@/lib/dictionary";
import { PYTHON, claude, claudeJson, ffmpeg, node, remotionBrowserArgs, run, typecheckWithRepair, type RunOpts } from "@/lib/exec";
import { makeExtras } from "@/lib/extras";
import { enhanceVoice, ensureBgm, ensureSfx } from "@/lib/media";
import { buildFillPrompt, buildHealPrompt, buildPlanPrompt, buildPlanRevisePrompt, buildPrompt, buildRecordPrompt, buildRevisePrompt, buildScenePatchPrompt, type RecFailure } from "@/lib/prompts";
import { applyStyleDna } from "@/remotion/engine/styledna";
import { fillSkeleton, skeletonFromBlueprint } from "@/remotion/engine/template";
import { autoPlan, mergeScenes, normalizePlan, parseRevisionTarget, revisionSlice, tutorialPlan, type ScenePlan } from "@/remotion/engine/plan";
import { QUALITY_PRESETS, effectiveCaptions, type Quality, type StudioSettings } from "@/lib/settings";
import { ROOT, jobDir, log, previewPath, publicDir, resetSteps, saveJob, setProgress, setSrt, setStep, versionFile, versionsDir, type Job, type StepId, type StepState } from "@/lib/store";
import { parseSrt, toSrt, totalSeconds, type RecEvent, type VideoProps } from "@/remotion/lib/types";

const GENERATED = path.join(ROOT, "remotion", "generated", "Video.tsx");
const TEMPLATE = path.join(ROOT, "remotion", "template", "Video.tsx");
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");

export type RunInput = { settings: StudioSettings; srt: string; quality: Quality; password?: string };

// ---------------------------------------------------------------- transcribe
/** Turns transcribe.py output (PROGRESS/STAGE lines, Hugging Face download bars) into live step progress. */
function transcribeLine(job: Job) {
  let lastPct = -10;
  return (line: string) => {
    const p = line.match(/^PROGRESS (\d+)/);
    if (p) {
      const pct = Number(p[1]);
      setProgress(job, "transcribe", 8 + pct * 0.92, `Transcribing audio ${pct}%`);
      if (pct - lastPct >= 10) {
        log(job, `Transcribing… ${pct}%`);
        lastPct = pct;
      }
      return;
    }
    const st = line.match(/^STAGE (.+)/);
    if (st) {
      setProgress(job, "transcribe", undefined, st[1]);
      return log(job, st[1]);
    }
    const dl = line.match(/(\d+)%\|.*?\|\s*([\d.]+\w?)\/([\d.]+\w?)/);
    if (dl) {
      setProgress(job, "transcribe", Number(dl[1]) * 0.08, `Downloading Whisper model ${dl[1]}% (${dl[2]} / ${dl[3]})`);
      return;
    }
    if (!/HF_TOKEN|unauthenticated/.test(line)) log(job, line);
  };
}

export function startTranscribe(job: Job) {
  job.status = "running";
  job.srt = undefined;
  job.error = undefined;
  setStep(job, "transcribe", "active");
  const audio = path.join(publicDir(job.id), job.audioFile);
  const out = path.join(jobDir(job.id), "subtitles.whisper.srt");
  log(job, "Local Whisper (faster-whisper, language=bn). First run downloads the model once.");
  run(job, PYTHON, [path.join("scripts", "transcribe.py"), audio, out], { env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONWARNINGS: "ignore", HF_HUB_DISABLE_SYMLINKS_WARNING: "1" }, timeoutMs: 60 * 60_000, onLine: transcribeLine(job) })
    .then(() => {
      job.subtitlesSource = "whisper";
      let srt = fs.readFileSync(out, "utf8");
      const rules = loadDictionary();
      if (rules.length) {
        const fixed = applyToCues(parseSrt(srt), rules);
        if (fixed.count) {
          srt = toSrt(fixed.cues);
          log(job, `Auto-Replace Dictionary: ${fixed.count} replacement${fixed.count === 1 ? "" : "s"} in ${fixed.lines} line${fixed.lines === 1 ? "" : "s"}.`);
        }
      }
      setSrt(job, srt);
      setStep(job, "transcribe", "done");
      job.status = "idle";
      saveJob(job);
    })
    .catch((err: Error) => fail(job, "transcribe", err));
}

export const TTS_VOICES = {
  "bn-BD-NabanitaNeural": "Nabanita (female, Bangladesh)",
  "bn-BD-PradeepNeural": "Pradeep (male, Bangladesh)",
  "bn-IN-TanishaaNeural": "Tanishaa (female, West Bengal)",
  "bn-IN-BashkarNeural": "Bashkar (male, West Bengal)",
} as const;
export type TtsVoice = keyof typeof TTS_VOICES;

/**
 * Auto-Voice: synthesize the pasted Bengali script with edge-tts (free neural voices, no API key) AND build the exact
 * .srt from the voice's own word timings. Lines tagged "A:"/"B:" use two voices and become Dialogue Mode speakers.
 */
export function startTts(job: Job, input: { text: string; voice: TtsVoice; voiceB: TtsVoice; rate: string; pitch?: string }) {
  job.status = "running";
  job.srt = undefined;
  job.error = undefined;
  setStep(job, "transcribe", "active");
  setProgress(job, "transcribe", undefined, "Synthesizing Bengali voice");
  const dir = jobDir(job.id);
  const scriptFile = path.join(dir, "script.txt");
  // "[দৃশ্য ১: ...]" lines are scene directions: never spoken, handed to the scene planner instead.
  const { spoken, marks } = extractDirections(input.text);
  if (!spoken.trim()) {
    job.status = "idle";
    return fail(job, "transcribe", new Error("The script has only [scene directions] and no text to speak."));
  }
  fs.writeFileSync(scriptFile, spoken, "utf8");
  const dirFile = path.join(dir, "directions.json");
  fs.rmSync(dirFile, { force: true });
  if (marks.length) log(job, `${marks.length} scene direction${marks.length > 1 ? "s" : ""} found in [brackets]: not spoken, used to plan the visuals.`);
  const audio = path.join(publicDir(job.id), job.audioFile);
  const out = path.join(dir, "subtitles.tts.srt");
  log(job, `Auto-Voice (edge-tts): ${TTS_VOICES[input.voice]}${/^\s*[ab]\s*[:：]/im.test(input.text) ? ` + ${TTS_VOICES[input.voiceB]} for B lines` : ""}, speed ${input.rate}. Needs an internet connection; no API key.`);
  run(job, PYTHON, [path.join("scripts", "tts.py"), scriptFile, audio, out, "--voice", input.voice, "--voice-b", input.voiceB, "--rate", input.rate, "--pitch", input.pitch ?? "+0Hz"], {
    env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    timeoutMs: 30 * 60_000,
    onLine: (line) => {
      const p = line.match(/^PROGRESS (\d+)/);
      if (p) return setProgress(job, "transcribe", Number(p[1]), `Synthesizing voice ${p[1]}%`);
      const st = line.match(/^STAGE (.+)/);
      if (st) {
        setProgress(job, "transcribe", undefined, st[1]);
        return log(job, st[1]);
      }
      log(job, line);
    },
  })
    .then(() => {
      job.subtitlesSource = "tts";
      const srtText = fs.readFileSync(out, "utf8");
      if (marks.length) fs.writeFileSync(dirFile, JSON.stringify(mapDirections(marks, parseSrt(srtText).map((c) => c.text))), "utf8");
      setSrt(job, srtText);
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
export type Task = (step: (id: StepId, s: StepState) => void) => Promise<void>;
export function launch(job: Job, task: Task, doneMessage?: () => string) {
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
      log(job, doneMessage ? `✔ ${doneMessage()}` : `✔ v${job.versions[job.versions.length - 1]?.n} ready`);
    })
    .catch((err: Error) => fail(job, current, err));
}

function loadDirections(jobId: string, cueCount: number): Direction[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(jobDir(jobId), "directions.json"), "utf8")) as Direction[];
    return raw.filter((d) => d && typeof d.text === "string" && d.cue >= 1 && d.cue <= cueCount);
  } catch {
    return [];
  }
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
        const tpl = s.template ? getTemplate(s.template) : null;
        const dna = !tpl && s.styleDna ? (getStyle(s.styleDna)?.dna ?? null) : null;
        if (s.template && !tpl) log(job, "The selected template was not found; planning normally.");
        if (tpl) {
          // Template run: structure comes from the saved template (0 tokens); Claude only writes each scene's content.
          const skeleton = skeletonFromBlueprint(tpl.blueprint, ctx.cues, ctx.durationSec);
          log(job, `Template "${tpl.name}": ${skeleton.scenes.length} scenes mapped onto the new voice (${tpl.blueprint.scenes.length} in the original). Claude fills only the content.`);
          const raw = await claudeJson(job, buildFillPrompt({ settings: s, brand: loadBrand(), skeleton, cues: ctx.cues, templateName: tpl.name }), "heavy").catch((e: Error) => {
            log(job, `Filling the template failed (${e.message.split(String.fromCharCode(10))[0]}); using the script's own lines as titles.`);
            return null;
          });
          ctx.plan = fillSkeleton(skeleton, raw, ctx.cues);
        } else {
          if (dna) log(job, `Style DNA "${dna.name}": ${dna.look.vibe}; ~${dna.look.sceneSeconds}s scenes, ${dna.look.transitions.join("/")} transitions.`);
          const raw = await claudeJson(job, buildPlanPrompt({ settings: s, brand: loadBrand(), cues: ctx.cues, durationSec: ctx.durationSec, dna, directions: loadDirections(job.id, ctx.cues.length) }), "heavy").catch((e: Error) => {
            log(job, `Scene planning failed (${e.message.split(String.fromCharCode(10))[0]}).`);
            return null;
          });
          ctx.plan = normalizePlan(raw, ctx.cues.length) ?? undefined;
          if (!ctx.plan) {
            log(job, "No usable scene plan from Claude; using the built-in automatic plan so you still get a video.");
            ctx.plan = autoPlan(ctx.cues, s.character !== "none", dna?.look.sceneSeconds);
          }
          if (dna) ctx.plan = applyStyleDna(ctx.plan, dna);
        }
        log(job, `Scene plan: ${ctx.plan.scenes.length} scenes, ${JSON.stringify(ctx.plan).length} bytes of JSON.`);
        if (s.autoBroll) {
          const fetched = await applyBroll(ctx.plan, publicDir(job.id), jobDir(job.id), (l) => log(job, l));
          if (fetched.length) ctx.extra.media = [...(ctx.extra.media ?? []).filter((m) => !fetched.some((f) => f.src === m.src)), ...fetched];
        } else log(job, "Auto B-roll OFF: pure vector motion graphics.");
      }
      savePlan(job, ctx.plan);
      savePreview(job, ctx);
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

/**
 * Thumbnail + YouTube pack on demand for an existing version (any quality). Automatic runs only happen after Final HD
 * renders, so drafts skip them; this lets you generate them from whichever version you are looking at.
 */
export function startExtras(job: Job, input: RunInput & { baseVersion?: number }) {
  launch(
    job,
    async (step) => {
      const v = job.versions.find((x) => x.n === input.baseVersion) ?? job.versions[job.versions.length - 1];
      if (!v) throw new Error("Render a video first.");
      const cues = parseSrt(input.srt);
      if (!cues.length) throw new Error("Subtitles are empty or not valid SRT.");
      job.settings = input.settings;
      const s = input.settings.thumbnail || input.settings.metadata ? input.settings : { ...input.settings, thumbnail: true, metadata: true };
      for (const id of ["prepare", "plan", "record", "render"] as const) step(id, "skipped");
      step("extras", "active");
      log(job, `Thumbnail / YouTube pack from v${v.n} (${v.quality}).`);
      await makeExtras(job, { settings: s, cues, durationSec: Math.ceil((cues[cues.length - 1].end + 0.5) * 10) / 10, videoFile: versionFile(job.id, v.n) });
      step("extras", "done");
      saveJob(job);
    },
    () => "Thumbnail & YouTube pack ready",
  );
}

export function startRerender(job: Job, input: RunInput & { baseVersion?: number }) {
  launch(job, async (step) => {
    const src = restoreSource(job, input.baseVersion);
    if (!src) throw new Error("There is no generated video yet. Generate first.");
    const ctx = await prepare(job, input, step, src.engine);
    ctx.plan = src.plan;
    savePreview(job, ctx);
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
      savePreview(job, ctx);
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
export type Ctx = {
  settings: StudioSettings;
  quality: Quality;
  password?: string;
  cues: ReturnType<typeof parseSrt>;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  extra: Pick<VideoProps, "audioSrc" | "captionStyle" | "captionOpts" | "brand" | "bgmSrc" | "bgmVolume" | "sfx" | "media" | "lipsyncSrc" | "character" | "dialogue" | "characterB" | "lookA" | "lookB">;
  recording: Pick<VideoProps, "recordingSrc" | "events">;
  engine: "json" | "custom";
  plan?: ScenePlan;
};

/** The exact props the "Main" composition renders with (also saved as preview.json for the live preview and the Shorts clipper). */
export function buildProps(ctx: Ctx): VideoProps {
  const q = QUALITY_PRESETS[ctx.quality];
  return { cues: ctx.cues, durationSec: ctx.durationSec, width: ctx.width, height: ctx.height, fps: q.fps, ...ctx.extra, ...ctx.recording, ...(ctx.engine === "json" && ctx.plan ? { plan: ctx.plan } : {}) };
}

/** Save the planned video's props. The browser loads this into the live Remotion Player as soon as the plan exists. */
function savePreview(job: Job, ctx: Ctx) {
  if (ctx.engine !== "json" || !ctx.plan) return;
  try {
    fs.writeFileSync(previewPath(job.id), JSON.stringify(buildProps(ctx)));
    log(job, "Live preview ready: scrub and play it in the browser while the MP4 renders.");
  } catch {
    /* preview is optional */
  }
}

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
  if (s.autoBroll) for (const m of existingBroll(pub)) if (!media.some((x) => x.src === m.src)) media.push(m);
  if (!media.length) log(job, "No extra media assets: skipping B-roll.");

  // characters: built-in, auto, or looks saved in the Character Builder; optional second speaker (Dialogue Mode)
  let character = s.character;
  let lookA: VideoProps["lookA"];
  let lookB: VideoProps["lookB"];
  if (s.character === "custom") {
    lookA = getCharacterLook(s.customCharacter);
    if (!lookA) {
      log(job, "The selected custom character was not found in the library; using Storyteller instead.");
      character = "storyteller";
    }
  }
  const dialogue = s.dialogue && character !== "none";
  if (dialogue && s.characterB === "custom") {
    lookB = getCharacterLook(s.customCharacterB);
    if (!lookB) log(job, "Speaker B's custom character was not found; using Friendly Teacher.");
  }
  if (dialogue) log(job, `Dialogue Mode ON: two characters; the spotlight follows each cue's speaker (${job.srt ? "A/B tags from the timeline" : "A by default"}).`);

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
    extra: { audioSrc, captionStyle: effectiveCaptions(s), captionOpts: { size: s.captionSize, position: s.captionPosition }, brand, bgmSrc, bgmVolume: s.bgmVolume, sfx: s.sfx || undefined, media: media.length ? media : undefined, lipsyncSrc, character, ...(dialogue ? { dialogue: true, characterB: lookB || s.characterB === "custom" ? ("custom" as const) : s.characterB } : {}), ...(lookA ? { lookA } : {}), ...(lookB ? { lookB } : {}) },
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
    SELF_HEAL: ctx.settings.selfHeal ? "1" : "0",
  };
  const rec = () => node(job, script, [], { env: recEnv, timeoutMs: (ctx.durationSec + 120) * 1000 });
  await rec().catch(async (err: Error) => {
    log(job, "Recording script failed; asking Claude to fix it…");
    await claude(job, `The Playwright script ${rel(script)} failed. Fix it (keep using scripts/recorder.mjs helpers, read .claude/skills/browser-tutorial.md). Only edit that file.\n\nError:\n${err.message.slice(-3000)}`);
    await rec();
  });
  if (ctx.settings.selfHeal) {
    const readFailures = (): RecFailure[] => {
      try {
        const f = JSON.parse(fs.readFileSync(path.join(dir, "failures.json"), "utf8"));
        return Array.isArray(f) ? (f as RecFailure[]) : [];
      } catch {
        return [];
      }
    };
    const failed = readFailures();
    if (!failed.length) log(job, "Self-heal: every recorded action found its element.");
    else {
      log(job, `Self-heal: ${failed.length} action(s) failed (${failed.map((f) => `${f.action} "${f.label ?? f.target ?? "?"}"`).join(", ").slice(0, 200)}). Asking Claude to patch the selectors once…`);
      const patched = await claude(job, buildHealPrompt(job.id, failed), "light").then(
        () => true,
        (e: Error) => {
          log(job, `Self-heal patch failed (${e.message.split(String.fromCharCode(10))[0]}); keeping the first recording.`);
          return false;
        },
      );
      if (patched) {
        log(job, "Re-recording with the patched script…");
        await rec().catch((e: Error) => log(job, `Re-recording failed (${e.message.split(String.fromCharCode(10))[0]}); keeping the first recording.`));
        const left = readFailures();
        log(job, left.length ? `Self-heal: ${left.length} action(s) still failing; the video keeps going without them.` : "Self-heal: all actions succeeded after the patch.");
      }
    }
  }
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
  const props = buildProps(ctx);
  const propsFile = path.join(dir, "props.json");
  fs.writeFileSync(propsFile, JSON.stringify(props));

  step("render", "active");
  log(job, `${q.label}: ${ctx.width}x${ctx.height} @ ${q.fps}fps`);
  // Long videos: separate Remotion runs over frame ranges, stitched with ffmpeg (RAM + crash protection)
  const { chunkSec, minSec } = chunkSettings(process.env);
  const seconds = totalSeconds(props);
  const chunked = ctx.settings.chunkedRender && seconds > minSec;
  const render = () => {
    if (chunked) return renderChunked(job, { out, propsFile, publicDir: pub, crf: q.crf, fps: q.fps, totalFrames: Math.ceil(seconds * q.fps), chunkSec, workDir: path.join(dir, "chunks") });
    const opts: RunOpts = { timeoutMs: 60 * 60_000, onLine: renderLine(job) };
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
