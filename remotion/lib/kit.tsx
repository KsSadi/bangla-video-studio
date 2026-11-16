/**
 * Studio kit: battle-tested building blocks every generated video should reuse.
 * Generated code (remotion/generated/Video.tsx) imports from here.
 */
import React from "react";
import { loadFont } from "@remotion/fonts";
import { Audio, Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CHARACTER_STYLES, Character, type CharacterStyle, type Expression } from "../characters/Character";
import type { CharacterId, Cue, RecEvent } from "./types";

// ---------- Bengali fonts (local files, never fetched from the network) ----------
export const FONT_HEADING = "Hind Siliguri";
export const FONT_BODY = "Noto Sans Bengali";
export const BENGALI_FONT_STACK = `"${FONT_HEADING}", "${FONT_BODY}", sans-serif`;

if (typeof document !== "undefined") {
  const handle = delayRender("Loading Bengali fonts");
  Promise.all([
    loadFont({ family: FONT_HEADING, url: staticFile("fonts/HindSiliguri-Regular.ttf"), weight: "400" }),
    loadFont({ family: FONT_HEADING, url: staticFile("fonts/HindSiliguri-SemiBold.ttf"), weight: "600" }),
    loadFont({ family: FONT_HEADING, url: staticFile("fonts/HindSiliguri-Bold.ttf"), weight: "700" }),
    loadFont({ family: FONT_BODY, url: staticFile("fonts/NotoSansBengali-Variable.ttf"), weight: "100 900" }),
  ])
    .then(() => continueRender(handle))
    .catch((err) => cancelRender(err));
}

// ---------- time + cue helpers ----------
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** Current time in seconds on the voiceover timeline. */
export const useTime = () => useCurrentFrame() / useVideoConfig().fps;

export const activeCueIndex = (cues: Cue[], t: number) => cues.findIndex((c) => t >= c.start && t < c.end);

/** 0..1 that eases in after `start` and out before `end` (seconds). */
export const fadeInOut = (t: number, start: number, end: number, d = 0.35) => {
  const dd = Math.min(d, (end - start) / 2);
  return interpolate(t, [start, start + dd, end - dd, end], [0, 1, 1, 0], { ...CLAMP, easing: EASE_OUT });
};

/** 0..1 ease-out ramp starting at `start` (seconds). */
export const enter = (t: number, start: number, d = 0.5) => interpolate(t, [start, start + d], [0, 1], { ...CLAMP, easing: EASE_OUT });

/**
 * Mouth openness 0..1 for lip-sync: flaps at syllable-like rate while a cue is spoken, closed in gaps.
 * ponytail: cue-driven, not audio-amplitude-driven. Upgrade path: @remotion/media-utils visualizeAudio.
 */
export const mouthOpen = (cues: Cue[], t: number) => {
  const i = activeCueIndex(cues, t);
  if (i < 0) return 0;
  const c = cues[i];
  const edge = Math.min(1, (t - c.start) / 0.08, (c.end - t) / 0.08);
  return edge * (0.25 + 0.75 * Math.abs(Math.sin(t * 19) * Math.sin(t * 7.3 + 1)));
};

/** Bengali-safe splitting. NEVER split Bengali with text.split("") - it breaks conjuncts and vowel signs. */
export const splitWords = (text: string) => text.trim().split(/\s+/).filter(Boolean);
export const splitGraphemes = (text: string) =>
  Array.from(new Intl.Segmenter("bn", { granularity: "grapheme" }).segment(text), (s) => s.segment);

// ---------- audio ----------
export const VoiceAudio: React.FC<{ src: string }> = ({ src }) => <Audio src={staticFile(src)} />;

// ---------- backgrounds ----------
export const GradientBackground: React.FC<{ colors?: [string, string, string] }> = ({ colors = ["#0B1026", "#1E2A78", "#7C3AED"] }) => {
  const t = useTime();
  const { width, height } = useVideoConfig();
  const blob = (i: number, color: string) => {
    const r = Math.max(width, height) * 0.45;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          width: r,
          height: r,
          borderRadius: "50%",
          background: color,
          filter: `blur(${r * 0.28}px)`,
          opacity: 0.55,
          left: width * (0.15 + 0.5 * i) + Math.sin(t * 0.25 + i * 2) * width * 0.08 - r / 2,
          top: height * (0.75 - 0.45 * i) + Math.cos(t * 0.2 + i) * height * 0.08 - r / 2,
        }}
      />
    );
  };
  return (
    <AbsoluteFill style={{ background: colors[0], overflow: "hidden" }}>
      {blob(0, colors[1])}
      {blob(1, colors[2])}
    </AbsoluteFill>
  );
};

