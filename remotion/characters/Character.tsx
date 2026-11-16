import React from "react";

/**
 * Pure SVG cartoon character (no Remotion hooks) so the same component renders
 * in the Next.js UI (static preview, Character Builder) and in Remotion (animated via `t`).
 */
export type Expression = "neutral" | "happy" | "surprised" | "thinking";

export const HAIR_STYLES = ["short", "bun", "long", "curly", "bob", "buzz", "bald"] as const;
export const OUTFIT_STYLES = ["shirt", "panjabi", "suit", "hoodie", "saree"] as const;
export const ACCESSORIES = ["headset", "glasses", "book", "none"] as const;

export type CharacterStyle = {
  skin: string;
  hair: string;
  hairStyle: (typeof HAIR_STYLES)[number];
  outfit: string;
  accent: string;
  accessory: (typeof ACCESSORIES)[number];
  /** Added by the Character Builder; absent = classic shirt, nothing extra. */
  outfitStyle?: (typeof OUTFIT_STYLES)[number];
  glasses?: boolean;
  beard?: boolean;
  bindi?: boolean;
};

export const CHARACTER_STYLES: Record<"tech-mentor" | "storyteller" | "friendly-teacher", CharacterStyle> = {
  "tech-mentor": { skin: "#E0A878", hair: "#1F2433", hairStyle: "short", outfit: "#2563EB", accent: "#22D3EE", accessory: "headset" },
  storyteller: { skin: "#D9A070", hair: "#3B2416", hairStyle: "long", outfit: "#C2410C", accent: "#FBBF24", accessory: "book" },
  "friendly-teacher": { skin: "#E8B48A", hair: "#2A1B12", hairStyle: "bun", outfit: "#0F766E", accent: "#F472B6", accessory: "glasses" },
};

export const SKIN_TONES = ["#F6D5B8", "#E8B48A", "#E0A878", "#C68642", "#A0693A", "#6F4428"];
export const HAIR_COLORS = ["#1F2433", "#2A1B12", "#3B2416", "#6B4423", "#B8860B", "#9CA3AF", "#7C2D12"];
export const OUTFIT_COLORS = ["#2563EB", "#0F766E", "#C2410C", "#7C3AED", "#BE123C", "#111827", "#F8FAFC", "#CA8A04"];

export const DEFAULT_CUSTOM_LOOK: CharacterStyle = { skin: "#E8B48A", hair: "#2A1B12", hairStyle: "short", outfit: "#0F766E", accent: "#FBBF24", accessory: "none", outfitStyle: "shirt" };

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

const SHADE = "rgba(0,0,0,0.22)";

