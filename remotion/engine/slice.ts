/**
 * Deterministic "Long -> Shorts" slicing. Pure TS (no React, no AI): cut cues + scene plan to a time window and
 * validate clip suggestions. Used by the backend for BOTH the AI suggestions and manual timestamps, so a Short
 * never needs Claude to rewrite a plan or write code.
 */
import type { Cue } from "../lib/types.ts";
import { autoPlan, sceneSpans, type PlanScene, type ScenePlan } from "./plan.ts";

const BN = "০১২৩৪৫৬৭৮৯";
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "01:10", "1:02:03", "70", "70.5", "০১:১০" -> seconds. null when it is not a time. */
export function parseClock(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? input : null;
  if (typeof input !== "string") return null;
  const t = input.trim().replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));
  if (!/^\d+(?:\.\d+)?(?::[0-5]?\d(?:\.\d+)?){0,2}$/.test(t)) return null;
  const parts = t.split(":").map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

/** Cues inside [start,end), shifted so the clip starts at 0. `origin` = index of each kept cue in the source list. */
export function sliceCues(cues: Cue[], start: number, end: number): { cues: Cue[]; origin: number[] } {
  const out: Cue[] = [];
  const origin: number[] = [];
  const len = end - start;
  cues.forEach((c, i) => {
    if (c.end <= start + 0.2 || c.start >= end - 0.2) return;
    out.push({ ...c, start: r2(Math.max(0, c.start - start)), end: r2(Math.min(len, c.end - start)) });
    origin.push(i);
  });
  return { cues: out, origin };
}

export type ShortSlice = { plan: ScenePlan; cues: Cue[]; durationSec: number };

/**
 * Cut a plan + cues to [start,end). Scenes outside the window are dropped, scene boundaries move to the matching
 * (re-numbered) cue, and absolute `at` times on elements and zoom keyframes are shifted back by `start`.
 */
export function sliceShort(plan: ScenePlan, cues: Cue[], durationSec: number, start: number, end: number): ShortSlice {
  const s = Math.max(0, start);
  const e = Math.min(durationSec, end);
  const len = r2(e - s);
  const { cues: kept, origin } = sliceCues(cues, s, e);
  if (!kept.length) return { plan: autoPlan([{ start: 0, end: len, text: " " }]), cues: [], durationSec: len };

  const spans = sceneSpans(plan, cues, durationSec).filter((sp) => sp.end > s + 0.05 && sp.start < e - 0.05);
  const scenes: PlanScene[] = [];
  let lastFrom = 0;
  for (const sp of spans) {
    const edge = Math.max(sp.start, s) - 0.01;
    let from = origin.findIndex((o) => cues[o].start >= edge) + 1;
    if (from <= 0) from = kept.length; // no cue starts inside this scene: attach to the last cue
    if (scenes.length === 0) from = 1;
    if (from <= lastFrom) continue; // collapsed into the previous scene
    lastFrom = from;
    const shiftAt = <T extends { at?: number }>(el: T): T => {
      if (typeof el.at !== "number") return el;
      const at = r2(el.at - s);
      const { at: _drop, ...rest } = el;
      return at >= 0 && at < len ? ({ ...rest, at } as T) : (rest as T);
    };
    const next: PlanScene = { ...sp.scene, fromCue: from, elements: sp.scene.elements.map((el) => shiftAt(el as { at?: number }) as PlanScene["elements"][number]) };
    if (sp.scene.zoom) {
      const zoom = sp.scene.zoom.map((z) => ({ ...z, at: r2(z.at - s) })).filter((z) => z.at >= 0 && z.at < len);
      if (zoom.length) next.zoom = zoom;
      else delete next.zoom;
    }
    delete next.photo;
    scenes.push(next);
  }
  const out: ScenePlan = scenes.length ? { ...plan, scenes } : autoPlan(kept);
  return { plan: out, cues: kept, durationSec: len };
}

// ---------------------------------------------------------------- clip validation
export type ClipDraft = { start: number; end: number; hookTitle: string };
export const SHORT_MIN_SEC = 5;
export const SHORT_MAX_SEC = 180;

const nearest = (values: number[], target: number) => values.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), values[0] ?? target);
const cleanTitle = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 70) : "");

/** Manual clip: exact times, clamped to the video and to Shorts length limits. null when unusable. */
export function clampClip(startRaw: unknown, endRaw: unknown, durationSec: number, hookTitle?: unknown): ClipDraft | null {
  const a = parseClock(startRaw);
  const b = parseClock(endRaw);
  if (a === null || b === null) return null;
  const start = Math.min(a, durationSec);
  const end = Math.min(b, durationSec, start + SHORT_MAX_SEC);
  if (end - start < SHORT_MIN_SEC) return null;
  return { start: r2(start), end: r2(end), hookTitle: cleanTitle(hookTitle) };
}

/**
 * AI suggestions -> safe clips. Accepts `[...]` or `{clips:[...]}` items like {start:"01:10",end:"01:45",hookTitle:"..."}.
 * Starts snap to the nearest cue start, ends to the nearest cue end, length is kept 8-90 s, overlaps are dropped.
 */
export function normalizeClips(raw: unknown, cues: Cue[], durationSec: number, max = 3): ClipDraft[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { clips?: unknown }).clips) ? (raw as { clips: unknown[] }).clips : [];
  const starts = cues.map((c) => c.start);
  const ends = cues.map((c) => c.end);
  const out: ClipDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const a = parseClock(it.start);
    const b = parseClock(it.end);
    if (a === null || b === null || !cues.length) continue;
    let start = nearest(starts, a);
    let end = nearest(ends.filter((x) => x > start), b);
    if (!(end > start)) continue;
    if (end - start > 90) end = Math.max(...ends.filter((x) => x <= start + 90 && x > start), start + 90);
    if (end - start < 8) end = Math.min(durationSec, ends.find((x) => x >= start + 12) ?? start + 12);
    start = Math.max(0, start);
    end = Math.min(durationSec, end);
    if (end - start < SHORT_MIN_SEC) continue;
    const overlaps = out.some((o) => Math.min(o.end, end) - Math.max(o.start, start) > 0.3 * (end - start));
    if (overlaps) continue;
    out.push({ start: r2(start), end: r2(end), hookTitle: cleanTitle(it.hookTitle ?? it.title) });
    if (out.length >= max) break;
  }
  return out.sort((x, y) => x.start - y.start);
}
