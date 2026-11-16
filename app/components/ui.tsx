"use client";

import { useState } from "react";

export const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
export const card = (active: boolean) => `rounded-xl border p-4 text-left transition-colors cursor-pointer ${active ? "border-accent bg-accent/10" : "border-line bg-raised hover:border-muted"}`;
export const field = "w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm placeholder:text-muted";
export const btn = "rounded-lg border border-line bg-raised px-3 py-1.5 text-sm font-semibold transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40";
export const btnPrimary = "rounded-xl bg-accent px-6 py-3 text-base font-bold text-accent-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40";

export function Section({ n, title, children, hint }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">{n}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <span className="ml-auto hidden text-xs text-muted sm:block">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Accessible ON/OFF switch with a label and optional description. */
export function Toggle({ label, desc, checked, onChange, disabled }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${checked ? "border-accent bg-accent" : "border-line bg-ink"}`}
      >
        <span className={`absolute top-0.5 rounded-full transition-all ${checked ? "bg-accent-ink" : "bg-muted"}`} style={{ width: 18, height: 18, left: checked ? 22 : 2 }} />
      </button>
      <div className="min-w-0 text-sm">
        <div className="font-semibold">
          {label} <span className={`ml-1 font-mono text-[11px] ${checked ? "text-accent" : "text-muted"}`}>{checked ? "ON" : "OFF"}</span>
        </div>
        {desc && <p className="text-xs text-muted">{desc}</p>}
      </div>
    </div>
  );
}

/** Collapsible panel. `badge` shows a short status next to the title (e.g. "2 files"). */
export function Collapsible({ title, badge, defaultOpen = false, children }: { title: string; badge?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line bg-raised">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold">
        <span aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        {title}
        {badge && <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[11px] text-muted">{badge}</span>}
      </button>
      {open && <div className="border-t border-line p-4">{children}</div>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={btn}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
