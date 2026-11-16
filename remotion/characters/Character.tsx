import React from "react";

/**
 * Pure SVG cartoon character (no Remotion hooks) so the same component renders
 * in the Next.js UI (static preview) and in Remotion (animated via `t`).
 */
export type Expression = "neutral" | "happy" | "surprised" | "thinking";

export type CharacterStyle = {
  skin: string;
  hair: string;
  hairStyle: "short" | "bun" | "long";
  outfit: string;
  accent: string;
  accessory: "headset" | "glasses" | "book" | "none";
};

export const CHARACTER_STYLES: Record<"tech-mentor" | "storyteller" | "friendly-teacher", CharacterStyle> = {
  "tech-mentor": { skin: "#E0A878", hair: "#1F2433", hairStyle: "short", outfit: "#2563EB", accent: "#22D3EE", accessory: "headset" },
  storyteller: { skin: "#D9A070", hair: "#3B2416", hairStyle: "long", outfit: "#C2410C", accent: "#FBBF24", accessory: "book" },
  "friendly-teacher": { skin: "#E8B48A", hair: "#2A1B12", hairStyle: "bun", outfit: "#0F766E", accent: "#F472B6", accessory: "glasses" },
};

export type CharacterProps = {
  look: CharacterStyle;
  /** Seconds. Drives blinking, breathing and gestures. 0 = static pose. */
  t?: number;
  /** 0 (closed) .. 1 (wide open). */
  mouth?: number;
  expression?: Expression;
  /** Raise and wave the right arm. */
  wave?: boolean;
  /** Pixel height; width is 2/3 of it. */
  size?: number;
  style?: React.CSSProperties;
};

/** Blink for ~0.15s every ~3.4s. Returns eye openness 0..1. */
export const blinkAt = (t: number) => {
  const phase = t % 3.4;
  return phase > 3.25 ? Math.abs((phase - 3.325) / 0.075) : 1;
};

