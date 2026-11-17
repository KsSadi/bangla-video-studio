/**
 * Style DNA: a compact, reusable description of a reference video's look-and-feel, expressed in the SAME vocabulary the
 * scene engine understands (colours, backgrounds, transitions, caption style, pacing). Pure TS (no React/Node):
 *   - dominantColors / pacing maths run on numbers measured by ffmpeg, so they cost zero tokens
 *   - normalizeDna validates whatever Claude returns (and fills gaps from the measurements)
 *   - applyStyleDna stamps colours / accent / transitions onto a scene plan deterministically
 */
import { BACKGROUNDS, TRANSITIONS, type ScenePlan } from "./plan.ts";

export const PACING = ["fast", "medium", "slow"] as const;
export type Pacing = (typeof PACING)[number];
export const CAPTION_THEMES = ["kinetic", "pill", "glow", "classic"] as const;
export const ZOOM_STYLES = ["none", "gentle", "punchy"] as const;
export const PLACEMENTS = ["top", "center", "bottom"] as const;

/** What ffmpeg measured (no AI involved). */
export type StyleMeasure = {
  durationSec: number;
  width: number;
  height: number;
  cuts: number;
  avgShotSec: number;
  pacing: Pacing;
  palette: string[]; // 3-5 dominant colours, darkest first
  brightness: "dark" | "mid" | "light";
  saturation: "muted" | "balanced" | "vivid";
};

export type StyleDna = {
  version: 1;
  name: string;
  measured: StyleMeasure;
  look: {
    vibe: string; // one short line: the aesthetic in words
    colors: [string, string, string]; // scene gradient: dark, mid, glow
    accent: string;
    bgs: (typeof BACKGROUNDS)[number][]; // preferred animated backgrounds
    transitions: (typeof TRANSITIONS)[number][];
    transitionSpeed: "fast" | "medium" | "slow";
    textPlacement: (typeof PLACEMENTS)[number];
    captionStyle: (typeof CAPTION_THEMES)[number];
    captionPosition: "bottom" | "center";
    sceneSeconds: number; // target average scene length
    zoomStyle: (typeof ZOOM_STYLES)[number];
    notes: string; // layout framing / composition hints
  };
};

// ---------------------------------------------------------------- colour maths
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
export const fromHex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const saturationOf = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

/**
 * Median-cut quantisation of an RGB byte buffer (3 bytes per pixel) into up to `k` representative colours,
 * most common first, near-duplicates merged. Deterministic.
 */
export function dominantColors(rgb: Uint8Array | number[], k = 5): string[] {
  const px: [number, number, number][] = [];
  for (let i = 0; i + 2 < rgb.length; i += 3) px.push([rgb[i], rgb[i + 1], rgb[i + 2]]);
  if (!px.length) return [];
  let boxes: [number, number, number][][] = [px];
  while (boxes.length < k * 2) {
    // split the box with the widest channel range
    let bi = -1;
    let range = 0;
    let ch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const p of b) {
          lo = Math.min(lo, p[c]);
          hi = Math.max(hi, p[c]);
        }
        if (hi - lo > range) {
          range = hi - lo;
          bi = i;
          ch = c;
        }
      }
    });
    if (bi < 0 || range < 8) break;
    const b = boxes[bi].slice().sort((a, c) => a[ch] - c[ch]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  const total = px.length;
  const swatches = boxes
    .map((b) => {
      const n = b.length;
      const avg = [0, 1, 2].map((c) => b.reduce((a, p) => a + p[c], 0) / n) as [number, number, number];
      return { avg, share: n / total };
    })
    .sort((a, b) => b.share - a.share);
  const out: { avg: [number, number, number]; share: number }[] = [];
  for (const s of swatches) {
    const near = out.find((o) => Math.hypot(o.avg[0] - s.avg[0], o.avg[1] - s.avg[1], o.avg[2] - s.avg[2]) < 38);
    if (near) near.share += s.share;
    else out.push({ ...s });
    if (out.length > k + 3) break;
  }
  return out
    .sort((a, b) => b.share - a.share)
    .slice(0, k)
    .map((s) => toHex(...s.avg));
}

