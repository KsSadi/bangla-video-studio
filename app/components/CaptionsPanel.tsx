"use client";

import { Captions as CaptionsIcon } from "lucide-react";
import { CAPTION_STYLES, type StudioSettings } from "@/lib/settings";
import { Segmented, Toggle, card } from "./ui";

type Style = (typeof CAPTION_STYLES)[number];

const STYLES: { id: Style; title: string; desc: string }[] = [
  { id: "kinetic", title: "Word Pop", desc: "Reels / Shorts style: the spoken word scales up in your accent colour" },
  { id: "pill", title: "Box", desc: "Dark frosted-glass pill with crisp white text" },
  { id: "glow", title: "Glow", desc: "Creator style: soft glow, gradient-coloured keyword" },
  { id: "classic", title: "Simple Bar", desc: "Clean bottom-aligned subtitle bar" },
];

const BG = "linear-gradient(135deg,#0B1026,#1E2A78 55%,#7C3AED)";
const FONT = '"Hind Siliguri","Noto Sans Bengali",sans-serif';

/** Tiny CSS approximation of each Remotion caption theme (the real render uses the same colours, fonts and shapes). */
function Sample({ id, size }: { id: Style; size: number }) {
  const fs = 15 * size;
  const base = { fontFamily: FONT, fontSize: fs, lineHeight: 1.4, color: "#fff", whiteSpace: "nowrap" } as const;
  return (
    <div className="grid h-20 place-items-center overflow-hidden rounded-lg px-2" style={{ background: BG }} aria-hidden>
      {id === "kinetic" && (
        <div style={{ ...base, fontWeight: 700, textShadow: "0 2px 8px rgba(0,0,0,.8)" }} lang="bn">
          আজ{" "}
          <span style={{ color: "#FBBF24", display: "inline-block", transform: "scale(1.2)", textShadow: "0 0 14px #FBBF2488", margin: "0 0.12em" }}>আমরা</span>{" "}
          শিখব
        </div>
      )}
      {id === "pill" && (
        <div lang="bn" style={{ ...base, fontWeight: 600, padding: "3px 14px", borderRadius: 999, background: "linear-gradient(180deg,rgba(24,28,52,.62),rgba(8,10,24,.56))", border: "1px solid rgba(255,255,255,.25)", backdropFilter: "blur(10px)", boxShadow: "0 6px 18px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.28)" }}>
          আজ আমরা শিখব
        </div>
      )}
      {id === "glow" && (
        <div lang="bn" style={{ ...base, fontWeight: 700, filter: "drop-shadow(0 3px 8px rgba(0,0,0,.6)) drop-shadow(0 0 12px rgba(251,191,36,.35))" }}>
          আজ আমরা{" "}
          <span style={{ backgroundImage: "linear-gradient(95deg,#FBBF24,#F472B6)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", display: "inline-block", transform: "scale(1.08)" }}>React</span>
        </div>
      )}
      {id === "classic" && (
        <div lang="bn" style={{ ...base, fontWeight: 500, fontSize: fs * 0.85, padding: "3px 12px", borderRadius: 6, background: "rgba(8,10,24,.78)" }}>
          আজ আমরা শিখব
        </div>
      )}
    </div>
  );
}

/** Subtitles master switch + the four modern themes + size and position. */
export function CaptionsPanel({ settings, patch }: { settings: StudioSettings; patch: (p: Partial<StudioSettings>) => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <CaptionsIcon className="size-4 text-accent-strong" />
        <h3 className="text-sm font-semibold">Subtitles</h3>
      </div>
      <Toggle
        label="Show Subtitles"
        desc={settings.captionsOn ? "ON: Bengali captions are burned into the video." : "OFF: a completely clean video with no on-screen captions. The .srt still times the scenes."}
        checked={settings.captionsOn}
        onChange={(v) => patch({ captionsOn: v })}
      />

      {settings.captionsOn && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Modern subtitle style</div>
            <div role="radiogroup" aria-label="Subtitle style" className="grid gap-2 sm:grid-cols-2">
              {STYLES.map((c) => (
                <button type="button" role="radio" aria-checked={settings.captions === c.id} key={c.id} onClick={() => patch({ captions: c.id })} className={`${card(settings.captions === c.id)} !p-2.5`}>
                  <Sample id={c.id} size={settings.captionSize} />
                  <span className="mt-2 block text-sm font-semibold">{c.title}</span>
                  <span className="block text-xs leading-snug text-muted">{c.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 flex items-center justify-between font-semibold">Font size <span className="tabular font-mono text-xs font-normal text-muted">{Math.round(settings.captionSize * 100)}%</span></span>
              <input type="range" min={0.6} max={1.6} step={0.05} value={settings.captionSize} onChange={(e) => patch({ captionSize: Number(e.target.value) })} className="w-full accent-[var(--color-accent)]" aria-label="Subtitle font size" />
            </label>
            <div className="text-sm">
              <span className="mb-1 block font-semibold">Vertical position</span>
              <Segmented label="Subtitle position" value={settings.captionPosition} onChange={(v) => patch({ captionPosition: v })} options={[{ id: "bottom", label: "Bottom" }, { id: "center", label: "Center" }]} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
