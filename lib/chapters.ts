/** Pure helpers for YouTube chapters (testable without Next/Node aliases). */
import type { Cue } from "../remotion/lib/types.ts";
import type { ChapterInfo } from "./settings.ts";

export const stamp = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const p = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`;
};

/** Turn the model's chapter picks (1-based cue numbers) into exact timestamps from the SRT. First chapter is forced to 00:00, min spacing 10 s (YouTube rule). */
export function buildChapters(picks: { cue: number; title: string }[], cues: Cue[]): ChapterInfo[] {
  const sorted = picks.filter((p) => Number.isInteger(p.cue) && p.cue >= 1 && p.cue <= cues.length && p.title).sort((a, b) => a.cue - b.cue);
  const out: ChapterInfo[] = [];
  let last = -99;
  for (const p of sorted) {
    const at = out.length === 0 ? 0 : cues[p.cue - 1].start;
    if (out.length > 0 && at - last < 10) continue;
    out.push({ time: stamp(at), title: p.title.slice(0, 80) });
    last = at;
  }
  if (out.length && out[0].time !== "00:00") out[0].time = "00:00";
  return out.length >= 3 ? out : [];
}

