/** <DataChart/>: animated bar / line / progress chart from a plain number array. Values grow in with easing, one bar can be highlighted. */
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BENGALI_FONT_STACK, EASE_OUT, SPRING, useTime } from "../lib/kit";

export type DataChartProps = {
  chart?: "bar" | "line" | "progress";
  values: number[];
  labels?: string[];
  unit?: string;
  /** Index of the value being talked about. */
  highlight?: number;
  start: number;
  width: number;
  height: number;
  accent?: string;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const fmtNum = (n: number) => (Math.abs(n) >= 100 || Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1));

export const DataChart: React.FC<DataChartProps> = ({ chart = "bar", values, labels = [], unit = "", highlight, start, width, height, accent = "#FBBF24" }) => {
  const frame = useCurrentFrame();
  const t = useTime();
  const { fps } = useVideoConfig();
  const max = Math.max(...values.map(Math.abs), 1e-6);
  const font = Math.max(26, Math.round(height * 0.085));
  const text: React.CSSProperties = { fontFamily: BENGALI_FONT_STACK, fontWeight: 600, fontSize: font, lineHeight: 1.4, color: "#fff" };
  const grow = (i: number, d = 0.9) => interpolate(t, [start + i * 0.18, start + i * 0.18 + d], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const card: React.CSSProperties = { width, height, boxSizing: "border-box", padding: height * 0.07, borderRadius: height * 0.06, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", opacity: interpolate(t, [start - 0.1, start + 0.3], [0, 1], CLAMP), scale: String(0.94 + 0.06 * spring({ frame: frame - start * fps, fps, config: SPRING.smooth })) };

  if (chart === "progress") {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", justifyContent: "center", gap: height * 0.06 }}>
        {values.slice(0, 4).map((v, i) => {
          const pct = Math.min(100, Math.max(0, max <= 1 ? v * 100 : max <= 100 ? v : (v / max) * 100));
          const p = grow(i, 1.1);
          return (
            <div key={i}>
              <div lang="bn" style={{ ...text, display: "flex", justifyContent: "space-between", marginBottom: font * 0.2 }}>
                <span>{labels[i] ?? ""}</span>
                <span style={{ color: i === highlight ? accent : "#fff" }}>{fmtNum(pct * p)}{unit || "%"}</span>
              </div>
              <div style={{ height: font * 0.55, borderRadius: 999, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
                <div style={{ width: `${pct * p}%`, height: "100%", borderRadius: 999, background: i === highlight || highlight === undefined ? accent : "#E5E7EB" }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const padB = font * 1.9;
  const padT = font * 1.6;
  const innerW = width - height * 0.14;
  const innerH = height - height * 0.14 - padB - padT;

  if (chart === "line") {
    const pts = values.map((v, i) => ({ x: values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW, y: padT + innerH - (Math.max(0, v) / max) * innerH }));
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const len = pts.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
    const draw = interpolate(t, [start + 0.2, start + 0.2 + Math.max(0.8, values.length * 0.25)], [0, 1], { ...CLAMP, easing: EASE_OUT });
    return (
      <div style={card}>
        <div style={{ position: "relative", width: innerW, height: innerH + padT + padB }}>
          <svg width={innerW} height={innerH + padT} style={{ overflow: "visible", position: "absolute", left: 0, top: 0 }}>
            <path d={d} fill="none" stroke={accent} strokeWidth={Math.max(4, height * 0.014)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
            {pts.map((p, i) => {
              const on = draw >= (values.length === 1 ? 0 : i / (values.length - 1)) - 0.01;
              return <circle key={i} cx={p.x} cy={p.y} r={on ? Math.max(6, height * 0.02) * (i === highlight ? 1.5 : 1) : 0} fill={i === highlight ? accent : "#fff"} />;
            })}
          </svg>
          {pts.map((p, i) => (
            <div key={i} lang="bn" style={{ ...text, fontSize: font * 0.8, position: "absolute", left: p.x, top: innerH + padT + font * 0.3, translate: "-50% 0", whiteSpace: "nowrap", color: i === highlight ? accent : "#fff" }}>
              {labels[i] ?? fmtNum(values[i])}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const gap = innerW * 0.06;
  const bw = (innerW - gap * (values.length - 1)) / values.length;
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "flex-end", gap, height: innerH + padT + padB }}>
        {values.map((v, i) => {
          const p = grow(i);
          const h = (Math.max(0, v) / max) * innerH * p;
          const hot = i === highlight;
          return (
            <div key={i} style={{ width: bw, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div lang="bn" style={{ ...text, fontSize: font * 0.9, color: hot ? accent : "#fff", opacity: p }}>{fmtNum(v * p)}{unit}</div>
              <div style={{ width: "100%", height: h, borderRadius: `${bw * 0.12}px ${bw * 0.12}px 0 0`, background: hot || highlight === undefined ? accent : "rgba(255,255,255,0.75)", boxShadow: hot ? `0 0 ${bw * 0.4}px ${accent}88` : undefined }} />
              <div lang="bn" style={{ ...text, fontSize: font * 0.8, height: padB, display: "flex", alignItems: "center", textAlign: "center", whiteSpace: "nowrap" }}>{labels[i] ?? ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
