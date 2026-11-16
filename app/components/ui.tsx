"use client";

import { useState } from "react";
import { Check, ChevronRight, Copy } from "lucide-react";

export const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
export const card = (active: boolean) => `relative rounded-xl border p-4 text-left transition-all cursor-pointer ${active ? "border-accent bg-accent/[0.07] shadow-[0_0_0_1px_var(--color-accent)]" : "border-line bg-panel hover:-translate-y-px hover:border-accent/50 hover:shadow-card"}`;
export const field = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm placeholder:text-muted/70 transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15";
export const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-semibold transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-40";
export const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-accent to-accent-strong px-5 py-2.5 text-sm font-bold text-accent-ink shadow-lg shadow-accent/25 transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";

export function Section({ n, title, children, hint, icon, id }: { n: number; title: string; hint?: string; icon?: React.ReactNode; id?: string; children: React.ReactNode }) {
  return (
    <section id={id ?? `step-${n}`} className="shadow-card rise overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-3 border-b border-line bg-raised/60 px-5 py-3.5 sm:px-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-strong text-accent-ink shadow-md shadow-accent/30">{icon ?? n}</span>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Step {n}</div>
          <h2 className="truncate text-base font-bold leading-tight sm:text-lg">{title}</h2>
        </div>
        {hint && <span className="ml-auto hidden rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-muted md:block">{hint}</span>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
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
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-accent" : "bg-line"}`}
      >
        <span className="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all" style={{ left: checked ? 22 : 2 }} />
      </button>
      <div className="min-w-0 text-sm">
        <div className="font-semibold">{label}</div>
        {desc && <p className="text-xs leading-relaxed text-muted">{desc}</p>}
      </div>
    </div>
  );
}

/** Pill-style segmented control. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: React.ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-ink p-1">
      {options.map((o) => (
        <button type="button" key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${value === o.id ? "bg-panel text-accent-strong shadow-sm ring-1 ring-line" : "text-muted hover:text-fg"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Determinate bar when `value` is a number; animated indeterminate bar otherwise. */
export function ProgressBar({ value, active = true, className = "" }: { value?: number; active?: boolean; className?: string }) {
  const determinate = typeof value === "number";
  return (
    <div className={`relative h-2 overflow-hidden rounded-full bg-line ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={determinate ? Math.round(value) : undefined}>
      {determinate ? (
        <div className={`h-full rounded-full bg-gradient-to-r from-accent to-accent-strong transition-[width] duration-500 ease-out ${active && value < 100 ? "bar-stripes" : ""}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      ) : (
        <div className="bar-indeterminate absolute inset-y-0 rounded-full bg-gradient-to-r from-accent to-accent-strong" />
      )}
    </div>
  );
}

/** Collapsible panel. `badge` shows a short status next to the title (e.g. "2 files"). */
export function Collapsible({ title, badge, defaultOpen = false, children }: { title: string; badge?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line bg-raised/60">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold">
        <ChevronRight aria-hidden className={`size-4 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
        {title}
        {badge && <span className="rounded-full border border-line bg-panel px-2 py-0.5 font-mono text-[11px] font-normal text-muted">{badge}</span>}
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
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}
