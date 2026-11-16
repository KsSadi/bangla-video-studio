"use client";

import { useEffect, useState } from "react";
import { Check, Save, X } from "lucide-react";
import { ACCESSORIES, Character, DEFAULT_CUSTOM_LOOK, HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, OUTFIT_STYLES, SKIN_TONES, type CharacterStyle } from "@/remotion/characters/Character";
import type { SavedCharacter } from "@/lib/characters";
import { Toggle, btn, btnPrimary, field } from "./ui";

const HAIR_LABEL: Record<(typeof HAIR_STYLES)[number], string> = { short: "Short", bun: "Bun", long: "Long", curly: "Curly", bob: "Bob", buzz: "Buzz cut", bald: "Bald" };
const OUTFIT_LABEL: Record<(typeof OUTFIT_STYLES)[number], string> = { shirt: "Shirt", panjabi: "Panjabi", suit: "Formal suit", hoodie: "Casual hoodie", saree: "Saree" };
const ACC_LABEL: Record<(typeof ACCESSORIES)[number], string> = { none: "None", headset: "Headset", glasses: "Glasses", book: "Book" };

const Swatches = ({ value, colors, onChange, label }: { value: string; colors: string[]; onChange: (c: string) => void; label: string }) => (
  <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
    {colors.map((c) => (
      <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c.toLowerCase()} aria-label={c} onClick={() => onChange(c)} className={`grid size-8 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-panel transition ${value.toLowerCase() === c.toLowerCase() ? "ring-accent" : "ring-transparent hover:ring-line"}`} style={{ background: c, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.15)" }}>
        {value.toLowerCase() === c.toLowerCase() && <Check className="size-4" strokeWidth={3} style={{ color: ["#F8FAFC", "#F6D5B8", "#E8B48A"].includes(c) ? "#111" : "#fff" }} />}
      </button>
    ))}
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} (custom)`} className="size-8 cursor-pointer rounded-full border border-line bg-panel p-0.5" />
  </div>
);

const Chips = <T extends string>({ value, options, labels, onChange, label }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void; label: string }) => (
  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
    {options.map((o) => (
      <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${value === o ? "border-accent bg-accent/10 text-accent-strong" : "border-line bg-panel text-muted hover:text-fg"}`}>
        {labels[o]}
      </button>
    ))}
  </div>
);

const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{title}</div>
    {children}
  </div>
);

/** Mix-and-match SVG character designer. Saves to the local library (data/characters.json) for future videos. */
export function CharacterBuilder({ initial, onClose, onSaved }: { initial?: SavedCharacter | null; onClose: () => void; onSaved: (c: SavedCharacter) => void }) {
  const [look, setLook] = useState<CharacterStyle>(initial?.look ?? DEFAULT_CUSTOM_LOOK);
  const [name, setName] = useState(initial?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [t, setT] = useState(0);
  const set = (p: Partial<CharacterStyle>) => setLook((l) => ({ ...l, ...p }));

  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 0.07), 70);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/characters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: initial?.id, name: name.trim() || "My character", look }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setErr(data?.error ?? "Could not save.");
    onSaved(data.character as SavedCharacter);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-3 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Character Customizer" className="rise flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-lg font-bold">Character Customizer</h2>
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent-strong">SVG · saved locally</span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid size-9 place-items-center rounded-lg border border-line text-muted hover:text-fg"><X className="size-4" /></button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[280px_1fr]">
          <div className="flex flex-col items-center gap-3 border-b border-line bg-gradient-to-b from-raised to-ink p-5 md:border-b-0 md:border-r">
            <div className="grid w-full flex-1 place-items-center rounded-xl bg-[radial-gradient(circle_at_50%_30%,var(--glow),transparent_70%)] py-4">
              <Character look={look} t={t} mouth={Math.max(0, Math.sin(t * 5)) * 0.8} expression="happy" size={340} />
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Character name" aria-label="Character name" className={field} lang="bn" />
          </div>

          <div className="space-y-5 p-5">
            <Row title="Hair style"><Chips value={look.hairStyle} options={HAIR_STYLES} labels={HAIR_LABEL} onChange={(v) => set({ hairStyle: v })} label="Hair style" /></Row>
            <Row title="Hair colour"><Swatches value={look.hair} colors={HAIR_COLORS} onChange={(c) => set({ hair: c })} label="Hair colour" /></Row>
            <Row title="Skin tone"><Swatches value={look.skin} colors={SKIN_TONES} onChange={(c) => set({ skin: c })} label="Skin tone" /></Row>
            <Row title="Outfit"><Chips value={look.outfitStyle ?? "shirt"} options={OUTFIT_STYLES} labels={OUTFIT_LABEL} onChange={(v) => set({ outfitStyle: v })} label="Outfit" /></Row>
            <div className="grid gap-5 sm:grid-cols-2">
              <Row title="Outfit colour"><Swatches value={look.outfit} colors={OUTFIT_COLORS} onChange={(c) => set({ outfit: c })} label="Outfit colour" /></Row>
              <Row title="Accent (trim, tie, pallu)"><Swatches value={look.accent} colors={["#22D3EE", "#FBBF24", "#F472B6", "#34D399", "#F8FAFC", "#EF4444"]} onChange={(c) => set({ accent: c })} label="Accent colour" /></Row>
            </div>
            <Row title="Accessory"><Chips value={look.accessory} options={ACCESSORIES} labels={ACC_LABEL} onChange={(v) => set({ accessory: v })} label="Accessory" /></Row>
            <div className="grid gap-3 sm:grid-cols-3">
              <Toggle label="Glasses" checked={!!look.glasses} onChange={(v) => set({ glasses: v })} />
              <Toggle label="Beard" checked={!!look.beard} onChange={(v) => set({ beard: v })} />
              <Toggle label="Bindi" checked={!!look.bindi} onChange={(v) => set({ bindi: v })} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-raised/60 px-5 py-3">
          {err && <span role="alert" className="text-sm text-red-600">{err}</span>}
          <button type="button" className={`${btn} ml-auto`} onClick={() => setLook(DEFAULT_CUSTOM_LOOK)}>Reset</button>
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void save()}><Save className="size-4" /> {busy ? "Saving…" : initial ? "Update character" : "Save to library"}</button>
        </div>
      </div>
    </div>
  );
}