// ---------- text ----------
/** Word-by-word spring reveal. Words (not letters) keep Bengali conjuncts intact. */
export const KineticText: React.FC<{
  text: string;
  /** Seconds when the first word appears. */
  start: number;
  /** Seconds between words. Pass (cue.end - cue.start) / words to sync with speech. */
  stagger?: number;
  highlight?: string[];
  highlightColor?: string;
  style?: React.CSSProperties;
}> = ({ text, start, stagger = 0.12, highlight = [], highlightColor = "#FBBF24", style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 700, lineHeight: 1.45, textAlign: "center", ...style }}>
      {splitWords(text).map((word, i) => {
        const p = spring({ frame: frame - (start + i * stagger) * fps, fps, config: { damping: 200 }, durationInFrames: 14 });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.28em",
              opacity: p,
              translate: `0px ${(1 - p) * 36}px`,
              scale: String(0.9 + 0.1 * p),
              color: highlight.some((h) => word.includes(h)) ? highlightColor : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** Subtitle bar showing the cue being spoken. Safe-area aware; wraps long Bengali lines. */
export const Captions: React.FC<{ cues: Cue[]; bottom?: number; fontSize?: number; style?: React.CSSProperties }> = ({ cues, bottom, fontSize, style }) => {
  const t = useTime();
  const { width, height } = useVideoConfig();
  const i = activeCueIndex(cues, t);
  if (i < 0) return null;
  const c = cues[i];
  const p = enter(t, c.start, 0.18);
  return (
    <div style={{ position: "absolute", left: width * 0.06, right: width * 0.06, bottom: bottom ?? height * 0.07, display: "flex", justifyContent: "center" }}>
      <div
        lang="bn"
        style={{
          fontFamily: BENGALI_FONT_STACK,
          fontWeight: 600,
          fontSize: fontSize ?? Math.round(width * (width > height ? 0.026 : 0.046)),
          lineHeight: 1.5,
          color: "#fff",
          background: "rgba(8,10,24,0.78)",
          padding: "0.45em 0.9em",
          borderRadius: "0.5em",
          textAlign: "center",
          opacity: p,
          translate: `0px ${(1 - p) * 12}px`,
          ...style,
        }}
      >
        {c.text}
      </div>
    </div>
  );
};

// ---------- presenter ----------
/** Pre-built talking character. Lip-syncs to cues, blinks and breathes on its own. Renders nothing for "none". */
export const Presenter: React.FC<{
  character: CharacterId;
  cues: Cue[];
  size?: number;
  expression?: Expression;
  wave?: boolean;
  /** Custom look, used when character is "auto" (design one that fits the story). */
  look?: CharacterStyle;
  style?: React.CSSProperties;
}> = ({ character, cues, size = 600, expression, wave, look, style }) => {
  const t = useTime();
  if (character === "none") return null;
  const resolved = look ?? CHARACTER_STYLES[character === "auto" ? "storyteller" : character];
  const m = mouthOpen(cues, t);
  return <Character look={resolved} t={t} mouth={m} expression={expression ?? (m > 0 ? "happy" : "neutral")} wave={wave} size={size} style={style} />;
};

// ---------- browser recording (tutorial mode) ----------
const ZOOM = 1.55;
/** Zoom strength 0..1 for one event at time t: ease in before the action, hold, ease out. */
const zoomFor = (e: RecEvent, t: number) =>
  interpolate(t, [e.t - 0.9, e.t - 0.25, e.t + 1.1, e.t + 1.8], [0, 1, 1, 0], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });

/**
 * Playwright recording in a browser frame with auto-zoom on clicks, click ripples and highlight boxes.
 * The recording timeline equals the voiceover timeline (recorder waits with h.at(seconds)).
 */
export const BrowserRecording: React.FC<{ src: string; events?: RecEvent[]; style?: React.CSSProperties; zoom?: number }> = ({ src, events = [], style, zoom = ZOOM }) => {
  const t = useTime();
  const targets = events.filter((e) => (e.type === "click" || e.type === "type" || e.type === "highlight") && e.x != null && e.y != null);
  // ponytail: strongest event wins; overlapping zooms can snap origin. Blend origins if actions come <1s apart.
  let best: RecEvent | undefined;
  let strength = 0;
  for (const e of targets) {
    const z = zoomFor(e, t);
    if (z > strength) [best, strength] = [e, z];
  }
  const ox = best ? (best.x! / best.vw) * 100 : 50;
  const oy = best ? (best.y! / best.vh) * 100 : 50;
  return (
    <div style={{ position: "relative", aspectRatio: "16 / 9", borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.45)", background: "#111", ...style }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: `${ox}% ${oy}%`, scale: String(1 + (zoom - 1) * strength) }}>
        <Video src={staticFile(src)} muted style={{ width: "100%", height: "100%" }} objectFit="cover" />
        {targets.map((e, i) => {
          const life = interpolate(t, [e.t - 0.6, e.t - 0.3, e.t + 1.2, e.t + 1.6], [0, 1, 1, 0], CLAMP);
          if (life <= 0) return null;
          const ripple = interpolate(t, [e.t, e.t + 0.6], [0, 1], CLAMP);
          return (
            <React.Fragment key={i}>
              {e.box && (
                <div
                  style={{
                    position: "absolute",
                    left: `${(e.box.x / e.vw) * 100}%`,
                    top: `${(e.box.y / e.vh) * 100}%`,
                    width: `${(e.box.w / e.vw) * 100}%`,
                    height: `${(e.box.h / e.vh) * 100}%`,
                    border: "3px solid #FBBF24",
                    borderRadius: 8,
                    boxShadow: "0 0 0 4px rgba(251,191,36,0.3)",
                    opacity: life,
                    scale: String(1.08 - 0.08 * life),
                  }}
                />
              )}
              {e.type === "click" && ripple > 0 && ripple < 1 && (
                <div
                  style={{
                    position: "absolute",
                    left: `${(e.x! / e.vw) * 100}%`,
                    top: `${(e.y! / e.vh) * 100}%`,
                    width: 60,
                    height: 60,
                    margin: -30,
                    borderRadius: "50%",
                    border: "4px solid #22D3EE",
                    opacity: 1 - ripple,
                    scale: String(0.3 + ripple * 1.4),
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