/** Palette summary: darkest-first order plus overall brightness and saturation labels. */
export function summarizePalette(colors: string[]) {
  const sorted = [...colors].sort((a, b) => luma(...fromHex(a)) - luma(...fromHex(b)));
  const n = Math.max(1, sorted.length);
  const avgL = sorted.reduce((a, c) => a + luma(...fromHex(c)), 0) / n;
  const avgS = sorted.reduce((a, c) => a + saturationOf(...fromHex(c)), 0) / n;
  return {
    palette: sorted,
    brightness: (avgL < 70 ? "dark" : avgL < 160 ? "mid" : "light") as StyleMeasure["brightness"],
    saturation: (avgS < 0.25 ? "muted" : avgS < 0.55 ? "balanced" : "vivid") as StyleMeasure["saturation"],
  };
}

// ---------------------------------------------------------------- pacing
/** Cut timestamps (seconds, from ffmpeg scene detection) -> number of cuts and average shot length. */
export function pacingFromCuts(cutTimes: number[], durationSec: number): { cuts: number; avgShotSec: number; pacing: Pacing } {
  const cuts = cutTimes.filter((t) => t > 0.2 && t < durationSec - 0.2).length;
  const avgShotSec = durationSec > 0 ? Math.round((durationSec / (cuts + 1)) * 10) / 10 : 0;
  return { cuts, avgShotSec, pacing: avgShotSec < 2.5 ? "fast" : avgShotSec < 6 ? "medium" : "slow" };
}

