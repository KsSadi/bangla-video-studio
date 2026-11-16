/**
 * <TalkingCharacter/>: expressive SVG presenter whose mouth follows the REAL voiceover volume
 * (useAudioData + visualizeAudio from @remotion/media-utils), with blinking, breathing and emotion presets.
 * No AI tokens involved: lip-sync is computed from the audio file at render time.
 */
import React from "react";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CHARACTER_STYLES, Character, type CharacterStyle, type Expression } from "../characters/Character";
import type { Emotion } from "../engine/plan";
import { mouthOpen } from "../lib/kit";
import type { Cue } from "../lib/types";

export type TalkingCharacterProps = {
  character: keyof typeof CHARACTER_STYLES;
  /** Custom look (overrides `character`). */
  look?: CharacterStyle;
  emotion?: Emotion;
  /** Audio file in the public dir used for lip-sync (the studio passes a small mono analysis copy). */
  audioSrc?: string;
  /** Fallback lip-sync source when no audio is available (studio preview with default props). */
  cues?: Cue[];
  size?: number;
  style?: React.CSSProperties;
};

/** Speech loudness 0..1 at `frame`, from the 125 Hz - 1.5 kHz band where voiced Bengali vowels live. */
export function voiceLevel(bins: number[]): number {
  const band = bins.slice(1, Math.max(2, Math.floor(bins.length * 0.4)));
  const avg = band.reduce((a, b) => a + b, 0) / Math.max(1, band.length);
  const v = Math.sqrt(avg) * 2.6; // perceptual curve + gain so normal speech opens the mouth fully
  return v < 0.1 ? 0 : Math.min(1, v);
}

const EMOTION: Record<Emotion, { talking: Expression; idle: Expression }> = {
  happy: { talking: "happy", idle: "happy" },
  explaining: { talking: "happy", idle: "neutral" },
  thinking: { talking: "thinking", idle: "thinking" },
  excited: { talking: "happy", idle: "surprised" },
};

const Body: React.FC<TalkingCharacterProps & { mouth: number }> = ({ character, look, emotion = "explaining", size = 600, style, mouth }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const e = EMOTION[emotion];
  // body language per emotion: small, continuous, deterministic
  const tilt = emotion === "thinking" ? -4 + Math.sin(t * 0.8) * 1.5 : emotion === "explaining" ? Math.sin(t * 1.4) * 1.8 * (0.4 + mouth) : emotion === "excited" ? Math.sin(t * 5) * 2.2 : Math.sin(t * 1.1) * 1.2;
  const hop = emotion === "excited" ? -Math.abs(Math.sin(t * 5)) * size * 0.018 : emotion === "happy" ? Math.sin(t * 2.2) * size * 0.004 : 0;
  return (
    <div style={{ width: (size * 2) / 3, height: size, rotate: `${tilt}deg`, translate: `0px ${hop}px`, transformOrigin: "50% 90%", ...style }}>
      <Character look={look ?? CHARACTER_STYLES[character]} t={t} mouth={mouth} expression={mouth > 0.05 ? e.talking : e.idle} wave={emotion === "excited" || (emotion === "happy" && t < 1.6)} size={size} />
    </div>
  );
};

const WaveformDriven: React.FC<TalkingCharacterProps & { audioSrc: string }> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(staticFile(props.audioSrc));
  let mouth = 0;
  if (audioData && frame / fps < audioData.durationInSeconds) {
    mouth = voiceLevel(visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, optimizeFor: "speed" }));
  }
  return <Body {...props} mouth={mouth} />;
};

const CueDriven: React.FC<TalkingCharacterProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <Body {...props} mouth={mouthOpen(props.cues ?? [], frame / fps)} />;
};

export const TalkingCharacter: React.FC<TalkingCharacterProps> = (props) => (props.audioSrc ? <WaveformDriven {...props} audioSrc={props.audioSrc} /> : <CueDriven {...props} />);
