/**
 * "Main" composition = the generated video plus studio-owned layers. Every layer is optional and driven by
 * VideoProps flags (absent/off = not rendered): captions, corner logo, BGM (auto-ducked), SFX, subscribe outro.
 * The video itself is the JSON scene engine (props.plan = scene-plan.json) or, as a fallback, custom generated/Video.tsx.
 */
import React from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { SceneEngine } from "./engine/SceneEngine";
import { GeneratedVideo } from "./generated/Video";
import { KineticSubtitles } from "./library";
import { BENGALI_FONT_STACK, useTime } from "./lib/kit";
import { sfxPlan, speaking } from "./sfx-plan";
import { SFX_FILES, totalSeconds, type BrandProps, type Cue, type SafeZone, type VideoProps } from "./lib/types";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Bgm: React.FC<{ src: string; volume: number; cues: Cue[]; total: number }> = ({ src, volume, cues, total }) => {
  const { fps } = useVideoConfig();
  return (
    <Audio
      src={staticFile(src)}
      loop
      volume={(f) => {
        const t = f / fps;
        const duck = 1 - 0.7 * speaking(cues, t);
        const fade = interpolate(t, [0, 1.2, total - 1.5, total], [0, 1, 1, 0], CLAMP);
        return volume * duck * fade;
      }}
    />
  );
};

/** Shorts hook: bold Bengali line in the top safe zone for the first seconds. */
const HookTitle: React.FC<{ text: string; accent: string; safe: SafeZone }> = ({ text, accent, safe }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const p = spring({ frame: frame - 0.15 * fps, fps, config: { damping: 14, stiffness: 150 } });
  const out = interpolate(t, [3.2, 3.8], [1, 0], CLAMP);
  const size = Math.round(width * 0.058);
  return (
    <div style={{ position: "absolute", left: width * safe.left, right: width * safe.right, top: height * (safe.top + 0.005), display: "flex", justifyContent: "center", opacity: Math.min(1, p * 1.4) * out, translate: `0px ${(1 - p) * -40}px`, scale: String(0.85 + 0.15 * p) }}>
      <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 700, fontSize: size, lineHeight: 1.4, textAlign: "center", color: "#111", background: accent, padding: "0.2em 0.7em", borderRadius: size * 0.5, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
        {text}
      </div>
    </div>
  );
};

const Watermark: React.FC<{ brand: BrandProps; safe?: SafeZone }> = ({ brand, safe }) => {
  const t = useTime();
  const { width, height } = useVideoConfig();
  const o = interpolate(t, [0.4, 1.0], [0, 0.9], CLAMP);
  const size = width * 0.065;
  return (
    <div style={{ position: "absolute", top: safe ? height * safe.top * 0.45 : width * 0.025, ...(safe ? { left: width * safe.left } : { right: width * 0.025 }), opacity: o, display: "flex", alignItems: "center", gap: size * 0.18 }}>
      {brand.logoSrc ? (
        <Img src={staticFile(brand.logoSrc)} style={{ height: size, width: "auto", maxWidth: size * 3, objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))" }} />
      ) : (
        <span lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 700, fontSize: size * 0.4, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.7)", background: "rgba(0,0,0,0.35)", padding: "0.2em 0.6em", borderRadius: 999 }}>
          {brand.channelName}
        </span>
      )}
    </div>
  );
};