/** Hair that sits BEHIND the head. */
const HairBack: React.FC<{ look: CharacterStyle }> = ({ look }) => {
  switch (look.hairStyle) {
    case "long":
      return <path d="M92 200 Q92 80 200 80 Q308 80 308 200 L308 330 Q270 300 270 230 L130 230 Q130 300 92 330 Z" fill={look.hair} />;
    case "bob":
      return <path d="M92 200 Q88 78 200 78 Q312 78 308 200 L308 292 Q288 300 272 276 L272 214 L128 214 L128 276 Q112 300 92 292 Z" fill={look.hair} />;
    case "bun":
      return <circle cx="200" cy="72" r="34" fill={look.hair} />;
    case "curly":
      return (
        <g fill={look.hair}>
          {[
            [108, 160, 40],
            [146, 108, 42],
            [200, 90, 46],
            [254, 108, 42],
            [292, 160, 40],
            [98, 212, 30],
            [302, 212, 30],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    default:
      return null;
  }
};

/** Cap + fringe in front of the forehead. */
const HairFront: React.FC<{ look: CharacterStyle }> = ({ look }) => {
  if (look.hairStyle === "bald") return null;
  if (look.hairStyle === "buzz") return <path d="M104 182 Q100 100 200 98 Q300 100 296 182 Q270 144 200 142 Q130 144 104 182 Z" fill={look.hair} opacity="0.9" />;
  return <path d="M96 190 Q90 84 200 84 Q310 84 304 190 Q280 130 200 128 Q120 130 96 190 Z" fill={look.hair} />;
};

const Torso: React.FC<{ look: CharacterStyle }> = ({ look }) => {
  const style = look.outfitStyle ?? "shirt";
  const body = <path d="M105 590 L105 400 Q105 320 200 320 Q295 320 295 400 L295 590 Z" fill={look.outfit} />;
  switch (style) {
    case "panjabi":
      return (
        <g>
          {body}
          <path d="M172 322 Q200 348 228 322 L228 340 Q200 366 172 340 Z" fill={look.accent} />
          <path d="M200 352 L200 570" stroke={look.accent} strokeWidth="6" />
          {[388, 436, 484].map((y) => (
            <circle key={y} cx="200" cy={y} r="6" fill={look.accent} />
          ))}
          <rect x="105" y="566" width="190" height="24" fill={look.accent} opacity="0.45" />
          <path d="M105 590 L105 560 M295 590 L295 560" stroke={SHADE} strokeWidth="2" />
        </g>
      );
    case "suit":
      return (
        <g>
          {body}
          <path d="M168 322 L200 410 L232 322 Z" fill="#fff" opacity="0.95" />
          <path d="M150 330 L192 428 L164 446 L128 384 Z" fill={SHADE} />
          <path d="M250 330 L208 428 L236 446 L272 384 Z" fill={SHADE} />
          <path d="M193 342 L207 342 L213 446 L200 470 L187 446 Z" fill={look.accent} />
          <circle cx="200" cy="510" r="6" fill="rgba(0,0,0,0.35)" />
          <circle cx="200" cy="548" r="6" fill="rgba(0,0,0,0.35)" />
        </g>
      );
    case "hoodie":
      return (
        <g>
          <ellipse cx="200" cy="334" rx="98" ry="40" fill={SHADE} />
          {body}
          <ellipse cx="200" cy="332" rx="62" ry="26" fill={SHADE} />
          <path d="M180 346 L176 430 M220 346 L224 430" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
          <rect x="146" y="486" width="108" height="64" rx="18" fill="none" stroke={SHADE} strokeWidth="4" />
        </g>
      );
    case "saree":
      return (
        <g>
          {body}
          <path d="M165 322 Q200 376 235 322 Z" fill={look.skin} />
          <path d="M160 322 Q200 384 240 322" fill="none" stroke={look.accent} strokeWidth="6" />
          <path d="M262 324 L298 348 L196 590 L118 590 Z" fill={look.accent} opacity="0.96" />
          <path d="M262 324 L298 348 L196 590" fill="none" stroke="#FBBF24" strokeWidth="6" />
          <path d="M122 560 L296 560" stroke="#FBBF24" strokeWidth="5" opacity="0.8" />
        </g>
      );
    default:
      return (
        <g>
          {body}
          <path d="M168 322 L200 372 L232 322 Z" fill="#fff" opacity="0.92" />
          <rect x="150" y="430" width="100" height="10" rx="5" fill={look.accent} opacity="0.85" />
        </g>
      );
  }
};

const Arm: React.FC<{ look: CharacterStyle; x: number; angle: number; pivot: [number, number] }> = ({ look, x, angle, pivot }) => {
  const short = (look.outfitStyle ?? "shirt") === "saree";
  return (
    <g transform={`rotate(${angle} ${pivot[0]} ${pivot[1]})`}>
      {short ? (
        <>
          <rect x={x} y="335" width="48" height="170" rx="24" fill={look.skin} />
          <rect x={x} y="335" width="48" height="84" rx="22" fill={look.accent} />
        </>
      ) : (
        <rect x={x} y="335" width="48" height="170" rx="24" fill={look.outfit} />
      )}
      <circle cx={x + 24} cy="510" r="24" fill={look.skin} />
    </g>
  );
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
  const glasses = look.accessory === "glasses" || !!look.glasses;

  return (
    <svg viewBox="0 0 400 600" width={(size * 2) / 3} height={size} style={style}>
      {/* soft floor shadow */}
      <ellipse cx="200" cy="585" rx="120" ry="12" fill="rgba(0,0,0,0.18)" />

      {/* left arm (rests) */}
      <Arm look={look} x={88} angle={-6 - breathe * 0.4} pivot={[112, 345]} />

      {/* body */}
      <g transform={`translate(0 ${breathe * 0.5})`}>
        <Torso look={look} />
        {look.accessory === "book" && (
          <g transform="rotate(-8 200 500)">
            <rect x="140" y="462" width="120" height="84" rx="8" fill={look.accent} />
            <rect x="197" y="462" width="6" height="84" fill="rgba(0,0,0,0.25)" />
          </g>
        )}
      </g>

      {/* right arm (gestures / waves) */}
      <Arm look={look} x={264} angle={armAngle} pivot={[288, 345]} />

      {/* head */}
      <g transform={`translate(0 ${bob}) rotate(${Math.sin(t * 0.9) * 1.5} 200 300)`}>
        <rect x="178" y="270" width="44" height="60" rx="18" fill={look.skin} />
        <HairBack look={look} />
        <circle cx="96" cy="205" r="18" fill={look.skin} />
        <circle cx="304" cy="205" r="18" fill={look.skin} />
        <ellipse cx="200" cy="195" rx="104" ry="110" fill={look.skin} />
        <HairFront look={look} />

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

        {glasses && (
          <g fill="rgba(255,255,255,0.12)" stroke="#1B1B1F" strokeWidth="6">
            <rect x="126" y="164" width="64" height="56" rx="20" />
            <rect x="210" y="164" width="64" height="56" rx="20" />
            <path d="M190 190 L210 190" fill="none" />
          </g>
        )}

        {look.bindi && <circle cx="200" cy="146" r="6" fill="#DC2626" />}

        {/* cheeks */}
        <circle cx="128" cy="232" r="15" fill="#F08A7A" opacity="0.32" />
        <circle cx="272" cy="232" r="15" fill="#F08A7A" opacity="0.32" />

        {look.beard && <path d="M110 222 Q114 328 200 336 Q286 328 290 222 Q266 286 200 290 Q134 286 110 222 Z" fill={look.hair} />}

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

        {look.beard && <path d="M160 242 Q200 226 240 242 Q200 252 160 242 Z" fill={look.hair} />}

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
