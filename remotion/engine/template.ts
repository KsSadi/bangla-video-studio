/**
 * Reusable video templates. A template is the STRUCTURAL blueprint of a finished video (scene pacing as ratios of the
 * total length, background / colours / transition / camera per scene, which element types each scene has),
 * with the old audio, subtitles and all on-screen text stripped out. Applying it to a new voice is mostly deterministic:
 * the ratios are mapped onto the new cue timeline to make a "skeleton" plan, and Claude only fills in the content slots.
 * Pure TS (no React/Node) so it is unit-tested with the rest of the plan logic.
 */
import type { Cue } from "../lib/types.ts";
import { compactCues, normalizeScene, sceneSpans, type PlanElement, type PlanScene, type PlanZoom, type ScenePlan } from "./plan.ts";

export type SlotElement =
  | { type: "title"; hasSub: boolean }
  | { type: "icons"; count: number }
  | { type: "illustration"; name: string }
  | { type: "list"; count: number }
  | { type: "chart"; chart: string; count: number; unit?: string }
  | { type: "media"; frame?: string };

export type TemplateScene = {
  /** Start and end as fractions (0..1) of the video's total length. */
  from: number;
  to: number;
  bg?: PlanScene["bg"];
  colors?: string[];
  transition?: PlanScene["transition"];
  slots: SlotElement[];
  /** Camera emphasis, positions as fractions of the video length. */
  zoom?: { at: number; x: number; y: number; scale: number; hold: number }[];
};

