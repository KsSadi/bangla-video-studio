/**
 * <IconSpotlight/>: a lucide-react icon (by name) or a pre-built illustration inside a glowing card that
 * lands with spring bounce and keeps a soft pulse. <IconRow/> lays out 1-4 of them with stagger.
 */
import React from "react";
import { icons, type LucideIcon } from "lucide-react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BENGALI_FONT_STACK, SPRING, useTime } from "../lib/kit";
import { Illustration, type IllustrationName } from "./Illustration";

const table = icons as Record<string, LucideIcon>;
/** Accepts "Rocket", "rocket", "bar-chart", "bar_chart", "BarChart". Unknown names fall back to Sparkles. */
export function resolveIcon(name: string): LucideIcon {
  const pascal = name.replace(/(^|[-_\s]+)([a-zA-Z0-9])/g, (_, __, ch: string) => ch.toUpperCase());
  return table[name] ?? table[pascal] ?? table.Sparkles;
}

export type IconSpotlightProps = { icon?: string; illustration?: IllustrationName; label?: string; start: number; size: number; accent?: string };

export const IconSpotlight: React.FC<IconSpotlightProps> = ({ icon = "Sparkles", illustration, label, start, size, accent = "#FBBF24" }) => {
  const frame = useCurrentFrame();
  const t = useTime();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - start * fps, fps, config: SPRING.bouncy });
  const glow = 0.55 + Math.sin((t - start) * 2.2) * 0.2;
  const Icon = resolveIcon(icon);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.12, opacity: Math.min(1, p * 2), scale: String(p), translate: `0px ${(1 - p) * size * 0.3 + Math.sin(t * 1.3 + start) * size * 0.02}px` }}>
      <div style={{ width: size, height: size, borderRadius: size * 0.24, display: "grid", placeItems: "center", background: "linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))", border: `${Math.max(2, size * 0.014)}px solid ${accent}`, boxShadow: `0 0 ${size * 0.35 * glow}px ${accent}88, 0 ${size * 0.08}px ${size * 0.2}px rgba(0,0,0,0.35)` }}>
        {illustration ? <Illustration name={illustration} size={size * 0.78} accent={accent} /> : <Icon size={size * 0.52} color="#fff" strokeWidth={1.8} />}
      </div>
      {label ? (
        <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 600, fontSize: Math.max(28, size * 0.2), lineHeight: 1.45, color: "#fff", textAlign: "center", maxWidth: size * 1.7, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
          {label}
        </div>
      ) : null}
    </div>
  );
};

export const IconRow: React.FC<{ items: { icon: string; label?: string }[]; start: number; size: number; accent?: string }> = ({ items, start, size, accent }) => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: size * 0.45 }}>
    {items.map((it, i) => (
      <IconSpotlight key={i} icon={it.icon} label={it.label} start={start + i * 0.22} size={size} accent={accent} />
    ))}
  </div>
);
