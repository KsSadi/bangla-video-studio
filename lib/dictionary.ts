import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/store";
import { cleanRules, type DictRule } from "@/lib/dictionary-core";

const FILE = path.join(DATA_DIR, "dictionary.json");

export function loadDictionary(): DictRule[] {
  try {
    return cleanRules(JSON.parse(fs.readFileSync(FILE, "utf8")).rules);
  } catch {
    return [];
  }
}

export function saveDictionary(raw: unknown): DictRule[] {
  const rules = cleanRules(raw);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE + ".tmp", JSON.stringify({ rules }, null, 2));
  fs.renameSync(FILE + ".tmp", FILE);
  return rules;
}
