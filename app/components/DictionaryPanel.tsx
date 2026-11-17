"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { STARTER_RULES, applyToCues, cleanRules, type DictRule } from "@/lib/dictionary-core";
import type { Cue } from "@/remotion/lib/types";
import { Collapsible, btn, field } from "./ui";

/** Auto-Replace Dictionary: saved find-and-replace rules, applied automatically to every Whisper result. */
export function DictionaryPanel({ cues, setCues, disabled }: { cues: Cue[]; setCues: (fn: (cs: Cue[]) => Cue[]) => void; disabled?: boolean }) {
  const [rules, setRules] = useState<DictRule[]>([]);
  const [saved, setSaved] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void fetch("/api/dictionary", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setRules(d.rules ?? []);
        setSaved((d.rules ?? []).length);
      })
      .catch(() => {});
  }, []);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3500);
  };
  const edit = (i: number, p: Partial<DictRule>) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const save = async () => {
    const res = await fetch("/api/dictionary", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) return flash("Could not save the dictionary.");
    setRules(d.rules);
    setSaved(d.rules.length);
    flash(`Saved ${d.rules.length} rule${d.rules.length === 1 ? "" : "s"}. They apply automatically after every Whisper run.`);
  };

  const applyNow = () => {
    const active = cleanRules(rules);
    const r = applyToCues(cues, active);
    if (!r.count) return flash("Nothing to replace in the current subtitles.");
    setCues(() => r.cues);
    flash(`Replaced ${r.count} term${r.count === 1 ? "" : "s"} in ${r.lines} line${r.lines === 1 ? "" : "s"}.`);
  };

  const addStarter = () => setRules((rs) => cleanRules([...rs, ...STARTER_RULES]));

  return (
    <Collapsible title="Word fixer (auto-replace)" badge={saved ? `${saved} rule${saved === 1 ? "" : "s"}` : "empty"}>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Whisper often spells tech terms and brand names phonetically. Save a rule once (for example <b lang="bn">রিয়্যাক্ট → React</b>) and it is applied automatically to every new Whisper transcript. Latin rules ignore case; Bengali rules also match inside inflected words (<span lang="bn">এপিআইকে → APIকে</span>).
      </p>
      <ul className="space-y-2">
        {rules.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            <input lang="bn" value={r.from} onChange={(e) => edit(i, { from: e.target.value })} placeholder="Whisper writes…" aria-label={`Rule ${i + 1} find`} maxLength={80} className={field} />
            <span className="text-muted" aria-hidden>→</span>
            <input lang="bn" value={r.to} onChange={(e) => edit(i, { to: e.target.value })} placeholder="Replace with…" aria-label={`Rule ${i + 1} replace`} maxLength={80} className={field} />
            <button type="button" className={btn} aria-label={`Remove rule ${i + 1}`} onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setRules((rs) => [...rs, { from: "", to: "" }])}><Plus className="size-4" /> Add rule</button>
        <button type="button" className={btn} onClick={addStarter}><Sparkles className="size-4" /> Add common tech terms</button>
        <button type="button" className={btn} onClick={() => void save()}><Save className="size-4" /> Save dictionary</button>
        <button type="button" className={btn} disabled={disabled || !cues.length} onClick={applyNow}><Wand2 className="size-4" /> Apply to current subtitles</button>
        {msg && <span role="status" className="text-xs font-semibold text-accent-strong">{msg}</span>}
      </div>
    </Collapsible>
  );
}
