export const FPS = 30;

/** One subtitle cue. Times are seconds on the voiceover timeline. */
export type Cue = { start: number; end: number; text: string };

export type CharacterId = "tech-mentor" | "storyteller" | "friendly-teacher" | "auto" | "none";

/** Logged by scripts/recorder.mjs. x/y/box are CSS px inside a vw x vh viewport. */
export type RecEvent = {
  t: number;
  type: "click" | "type" | "highlight" | "scroll" | "goto";
  x?: number;
  y?: number;
  box?: { x: number; y: number; w: number; h: number };
  label?: string;
  vw: number;
  vh: number;
};

/** Input props the backend passes to the "Main" composition. */
export type VideoProps = {
  audioSrc: string; // file name inside the job's public dir
  cues: Cue[];
  durationSec: number;
  width: number;
  height: number;
  character: CharacterId;
  recordingSrc?: string; // tutorial mode only
  events?: RecEvent[]; // tutorial mode only
};

/** Parse SRT text into cues. Tolerates CRLF, missing indexes and "." millisecond separators. */
export function parseSrt(srt: string): Cue[] {
  const toSec = (s: string) => {
    const [h, m, rest] = s.trim().split(":");
    return Number(h) * 3600 + Number(m) * 60 + Number(rest.replace(",", "."));
  };
  const cues: Cue[] = [];
  for (const block of srt.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    const text = lines.slice(i + 1).join(" ").trim();
    const start = toSec(a);
    const end = toSec(b);
    if (text && Number.isFinite(start) && Number.isFinite(end) && end > start) cues.push({ start, end, text });
  }
  return cues;
}

export function toSrt(cues: Cue[]): string {
  const ts = (sec: number) => {
    const ms = Math.max(0, Math.round(sec * 1000));
    const p = (n: number, l = 2) => String(n).padStart(l, "0");
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n");
}