export const Character: React.FC<CharacterProps> = ({ look, t = 0, mouth = 0, expression = "neutral", wave = false, size = 600, style }) => {
  const eye = Math.max(0.08, blinkAt(t)) * (expression === "surprised" ? 1.25 : 1);
  const breathe = Math.sin(t * 2.1) * 3;
  const bob = Math.sin(t * 1.3) * 1.5 + mouth * 1.5;
  const armAngle = wave ? -120 + Math.sin(t * 9) * 16 : 8 + Math.sin(t * 1.7) * 3;
  const browY = expression === "surprised" ? -10 : expression === "thinking" ? -4 : 0;
  const browTilt = expression === "thinking" ? 10 : expression === "happy" ? -4 : 0;
  const smile = expression === "happy" ? 14 : expression === "thinking" ? 2 : 8;
  const open = Math.max(0, Math.min(1, mouth)) * 20 + (expression === "surprised" ? 8 : 0);

  return (
    <svg viewBox="0 0 400 600" width={(size * 2) / 3} height={size} style={style}>
      {/* soft floor shadow */}
      <ellipse cx="200" cy="585" rx="120" ry="12" fill="rgba(0,0,0,0.18)" />

      {/* left arm (rests) */}
      <g transform={`rotate(${-6 - breathe * 0.4} 112 345)`}>
        <rect x="88" y="335" width="48" height="170" rx="24" fill={look.outfit} />
        <circle cx="112" cy="510" r="24" fill={look.skin} />
      </g>

      {/* body */}
      <g transform={`translate(0 ${breathe * 0.5})`}>
        <path d="M105 590 L105 400 Q105 320 200 320 Q295 320 295 400 L295 590 Z" fill={look.outfit} />
        <path d="M168 322 L200 372 L232 322 Z" fill="#fff" opacity="0.92" />
        <rect x="150" y="430" width="100" height="10" rx="5" fill={look.accent} opacity="0.85" />
        {look.accessory === "book" && (
          <g transform="rotate(-8 200 500)">
            <rect x="140" y="462" width="120" height="84" rx="8" fill={look.accent} />
            <rect x="197" y="462" width="6" height="84" fill="rgba(0,0,0,0.25)" />
          </g>
        )}
      </g>

      {/* right arm (gestures / waves) */}
      <g transform={`rotate(${armAngle} 288 345)`}>
        <rect x="264" y="335" width="48" height="170" rx="24" fill={look.outfit} />
        <circle cx="288" cy="510" r="24" fill={look.skin} />
      </g>

      {/* head */}
      <g transform={`translate(0 ${bob}) rotate(${Math.sin(t * 0.9) * 1.5} 200 300)`}>
        <rect x="178" y="270" width="44" height="60" rx="18" fill={look.skin} />
        {look.hairStyle === "long" && <path d="M92 200 Q92 80 200 80 Q308 80 308 200 L308 330 Q270 300 270 230 L130 230 Q130 300 92 330 Z" fill={look.hair} />}
        {look.hairStyle === "bun" && <circle cx="200" cy="72" r="34" fill={look.hair} />}
        <circle cx="96" cy="205" r="18" fill={look.skin} />
        <circle cx="304" cy="205" r="18" fill={look.skin} />
        <ellipse cx="200" cy="195" rx="104" ry="110" fill={look.skin} />
        {/* hair cap + fringe */}
        <path d="M96 190 Q90 84 200 84 Q310 84 304 190 Q280 130 200 128 Q120 130 96 190 Z" fill={look.hair} />

        {/* brows */}
        <g fill="none" stroke={look.hair} strokeWidth="7" strokeLinecap="round">
          <path d="M138 158 Q158 148 178 158" transform={`translate(0 ${browY}) rotate(${browTilt} 158 155)`} />
          <path d="M222 158 Q242 148 262 158" transform={`translate(0 ${browY}) rotate(${-browTilt} 242 155)`} />
        </g>

        {/* eyes (scaleY = blink) */}
        {[158, 242].map((cx) => (
          <g key={cx} transform={`translate(${cx} 192) scale(1 ${eye})`}>
            <ellipse rx="19" ry="21" fill="#fff" />
            <circle cx={expression === "thinking" ? 5 : 0} cy={expression === "thinking" ? -5 : 1} r="10" fill="#1B1B1F" />
            <circle cx="4" cy="-4" r="3.5" fill="#fff" />
          </g>
        ))}

        {look.accessory === "glasses" && (
          <g fill="rgba(255,255,255,0.12)" stroke="#1B1B1F" strokeWidth="6">
            <rect x="126" y="164" width="64" height="56" rx="20" />
            <rect x="210" y="164" width="64" height="56" rx="20" />
            <path d="M190 190 L210 190" fill="none" />
          </g>
        )}

        {/* cheeks */}
        <circle cx="128" cy="232" r="15" fill="#F08A7A" opacity="0.32" />
        <circle cx="272" cy="232" r="15" fill="#F08A7A" opacity="0.32" />

        {/* mouth: smile curve when closed, opens downward when talking */}
        {open < 2 ? (
          <path d={`M170 250 Q200 ${250 + smile * 1.6} 230 250`} fill="none" stroke="#7A2E2E" strokeWidth="7" strokeLinecap="round" />
        ) : (
          <g>
            <path d={`M168 248 Q200 ${244 + smile * 0.5} 232 248 Q${226 - open * 0.2} ${254 + open * 1.5} 200 ${256 + open * 1.5} Q${174 + open * 0.2} ${254 + open * 1.5} 168 248 Z`} fill="#6B1F24" />
            <path d="M178 250 Q200 255 222 250 L220 256 Q200 260 180 256 Z" fill="#fff" />
            {open > 9 && <ellipse cx="200" cy={254 + open * 1.25} rx="15" ry={open * 0.32} fill="#E86A75" />}
          </g>
        )}

        {look.accessory === "headset" && (
          <g>
            <path d="M92 205 Q88 70 200 70 Q312 70 308 205" fill="none" stroke="#111827" strokeWidth="12" strokeLinecap="round" />
            <rect x="76" y="180" width="30" height="58" rx="14" fill={look.accent} />
            <rect x="294" y="180" width="30" height="58" rx="14" fill={look.accent} />
            <path d="M91 236 Q95 272 152 268" fill="none" stroke="#111827" strokeWidth="6" strokeLinecap="round" />
            <circle cx="156" cy="268" r="8" fill="#111827" />
          </g>
        )}
      </g>
    </svg>
  );
};
