/**
 * <SmartZoomContainer/>: smooth camera pan-and-zoom around its children. Give it keyframes
 * ({ at, x, y, scale, hold } with x/y as 0..1 fractions); it eases in before `at`, holds, eases back.
 * Used for emphasis in scenes and on top of browser recordings.
 */
import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { useTime } from "../lib/kit";

export type ZoomKeyframe = { at: number; x: number; y: number; scale: number; hold: number };
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Camera state at time t: strength-weighted blend of the active keyframes (so close keyframes pan instead of snapping). */
export function zoomAt(keyframes: ZoomKeyframe[], t: number): { scale: number; x: number; y: number } {
  let w = 0;
  let x = 0;
  let y = 0;
  let s = 0;
  let peak = 0;
  for (const k of keyframes) {
    const p = interpolate(t, [k.at - 0.7, k.at, k.at + k.hold, k.at + k.hold + 0.8], [0, 1, 1, 0], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
    if (p <= 0) continue;
    w += p;
    x += k.x * p;
    y += k.y * p;
    s += k.scale * p;
    peak = Math.max(peak, p);
  }
  if (w === 0) return { scale: 1, x: 0.5, y: 0.5 };
  return { scale: 1 + (s / w - 1) * peak, x: x / w, y: y / w };
}

export const SmartZoomContainer: React.FC<{ keyframes?: ZoomKeyframe[]; children: React.ReactNode; style?: React.CSSProperties }> = ({ keyframes = [], children, style }) => {
  const t = useTime();
  const z = zoomAt(keyframes, t);
  return <AbsoluteFill style={{ scale: String(z.scale), transformOrigin: `${z.x * 100}% ${z.y * 100}%`, ...style }}>{children}</AbsoluteFill>;
};
