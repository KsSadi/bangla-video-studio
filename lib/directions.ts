/**
 * Scene directions inside a script: "[দৃশ্য ১: একটি জমি ...]" lines are visual instructions, not words to speak.
 * They are removed before the voice is synthesised and later handed to the scene planner, anchored to the cue where they appear.
 */
export type Direction = { cue: number; text: string };

const BRACKET = /\[([^\[\]]{2,600})\]|【([^【】]{2,600})】/g;
const squash = (s: string) => s.replace(/\s+/g, "");

/** Splits a script into the text to speak and the directions, each with its position (non-space characters spoken before it). */
export function extractDirections(raw: string): { spoken: string; marks: { at: number; text: string }[] } {
  const marks: { at: number; text: string }[] = [];
  let spoken = "";
  let last = 0;
  for (const m of raw.matchAll(BRACKET)) {
    spoken += raw.slice(last, m.index);
    marks.push({ at: squash(spoken).length, text: (m[1] ?? m[2]).trim() });
    last = (m.index ?? 0) + m[0].length;
  }
  spoken += raw.slice(last);
  spoken = spoken.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { spoken, marks };
}

/** Maps each direction onto the (1-based) subtitle cue being spoken at that point of the script. */
export function mapDirections(marks: { at: number; text: string }[], cueTexts: string[]): Direction[] {
  if (!marks.length || !cueTexts.length) return [];
  const lens = cueTexts.map((t) => squash(t.replace(/^\[[AB]\]\s*/, "")).length);
  const total = Math.max(1, lens.reduce((a, b) => a + b, 0));
  const out: Direction[] = [];
  for (const mk of marks) {
    const pos = Math.min(total - 1, mk.at);
    let acc = 0;
    let cue = cueTexts.length;
    for (let i = 0; i < lens.length; i++) {
      if (pos < acc + lens[i]) {
        cue = i + 1;
        break;
      }
      acc += lens[i];
    }
    out.push({ cue, text: mk.text });
  }
  return out;
}

/** Prompt block for the scene planner. */
export function directionLines(dirs: Direction[]): string[] {
  if (!dirs.length) return [];
  return [
    "",
    "SCENE DIRECTIONS FROM THE AUTHOR (the visual to show; each starts at the given cue number and lasts until the next direction). Start a new scene at each direction and build that scene's illustration/elements/background around it. Keep these directions' meaning, but use only the allowed element types and illustrations:",
    ...dirs.map((d) => `- from cue ${d.cue}: ${d.text.slice(0, 300)}`),
  ];
}
