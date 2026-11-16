/**
 * Studio settings shared by the browser UI and the API routes. Pure (no Node imports).
 * Every optional feature has an independent flag here; the backend skips a step when its flag is off.
 */
import type { CharacterId } from "@/remotion/lib/types";

export type Mode = "cartoon" | "motion" | "tutorial" | "auto";
export type { CaptionStyle } from "@/remotion/lib/types";
import type { CaptionStyle } from "@/remotion/lib/types";
export type BgmId = "none" | "soft-storytelling" | "tech-explainer";
export type Quality = "draft" | "final";
export type Verification = "unchecked" | "verified" | "skipped";

export const MODES: Mode[] = ["cartoon", "motion", "tutorial", "auto"];
export const CHARACTERS: CharacterId[] = ["tech-mentor", "storyteller", "friendly-teacher", "auto", "none", "custom"];
export const SPEAKER_B_CHARACTERS = ["tech-mentor", "storyteller", "friendly-teacher", "custom"] as const;
/** Subtitle themes the user can pick (OFF is the master switch `captionsOn`, not a style). */
export const CAPTION_STYLES: Exclude<CaptionStyle, "none">[] = ["kinetic", "pill", "glow", "classic"];
export const CAPTION_POSITIONS = ["bottom", "center"] as const;
/** What the renderer gets: "none" when the master switch is OFF. */
export const effectiveCaptions = (s: Pick<StudioSettings, "captions" | "captionsOn">): CaptionStyle => (s.captionsOn ? s.captions : "none");
export const BGM_IDS: BgmId[] = ["none", "soft-storytelling", "tech-explainer"];

/** Fast Draft Preview vs Final HD Render. Draft keeps the aspect ratio but is tiny and 15 fps. */
export const QUALITY_PRESETS: Record<Quality, { short: number; fps: number; crf: number; label: string }> = {
  draft: { short: 480, fps: 15, crf: 30, label: "Fast Draft Preview (480p / 15fps)" },
  final: { short: 1080, fps: 30, crf: 18, label: "Final HD Render (1080p / 30fps)" },
};

export type AssetItem = { file: string; kind: "image" | "video"; instruction: string };

export type StudioSettings = {
  mode: Mode;
  character: CharacterId;
  aspect: "16:9" | "9:16";
  hints: string;
  tutorialUrl: string; // the login password is never part of settings: it is never saved
  tutorialEmail: string;
  // 1-3 voice & subtitles
  enhanceVoice: boolean;
  requireVerified: boolean;
  verification: Verification;
  // 4 media
  assets: AssetItem[];
  mediaNotes: string;
  // 5 captions / audio / brand
  /** Master switch. OFF = a completely clean video (the .srt still times the scenes). */
  captionsOn: boolean;
  captions: Exclude<CaptionStyle, "none">;
  captionSize: number; // 0.6 .. 1.6 (1 = default)
  captionPosition: (typeof CAPTION_POSITIONS)[number];
  bgm: BgmId;
  bgmVolume: number; // 0..1, relative level before auto-ducking
  sfx: boolean;
  showLogo: boolean;
  outro: boolean;
  // 9 extras
  thumbnail: boolean;
  metadata: boolean;
  // engine + tokens
  /** "json": Claude writes a compact scene-plan.json rendered by the pre-built library (default, cheapest, most reliable). "custom": Claude writes one-off TSX. */
  engine: "json" | "custom";
  /** Token Saver (Haiku/Sonnet hybrid) vs Max Quality (your default model for everything). */
  tokenSaver: boolean;
  // pro-creator features (each independently switchable)
  /** Instant in-browser Remotion Player preview of the scene plan, before any MP4 render. */
  livePreview: boolean;
  /** Show the Long-to-Shorts (9:16) clipper after a video exists. */
  shorts: boolean;
  /** Two-speaker Dialogue Mode: two characters, spotlight + lip-sync follow the active speaker. */
  dialogue: boolean;
  characterB: (typeof SPEAKER_B_CHARACTERS)[number];
  /** Character Builder library ids, used when character / characterB is "custom". */
  customCharacter: string;
  customCharacterB: string;
  /** Fetch public-domain/CC0 photos from Wikimedia Commons for scenes that benefit from real-world visuals. */
  autoBroll: boolean;
  // reliability
  /** Tutorial mode: smart fallback locators + one Claude auto-patch of failed selectors before the final recording. */
  selfHeal: boolean;
  /** Videos longer than 3 minutes render in 90-second chunks (separate Remotion runs) stitched with ffmpeg. */
  chunkedRender: boolean;
  // style + templates
  /** Style DNA library id (data/styles/): colours, transitions, pacing and caption look of a cloned reference video. */
  styleDna: string;
  /** Template library id (data/templates/): reuse the structure of a finished video with a new voice. */
  template: string;
};