export type TemplateBlueprint = {
  accent?: string;
  refDurationSec: number;
  avgSceneSec: number;
  scenes: TemplateScene[];
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Strip a finished plan down to its structure (no text, no audio, no subtitles). */
export function blueprintFromPlan(plan: ScenePlan, cues: Cue[], durationSec: number): TemplateBlueprint {
  const total = Math.max(1, durationSec);
  const spans = sceneSpans(plan, cues, durationSec);
  const scenes: TemplateScene[] = spans.map(({ scene, start, end }) => {
    const slots: SlotElement[] = [];
    for (const el of scene.elements) {
      if (el.type === "title") slots.push({ type: "title", hasSub: !!el.sub });
      else if (el.type === "icons") slots.push({ type: "icons", count: el.items.length });
      else if (el.type === "illustration") slots.push({ type: "illustration", name: el.name });
      else if (el.type === "list") slots.push({ type: "list", count: el.items.length });
      else if (el.type === "chart") slots.push({ type: "chart", chart: el.chart, count: el.values.length, ...(el.unit ? { unit: el.unit } : {}) });
      else if (el.type === "media") slots.push({ type: "media", ...(el.frame ? { frame: el.frame } : {}) });
      // "recording" (browser tutorials) is not templatable
    }
    const t: TemplateScene = { from: r4(start / total), to: r4(Math.min(1, end / total)), slots };
    if (scene.bg) t.bg = scene.bg;
    if (scene.colors) t.colors = scene.colors;
    if (scene.transition) t.transition = scene.transition;
    if (scene.zoom?.length) t.zoom = scene.zoom.map((z) => ({ at: r4(z.at / total), x: z.x, y: z.y, scale: z.scale, hold: z.hold }));
    return t;
  });
  return { ...(plan.accent ? { accent: plan.accent } : {}), refDurationSec: Math.round(durationSec * 10) / 10, avgSceneSec: Math.round((durationSec / Math.max(1, scenes.length)) * 10) / 10, scenes };
}

/**
 * Map a blueprint onto a new voice: each scene starts at the cue nearest its ratio (scenes stay in order and unique),
 * structural fields are copied, and every slot becomes a placeholder element the model must fill with real content.
 */
export function skeletonFromBlueprint(bp: TemplateBlueprint, cues: Cue[], durationSec: number): ScenePlan {
  const total = Math.max(1, durationSec);
  const scenes: PlanScene[] = [];
  let lastFrom = 0;
  bp.scenes.forEach((t, i) => {
    const time = t.from * total;
    // nearest cue start keeps the template's pacing ratios faithful (a scene never drifts by more than half a cue)
    let from = 1;
    if (i > 0) {
      let best = Infinity;
      cues.forEach((c, k) => {
        const d = Math.abs(c.start - time);
        if (d < best) {
          best = d;
          from = k + 1;
        }
      });
    }
    if (i > 0 && from <= lastFrom) return; // two template scenes collapsed onto the same cue: keep the earlier one
    if (from > cues.length) return;
    lastFrom = from;
    const placeholders: PlanElement[] = t.slots.length ? t.slots.map(placeholder) : [{ type: "title", text: "…" }];
    const zoom: PlanZoom[] = (t.zoom ?? []).map((z) => ({ at: Math.round(z.at * total * 100) / 100, x: z.x, y: z.y, scale: z.scale, hold: z.hold })).filter((z) => z.at < total);
    const scene: PlanScene = { id: `s${scenes.length + 1}`, fromCue: from, elements: placeholders };
    if (t.bg) scene.bg = t.bg;
    if (t.colors) scene.colors = t.colors;
    if (t.transition) scene.transition = t.transition;
    if (zoom.length) scene.zoom = zoom;
    scenes.push(scene);
  });
  if (!scenes.length) scenes.push({ id: "s1", fromCue: 1, elements: [{ type: "title", text: "…" }] });
  return { version: 1, ...(bp.accent ? { accent: bp.accent } : {}), scenes };
}

function placeholder(s: SlotElement): PlanElement {
  switch (s.type) {
    case "title":
      return { type: "title", text: "…", ...(s.hasSub ? { sub: "…" } : {}) };
    case "icons":
      return { type: "icons", items: Array.from({ length: Math.min(4, Math.max(1, s.count)) }, () => ({ icon: "star" })) };
    case "illustration":
      return { type: "illustration", name: (["laptop", "phone", "idea", "growth", "team"].includes(s.name) ? s.name : "idea") as "idea" };
    case "list":
      return { type: "list", items: Array.from({ length: Math.min(5, Math.max(1, s.count)) }, () => "…") };
    case "chart":
      return { type: "chart", chart: (["bar", "line", "progress"].includes(s.chart) ? s.chart : "bar") as "bar", values: Array.from({ length: Math.min(8, Math.max(1, s.count)) }, () => 1), ...(s.unit ? { unit: s.unit } : {}) };
    case "media":
      return { type: "title", text: "…" }; // media files belong to the old video: the new scene gets a title instead
  }
}

/** Human-readable slot, e.g. `title+sub`, `list(3)`, `chart(bar,4)`. */
export const elementSlot = (e: PlanElement): string =>
  e.type === "title" ? (e.sub ? "title+sub" : "title") : e.type === "icons" ? `icons(${e.items.length})` : e.type === "illustration" ? `illustration(${e.name})` : e.type === "list" ? `list(${e.items.length})` : e.type === "chart" ? `chart(${e.chart},${e.values.length}${e.unit ? `,${e.unit}` : ""})` : e.type;

/** Cue range of every skeleton scene (inclusive, 1-based). */
export function sceneCueRanges(plan: ScenePlan, cueCount: number): { id: string; from: number; to: number }[] {
  return plan.scenes.map((s, i) => ({ id: s.id, from: s.fromCue, to: (plan.scenes[i + 1]?.fromCue ?? cueCount + 1) - 1 }));
}

/** The compact "fill the slots" prompt body (structure is fixed; the model writes only the content). */
export function fillPromptBody(plan: ScenePlan, cues: Cue[]): string {
  const ranges = sceneCueRanges(plan, cues.length);
  const structure = plan.scenes.map((s, i) => {
    const slots = s.elements.map(elementSlot).join(", ");
    return `${s.id}|cues ${ranges[i].from}-${ranges[i].to}|${slots}`;
  });
  return ["SCENE SLOTS (id|cue range|elements to write, in order):", ...structure, "", "SUBTITLES (cue number|start second|Bengali text):", compactCues(cues)].join("\n");
}

/**
 * Merge model-written content into the skeleton. Structure (cue boundaries, background, colours, transition,
 * zoom) always comes from the skeleton; only `elements` come from the model, validated like any plan. A scene the
 * model skipped (or filled with nothing usable) gets a title from its first cue.
 */
export function fillSkeleton(skeleton: ScenePlan, raw: unknown, cues: Cue[]): ScenePlan {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { scenes?: unknown }).scenes) ? ((raw as { scenes: unknown[] }).scenes as Record<string, unknown>[]) : [];
  const scenes = skeleton.scenes.map((s) => {
    const got = list.find((x) => x && x.id === s.id);
    const norm = got ? normalizeScene({ id: s.id, fromCue: s.fromCue, elements: got.elements }, cues.length) : null;
    const elements = norm?.elements.length ? norm.elements : [{ type: "title" as const, text: (cues[s.fromCue - 1]?.text ?? "").split(/\s+/).slice(0, 6).join(" ") || "…" }];
    return { ...s, elements };
  });
  return { ...skeleton, scenes };
}

/** Zero-token fallback when the model is unavailable: one title per scene taken from the cue text. */
export const fallbackFill = (skeleton: ScenePlan, cues: Cue[]): ScenePlan => fillSkeleton(skeleton, null, cues);
