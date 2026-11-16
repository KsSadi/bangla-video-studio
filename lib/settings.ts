/**
 * Studio settings shared by the browser UI and the API routes. Pure (no Node imports).
 * Every optional feature has an independent flag here; the backend skips a step when its flag is off.
 */
import type { CharacterId } from "@/remotion/lib/types";

export type Mode = "cartoon" | "motion" | "tutorial" | "auto";
export type CaptionStyle = "kinetic" | "classic" | "none";
export type BgmId = "none" | "soft-storytelling" | "tech-explainer";
export type Quality = "draft" | "final";
export type Verification = "unchecked" | "verified" | "skipped";

export const MODES: Mode[] = ["cartoon", "motion", "tutorial", "auto"];
export const CHARACTERS: CharacterId[] = ["tech-mentor", "storyteller", "friendly-teacher", "auto", "none"];
export const CAPTION_STYLES: CaptionStyle[] = ["kinetic", "classic", "none"];
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
  captions: CaptionStyle;
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
  captions: "kinetic",
  bgm: "none",
  bgmVolume: 0.2,
  sfx: false,
  showLogo: false,
  outro: false,
  thumbnail: false,
  metadata: false,
  engine: "json",
  tokenSaver: true,
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
    captions: pick(r.captions, CAPTION_STYLES, base.captions),
    bgm: pick(r.bgm, BGM_IDS, base.bgm),
    bgmVolume: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : base.bgmVolume,
    sfx: bool(r.sfx, base.sfx),
    showLogo: bool(r.showLogo, base.showLogo),
    outro: bool(r.outro, base.outro),
    thumbnail: bool(r.thumbnail, base.thumbnail),
    metadata: bool(r.metadata, base.metadata),
    engine: r.engine === "custom" ? "custom" : r.engine === "json" ? "json" : base.engine,
    tokenSaver: bool(r.tokenSaver, base.tokenSaver),
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
