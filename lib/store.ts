/**
 * Project/job store. A "job" is the in-memory view of a project folder: projects/<id>/.
 * Everything that matters is persisted to projects/<id>/project.json on every state change, so any session
 * can be reopened later from the Recent Projects drawer.
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, sanitizeSettings, type ChapterInfo, type Quality, type RevisionInfo, type SeoPack, type StudioSettings, type VersionInfo } from "@/lib/settings";

export const ROOT = process.cwd();
export const PROJECTS_DIR = path.join(ROOT, "projects");
export const DATA_DIR = path.join(ROOT, "data"); // brand kit etc. (shared by all projects)

export type StepId = "transcribe" | "prepare" | "plan" | "record" | "render" | "extras";
export type StepState = "pending" | "active" | "done" | "error" | "skipped";
export type Step = { id: StepId; label: string; state: StepState };

export type Job = {
  id: string;
  name: string;
  createdAt: string;
  status: "idle" | "running" | "done" | "error";
  steps: Step[];
  logs: string[];
  audioFile: string;
  subtitlesSource: "whisper" | "srt" | "";
  srt?: string;
  settings: StudioSettings;
  versions: VersionInfo[];
  revisions: RevisionInfo[];
  seo?: SeoPack;
  thumbnail: boolean;
  error?: string;
  videoReady: boolean;
};

// Survive Next.js dev hot reloads.
const store = ((globalThis as { __studioJobs?: Map<string, Job> }).__studioJobs ??= new Map<string, Job>());

export const isJobId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9][a-z0-9-]{2,62}$/.test(id);
export const getJob = (id: unknown) => (isJobId(id) ? store.get(id) : undefined);
export const isBusy = () => [...store.values()].some((j) => j.status === "running");
export const jobDir = (id: string) => path.join(PROJECTS_DIR, id);
export const publicDir = (id: string) => path.join(jobDir(id), "public");
export const versionsDir = (id: string) => path.join(jobDir(id), "versions");
export const versionFile = (id: string, n: number) => path.join(versionsDir(id), `v${n}.mp4`);
export const thumbnailPath = (id: string) => path.join(jobDir(id), "thumbnail.png");

const STEP_LABELS: Record<StepId, string> = {
  transcribe: "Generating Bengali SRT",
  prepare: "Preparing Audio & Assets",
  plan: "Planning Scenes",
  record: "Recording Browser",
  render: "Rendering MP4",
  extras: "Thumbnail & YouTube Pack",
};
const freshSteps = (): Step[] => (Object.keys(STEP_LABELS) as StepId[]).map((id) => ({ id, label: STEP_LABELS[id], state: "pending" }));

const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function createJob(audioExt: string, rawName: string): Job {
  const name = rawName.trim().slice(0, 80) || "Untitled project";
  const id = `${slug(name) || "project"}-${Date.now().toString(36).slice(-5)}`;
  const job: Job = {
    id,
    name,
    createdAt: new Date().toISOString(),
    status: "idle",
    audioFile: `audio${audioExt}`,
    subtitlesSource: "",
    logs: [],
    videoReady: false,
    steps: freshSteps(),
    settings: { ...DEFAULT_SETTINGS },
    versions: [],
    revisions: [],
    thumbnail: false,
  };
  fs.mkdirSync(publicDir(id), { recursive: true });
  store.set(id, job);
  saveJob(job);
  return job;
}

export function saveJob(job: Job) {
  try {
    const file = path.join(jobDir(job.id), "project.json");
    const data = {
      id: job.id,
      name: job.name,
      createdAt: job.createdAt,
      updatedAt: new Date().toISOString(),
      audioFile: job.audioFile,
      subtitlesSource: job.subtitlesSource,
      settings: job.settings,
      versions: job.versions,
      revisions: job.revisions,
      seo: job.seo,
      thumbnail: job.thumbnail,
    };
    fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2));
    fs.renameSync(file + ".tmp", file);
  } catch {
    /* auto-save must never crash a pipeline */
  }
}

/** Write the subtitles to disk and remember them on the job. */
export function setSrt(job: Job, srt: string) {
  job.srt = srt;
  fs.writeFileSync(path.join(jobDir(job.id), "subtitles.srt"), srt, "utf8");
}

export function loadJob(id: string): Job | undefined {
  if (!isJobId(id)) return undefined;
  const live = store.get(id);
  if (live) return live;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(jobDir(id), "project.json"), "utf8"));
    const srtFile = path.join(jobDir(id), "subtitles.srt");
    const versions: VersionInfo[] = Array.isArray(d.versions) ? d.versions.filter((v: VersionInfo) => fs.existsSync(versionFile(id, v.n))) : [];
    const job: Job = {
      id,
      name: String(d.name ?? id),
      createdAt: String(d.createdAt ?? new Date().toISOString()),
      status: "idle",
      steps: freshSteps(),
      logs: [],
      audioFile: String(d.audioFile ?? ""),
      subtitlesSource: d.subtitlesSource === "srt" || d.subtitlesSource === "whisper" ? d.subtitlesSource : "",
      srt: fs.existsSync(srtFile) ? fs.readFileSync(srtFile, "utf8") : undefined,
      settings: sanitizeSettings(d.settings),
      versions,
      revisions: Array.isArray(d.revisions) ? d.revisions : [],
      seo: d.seo,
      thumbnail: !!d.thumbnail && fs.existsSync(thumbnailPath(id)),
      videoReady: versions.length > 0,
    };
    if (!job.audioFile || !fs.existsSync(path.join(publicDir(id), job.audioFile))) return undefined;
    store.set(id, job);
    return job;
  } catch {
    return undefined;
  }
}

export type ProjectSummary = { id: string; name: string; updatedAt: string; versions: number; mode: string; thumbnail: boolean };
export function listProjects(): ProjectSummary[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const out: ProjectSummary[] = [];
  for (const id of fs.readdirSync(PROJECTS_DIR)) {
    if (!isJobId(id)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, id, "project.json"), "utf8"));
      out.push({ id, name: String(d.name ?? id), updatedAt: String(d.updatedAt ?? ""), versions: Array.isArray(d.versions) ? d.versions.length : 0, mode: String(d.settings?.mode ?? ""), thumbnail: !!d.thumbnail });
    } catch {
      /* not a project folder */
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50);
}

export function resetSteps(job: Job, keepTranscribe = true) {
  for (const s of job.steps) if (!(keepTranscribe && s.id === "transcribe")) s.state = "pending";
}

export const log = (job: Job, line: string) => {
  const text = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trimEnd();
  if (!text) return;
  job.logs.push(`[${new Date().toLocaleTimeString("en-GB")}] ${text}`);
  if (job.logs.length > 3000) job.logs.splice(0, job.logs.length - 3000);
};

export const setStep = (job: Job, id: StepId, state: StepState) => {
  const step = job.steps.find((s) => s.id === id)!;
  step.state = state;
  if (state === "active") log(job, `▶ ${step.label}`);
};

export type { Quality, ChapterInfo };
