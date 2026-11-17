/**
 * Studio kit: battle-tested building blocks every generated video should reuse.
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
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CaptionOpts, CaptionStyle, Cue, RecEvent, SafeZone } from "./types";

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

// ---------- studio captions (4 themes) ----------
type CapProps = { cues: Cue[]; accent: string; accent2: string; safe?: SafeZone; opts?: CaptionOpts };

/** Where the caption block sits: above the bottom margin (default) or vertically centred. */
const capBox = (width: number, height: number, safe: SafeZone | undefined, opts: CaptionOpts | undefined, side = 0.07): React.CSSProperties => {
  const left = width * (safe?.left ?? side);
  const right = width * (safe?.right ?? side);
  return opts?.position === "center"
    ? { position: "absolute", left, right, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }
    : { position: "absolute", left, right, bottom: height * (safe?.bottom ?? 0.07), display: "flex", justifyContent: "center" };
};
const capSize = (width: number, height: number, opts: CaptionOpts | undefined, k = 1) => Math.round(width * (width > height ? 0.036 : 0.062) * k * Math.min(1.8, Math.max(0.5, opts?.size ?? 1)));

/** Minimalist Classic: clean bottom-aligned subtitle bar. */
const ClassicCaption: React.FC<CapProps> = ({ cues, safe, opts }) => {
  const t = useTime();
  const { width, height } = useVideoConfig();
  const i = activeCueIndex(cues, t);
  if (i < 0) return null;
  const c = cues[i];
  const p = enter(t, c.start, 0.18);
  return (
    <div style={capBox(width, height, safe, opts, 0.06)}>
      <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 500, fontSize: capSize(width, height, opts, 0.72), lineHeight: 1.5, color: "#fff", background: "rgba(8,10,24,0.78)", padding: "0.4em 0.9em", borderRadius: "0.4em", textAlign: "center", opacity: p, translate: `0px ${(1 - p) * 10}px` }}>
        {c.text}
      </div>
    </div>
  );
};

