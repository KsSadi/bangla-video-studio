/** Auto-Replace Dictionary: pure find-and-replace rules for Bengali spell fixes and tech terms (browser + backend + tests). */

export type DictRule = { from: string; to: string };

export const MAX_RULES = 300;

/** Validate untrusted rules: trimmed, non-empty, `from` != `to`, no duplicates (case-insensitive on `from`). */
export function cleanRules(raw: unknown): DictRule[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: DictRule[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const from = typeof (r as DictRule).from === "string" ? (r as DictRule).from.trim().slice(0, 80) : "";
    const to = typeof (r as DictRule).to === "string" ? (r as DictRule).to.trim().slice(0, 80) : "";
    if (!from || from === to || seen.has(from.toLowerCase())) continue;
    seen.add(from.toLowerCase());
    out.push({ from, to });
    if (out.length >= MAX_RULES) break;
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * One pass over the text with every rule at once (longest `from` first), so a replacement is never re-replaced by a
 * later rule. Latin rules ignore case; Bengali rules are exact and also match inside inflected words (এপিআইকে -> APIকে).
 */
export function applyRules(text: string, rules: DictRule[]): { text: string; count: number } {
  const active = cleanRules(rules);
  if (!active.length || !text) return { text, count: 0 };
  const sorted = [...active].sort((a, b) => b.from.length - a.from.length);
  const map = new Map(sorted.map((r) => [r.from.toLowerCase(), r.to]));
  const re = new RegExp(sorted.map((r) => esc(r.from)).join("|"), "giu");
  let count = 0;
  const out = text.replace(re, (m) => {
    const to = map.get(m.toLowerCase());
    if (to === undefined) return m;
    count++;
    return to;
  });
  return { text: out, count };
}

export function applyToCues<T extends { text: string }>(cues: T[], rules: DictRule[]): { cues: T[]; count: number; lines: number } {
  let count = 0;
  let lines = 0;
  const out = cues.map((c) => {
    const r = applyRules(c.text, rules);
    if (r.count) {
      count += r.count;
      lines++;
      return { ...c, text: r.text };
    }
    return c;
  });
  return { cues: out, count, lines };
}

/** A starter set the user can add with one click. */
export const STARTER_RULES: DictRule[] = [
  { from: "রিয়্যাক্ট", to: "React" },
  { from: "ক্লড", to: "Claude" },
  { from: "এপিআই", to: "API" },
  { from: "জাভাস্ক্রিপ্ট", to: "JavaScript" },
  { from: "পাইথন", to: "Python" },
  { from: "ইউটিউব", to: "YouTube" },
  { from: "গিটহাব", to: "GitHub" },
  { from: "ওয়েবসাইট", to: "website" },
];
