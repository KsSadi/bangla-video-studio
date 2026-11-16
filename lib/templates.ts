/** Reusable templates (data/templates/<id>.json): the structure of a finished video, minus its audio, subtitles and text. */
import fs from "node:fs";
import path from "node:path";
import { getStyle } from "@/lib/styledna";
import { presetFromSettings, type StudioSettings } from "@/lib/settings";
import { DATA_DIR, jobDir, versionsDir, type Job } from "@/lib/store";
import { normalizePlan, type ScenePlan } from "@/remotion/engine/plan";
import { blueprintFromPlan, type TemplateBlueprint } from "@/remotion/engine/template";
import { parseStoredDna, type StyleDna } from "@/remotion/engine/styledna";
import { parseSrt } from "@/remotion/lib/types";

const DIR = path.join(DATA_DIR, "templates");
const ID_RE = /^tpl-[a-z0-9]{3,24}$/;

export type Template = {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  mode: StudioSettings["mode"];
  /** The workflow settings (character, music, captions, brand toggles...). Audio and subtitles are never stored. */
  settings: Partial<StudioSettings>;
  blueprint: TemplateBlueprint;
  styleDna?: StyleDna;
};

export type TemplateSummary = { id: string; name: string; createdAt: string; mode: string; scenes: number; avgSceneSec: number; refDurationSec: number; colors: string[]; ratios: [number, number][]; character: string; captions: string; bgm: string; style?: string };

export const isTemplateId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

export function getTemplate(id: string): Template | null {
  if (!isTemplateId(id)) return null;
  try {
    const t = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), "utf8"));
    if (!t || !t.blueprint || !Array.isArray(t.blueprint.scenes) || !t.blueprint.scenes.length) return null;
    return { ...t, id, settings: presetFromSettings(t.settings), styleDna: t.styleDna ? (parseStoredDna(t.styleDna) ?? undefined) : undefined } as Template;
  } catch {
    return null;
  }
}

export function listTemplates(): TemplateSummary[] {
  if (!fs.existsSync(DIR)) return [];
  const out: (TemplateSummary & { _t: string })[] = [];
  for (const f of fs.readdirSync(DIR)) {
    const t = f.endsWith(".json") ? getTemplate(f.slice(0, -5)) : null;
    if (!t) continue;
    const sc = t.blueprint.scenes;
    out.push({
      _t: t.createdAt,
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
      mode: t.mode,
      scenes: sc.length,
      avgSceneSec: t.blueprint.avgSceneSec,
      refDurationSec: t.blueprint.refDurationSec,
      colors: [...new Set(sc.flatMap((s) => s.colors ?? []))].slice(0, 5),
      ratios: sc.map((s) => [s.from, s.to] as [number, number]),
      character: String(t.settings.character ?? ""),
      captions: t.settings.captionsOn === false ? "off" : String(t.settings.captions ?? ""),
      bgm: String(t.settings.bgm ?? "none"),
      style: t.styleDna?.name,
    });
  }
  return out.sort((a, b) => b._t.localeCompare(a._t)).map(({ _t, ...rest }) => rest);
}

export function deleteTemplate(id: string): boolean {
  if (!isTemplateId(id) || !fs.existsSync(path.join(DIR, `${id}.json`))) return false;
  fs.rmSync(path.join(DIR, `${id}.json`), { force: true });
  return true;
}

/** The plan of the newest version (JSON engine), falling back to the last saved scene-plan.json. */
function currentPlan(job: Job): { plan: ScenePlan; durationSec: number } | { error: string } {
  if (job.settings.mode === "tutorial") return { error: "Browser-tutorial videos cannot be saved as templates (their plan is the recording)." };
  const cues = parseSrt(job.srt ?? "");
  if (!cues.length) return { error: "This project has no subtitles to measure the pacing from." };
  const latest = job.versions[job.versions.length - 1];
  const files = [latest ? path.join(versionsDir(job.id), `v${latest.n}.scene-plan.json`) : "", path.join(jobDir(job.id), "scene-plan.json")].filter(Boolean);
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const plan = normalizePlan(JSON.parse(fs.readFileSync(f, "utf8")), cues.length);
    if (plan) return { plan, durationSec: Math.max(cues[cues.length - 1].end + 0.5, 1) };
  }
  return { error: "Templates need a video made with the JSON scene engine (not the custom TSX engine)." };
}

/** Save the structural blueprint of a finished project. Same name (case-insensitive) updates that template. */
export function saveTemplate(job: Job, nameRaw: unknown): Template | { error: string } {
  const cur = currentPlan(job);
  if ("error" in cur) return cur;
  const name = (typeof nameRaw === "string" ? nameRaw.trim() : "").slice(0, 50) || job.name.slice(0, 50) || "My template";
  const cues = parseSrt(job.srt ?? "");
  const styleDna = job.settings.styleDna ? getStyle(job.settings.styleDna)?.dna : undefined;
  fs.mkdirSync(DIR, { recursive: true });
  const existing = listTemplates().find((t) => t.name.toLowerCase() === name.toLowerCase());
  const slug = name.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "tpl";
  const id = existing?.id ?? `tpl-${slug}${Math.random().toString(36).slice(2, 6)}`;
  const tpl: Template = {
    version: 1,
    id,
    name,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    mode: job.settings.mode,
    settings: presetFromSettings(job.settings),
    blueprint: blueprintFromPlan(cur.plan, cues, cur.durationSec),
    ...(styleDna ? { styleDna } : {}),
  };
  fs.writeFileSync(path.join(DIR, `${id}.json`), JSON.stringify(tpl, null, 2));
  return tpl;
}
