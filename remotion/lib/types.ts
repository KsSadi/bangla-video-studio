export const FPS = 30;

/** One subtitle cue. Times are seconds on the voiceover timeline. */
export type Cue = { start: number; end: number; text: string };

/** Fractions of the frame kept clear of platform UI (Reels / Shorts / TikTok). */
export type SafeZone = { top: number; bottom: number; left: number; right: number };

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

/**
 * Subtitle themes (Hind Siliguri / Noto Sans Bengali):
 *   kinetic  Viral Word-Pop: words pop in, the spoken word scales up in the accent colour (Reels / Shorts look)
 *   pill     Cinema Pill: dark frosted-glass pill with crisp white text
 *   glow     Gradient Glow: soft glow + gradient-coloured keyword
 *   classic  Minimalist Classic: clean bottom-aligned bar
 *   none     no on-screen captions (the .srt still drives scene timing)
 */
export type CaptionStyle = "kinetic" | "pill" | "glow" | "classic" | "none";
export type CaptionOpts = { size?: number; position?: "bottom" | "center" };

/** User media (public/assets/…) Claude should embed in animated frames at the requested moments. */
export type MediaAsset = { src: string; kind: "image" | "video"; instruction: string };

export type BrandProps = {
  channelName: string;
  primary: string;
  secondary: string;
  logoSrc?: string; // file inside the job's public dir
  showLogo: boolean; // corner watermark
  outro: boolean; // animated subscribe/follow outro appended after the voice ends
};

/** Seconds the optional outro adds after the voiceover. */
export const OUTRO_SEC = 4;

/** Input props the backend passes to the "Main" composition. All studio extras are optional; absent = off. */
export type VideoProps = {
  audioSrc: string; // file name inside the job's public dir
  cues: Cue[];
  durationSec: number;
  width: number;
  height: number;
  recordingSrc?: string; // tutorial mode only
  events?: RecEvent[]; // tutorial mode only
  fps?: number; // 30 for final renders, 15 for fast drafts (default 30)
  captionStyle?: CaptionStyle; // drawn by the studio overlay, never by the generated video
  captionOpts?: CaptionOpts; // font size multiplier (1 = default) and vertical position
  brand?: BrandProps;
  bgmSrc?: string; // background music file; the studio overlay loops and auto-ducks it
  bgmVolume?: number;
  silent?: boolean; // no voice: background music is not ducked under subtitles
  sfx?: boolean; // UI + transition sound effects (synthesized audio/sfx-*.wav)
  media?: MediaAsset[]; // optional B-roll for the generated video to place
  /** scene-plan.json (validated). The JSON scene engine renders the video from it. */
  plan?: import("../engine/plan").ScenePlan;
  /** Vertical Shorts: keep captions and key content out of the platform UI zones. */
  safeZone?: SafeZone;
  hookTitle?: string; // Shorts: bold Bengali hook shown at the top for the first seconds
};

/** Total composition length in seconds: voice + optional outro. */
export const totalSeconds = (p: Pick<VideoProps, "durationSec" | "brand">) => p.durationSec + (p.brand?.outro ? OUTRO_SEC : 0);

export type SfxName = "whoosh" | "pop" | "chime";
export const SFX_FILES: Record<SfxName, string> = { whoosh: "audio/sfx-whoosh.wav", pop: "audio/sfx-pop.wav", chime: "audio/sfx-chime.wav" };

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
    const text = lines.slice(i + 1).join(" ").trim().replace(/^\[[AB]\]\s*/, ""); // drop legacy speaker tags from old .srt files
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
