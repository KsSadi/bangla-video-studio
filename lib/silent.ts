/** Silent videos: subtitle timing estimated from reading speed (no voice to measure). Pure (no Node imports). */
import type { Cue } from "../remotion/lib/types.ts";

export const SILENT_START = 0.5; // seconds before the first line
const GAP = 0.25; // seconds between lines
/** Seconds a line stays on screen: about 0.45 s per word + 1 s, never shorter than 2.5 s or longer than 9 s. */
export const readSeconds = (line: string, minSec = 2.5) => Math.min(Math.max(9, minSec), Math.max(minSec, 1 + 0.45 * line.trim().split(/\s+/).length));

/** One subtitle per non-empty line, laid out back to back. Edit the times later in the subtitle editor. */
export function cuesFromLines(text: string, minSec = 2.5): Cue[] {
  const cues: Cue[] = [];
  let t = SILENT_START;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const end = Math.round((t + readSeconds(line, minSec)) * 100) / 100;
    cues.push({ start: Math.round(t * 100) / 100, end, text: line });
    t = end + GAP;
  }
  return cues;
}
