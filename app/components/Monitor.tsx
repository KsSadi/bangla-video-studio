"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, CircleDashed, Clapperboard, Loader2, MinusCircle, Terminal, UploadCloud, X } from "lucide-react";
import { ProgressBar } from "./ui";

export type StepView = {
  id: string;
  label: string;
  state: "pending" | "active" | "done" | "error" | "skipped";
  progress?: number;
  detail?: string;
  startedAt?: number;
  endedAt?: number;
};

/** Ticks `Date.now()` while `active`, so elapsed timers move live. */
export function useNow(active: boolean, ms = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

const IDLE_STEPS: StepView[] = [
  { id: "transcribe", label: "Generating Bengali SRT", state: "pending" },
  { id: "prepare", label: "Preparing Audio & Assets", state: "pending" },
  { id: "plan", label: "Planning Scenes", state: "pending" },
  { id: "record", label: "Recording Browser", state: "pending" },
  { id: "render", label: "Rendering MP4", state: "pending" },
  { id: "extras", label: "Thumbnail & YouTube Pack", state: "pending" },
];

const WEIGHT: Record<string, number> = { transcribe: 20, prepare: 5, plan: 25, record: 15, render: 35, extras: 5 };
const TYPICAL_S: Record<string, number> = { transcribe: 120, prepare: 15, plan: 60, record: 60, render: 90, extras: 40 };

/** Fraction (0-1) of one step. Steps that cannot measure themselves use a calm time-based estimate that never reaches 100%. */
export function stepFraction(s: StepView, now: number) {
  if (s.state === "done") return 1;
  if (s.state !== "active") return 0;
  if (typeof s.progress === "number") return s.progress / 100;
  const elapsed = Math.max(0, now - (s.startedAt ?? now)) / 1000;
  return Math.min(0.92, 1 - Math.exp(-elapsed / (TYPICAL_S[s.id] ?? 60)));
}

/** Overall pipeline percent (0-100) across the steps that are not skipped. */
export function overallProgress(steps: StepView[], now: number) {
  const used = steps.filter((s) => s.state !== "skipped");
  const total = used.reduce((a, s) => a + (WEIGHT[s.id] ?? 10), 0);
  if (!total) return 0;
  return Math.round((used.reduce((a, s) => a + (WEIGHT[s.id] ?? 10) * stepFraction(s, now), 0) / total) * 100);
}

export const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Ring({ pct, size = 132 }: { pct: number; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ringGrad)" strokeWidth={8} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StepIcon({ state }: { state: StepView["state"] }) {
  const base = "grid size-6 shrink-0 place-items-center rounded-full";
  if (state === "done") return <span className={`${base} bg-accent text-accent-ink`}><Check className="size-3.5" strokeWidth={3} /></span>;
  if (state === "active") return <span className={`${base} pulse-ring bg-accent/15 text-accent-strong ring-2 ring-accent`}><Loader2 className="size-3.5 animate-spin" /></span>;
  if (state === "error") return <span className={`${base} bg-red-500 text-white`}><X className="size-3.5" strokeWidth={3} /></span>;
  if (state === "skipped") return <span className={`${base} text-muted`}><MinusCircle className="size-4" /></span>;
  return <span className={`${base} text-muted/60`}><CircleDashed className="size-4" /></span>;
}

const lineTone = (l: string) => (/error|failed|exited with code|✕/i.test(l) ? "text-red-400" : /▶/.test(l) ? "font-semibold text-teal-300" : /claude/i.test(l) ? "text-violet-300" : /done|ok |saved|✓/i.test(l) ? "text-emerald-300" : "text-slate-300");

type Props = {
  steps: StepView[];
  logs: string[];
  running: boolean;
  uploadPct: number | null;
  uploadName?: string;
  videoSrc: string | null;
  videoLabel?: string;
  portrait: boolean;
  tokens: { input: number; output: number } | null;
  error: string | null;
  projectName: string;
  /** Live in-browser Remotion Player (plays the scene plan before/without an MP4). */
  live?: React.ReactNode;
};

/** The always-visible live monitor: preview screen, overall progress, per-step pipeline timeline and the live log. */
export function Monitor({ steps: stepsIn, logs, running, uploadPct, uploadName, videoSrc, videoLabel, portrait, tokens, error, projectName, live }: Props) {
  const [view, setView] = useState<"live" | "mp4">("live");
  const steps: StepView[] = stepsIn.length ? stepsIn : IDLE_STEPS;
  const uploading = uploadPct != null;
  const now = useNow(running || uploading);
  const [logOpen, setLogOpen] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  const active = steps.find((s) => s.state === "active");
  const failed = steps.find((s) => s.state === "error");
  const overall = overallProgress(steps, now);
  const firstStart = Math.min(...steps.map((s) => s.startedAt ?? Infinity));
  const total = Number.isFinite(firstStart) ? now - firstStart : 0;
  const busy = running || uploading;

  useEffect(() => {
    if (stuck.current) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  const hasLive = !!live;
  const hasMp4 = !!videoSrc;
  const mode: "live" | "mp4" | "status" = hasLive && (view === "live" || !hasMp4) ? "live" : hasMp4 && (!busy || (hasLive && view === "mp4")) ? "mp4" : "status";

  const headline = uploading ? "Uploading audio" : active ? active.label : failed ? "Stopped with an error" : steps.some((s) => s.state === "done") && !busy ? "Finished" : "Waiting for input";
  const subline = uploading ? `${uploadName ?? "audio"} · ${uploadPct}%` : active?.detail ?? (active ? "Working…" : failed ? (failed.detail ?? "See the log below") : "Load a voice file to begin");
  const shownPct = uploading ? uploadPct! : busy ? overall : steps.some((s) => s.state === "done") && !failed ? 100 : overall;

  return (
    <div className="shadow-card flex flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line bg-raised/60 px-4 py-2.5">
        <span className={`size-2 rounded-full ${busy ? "pulse-ring bg-accent" : failed ? "bg-red-500" : "bg-muted/50"}`} />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">Live monitor</span>
        {hasLive && hasMp4 ? (
          <div role="radiogroup" aria-label="Preview source" className="ml-auto inline-flex rounded-lg border border-line bg-ink p-0.5 text-[11px] font-semibold">
            {(["live", "mp4"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={`rounded-md px-2 py-0.5 transition ${view === v ? "bg-panel text-accent-strong shadow-sm ring-1 ring-line" : "text-muted hover:text-fg"}`}>
                {v === "live" ? "Live" : "MP4"}
              </button>
            ))}
          </div>
        ) : (
          <span lang="bn" className="ml-auto max-w-[45%] truncate text-xs text-muted">{projectName}</span>
        )}
      </div>

      {/* Screen */}
      <div className={`relative bg-[#05090c] ${portrait ? "mx-auto aspect-[9/16] max-h-[420px]" : "aspect-video"} w-full overflow-hidden`}>
        {mode === "live" ? (
          <div className="absolute inset-0 bg-black">{live}</div>
        ) : mode === "mp4" ? (
          <video key={videoSrc} src={videoSrc!} controls className="size-full bg-black object-contain" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,rgb(20_184_166/0.22),transparent_65%)] p-4 text-center">
            {busy ? (
              <div className="flex flex-col items-center gap-2 text-white">
                <div className="relative grid place-items-center">
                  <Ring pct={shownPct} size={portrait ? 104 : 124} />
                  <div className="absolute text-center">
                    <div className="tabular text-3xl font-bold leading-none">{shownPct}<span className="text-base font-semibold text-white/60">%</span></div>
                    <div className="tabular mt-1 text-[11px] text-white/60">{fmtDur(total)}</div>
                  </div>
                </div>
                <div className="max-w-[90%] truncate text-sm font-semibold">{headline}</div>
                <div className="line-clamp-2 max-w-[90%] text-xs text-white/60">{subline}</div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/70">
                {failed ? <AlertTriangle className="size-9 text-red-400" /> : <Clapperboard className="size-9 text-teal-300" strokeWidth={1.5} />}
                <div className="text-sm font-semibold text-white">{failed ? "Something went wrong" : "Preview"}</div>
                <div className="max-w-[80%] text-xs">{failed ? subline : "Your rendered video appears here"}</div>
              </div>
            )}
          </div>
        )}
        {mode === "live" && busy && (
          <span className="pointer-events-none absolute right-2 top-2 flex max-w-[80%] items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <Loader2 className="size-3 shrink-0 animate-spin text-teal-300" />
            <span className="truncate">{active?.label ?? "Working"} · {shownPct}%</span>
          </span>
        )}
        {mode === "live" && <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-teal-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">Live preview</span>}
        {mode === "mp4" && videoLabel && <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{videoLabel}</span>}
      </div>

      {/* Overall bar */}
      <div className="border-b border-line px-4 py-3">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-semibold">{uploading ? "Upload" : "Overall progress"}</span>
          <span className="tabular font-mono text-muted">
            {shownPct}% {busy && total > 0 && `· ${fmtDur(total)}`}
          </span>
        </div>
        <ProgressBar value={shownPct} active={busy} />
        {tokens && <div className="mt-2 text-[11px] text-muted">Claude tokens this run: <span className="tabular font-mono">{tokens.input.toLocaleString()}</span> in · <span className="tabular font-mono">{tokens.output.toLocaleString()}</span> out</div>}
      </div>

      {/* Pipeline */}
      <ol className="space-y-0.5 px-2 py-2" aria-label="Pipeline steps">
        {uploading && (
          <li className="rounded-lg bg-accent/[0.07] px-2 py-2">
            <div className="flex items-center gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-accent-strong ring-2 ring-accent"><UploadCloud className="size-3.5" /></span>
              <span className="flex-1 text-sm font-semibold">Uploading audio</span>
              <span className="tabular font-mono text-xs text-muted">{uploadPct}%</span>
            </div>
            <ProgressBar value={uploadPct!} className="mt-2" />
          </li>
        )}
        {steps.map((s) => {
          const frac = stepFraction(s, now);
          const measured = typeof s.progress === "number";
          const elapsed = s.startedAt ? (s.endedAt ?? now) - s.startedAt : 0;
          return (
            <li key={s.id} className={`rounded-lg px-2 py-2 transition-colors ${s.state === "active" ? "bg-accent/[0.07]" : ""}`}>
              <div className="flex items-center gap-3">
                <StepIcon state={s.state} />
                <span className={`flex-1 truncate text-sm ${s.state === "active" ? "font-semibold" : s.state === "pending" || s.state === "skipped" ? "text-muted" : "font-medium"}`}>{s.label}</span>
                {s.state === "active" && measured && <span className="tabular font-mono text-xs font-semibold text-accent-strong">{Math.round(s.progress!)}%</span>}
                {s.state === "active" && !measured && <span className="tabular font-mono text-xs text-muted">~{Math.round(frac * 100)}%</span>}
                {s.startedAt && s.state !== "skipped" && <span className="tabular w-10 text-right font-mono text-xs text-muted">{fmtDur(elapsed)}</span>}
                {s.state === "skipped" && <span className="text-[11px] text-muted">skipped</span>}
              </div>
              {s.state === "active" && (
                <div className="mt-2 pl-9">
                  <ProgressBar value={measured ? s.progress : undefined} />
                  <div className="mt-1.5 truncate text-xs text-muted" title={s.detail}>{s.detail ?? "Working…"}</div>
                </div>
              )}
              {s.state === "error" && s.detail && <div className="mt-1 pl-9 text-xs text-red-500">{s.detail}</div>}
            </li>
          );
        })}
      </ol>

      {error && <div role="alert" className="mx-3 mb-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-600">{error}</div>}

      {/* Live log */}
      <div className="border-t border-line">
        <button type="button" aria-expanded={logOpen} onClick={() => setLogOpen(!logOpen)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold text-muted hover:text-fg">
          <Terminal className="size-3.5" /> Live log
          <span className="rounded-full bg-ink px-1.5 font-mono text-[10px] font-normal">{logs.length}</span>
          <ChevronDown className={`ml-auto size-4 transition-transform ${logOpen ? "" : "-rotate-90"}`} />
        </button>
        {logOpen && (
          <div
            ref={logRef}
            aria-live="polite"
            aria-label="Progress console"
            onScroll={(e) => {
              const el = e.currentTarget;
              stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }}
            className="mx-3 mb-3 h-52 overflow-auto rounded-lg bg-[#071015] p-3 font-mono text-[11px] leading-relaxed"
          >
            {logs.length ? logs.map((l, i) => <div key={i} className={`whitespace-pre-wrap break-words ${lineTone(l)}`}>{l}</div>) : <span className="text-slate-500">Logs appear here once a job starts.</span>}
          </div>
        )}
      </div>
    </div>
  );
}
