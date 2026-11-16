/** Pure timing helpers for the studio overlay (no React, testable with plain node). */
import { interpolate } from "remotion";
import type { Cue, RecEvent, SfxName, VideoProps } from "./lib/types";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0..1: 1 while the narrator speaks (with short ramps) so the music can duck underneath. */
export const speaking = (cues: Cue[], t: number) => {
  let v = 0;
  for (const c of cues) {
    if (t < c.start - 0.3 || t > c.end + 0.5) continue;
    v = Math.max(v, interpolate(t, [c.start - 0.3, c.start, c.end, c.end + 0.5], [0, 1, 1, 0], CLAMP));
  }
  return v;
};

/** Deterministic SFX schedule from the subtitle timeline: whooshes on scene-like gaps, pops on clicks, chime at the outro. */
export function sfxPlan(p: VideoProps): { at: number; name: SfxName; volume: number }[] {
  const out: { at: number; name: SfxName; volume: number }[] = [];
  let lastWhoosh = -99;
  p.cues.forEach((c, i) => {
    const gap = i === 0 ? 1 : c.start - p.cues[i - 1].end;
    if (i > 0 && gap >= 0.45 && c.start - lastWhoosh >= 5) {
      out.push({ at: Math.max(0, c.start - 0.25), name: "whoosh", volume: 0.5 });
      lastWhoosh = c.start;
    }
  });
  let lastPop = -99;
  for (const e of (p.events ?? []) as RecEvent[]) {
    if ((e.type === "click" || e.type === "type") && e.t - lastPop >= 0.6) {
      out.push({ at: e.t, name: "pop", volume: 0.45 });
      lastPop = e.t;
    }
  }
  if (p.brand?.outro) out.push({ at: p.durationSec + 0.2, name: "chime", volume: 0.6 });
  return out;
}

