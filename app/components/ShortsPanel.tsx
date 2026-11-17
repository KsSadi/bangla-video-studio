"use client";

import { useState } from "react";
import { Download, Loader2, Play, Plus, Scissors, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import type { Quality, ShortClip } from "@/lib/settings";
import { fmtClock } from "@/remotion/engine/slice";
import { btn, btnPrimary, field } from "./ui";

type Props = {
  jobId: string;
  shorts: ShortClip[];
  setShorts: (s: ShortClip[]) => void;
  /** A job (render, transcribe, ...) is running: clip actions that start work are disabled. */
  busy: boolean;
  /** A short render job was accepted by the server (parent starts polling). */
  onStarted: () => void;
};

const chip: Record<ShortClip["state"], string> = {
  ready: "border-line text-muted",
  rendering: "border-accent/50 bg-accent/10 text-accent-strong",
  done: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700",
  error: "border-red-500/50 bg-red-500/10 text-red-700",
};

/** Long-to-Shorts: AI suggestions (one Haiku call, subtitles only) or manual timestamps (zero tokens); both render locally. */
export function ShortsPanel({ jobId, shorts, setShorts, busy, onStarted }: Props) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [hook, setHook] = useState("");
  const [quality, setQuality] = useState<Quality>("final");
  const [finding, setFinding] = useState(false);
  const [err, setErr] = useState("");

  const call = async (body: Record<string, unknown>) => {
    setErr("");
    const res = await fetch("/api/shorts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, ...body }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setErr(data?.error ?? "Request failed.");
      return null;
    }
    if (data.shorts) setShorts(data.shorts as ShortClip[]);
    return data;
  };

  const find = async () => {
    setFinding(true);
    await call({ action: "suggest" });
    setFinding(false);
  };
  const add = async () => {
    const d = await call({ action: "add", start, end, hookTitle: hook });
    if (d) {
      setStart("");
      setEnd("");
      setHook("");
    }
  };
  const render = async (ids: string[]) => {
    if (!ids.length) return;
    if (await call({ action: "render", ids, quality })) onStarted();
  };
  const pending = shorts.filter((c) => c.state === "ready" || c.state === "error").map((c) => c.id);

  return (
    <div className="rounded-2xl border border-line bg-raised/40 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-strong text-accent-ink"><Scissors className="size-4" /></span>
        <div>
          <h3 className="font-bold leading-tight">Create Shorts / Reels</h3>
          <p className="text-xs text-muted">Cut clips from this video: same scene plan, new 9:16 layout with safe-zone captions. Rendered locally.</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-1 flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-accent-strong" /> Option A · AI auto-detect</div>
          <p className="mb-3 text-xs leading-relaxed text-muted">One tiny Claude Haiku call reads <b>only the subtitles</b> and returns 3 timestamp ranges. It never rewrites plans or code.</p>
          <button type="button" className={btnPrimary} disabled={busy || finding} onClick={() => void find()}>
            {finding ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {finding ? "Finding moments…" : "Auto-Find Top 3 Viral Shorts"}
          </button>
        </div>

        <form className="rounded-xl border border-line bg-panel p-4" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <div className="mb-1 flex items-center gap-2 font-semibold"><Plus className="size-4 text-accent-strong" /> Option B · Manual timestamps <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">0 tokens</span></div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="Start  01:10" aria-label="Start time" className={`${field} font-mono`} inputMode="numeric" />
            <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="End  01:45" aria-label="End time" className={`${field} font-mono`} inputMode="numeric" />
            <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Hook title (optional, Bengali)" aria-label="Hook title" lang="bn" maxLength={70} className={`${field} col-span-2`} />
          </div>
          <button type="submit" className={`${btn} mt-3`} disabled={!start.trim() || !end.trim()}><Plus className="size-4" /> Add Custom Clip</button>
        </form>
      </div>

      {err && <p role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">{err}</p>}

      {shorts.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h4 className="text-sm font-semibold">Clips ({shorts.length})</h4>
            <label className="ml-auto flex items-center gap-2 text-sm">
              Quality
              <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} className={`${field} !w-auto !py-1`}>
                <option value="final">Final 1080x1920</option>
                <option value="draft">Draft 480x854</option>
              </select>
            </label>
            <button type="button" className={btnPrimary} disabled={busy || !pending.length} onClick={() => void render(pending)}>
              <Play className="size-4" /> Render {pending.length > 1 ? `all (${pending.length})` : "clip"}
            </button>
          </div>

          <ul className="space-y-2">
            {shorts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-panel p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{fmtClock(c.start)} → {fmtClock(c.end)}</span>
                    <span className="text-xs text-muted">{Math.round(c.end - c.start)}s</span>
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">{c.source === "ai" ? "AI" : "manual"}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip[c.state]}`}>{c.state === "rendering" ? "rendering…" : c.state === "ready" ? "ready to render" : c.state}</span>
                  </div>
                  {c.hookTitle && <p lang="bn" className="mt-1 text-sm">{c.hookTitle}</p>}
                  {c.state === "error" && c.error && <p className="mt-1 flex items-start gap-1 text-xs text-red-600"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {c.error}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(c.state === "ready" || c.state === "error") && <button type="button" className={btn} disabled={busy} onClick={() => void render([c.id])}><Play className="size-3.5" /> Render</button>}
                    {c.state === "done" && <a className={btn} href={`/api/short?id=${jobId}&n=${c.n}&download=1`}><Download className="size-3.5" /> Download MP4</a>}
                    {c.state === "done" && <button type="button" className={btn} disabled={busy} onClick={() => void render([c.id])}>Re-render</button>}
                    <button type="button" className={btn} disabled={busy || c.state === "rendering"} onClick={() => void call({ action: "delete", id: c.id })} aria-label="Delete clip"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
                {c.state === "done" && <video src={`/api/short?id=${jobId}&n=${c.n}&k=${c.size ?? 0}`} controls preload="metadata" className="aspect-[9/16] w-32 rounded-lg bg-black object-cover" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