/** Parse `pts_time:12.34` entries from ffmpeg showinfo output. */
export function parseCutTimes(lines: string[]): number[] {
  const out: number[] = [];
  for (const l of lines) {
    const m = l.match(/pts_time:([0-9.]+)/);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

// ---------------------------------------------------------------- validation
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const hex = (v: unknown): string | undefined => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);

/** Defaults derived purely from the measurements (also the full result when Claude is unavailable). */
export function dnaFromMeasure(name: string, m: StyleMeasure): StyleDna {
  const pal = m.palette.length ? m.palette : ["#0B1026", "#1E2A78", "#7C3AED"];
  const dark = pal[0];
  const mid = pal[Math.min(1, pal.length - 1)];
  const sat = [...pal].sort((a, b) => saturationOf(...fromHex(b)) - saturationOf(...fromHex(a)))[0];
  const fast = m.pacing === "fast";
  return {
    version: 1,
    name,
    measured: m,
    look: {
      vibe: `${m.brightness} ${m.saturation} palette, ${m.pacing} pacing`,
      colors: [dark, mid, sat],
      accent: sat,
      bgs: m.saturation === "vivid" ? ["particles", "gradient"] : ["gradient", "grid"],
      transitions: fast ? ["zoom", "slide-left", "wipe"] : m.pacing === "medium" ? ["slide-left", "fade", "zoom"] : ["fade", "slide-up"],
      transitionSpeed: m.pacing,
      textPlacement: "center",
      captionStyle: fast ? "kinetic" : "classic",
      captionPosition: "bottom",
      sceneSeconds: clamp(Math.round(m.avgShotSec * 2 * 10) / 10 || 6, 3, 14),
      zoomStyle: fast ? "punchy" : m.pacing === "medium" ? "gentle" : "none",
      notes: "",
    },
  };
}

/** Validate Claude's JSON; every missing or invalid field falls back to the measured defaults. Never throws. */
export function normalizeDna(raw: unknown, name: string, measured: StyleMeasure): StyleDna {
  const base = dnaFromMeasure(name, measured);
  if (!isObj(raw)) return base;
  const r = isObj(raw.look) ? raw.look : raw;
  const colors = (Array.isArray(r.colors) ? r.colors : []).map(hex).filter((c): c is string => !!c);
  const look = { ...base.look };
  look.vibe = text(r.vibe, 160) || look.vibe;
  if (colors.length >= 3) look.colors = [colors[0], colors[1], colors[2]];
  else if (colors.length === 2) look.colors = [colors[0], colors[1], base.look.colors[2]];
  look.accent = hex(r.accent) ?? look.accent;
  const bgs = (Array.isArray(r.bgs) ? r.bgs : []).map((b) => oneOf(b, BACKGROUNDS)).filter((b): b is (typeof BACKGROUNDS)[number] => !!b);
  if (bgs.length) look.bgs = [...new Set(bgs)].slice(0, 3);
  const tr = (Array.isArray(r.transitions) ? r.transitions : []).map((t) => oneOf(t, TRANSITIONS)).filter((t): t is (typeof TRANSITIONS)[number] => !!t);
  if (tr.length) look.transitions = [...new Set(tr)].slice(0, 4);
  look.transitionSpeed = oneOf(r.transitionSpeed, PACING) ?? look.transitionSpeed;
  look.textPlacement = oneOf(r.textPlacement, PLACEMENTS) ?? look.textPlacement;
  look.captionStyle = oneOf(r.captionStyle, CAPTION_THEMES) ?? look.captionStyle;
  look.captionPosition = oneOf(r.captionPosition, ["bottom", "center"] as const) ?? look.captionPosition;
  const secs = Number(r.sceneSeconds);
  if (Number.isFinite(secs) && secs > 0) look.sceneSeconds = clamp(Math.round(secs * 10) / 10, 2, 20);
  look.zoomStyle = oneOf(r.zoomStyle, ZOOM_STYLES) ?? look.zoomStyle;
  look.notes = text(r.notes, 240);
  return { version: 1, name, measured, look };
}

/** Is this a usable stored DNA object? (library files are untrusted too.) */
export function parseStoredDna(raw: unknown): StyleDna | null {
  if (!isObj(raw) || !isObj(raw.measured) || !isObj(raw.look)) return null;
  const m = raw.measured as Record<string, unknown>;
  const palette = (Array.isArray(m.palette) ? m.palette : []).map(hex).filter((c): c is string => !!c).slice(0, 6);
  const measured: StyleMeasure = {
    durationSec: Number(m.durationSec) || 0,
    width: Number(m.width) || 0,
    height: Number(m.height) || 0,
    cuts: Math.max(0, Math.floor(Number(m.cuts) || 0)),
    avgShotSec: Number(m.avgShotSec) || 0,
    pacing: oneOf(m.pacing, PACING) ?? "medium",
    palette,
    brightness: oneOf(m.brightness, ["dark", "mid", "light"] as const) ?? "dark",
    saturation: oneOf(m.saturation, ["muted", "balanced", "vivid"] as const) ?? "balanced",
  };
  return normalizeDna(raw, text(raw.name, 60) || "Style", measured);
}

// ---------------------------------------------------------------- applying a style
/** Rotate the palette so neighbouring scenes differ slightly while the whole video keeps one look. */
const rotate = <T,>(list: T[], i: number) => list[i % list.length];

/**
 * Stamp the style onto a plan: accent, gradient colours (per-scene variation around the style's own triple),
 * transitions (cycled from the style's set) and, when the plan left it open, backgrounds. Content is untouched.
 */
export function applyStyleDna(plan: ScenePlan, dna: StyleDna): ScenePlan {
  const [c0, c1, c2] = dna.look.colors;
  const variants: [string, string, string][] = [
    [c0, c1, c2],
    [c0, c2, c1],
    [c1, c0, c2],
  ];
  return {
    ...plan,
    accent: dna.look.accent,
    scenes: plan.scenes.map((s, i) => ({
      ...s,
      colors: rotate(variants, i),
      bg: s.bg ?? rotate(dna.look.bgs, i),
      transition: i === 0 ? s.transition : rotate(dna.look.transitions, i - 1),
    })),
  };
}

/** Compact text version for the planning prompt (a few dozen tokens). */
export function dnaPromptLines(dna: StyleDna): string[] {
  const l = dna.look;
  return [
    `STYLE DNA "${dna.name}" (match this reference look; colours/transitions are enforced by the studio, you match pacing and composition):`,
    `- vibe: ${l.vibe}`,
    `- target scene length ~${l.sceneSeconds}s (${dna.measured.pacing} cutting, ${l.transitionSpeed} transitions), zoom: ${l.zoomStyle}`,
    `- text placement: ${l.textPlacement}`,
    ...(l.notes ? [`- framing notes: ${l.notes}`] : []),
  ];
}
