/**
 * Master composition: renders ANY video from a ScenePlan (scene-plan.json) using only the pre-built library.
 * No generated code. Timing comes from subtitle cue numbers, so subtitle edits never desync the video.
 * Every scene automatically gets: animated background, camera drift, spring entrances, overlapping transition.
 */
import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BENGALI_FONT_STACK, BrowserRecording, CameraDrift, KineticText, MediaFrame, SPRING, VoiceAudio, useTime } from "../lib/kit";
import type { VideoProps } from "../lib/types";
import { DataChart, IconRow, IconSpotlight, SceneBackground, SmartZoomContainer, TalkingCharacter } from "../library";
import { CHARACTER_IDS, sceneSpans, type PlanElement, type PlanScene, type ScenePlan, type SceneSpan } from "./plan";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const TRANSITION_SEC = 0.45;
type Box = { x: number; y: number; w: number; h: number }; // px

const ListBlock: React.FC<{ items: string[]; start: number; fontSize: number; accent: string }> = ({ items, start, fontSize, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: fontSize * 0.4, alignItems: "stretch" }}>
      {items.map((it, i) => {
        const p = spring({ frame: frame - (start + i * 0.35) * fps, fps, config: SPRING.snappy });
        return (
          <div key={i} lang="bn" style={{ display: "flex", alignItems: "center", gap: fontSize * 0.6, fontFamily: BENGALI_FONT_STACK, fontWeight: 600, fontSize, lineHeight: 1.45, color: "#fff", padding: `${fontSize * 0.3}px ${fontSize * 0.7}px`, borderRadius: fontSize * 0.5, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", opacity: Math.min(1, p * 1.5), translate: `${(1 - p) * -fontSize * 2}px 0px` }}>
            <span style={{ flexShrink: 0, width: fontSize * 1.35, height: fontSize * 1.35, borderRadius: "50%", background: accent, color: "#111", display: "grid", placeItems: "center", fontSize: fontSize * 0.8, fontWeight: 700 }}>{i + 1}</span>
            <span>{it}</span>
          </div>
        );
      })}
    </div>
  );
};

/** One element inside the content box. `share` = fraction of the box height this element may use. */
const ElementView: React.FC<{ el: PlanElement; at: number; span: SceneSpan; box: Box; share: number; accent: string; props: VideoProps; solo: boolean }> = ({ el, at, span, box, share, accent, props, solo }) => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const h = box.h * share;
  switch (el.type) {
    case "title": {
      const size = Math.round(Math.min(box.w * (portrait ? 0.11 : 0.085), h * 0.36) * (solo ? 1 : 0.82));
      const words = el.text.split(/\s+/);
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.25 }}>
          <KineticText text={el.text} start={at} stagger={0.09} highlight={words.slice(-1)} highlightColor={accent} style={{ color: "#fff", fontSize: Math.max(34, size), textShadow: "0 4px 24px rgba(0,0,0,0.45)" }} />
          {el.sub ? <KineticText text={el.sub} start={at + 0.35 + words.length * 0.09} stagger={0.05} style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600, fontSize: Math.max(28, size * 0.5) }} /> : null}
        </div>
      );
    }
    case "icons":
      return <IconRow items={el.items} start={at} size={Math.min(h * 0.62, (box.w / el.items.length) * 0.5)} accent={accent} />;
    case "illustration":
      return <IconSpotlight illustration={el.name} label={el.label} start={at} size={Math.min(h * 0.7, box.w * 0.4)} accent={accent} />;
    case "list":
      return <ListBlock items={el.items} start={at} fontSize={Math.max(28, Math.min(box.w * 0.045, (h / el.items.length) * 0.42))} accent={accent} />;
    case "chart":
      return <DataChart chart={el.chart} values={el.values} labels={el.labels} unit={el.unit} highlight={el.highlight} start={at} width={Math.min(box.w, h * 2.2)} height={h} accent={accent} />;
    case "media": {
      const asset = props.media?.find((m) => m.src === el.src);
      if (!asset) return null;
      // MediaFrame positions itself absolutely from screen fractions: give it this element's slot
      return (
        <div style={{ width: box.w, height: h, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0 }}>
            <MediaFrame src={asset.src} kind={asset.kind} start={at} end={span.end - 0.1} variant={el.frame ?? "browser"} caption={el.caption} accent={accent} box={{ x: 0, y: 0, w: box.w / width, h: h / height }} />
          </div>
        </div>
      );
    }
    case "recording":
      return props.recordingSrc ? <BrowserRecording src={props.recordingSrc} events={props.events} style={{ width: box.w }} /> : null;
  }
};

