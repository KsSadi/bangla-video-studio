"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Check } from "@/lib/doctor";
import { btn } from "./ui";

const DOT: Record<Check["status"], string> = { ok: "bg-accent-strong", warn: "bg-amber-400", fail: "bg-red-400" };
const GROUPS: Check["group"][] = ["System", "Claude", "Project"];

/** Live environment check. Re-checks on load, on window focus and every 8s while something needs attention. */
export function SetupCheck({ onReady }: { onReady?: (ready: boolean) => void }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const fixing = useRef(false);
  const autoOpened = useRef(false);

  const refresh = useCallback(async () => {
    if (fixing.current) return;
    setLoading(true);
    const d = await fetch("/api/doctor", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setLoading(false);
    if (d?.checks) setChecks(d.checks);
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const blocking = checks?.filter((c) => c.required && c.status === "fail") ?? [];
  const attention = checks?.filter((c) => c.status !== "ok") ?? [];
  const ready = !!checks && blocking.length === 0;

  useEffect(() => onReady?.(ready), [ready, onReady]);

  // Collapse once everything is fine the first time; keep it open while there are problems.
  useEffect(() => {
    if (!checks || autoOpened.current) return;
    autoOpened.current = true;
    setOpen(attention.length > 0);
  }, [checks, attention.length]);

  useEffect(() => {
    if (!attention.length) return;
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [attention.length, refresh]);

  const fix = async (id: string, checkId: string) => {
    setBusy(id);
    setMsg(null);
    fixing.current = true;
    const d = await fetch("/api/doctor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fix: id }) })
      .then((r) => r.json())
      .catch(() => null);
    fixing.current = false;
    setBusy(null);
    if (d?.checks) setChecks(d.checks);
    setMsg({ id: checkId, ok: !!d?.result?.ok, text: d?.result?.message ?? "Fix failed." });
  };

  const headline = !checks ? "Checking your environment…" : blocking.length ? `${blocking.length} required item${blocking.length === 1 ? "" : "s"} need fixing` : attention.length ? "Ready · optional items missing" : "Everything is ready";
  const tone = !checks ? "border-line" : blocking.length ? "border-red-500/50" : attention.length ? "border-amber-400/40" : "border-accent/50";

  return (
    <section aria-label="Environment check" className={`rounded-2xl border bg-panel/90 ${tone}`}>
      <div className="flex items-center gap-3 px-5 py-3">
        <span className={`size-2.5 rounded-full ${!checks ? "animate-pulse bg-muted" : blocking.length ? DOT.fail : attention.length ? DOT.warn : DOT.ok}`} />
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex-1 text-left text-sm font-semibold">
          {headline}
          {checks && <span className="ml-2 text-xs font-normal text-muted">{checks.filter((c) => c.status === "ok").length}/{checks.length} checks passed</span>}
        </button>
        <button type="button" className={btn} onClick={() => void refresh()} disabled={loading || !!busy}>{loading ? "Checking…" : "Re-check"}</button>
      </div>

      {open && checks && (
        <div className="space-y-5 border-t border-line p-5">
          {GROUPS.map((g) => (
            <div key={g}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">{g === "Claude" ? "Claude account & CLI" : g === "System" ? "System tools" : "This project"}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {checks.filter((c) => c.group === g).map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-raised/60 px-4 py-2.5 text-sm">
                    <span className={`size-2 shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
                    <span className="font-semibold">{c.label}</span>
                    {!c.required && <span className="rounded bg-ink px-1.5 text-[10px] text-muted">optional</span>}
                    <span className={`min-w-0 flex-1 truncate text-xs ${c.status === "ok" ? "text-muted" : c.status === "fail" ? "text-red-700" : "text-amber-700"}`} title={c.detail}>{c.detail}</span>
                    {c.status !== "ok" && c.fix && (
                      <button type="button" className={`${btn} !border-accent !text-accent-strong`} disabled={!!busy} onClick={() => void fix(c.fix!, c.id)}>
                        {busy === c.fix ? "Working…" : c.fixLabel ?? "Fix"}
                      </button>
                    )}
                    {c.id === "claude-login" && c.status === "ok" && (
                      <button type="button" className={btn} disabled={!!busy} onClick={() => void fix("claude-test", c.id)}>{busy === "claude-test" ? "Testing…" : "Test"}</button>
                    )}
                    {c.status !== "ok" && c.hint && (!c.fix || msg?.id === c.id) && <code className="basis-full pl-5 font-mono text-[11px] text-muted">{c.hint}</code>}
                    {msg?.id === c.id && <p className={`basis-full whitespace-pre-wrap pl-5 text-xs ${msg.ok ? "text-accent-strong" : "text-red-700"}`}>{msg.text}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