export const DEFAULT_SETTINGS: StudioSettings = {
  mode: "auto",
  character: "tech-mentor",
  aspect: "16:9",
  hints: "",
  tutorialUrl: "",
  tutorialEmail: "",
  enhanceVoice: false,
  requireVerified: false,
  verification: "unchecked",
  assets: [],
  mediaNotes: "",
  captionsOn: true,
  captions: "kinetic",
  captionSize: 1,
  captionPosition: "bottom",
  bgm: "none",
  bgmVolume: 0.2,
  sfx: false,
  showLogo: false,
  outro: false,
  thumbnail: false,
  metadata: false,
  engine: "json",
  tokenSaver: true,
  livePreview: true,
  shorts: true,
  dialogue: false,
  characterB: "friendly-teacher",
  customCharacter: "",
  customCharacterB: "",
  autoBroll: false,
  selfHeal: true,
  chunkedRender: true,
  styleDna: "",
  template: "",
};

/** Persistent brand kit (shared by every project). */
export type BrandKit = { channelName: string; primary: string; secondary: string; hasLogo: boolean };
export const DEFAULT_BRAND: BrandKit = { channelName: "", primary: "#F5A524", secondary: "#7C3AED", hasLogo: false };

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const text = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);
export const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Validate untrusted JSON into settings. Unknown or invalid fields fall back to `base`. */
export function sanitizeSettings(raw: unknown, base: StudioSettings = DEFAULT_SETTINGS): StudioSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const assets: AssetItem[] = Array.isArray(r.assets)
    ? r.assets
        .map((a): AssetItem | null => {
          const o = a as Record<string, unknown>;
          if (typeof o?.file !== "string" || !SAFE_FILE.test(o.file)) return null;
          return { file: o.file, kind: o.kind === "video" ? "video" : "image", instruction: text(o.instruction, 400) };
        })
        .filter((a): a is AssetItem => !!a)
        .slice(0, 30)
    : base.assets;
  const vol = Number(r.bgmVolume);
  return {
    mode: pick(r.mode, MODES, base.mode),
    character: pick(r.character, CHARACTERS, base.character),
    aspect: r.aspect === "9:16" ? "9:16" : r.aspect === "16:9" ? "16:9" : base.aspect,
    hints: text(r.hints, 2000, base.hints),
    tutorialUrl: text(r.tutorialUrl, 2000, base.tutorialUrl),
    tutorialEmail: text(r.tutorialEmail, 320, base.tutorialEmail),
    enhanceVoice: bool(r.enhanceVoice, base.enhanceVoice),
    requireVerified: bool(r.requireVerified, base.requireVerified),
    verification: pick(r.verification, ["unchecked", "verified", "skipped"] as const, base.verification),
    assets,
    mediaNotes: text(r.mediaNotes, 2000, base.mediaNotes),
    // legacy projects stored "none" as a style: that now means master switch OFF
    captionsOn: r.captions === "none" ? false : bool(r.captionsOn, base.captionsOn),
    captions: pick(r.captions, CAPTION_STYLES, base.captions),
    captionSize: Number.isFinite(Number(r.captionSize)) && r.captionSize !== null && r.captionSize !== "" ? Math.min(1.6, Math.max(0.6, Number(r.captionSize))) : base.captionSize,
    captionPosition: pick(r.captionPosition, CAPTION_POSITIONS, base.captionPosition),
    bgm: pick(r.bgm, BGM_IDS, base.bgm),
    bgmVolume: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : base.bgmVolume,
    sfx: bool(r.sfx, base.sfx),
    showLogo: bool(r.showLogo, base.showLogo),
    outro: bool(r.outro, base.outro),
    thumbnail: bool(r.thumbnail, base.thumbnail),
    metadata: bool(r.metadata, base.metadata),
    engine: r.engine === "custom" ? "custom" : r.engine === "json" ? "json" : base.engine,
    tokenSaver: bool(r.tokenSaver, base.tokenSaver),
    livePreview: bool(r.livePreview, base.livePreview),
    shorts: bool(r.shorts, base.shorts),
    dialogue: bool(r.dialogue, base.dialogue),
    characterB: pick(r.characterB, SPEAKER_B_CHARACTERS, base.characterB),
    customCharacter: typeof r.customCharacter === "string" && /^[a-z0-9-]{0,40}$/.test(r.customCharacter) ? r.customCharacter : base.customCharacter,
    customCharacterB: typeof r.customCharacterB === "string" && /^[a-z0-9-]{0,40}$/.test(r.customCharacterB) ? r.customCharacterB : base.customCharacterB,
    autoBroll: bool(r.autoBroll, base.autoBroll),
    selfHeal: bool(r.selfHeal, base.selfHeal),
    chunkedRender: bool(r.chunkedRender, base.chunkedRender),
    styleDna: typeof r.styleDna === "string" && /^(style-[a-z0-9]{3,20})?$/.test(r.styleDna) ? r.styleDna : base.styleDna,
    template: typeof r.template === "string" && /^(tpl-[a-z0-9]{3,24})?$/.test(r.template) ? r.template : base.template,
  };
}

