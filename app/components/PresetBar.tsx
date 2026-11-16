"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Check, Save, X } from "lucide-react";
import { presetFromSettings, type StudioPreset, type StudioSettings } from "@/lib/settings";
import { btn, field } from "./ui";

/** One-click Studio Presets: the reusable workflow (mode, character, music, captions, brand toggles, feature switches). */
export function PresetBar({ settings, onLoad, disabled }: { settings: StudioSettings; onLoad: (p: Partial<StudioSettings>, name: string) => void; disabled?: boolean }) {
  const [presets, setPresets] = useState<StudioPreset[]>([]);
  const [name, setName] = useState("");
  const [active, setActive] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const d = await fetch("/api/presets", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.presets) setPresets(d.presets as StudioPreset[]);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 2500);
  };

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    const res = await fetch("/api/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, settings: presetFromSettings(settings) }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setSaving(false);
    if (!res?.ok) return flash(d?.error ?? "Could not save the preset.");
    setPresets(d.presets as StudioPreset[]);
    setActive(d.preset.id);
    setName("");
    flash(`Saved "${d.preset.name}"`);
  };

  const remove = async (p: StudioPreset) => {
    if (!confirm(`Delete the preset "${p.name}"?`)) return;
    const res = await fetch(`/api/presets?id=${p.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (d.presets) setPresets(d.presets as StudioPreset[]);
    if (active === p.id) setActive("");
  };

  return (
    <section aria-label="Studio presets" className="shadow-card rise rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent-strong"><Bookmark className="size-4" /></span>
        <div className="mr-1">
          <h2 className="text-sm font-bold leading-tight">Studio presets</h2>
          <p className="text-[11px] text-muted">Mode, character, music, captions, brand toggles and feature switches in one click</p>
        </div>
        <form className="ml-auto flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this setup, e.g. Tech Explainer" aria-label="Preset name" maxLength={50} className={`${field} !w-56 !py-1.5`} />
          <button type="submit" className={btn} disabled={!name.trim() || saving}><Save className="size-4" /> Save current</button>
        </form>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2" role="list">
        {presets.length === 0 && <span className="text-xs text-muted">No presets yet. Set up Steps 2 to 5 the way you like, name it and press Save current.</span>}
        {presets.map((p) => (
          <span key={p.id} role="listitem" className={`inline-flex items-center overflow-hidden rounded-full border text-sm font-semibold transition ${active === p.id ? "border-accent bg-accent/10 text-accent-strong" : "border-line bg-raised hover:border-accent/60"}`}>
            <button type="button" disabled={disabled} onClick={() => { onLoad(p.settings, p.name); setActive(p.id); flash(`Loaded "${p.name}"`); }} className="inline-flex items-center gap-1.5 py-1 pl-3 pr-2 disabled:opacity-50" title={`${p.settings.mode} · ${p.settings.character} · captions ${p.settings.captions} · music ${p.settings.bgm}`}>
              {active === p.id && <Check className="size-3.5" strokeWidth={3} />}
              <span lang="bn">{p.name}</span>
            </button>
            <button type="button" onClick={() => void remove(p)} aria-label={`Delete preset ${p.name}`} className="grid h-full place-items-center border-l border-line px-1.5 py-1.5 text-muted hover:text-red-600"><X className="size-3.5" /></button>
          </span>
        ))}
        {msg && <span role="status" className="text-xs font-semibold text-accent-strong">{msg}</span>}
      </div>
    </section>
  );
}
