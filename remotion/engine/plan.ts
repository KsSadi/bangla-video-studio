/**
 * scene-plan.json: the compact, declarative description of a whole video. Claude writes ONLY this JSON;
 * the pre-built component library + SceneEngine turn it into animation. Pure TS (no React) so the backend
 * validates, auto-generates and surgically edits plans with the same code the renderer uses.
 */
import type { Cue } from "../lib/types.ts";

export const EMOTIONS = ["happy", "explaining", "thinking", "excited"] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const BACKGROUNDS = ["gradient", "particles", "grid"] as const;
export const TRANSITIONS = ["fade", "slide-left", "slide-up", "zoom", "wipe"] as const;
export const CHARACTER_IDS = ["tech-mentor", "storyteller", "friendly-teacher"] as const;
export const ILLUSTRATIONS = ["laptop", "phone", "idea", "growth", "team"] as const;
export const CHARTS = ["bar", "line", "progress"] as const;
export const FRAMES = ["browser", "phone", "polaroid", "card"] as const;

export type PlanElement =
  | { type: "title"; text: string; sub?: string; at?: number }
  | { type: "icons"; items: { icon: string; label?: string }[]; at?: number }
  | { type: "illustration"; name: (typeof ILLUSTRATIONS)[number]; label?: string; at?: number }
  | { type: "list"; items: string[]; at?: number }
  | { type: "chart"; chart: (typeof CHARTS)[number]; values: number[]; labels?: string[]; unit?: string; highlight?: number; at?: number }
  | { type: "media"; src: string; frame?: (typeof FRAMES)[number]; caption?: string; at?: number }
  | { type: "recording" };

/** Camera emphasis inside a scene: zoom to (x,y) as 0..1 fractions of the frame at `at` seconds, hold, return. */
export type PlanZoom = { at: number; x: number; y: number; scale: number; hold: number };

export type PlanScene = {
  id: string;
  /** 1-based number of the first subtitle cue of this scene. Scene runs until the next scene's first cue. */
  fromCue: number;
  bg?: (typeof BACKGROUNDS)[number];
  colors?: string[];
  transition?: (typeof TRANSITIONS)[number];
  /** Omit for no character in this scene. */
  character?: { emotion: Emotion; side?: "left" | "right" | "center" };
  elements: PlanElement[];
  zoom?: PlanZoom[];
  /** Optional B-roll: 1-3 English search words. The studio fetches a public-domain/CC0 photo and adds it as a media element. */
  photo?: string;
};

export type ScenePlan = {
  version: 1;
  /** Which pre-built character to use when the user chose "Auto". */
  character?: (typeof CHARACTER_IDS)[number];
  accent?: string;
  scenes: PlanScene[];
};

// ---------------------------------------------------------------- validation
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
const optAt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? { at: Math.round(v * 100) / 100 } : {});

function element(raw: unknown): PlanElement | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case "title": {
      const text = str(raw.text, 120);
      return text ? { type: "title", text, ...(str(raw.sub, 160) ? { sub: str(raw.sub, 160) } : {}), ...optAt(raw.at) } : null;
    }
    case "icons": {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map((i) => (isObj(i) && str(i.icon, 40) ? { icon: str(i.icon, 40), ...(str(i.label, 40) ? { label: str(i.label, 40) } : {}) } : null))
        .filter((i): i is { icon: string; label?: string } => !!i)
        .slice(0, 4);
      return items.length ? { type: "icons", items, ...optAt(raw.at) } : null;
    }
    case "illustration": {
      const name = oneOf(raw.name, ILLUSTRATIONS);
      return name ? { type: "illustration", name, ...(str(raw.label, 60) ? { label: str(raw.label, 60) } : {}), ...optAt(raw.at) } : null;
    }
    case "list": {
      const items = (Array.isArray(raw.items) ? raw.items : []).map((i) => str(i, 80)).filter(Boolean).slice(0, 5);
      return items.length ? { type: "list", items, ...optAt(raw.at) } : null;
    }
    case "chart": {
      const values = (Array.isArray(raw.values) ? raw.values : []).filter((v): v is number => typeof v === "number" && Number.isFinite(v)).slice(0, 8);
      if (!values.length) return null;
      const labels = Array.isArray(raw.labels) ? raw.labels.map((l) => str(l, 24)).slice(0, values.length) : undefined;
      const highlight = typeof raw.highlight === "number" && raw.highlight >= 0 && raw.highlight < values.length ? Math.floor(raw.highlight) : undefined;
      return { type: "chart", chart: oneOf(raw.chart, CHARTS) ?? "bar", values, ...(labels?.length ? { labels } : {}), ...(str(raw.unit, 8) ? { unit: str(raw.unit, 8) } : {}), ...(highlight !== undefined ? { highlight } : {}), ...optAt(raw.at) };
    }
    case "media": {
      const src = str(raw.src, 120);
      if (!/^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(src)) return null;
      return { type: "media", src, ...(oneOf(raw.frame, FRAMES) ? { frame: oneOf(raw.frame, FRAMES) } : {}), ...(str(raw.caption, 80) ? { caption: str(raw.caption, 80) } : {}), ...optAt(raw.at) };
    }
    case "recording":
      return { type: "recording" };
    default:
      return null;
  }
}