export type VersionInfo = { n: number; quality: Quality; label: string; createdAt: string; size: number; engine?: "json" | "custom" };
export type RevisionInfo = { n: number; feedback: string; version: number; createdAt: string };
export type ChapterInfo = { time: string; title: string };
export type SeoPack = {
  titlesBn: string[];
  titlesEn: string[];
  descriptionBn: string;
  descriptionEn: string;
  hashtags: string[];
  headline: string;
  chapters: ChapterInfo[];
};

/** A vertical Short cut from the long video (times are seconds on the voiceover clock). */
export type ShortClip = {
  id: string;
  n: number;
  start: number;
  end: number;
  hookTitle: string;
  source: "ai" | "manual";
  state: "ready" | "rendering" | "done" | "error";
  quality?: Quality;
  size?: number;
  error?: string;
  createdAt: string;
};

/**
 * Studio presets save the reusable workflow (mode, character, music, captions, brand toggles, engine, feature switches).
 * Per-video things (notes, URL, login, media, verification) are deliberately not part of a preset.
 */
export const PRESET_KEYS = [
  "mode", "character", "customCharacter", "dialogue", "characterB", "customCharacterB", "aspect",
  "captionsOn", "captions", "captionSize", "captionPosition", "bgm", "bgmVolume", "sfx", "showLogo", "outro", "enhanceVoice",
  "thumbnail", "metadata", "engine", "tokenSaver", "livePreview", "shorts", "autoBroll", "selfHeal", "chunkedRender", "styleDna",
] as const satisfies readonly (keyof StudioSettings)[];

export type StudioPreset = { id: string; name: string; settings: Partial<StudioSettings>; createdAt: string };

/** Keep only the preset keys of validated settings. */
export function presetFromSettings(raw: unknown, base: StudioSettings = DEFAULT_SETTINGS): Partial<StudioSettings> {
  const clean = sanitizeSettings(raw, base);
  return Object.fromEntries(PRESET_KEYS.map((k) => [k, clean[k]])) as Partial<StudioSettings>;
}