/** Animated subscribe / follow outro: logo + channel name spring in, button gets "pressed", bell rings. */
const Outro: React.FC<{ brand: BrandProps }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const portrait = height > width;
  const u = Math.min(width, height);
  const bg = interpolate(t, [0, 3], [0, 1], CLAMP);
  const logo = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const name = spring({ frame: frame - 0.25 * fps, fps, config: { damping: 200 } });
  const btn = spring({ frame: frame - 0.7 * fps, fps, config: { damping: 14, stiffness: 160 } });
  const press = interpolate(t, [1.7, 1.8, 1.95], [1, 0.9, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const done = t > 1.8;
  const ring = interpolate(t, [1.95, 3.2], [0, 1], CLAMP);
  const swing = Math.sin(ring * Math.PI * 7) * 18 * (1 - ring);
  const words = brand.channelName.trim().split(/\s+/).filter(Boolean);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${135 + bg * 40}deg, ${brand.secondary}, ${brand.primary})`, justifyContent: "center", alignItems: "center", gap: u * 0.035, flexDirection: "column" }}>
      {brand.logoSrc ? (
        <Img src={staticFile(brand.logoSrc)} style={{ height: u * (portrait ? 0.2 : 0.26), width: "auto", maxWidth: width * 0.5, objectFit: "contain", scale: String(logo), filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.35))" }} />
      ) : null}
      {words.length > 0 && (
        <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 700, fontSize: u * (portrait ? 0.075 : 0.085), lineHeight: 1.45, color: "#fff", textAlign: "center", padding: `0 ${width * 0.06}px`, opacity: name, translate: `0px ${(1 - name) * 40}px`, textShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          {words.map((w, i) => (
            <span key={i} style={{ display: "inline-block", marginRight: "0.28em" }}>{w}</span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: u * 0.025, scale: String(btn * press), opacity: Math.min(1, btn * 1.4) }}>
        <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 700, fontSize: u * 0.05, lineHeight: 1.5, padding: `${u * 0.012}px ${u * 0.045}px`, borderRadius: 999, background: done ? "#fff" : "#E11D48", color: done ? "#111" : "#fff", boxShadow: "0 12px 30px rgba(0,0,0,0.3)" }}>
          {done ? "সাবস্ক্রাইবড ✓" : "সাবস্ক্রাইব করুন"}
        </div>
        <svg width={u * 0.08} height={u * 0.08} viewBox="0 0 24 24" style={{ rotate: `${swing}deg`, transformOrigin: "50% 10%" }} aria-hidden>
          <path fill="#fff" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z" />
        </svg>
      </div>
      <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontSize: u * 0.032, lineHeight: 1.5, color: "rgba(255,255,255,0.92)", opacity: interpolate(t, [1.2, 1.8], [0, 1], CLAMP) }}>
        ফলো করুন · শেয়ার করুন
      </div>
    </AbsoluteFill>
  );
};

export const Studio: React.FC<VideoProps> = (props) => {
  const { fps } = useVideoConfig();
  const total = totalSeconds(props);
  const voiceFrames = Math.max(1, Math.round(props.durationSec * fps));
  const brand = props.brand;
  const plan = props.sfx ? sfxPlan(props) : [];
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={voiceFrames} name="Generated video">
        {props.plan ? <SceneEngine {...props} plan={props.plan} /> : <GeneratedVideo {...props} />}
        {props.captionStyle && props.captionStyle !== "none" ? <KineticSubtitles cues={props.cues} mode={props.captionStyle} accent={props.plan?.accent ?? brand?.primary} accent2={brand?.secondary} safe={props.safeZone} opts={props.captionOpts} /> : null}
        {brand?.showLogo ? <Watermark brand={brand} safe={props.safeZone} /> : null}
        {props.hookTitle && props.safeZone ? <HookTitle text={props.hookTitle} accent={props.plan?.accent ?? brand?.primary ?? "#FBBF24"} safe={props.safeZone} /> : null}
      </Sequence>
      {brand?.outro ? (
        <Sequence from={voiceFrames} durationInFrames={Math.max(1, Math.round(total * fps) - voiceFrames)} name="Outro">
          <Outro brand={brand} />
        </Sequence>
      ) : null}
      {props.bgmSrc ? <Bgm src={props.bgmSrc} volume={props.bgmVolume ?? 0.2} cues={props.cues} total={total} /> : null}
      {plan.map((s, i) => (
        <Sequence key={i} from={Math.round(s.at * fps)} durationInFrames={Math.round(1.6 * fps)} name={`sfx ${s.name}`}>
          <Audio src={staticFile(SFX_FILES[s.name])} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
