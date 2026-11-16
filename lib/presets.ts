/** Studio Presets: named, reusable workflows saved in data/presets.json (see PRESET_KEYS in settings.ts for what a preset holds). */
import fs from "node:fs";
import path from "node:path";
import { presetFromSettings, type StudioPreset } from "@/lib/settings";
import { DATA_DIR } from "@/lib/store";

const FILE = path.join(DATA_DIR, "presets.json");

export function listPresets(): StudioPreset[] {
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return (Array.isArray(arr) ? arr : [])
      .filter((p) => p && typeof p.id === "string" && /^p-[a-z0-9]{3,24}$/.test(p.id))
      .map((p) => ({ id: p.id, name: String(p.name ?? "Preset").slice(0, 50), settings: presetFromSettings(p.settings), createdAt: String(p.createdAt ?? "") }));
  } catch {
    return [];
  }
}

const write = (list: StudioPreset[]) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(list, null, 2));
  fs.renameSync(FILE + ".tmp", FILE);
};

/** Save under a name; the same name (case-insensitive) updates the existing preset. */
export function savePreset(nameRaw: unknown, settings: unknown): StudioPreset {
  const name = (typeof nameRaw === "string" ? nameRaw.trim() : "").slice(0, 50) || "My preset";
  const list = listPresets();
  const existing = list.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const preset: StudioPreset = { id: existing?.id ?? `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name, settings: presetFromSettings(settings), createdAt: existing?.createdAt ?? new Date().toISOString() };
  write([preset, ...list.filter((p) => p.id !== preset.id)].slice(0, 40));
  return preset;
}

export function deletePreset(id: string): boolean {
  const list = listPresets();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  write(next);
  return true;
}