const SceneView: React.FC<{ span: SceneSpan; props: VideoProps; plan: ScenePlan; accent: string }> = ({ span, props, plan, accent }) => {
  const t = useTime();
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const { scene, index, start, end } = span;
  const portrait = H > W;
  const isRecording = scene.elements.some((e) => e.type === "recording");

  // entrance transition (the previous scene stays underneath for TRANSITION_SEC, so there is never an empty frame)
  const p = index === 0 ? 1 : interpolate(t, [start, start + TRANSITION_SEC], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const kind = scene.transition ?? "fade";
  const enter: React.CSSProperties =
    kind === "slide-left" ? { translate: `${(1 - p) * W}px 0px` } : kind === "slide-up" ? { translate: `0px ${(1 - p) * H}px` } : kind === "zoom" ? { opacity: p, scale: String(1.25 - 0.25 * p) } : kind === "wipe" ? { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` } : { opacity: p };

  // character
  const chosen = props.character === "none" ? null : props.character === "auto" ? (plan.character ?? "storyteller") : (CHARACTER_IDS as readonly string[]).includes(props.character) ? props.character : "storyteller";
  const who = scene.character && chosen ? (chosen as (typeof CHARACTER_IDS)[number]) : null;
  const side = scene.character?.side ?? (index % 2 ? "right" : "left");
  const stacked = portrait || side === "center";
  const captionTop = H * 0.8; // bottom ~20% belongs to the studio captions
  const pad = W * 0.06;
  const charSize = isRecording ? H * (portrait ? 0.22 : 0.3) : stacked ? H * (portrait ? 0.3 : 0.36) : H * 0.62;
  const charW = (charSize * 2) / 3;
  const charIn = spring({ frame: frame - (start + 0.15) * fps, fps, config: SPRING.soft });

  // content box
  let box: Box;
  if (isRecording) box = { x: W * 0.04, y: H * (portrait ? 0.1 : 0.04), w: W * 0.92, h: captionTop - H * 0.06 };
  else if (!who) box = { x: pad, y: H * 0.08, w: W - pad * 2, h: captionTop - H * 0.12 };
  else if (stacked) box = { x: pad, y: H * 0.07, w: W - pad * 2, h: captionTop - charSize - H * 0.09 };
  else box = { x: side === "left" ? pad + charW + W * 0.02 : pad, y: H * 0.08, w: W - pad * 2 - charW - W * 0.02, h: captionTop - H * 0.12 };

  const charLeft = isRecording ? W - charW - W * 0.02 : stacked ? (W - charW) / 2 : side === "left" ? pad * 0.7 : W - charW - pad * 0.7;
  const weights = scene.elements.map((e) => (e.type === "title" ? 1 : e.type === "icons" || e.type === "illustration" ? 1.4 : 2));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const gap = H * 0.03;
  const usable = box.h - gap * Math.max(0, scene.elements.length - 1);

  return (
    <AbsoluteFill style={{ overflow: "hidden", ...enter }}>
      <SceneBackground variant={scene.bg ?? (["gradient", "particles", "grid"] as const)[index % 3]} colors={scene.colors} seed={index} />
      <SmartZoomContainer keyframes={scene.zoom}>
        <CameraDrift from={start} to={end} push={isRecording ? 0.015 : index % 2 ? -0.04 : 0.05} drift={isRecording ? 0.004 : 0.014} seed={index}>
          <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex", flexDirection: "column", justifyContent: isRecording ? "flex-start" : "center", alignItems: "center", gap }}>
            {scene.elements.map((el, i) => (
              <ElementView key={i} el={el} at={Math.min(Math.max(start, ("at" in el ? el.at : undefined) ?? start + 0.35 + i * 0.7), Math.max(start, end - 0.5))} span={span} box={box} share={(weights[i] / total) * (usable / box.h)} accent={accent} props={props} solo={scene.elements.length === 1} />
            ))}
          </div>
          {who ? (
            <div style={{ position: "absolute", left: charLeft, top: captionTop - charSize + H * (isRecording ? 0.16 : 0.01), opacity: Math.min(1, charIn * 1.5), translate: `0px ${(1 - charIn) * H * 0.12}px` }}>
              <TalkingCharacter character={who} emotion={scene.character?.emotion} audioSrc={props.lipsyncSrc} cues={props.cues} size={charSize} />
            </div>
          ) : null}
        </CameraDrift>
      </SmartZoomContainer>
    </AbsoluteFill>
  );
};

export const SceneEngine: React.FC<VideoProps & { plan: ScenePlan }> = (props) => {
  const t = useTime();
  const spans = sceneSpans(props.plan, props.cues, props.durationSec);
  const accent = props.plan.accent ?? props.brand?.primary ?? "#FBBF24";
  // current scene + the one it is covering during its entrance
  const visible = spans.filter((s) => t >= s.start && t < s.end + TRANSITION_SEC);
  return (
    <AbsoluteFill style={{ background: "#0B1026" }}>
      {props.audioSrc ? <VoiceAudio src={props.audioSrc} /> : null}
      {visible.map((s) => (
        <SceneView key={s.scene.id} span={s} props={props} plan={props.plan} accent={accent} />
      ))}
    </AbsoluteFill>
  );
};

export type { PlanScene };
