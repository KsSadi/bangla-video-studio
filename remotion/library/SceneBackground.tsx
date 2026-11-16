/** <SceneBackground/>: animated gradient, floating particles, or a drifting parallax grid. Always moving, never busy. */
import React from "react";
import { AbsoluteFill, random, useVideoConfig } from "remotion";
import { GradientBackground, useTime } from "../lib/kit";

export type SceneBackgroundProps = { variant?: "gradient" | "particles" | "grid"; colors?: string[]; seed?: number };
const DEFAULT = ["#0B1026", "#1E2A78", "#7C3AED"];

export const SceneBackground: React.FC<SceneBackgroundProps> = ({ variant = "gradient", colors, seed = 0 }) => {
  const t = useTime();
  const { width, height } = useVideoConfig();
  const c = [colors?.[0] ?? DEFAULT[0], colors?.[1] ?? DEFAULT[1], colors?.[2] ?? colors?.[1] ?? DEFAULT[2]] as [string, string, string];
  if (variant === "gradient") return <GradientBackground colors={c} />;
  if (variant === "particles") {
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <GradientBackground colors={c} />
        {Array.from({ length: 26 }, (_, i) => {
          const r = (k: string) => random(`${seed}-${i}-${k}`);
          const depth = 0.3 + r("d") * 0.7; // nearer particles are bigger, faster, brighter
          const size = width * (0.004 + depth * 0.012);
          const y = ((r("y") * 1.2 - (t * (0.012 + depth * 0.03))) % 1.2 + 1.2) % 1.2 - 0.1;
          const x = r("x") + Math.sin(t * (0.3 + r("s")) + i) * 0.02 * depth;
          return <div key={i} style={{ position: "absolute", left: x * width, top: y * height, width: size, height: size, borderRadius: "50%", background: i % 3 === 0 ? c[2] : "#fff", opacity: 0.12 + depth * 0.3, filter: `blur(${(1 - depth) * 3}px)` }} />;
        })}
      </AbsoluteFill>
    );
  }
  const cell = Math.max(width, height) / 14;
  const off = (t * cell * 0.25) % cell;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, ${c[1]} 0%, ${c[0]} 70%)`, overflow: "hidden" }}>
      {/* far layer */}
      <AbsoluteFill style={{ opacity: 0.1, backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`, backgroundSize: `${cell / 2}px ${cell / 2}px`, backgroundPosition: `${-off / 2}px ${-off / 2}px` }} />
      {/* near layer moves faster: parallax */}
      <AbsoluteFill style={{ opacity: 0.16, backgroundImage: `linear-gradient(${c[2]} 2px, transparent 2px), linear-gradient(90deg, ${c[2]} 2px, transparent 2px)`, backgroundSize: `${cell}px ${cell}px`, backgroundPosition: `${-off}px ${-off}px`, scale: String(1.04 + Math.sin(t * 0.3) * 0.02) }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, transparent 40%, ${c[0]} 100%)` }} />
    </AbsoluteFill>
  );
};