/** Validate one untrusted scene object. Returns null if it has no usable id/fromCue. Never throws. */
export function normalizeScene(raw: unknown, cueCount: number): PlanScene | null {
  if (!isObj(raw)) return null;
  const fromCue = Math.floor(num(raw.fromCue, 1, Math.max(1, cueCount), NaN));
  if (!Number.isFinite(fromCue)) return null;
  const scene: PlanScene = { id: str(raw.id, 24).replace(/[^A-Za-z0-9_-]/g, "") || `s${fromCue}`, fromCue, elements: (Array.isArray(raw.elements) ? raw.elements : []).map(element).filter((e): e is PlanElement => !!e).slice(0, 3) };
  const bg = oneOf(raw.bg, BACKGROUNDS);
  if (bg) scene.bg = bg;
  const colors = (Array.isArray(raw.colors) ? raw.colors : []).map(hex).filter((c): c is string => !!c).slice(0, 3);
  if (colors.length >= 2) scene.colors = colors;
  const transition = oneOf(raw.transition, TRANSITIONS);
  if (transition) scene.transition = transition;
  if (isObj(raw.character)) {
    const side = oneOf(raw.character.side, ["left", "right", "center"] as const);
    scene.character = { emotion: oneOf(raw.character.emotion, EMOTIONS) ?? "explaining", ...(side ? { side } : {}) };
  }
  const zoom = (Array.isArray(raw.zoom) ? raw.zoom : [])
    .map((z) => (isObj(z) && typeof z.at === "number" ? { at: num(z.at, 0, 1e6, 0), x: num(z.x, 0, 1, 0.5), y: num(z.y, 0, 1, 0.5), scale: num(z.scale, 1, 3, 1.5), hold: num(z.hold, 0.3, 20, 2) } : null))
    .filter((z): z is PlanZoom => !!z)
    .slice(0, 6);
  if (zoom.length) scene.zoom = zoom;
  const photo = str(raw.photo, 40).replace(/[^A-Za-z0-9 ,'-]/g, "").trim();
  if (photo) scene.photo = photo;
  return scene;
}

/** Validate an untrusted plan. Scenes are sorted, de-duplicated per cue, and the first always starts at cue 1. Null if nothing usable. */
export function normalizePlan(raw: unknown, cueCount: number): ScenePlan | null {
  if (!isObj(raw) || !Array.isArray(raw.scenes)) return null;
  const seenCue = new Set<number>();
  const seenId = new Set<string>();
  const scenes = raw.scenes
    .map((s) => normalizeScene(s, cueCount))
    .filter((s): s is PlanScene => !!s)
    .sort((a, b) => a.fromCue - b.fromCue)
    .filter((s) => !seenCue.has(s.fromCue) && !!seenCue.add(s.fromCue))
    .slice(0, 200);
  if (!scenes.length) return null;
  scenes[0].fromCue = 1;
  for (const s of scenes) {
    while (seenId.has(s.id)) s.id += "x";
    seenId.add(s.id);
  }
  const plan: ScenePlan = { version: 1, scenes };
  const character = oneOf(raw.character, CHARACTER_IDS);
  if (character) plan.character = character;
  if (hex(raw.accent)) plan.accent = hex(raw.accent);
  return plan;
}

// ---------------------------------------------------------------- timing
export type SceneSpan = { scene: PlanScene; index: number; start: number; end: number };

/** Resolve scene times from cue numbers: first scene starts at 0, each ends where the next begins, last ends at durationSec. */
export function sceneSpans(plan: ScenePlan, cues: Cue[], durationSec: number): SceneSpan[] {
  const starts = plan.scenes.map((s, i) => (i === 0 ? 0 : (cues[Math.min(cues.length, s.fromCue) - 1]?.start ?? 0)));
  return plan.scenes.map((scene, index) => ({ scene, index, start: starts[index], end: Math.max(starts[index] + 0.1, starts[index + 1] ?? durationSec) }));
}

/** Index of the scene on screen at `sec`. */
export function sceneIndexAt(plan: ScenePlan, cues: Cue[], durationSec: number, sec: number): number {
  const spans = sceneSpans(plan, cues, durationSec);
  const i = spans.findIndex((s) => sec >= s.start && sec < s.end);
  return i >= 0 ? i : sec < 0 ? 0 : spans.length - 1;
}

// ---------------------------------------------------------------- zero-token plans
const PALETTES = [
  ["#0B1026", "#1E2A78", "#7C3AED"],
  ["#06202B", "#0F766E", "#22D3EE"],
  ["#2A0A1F", "#9D174D", "#F59E0B"],
  ["#111827", "#1D4ED8", "#34D399"],
];

/** Deterministic fallback plan (no AI): a new scene roughly every 7 s, headline taken from the cue text. */
export function autoPlan(cues: Cue[], withCharacter = true, sceneSec = 7): ScenePlan {
  const scenes: PlanScene[] = [];
  let last = -99;
  cues.forEach((c, i) => {
    if (i > 0 && c.start - last < sceneSec) return;
    last = c.start;
    const n = scenes.length;
    scenes.push({
      id: `s${n + 1}`,
      fromCue: i + 1,
      bg: BACKGROUNDS[n % BACKGROUNDS.length],
      colors: PALETTES[n % PALETTES.length],
      transition: TRANSITIONS[n % TRANSITIONS.length],
      ...(withCharacter ? { character: { emotion: EMOTIONS[n % EMOTIONS.length], side: n % 2 ? ("right" as const) : ("left" as const) } } : {}),
      elements: [{ type: "title", text: c.text.split(/\s+/).slice(0, 5).join(" ") }],
    });
  });
  return { version: 1, scenes: scenes.length ? scenes : [{ id: "s1", fromCue: 1, elements: [] }] };
}

/** Tutorial videos need no AI plan: one scene with the browser recording (auto-zoom comes from recorded click events). */
export function tutorialPlan(withCharacter: boolean): ScenePlan {
  return { version: 1, scenes: [{ id: "s1", fromCue: 1, bg: "grid", ...(withCharacter ? { character: { emotion: "explaining", side: "right" } } : {}), elements: [{ type: "recording" }] }] };
}

// ---------------------------------------------------------------- surgical revisions
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toAsciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/**
 * Find what a revision request points at. Understands "0:15", "০:১৫", "1:02:03", "15s", "15 sec", "১৫ সেকেন্ডে",
 * "scene 3", "দৃশ্য ৩". Returns seconds, a 1-based scene number, or null when the feedback is global.
 */
export function parseRevisionTarget(feedback: string): { sec: number } | { scene: number } | null {
  const f = toAsciiDigits(feedback).toLowerCase();
  const sc = f.match(/(?:scene|দৃশ্য|সিন)\s*#?\s*(\d{1,3})/);
  if (sc) return { scene: Number(sc[1]) };
  const hms = f.match(/(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)(?!\d)/);
  if (hms) return { sec: Number(hms[1] ?? 0) * 3600 + Number(hms[2]) * 60 + Number(hms[3]) };
  const s = f.match(/(\d{1,5}(?:\.\d+)?)\s*(?:s\b|sec|second|সেকেন্ড|সেকেণ্ড)/);
  if (s) return { sec: Number(s[1]) };
  const m = f.match(/(\d{1,3})\s*(?:min|minute|মিনিট)/);
  if (m) return { sec: Number(m[1]) * 60 };
  return null;
}

/** The slice sent to the model for a targeted edit: the target scene + one neighbour for context. */
export function revisionSlice(plan: ScenePlan, cues: Cue[], durationSec: number, target: { sec: number } | { scene: number }) {
  const index = "scene" in target ? Math.min(plan.scenes.length, Math.max(1, target.scene)) - 1 : sceneIndexAt(plan, cues, durationSec, target.sec);
  const neighbour = index + 1 < plan.scenes.length ? index + 1 : index - 1;
  return { index, neighbour: neighbour >= 0 && neighbour !== index ? neighbour : -1 };
}

/**
 * Merge model-edited scenes back into the plan by id. Only ids in `allowed` may change (others are ignored), a scene
 * keeps its fromCue unless it stays between its neighbours, and nothing can be deleted. Returns the ids that changed.
 */
export function mergeScenes(plan: ScenePlan, edited: unknown[], cueCount: number, allowed?: Set<string>): { plan: ScenePlan; changed: string[] } {
  const changed: string[] = [];
  const scenes = plan.scenes.map((old, i) => {
    const raw = edited.find((e) => isObj(e) && e.id === old.id);
    if (!raw || (allowed && !allowed.has(old.id))) return old;
    const next = normalizeScene(raw, cueCount);
    if (!next) return old;
    const lo = i === 0 ? 1 : plan.scenes[i - 1].fromCue + 1;
    const hi = i + 1 < plan.scenes.length ? plan.scenes[i + 1].fromCue - 1 : cueCount;
    if (i === 0 || next.fromCue < lo || next.fromCue > hi) next.fromCue = old.fromCue;
    next.id = old.id;
    if (JSON.stringify(next) !== JSON.stringify(old)) changed.push(old.id);
    return next;
  });
  return { plan: { ...plan, scenes }, changed };
}

/** Subtitle lines as the model sees them: `n|start|text` (one line each, no SRT overhead). */
export const compactCues = (cues: Cue[], from = 1, to = cues.length) =>
  cues
    .slice(from - 1, to)
    .map((c, i) => `${from + i}|${c.start.toFixed(1)}|${c.speaker ? `${c.speaker}: ` : ""}${c.text}`)
    .join("\n");
