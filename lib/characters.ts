/** Local library of custom SVG characters made in the Character Builder (data/characters.json). */
import fs from "node:fs";
import path from "node:path";
import { ACCESSORIES, DEFAULT_CUSTOM_LOOK, HAIR_STYLES, OUTFIT_STYLES, type CharacterStyle } from "@/remotion/characters/Character";
import { DATA_DIR } from "@/lib/store";

export type SavedCharacter = { id: string; name: string; look: CharacterStyle; createdAt: string };

const FILE = path.join(DATA_DIR, "characters.json");
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Validate an untrusted look: only known enums and hex colours get through. */
export function sanitizeLook(raw: unknown): CharacterStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CUSTOM_LOOK;
  return {
    skin: hex(r.skin, d.skin),
    hair: hex(r.hair, d.hair),
    hairStyle: oneOf(r.hairStyle, HAIR_STYLES, "short"),
    outfit: hex(r.outfit, d.outfit),
    accent: hex(r.accent, d.accent),
    accessory: oneOf(r.accessory, ACCESSORIES, "none"),
    outfitStyle: oneOf(r.outfitStyle, OUTFIT_STYLES, "shirt"),
    glasses: r.glasses === true,
    beard: r.beard === true,
    bindi: r.bindi === true,
  };
}

export function listCharacters(): SavedCharacter[] {
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return (Array.isArray(arr) ? arr : [])
      .filter((c) => c && typeof c.id === "string" && /^[a-z0-9-]{3,40}$/.test(c.id))
      .map((c) => ({ id: c.id, name: String(c.name ?? "Character").slice(0, 40), look: sanitizeLook(c.look), createdAt: String(c.createdAt ?? "") }));
  } catch {
    return [];
  }
}

const write = (list: SavedCharacter[]) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(list, null, 2));
  fs.renameSync(FILE + ".tmp", FILE);
};

export function saveCharacter(input: { id?: string; name: unknown; look: unknown }): SavedCharacter {
  const list = listCharacters();
  const name = (typeof input.name === "string" ? input.name.trim() : "").slice(0, 40) || "My character";
  const look = sanitizeLook(input.look);
  const existing = input.id ? list.find((c) => c.id === input.id) : undefined;
  if (existing) {
    existing.name = name;
    existing.look = look;
    write(list);
    return existing;
  }
  const item: SavedCharacter = { id: `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name, look, createdAt: new Date().toISOString() };
  write([item, ...list].slice(0, 60));
  return item;
}

export function deleteCharacter(id: string): boolean {
  const list = listCharacters();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  write(next);
  return true;
}

export const getCharacterLook = (id: string): CharacterStyle | undefined => listCharacters().find((c) => c.id === id)?.look;