/** Viral Word-Pop: the spoken line pops in word by word; the word being spoken scales up in the accent colour. */
const KineticCaption: React.FC<CapProps> = ({ cues, accent, safe, opts }) => {
  const t = useTime();
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const i = activeCueIndex(cues, t);
  if (i < 0) return null;
  const c = cues[i];
  const words = splitWords(c.text);
  const span = Math.max(0.1, c.end - c.start);
  const exit = interpolate(t, [c.end - 0.12, c.end], [1, 0], CLAMP);
  const activeWord = Math.min(words.length - 1, Math.floor(((t - c.start) / span) * words.length));
  return (
    <div style={{ ...capBox(width, height, safe, opts), opacity: exit }}>
      <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 700, fontSize: capSize(width, height, opts), lineHeight: 1.5, textAlign: "center", color: "#fff", textShadow: "0 3px 14px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.9)" }}>
        {words.map((w, k) => {
          const p = spring({ frame: frame - (c.start + Math.min(k * 0.07, span * 0.4)) * fps, fps, config: { damping: 14, stiffness: 180 }, durationInFrames: 16 });
          const startOfWord = c.start + (k / words.length) * span;
          const pop = k === activeWord ? spring({ frame: frame - startOfWord * fps, fps, config: { damping: 9, stiffness: 220 }, durationInFrames: 14 }) : 0;
          return (
            <span key={k} style={{ display: "inline-block", marginRight: "0.26em", opacity: Math.min(1, p * 1.6), translate: `0px ${(1 - p) * 26}px`, scale: String((0.7 + 0.3 * p) * (1 + 0.2 * pop)), color: k === activeWord ? accent : "#fff", textShadow: k === activeWord ? `0 3px 14px rgba(0,0,0,0.85), 0 0 22px ${accent}88` : undefined }}>
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** Cinema Pill: dark frosted-glass pill with crisp white text. */
const PillCaption: React.FC<CapProps> = ({ cues, safe, opts }) => {
  const t = useTime();
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const i = activeCueIndex(cues, t);
  if (i < 0) return null;
  const c = cues[i];
  const p = spring({ frame: frame - c.start * fps, fps, config: { damping: 20, stiffness: 170 }, durationInFrames: 14 });
  const out = interpolate(t, [c.end - 0.14, c.end], [1, 0], CLAMP);
  const size = capSize(width, height, opts, 0.78);
  return (
    <div style={{ ...capBox(width, height, safe, opts), opacity: Math.min(1, p * 1.5) * out }}>
      <div
        lang="bn"
        style={{
          fontFamily: BENGALI_FONT_STACK,
          fontWeight: 600,
          fontSize: size,
          lineHeight: 1.5,
          color: "#fff",
          textAlign: "center",
          maxWidth: "100%",
          padding: "0.38em 1.05em",
          borderRadius: size * 1.1,
          background: "linear-gradient(180deg, rgba(24,28,52,0.62), rgba(8,10,24,0.56))",
          backdropFilter: "blur(18px) saturate(1.5)",
          WebkitBackdropFilter: "blur(18px) saturate(1.5)",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.28)",
          translate: `0px ${(1 - p) * 18}px`,
          scale: String(0.94 + 0.06 * p),
          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        }}
      >
        {c.text}
      </div>
    </div>
  );
};

/** Keyword = longest word (4+ characters), or the first Latin/number token (React, API, 2025). */
const keywordIndex = (words: string[]) => {
  const latin = words.findIndex((w) => /[A-Za-z0-9]/.test(w));
  if (latin >= 0) return latin;
  let best = -1;
  let len = 2;
  words.forEach((w, k) => {
    const n = splitGraphemes(w.replace(/[।,.!?;:"'()]/g, "")).length;
    if (n > len) {
      len = n;
      best = k;
    }
  });
  return best;
};

/** Gradient Glow: soft drop-shadow glow with a gradient-coloured keyword. */
const GlowCaption: React.FC<CapProps> = ({ cues, accent, accent2, safe, opts }) => {
  const t = useTime();
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const i = activeCueIndex(cues, t);
  if (i < 0) return null;
  const c = cues[i];
  const words = splitWords(c.text);
  const key = keywordIndex(words);
  const out = interpolate(t, [c.end - 0.14, c.end], [1, 0], CLAMP);
  const size = capSize(width, height, opts, 0.92);
  return (
    <div style={{ ...capBox(width, height, safe, opts), opacity: out }}>
      <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 700, fontSize: size, lineHeight: 1.5, textAlign: "center", color: "#fff", filter: `drop-shadow(0 4px 14px rgba(0,0,0,0.55)) drop-shadow(0 0 20px ${accent}55)` }}>
        {words.map((w, k) => {
          const p = spring({ frame: frame - (c.start + Math.min(k * 0.05, 0.4)) * fps, fps, config: { damping: 22, stiffness: 150 }, durationInFrames: 16 });
          const hot = k === key;
          return (
            <span key={k} style={{ display: "inline-block", marginRight: "0.26em", opacity: Math.min(1, p * 1.5), translate: `0px ${(1 - p) * 14}px`, scale: String(hot ? 1.08 : 1), ...(hot ? { backgroundImage: `linear-gradient(95deg, ${accent}, ${accent2})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" } : {}) }}>
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** Studio-owned captions overlay (Main composition draws it from the UI's subtitle settings). */
export const StudioCaptions: React.FC<{ cues: Cue[]; style: CaptionStyle; accent?: string; accent2?: string; safe?: SafeZone; opts?: CaptionOpts }> = ({ cues, style, accent = "#FBBF24", accent2 = "#F472B6", safe, opts }) => {
  const p = { cues, accent, accent2, safe, opts };
  switch (style) {
    case "kinetic":
      return <KineticCaption {...p} />;
    case "pill":
      return <PillCaption {...p} />;
    case "glow":
      return <GlowCaption {...p} />;
    case "classic":
      return <ClassicCaption {...p} />;
    default:
      return null;
  }
};

/**
 * DEPRECATED for generated videos: captions are drawn by the studio overlay according to the user's caption
 * toggle (kinetic / classic / none). Kept as a no-op so older generated code still compiles. Do not draw captions.
 */
export const Captions: React.FC<{ cues: Cue[]; bottom?: number; fontSize?: number; style?: React.CSSProperties }> = () => null;

// ---------- cinematic motion ----------
/** Named spring presets. Opacity and colour never bounce: use SPRING.smooth for them. */
export const SPRING = {
  smooth: { damping: 200 },
  snappy: { damping: 20, stiffness: 200 },
  soft: { damping: 26, stiffness: 90, mass: 1.2 },
  bouncy: { damping: 12, stiffness: 140 },
} as const;

/** 0..1 spring that starts `delay` seconds into the current sequence. */
export const springIn = (frame: number, fps: number, delay = 0, preset: keyof typeof SPRING = "snappy") =>
  spring({ frame: frame - delay * fps, fps, config: SPRING[preset] });

/**
 * Slow camera move for a scene: push-in plus a gentle drift, eased in/out so it never looks static.
 * Wrap the scene's whole visual stack. `from`/`to` are seconds on the same clock as useTime() in the scene.
 */
export const CameraDrift: React.FC<{
  children: React.ReactNode;
  from: number;
  to: number;
  /** Extra zoom at the end of the move (0.06 = 6%). */
  push?: number;
  /** Drift distance as a fraction of the width. */
  drift?: number;
  /** Different seeds give different drift directions per scene. */
  seed?: number;
  style?: React.CSSProperties;
}> = ({ children, from, to, push = 0.06, drift = 0.018, seed = 0, style }) => {
  const t = useTime();
  const { width } = useVideoConfig();
  const p = interpolate(t, [from, to], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.sin) });
  const angle = seed * 2.4;
  return (
    <AbsoluteFill style={{ scale: String(1 + push * p), translate: `${Math.cos(angle) * drift * width * p}px ${Math.sin(angle) * drift * width * 0.6 * p}px`, ...style }}>
      {children}
    </AbsoluteFill>
  );
};

/**
 * Depth layer: moves and scales slightly with time, deeper layers (depth near 1) move more than the
 * background (depth near 0). Stack 2-3 layers inside a scene for parallax.
 */
export const Parallax: React.FC<{ children: React.ReactNode; depth?: number; seed?: number; style?: React.CSSProperties }> = ({ children, depth = 0.5, seed = 0, style }) => {
  const t = useTime();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        translate: `${Math.sin(t * 0.4 + seed) * depth * width * 0.014}px ${Math.cos(t * 0.33 + seed) * depth * height * 0.01}px`,
        scale: String(1 + depth * 0.025 + Math.sin(t * 0.2 + seed) * depth * 0.008),
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/**
 * User media (screenshot / short clip) inside an animated frame. Springs in at `start`, floats gently while
 * visible, springs out before `end`. `src` is MediaAsset.src (a file under assets/ in the job's public dir).
 */
export const MediaFrame: React.FC<{
  src: string;
  kind?: "image" | "video";
  start: number;
  end: number;
  variant?: "browser" | "phone" | "polaroid" | "card";
  caption?: string;
  accent?: string;
  /** Box the frame fits into, as fractions of the screen. */
  box?: { x: number; y: number; w: number; h: number };
}> = ({ src, kind = "image", start, end, variant = "browser", caption, accent = "#FBBF24", box = { x: 0.1, y: 0.08, w: 0.8, h: 0.62 } }) => {
  const frame = useCurrentFrame();
  const t = useTime();
  const { fps, width, height } = useVideoConfig();
  if (t < start - 0.05 || t > end + 0.6) return null;
  const inP = spring({ frame: frame - start * fps, fps, config: SPRING.bouncy, durationInFrames: 22 });
  const outP = interpolate(t, [end - 0.3, end], [1, 0], { ...CLAMP, easing: Easing.in(Easing.poly(4)) });
  const p = inP * outP;
  const bw = width * box.w;
  const bh = height * box.h;
  const radius = Math.round(width * 0.012);
  const content =
    kind === "video" ? (
      <Video src={staticFile(src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : (
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    );
  const chrome = variant === "browser" ? radius * 3.2 : 0;
  const pad = variant === "polaroid" ? radius * 1.4 : variant === "phone" ? radius * 1.1 : variant === "card" ? radius * 0.6 : 0;
  const bottomPad = variant === "polaroid" ? radius * 5 : pad;
  return (
    <div
      style={{
        position: "absolute",
        left: width * box.x,
        top: height * box.y,
        width: bw,
        height: bh,
        display: "grid",
        placeItems: "center",
        opacity: Math.min(1, p * 1.5),
        scale: String(0.75 + 0.25 * p),
        translate: `0px ${(1 - p) * 60 + Math.sin(t * 1.1) * height * 0.006}px`,
        rotate: `${(variant === "polaroid" ? -3 : 0) * p + Math.sin(t * 0.7) * 0.4}deg`,
      }}
    >
      <div
        style={{
          width: variant === "phone" ? Math.min(bw, bh * 0.52) : "100%",
          height: "100%",
          background: variant === "polaroid" ? "#fff" : variant === "phone" ? "#0b0b12" : "#fff",
          borderRadius: variant === "phone" ? radius * 3 : radius,
          boxShadow: "0 30px 80px rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.3)",
          border: variant === "phone" ? `${radius * 0.5}px solid #1c1c28` : variant === "card" ? `3px solid ${accent}` : undefined,
          padding: `${chrome + pad}px ${pad}px ${bottomPad}px`,
          position: "relative",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {variant === "browser" && (
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: chrome, background: "#E8EAF0", display: "flex", alignItems: "center", gap: radius * 0.7, padding: `0 ${radius * 1.2}px` }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <span key={c} style={{ width: radius * 1.1, height: radius * 1.1, borderRadius: "50%", background: c }} />
            ))}
            <span style={{ marginLeft: radius, flex: 1, height: chrome * 0.5, borderRadius: chrome, background: "#fff" }} />
          </div>
        )}
        <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: variant === "phone" ? radius * 2 : variant === "polaroid" ? radius * 0.4 : 0 }}>{content}</div>
        {caption && (
          <div lang="bn" style={{ position: "absolute", left: 0, right: 0, bottom: variant === "polaroid" ? radius * 1.2 : radius, textAlign: "center", fontFamily: BENGALI_FONT_STACK, fontWeight: 600, fontSize: Math.round(width * 0.02), lineHeight: 1.5, color: variant === "polaroid" ? "#222" : "#fff", textShadow: variant === "polaroid" ? undefined : "0 2px 10px rgba(0,0,0,0.8)" }}>
            {caption}
          </div>
        )}
      </div>
    </div>
  );
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
