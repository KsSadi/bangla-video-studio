"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Palette, ScanSearch, Trash2, Upload } from "lucide-react";
import type { SavedStyle } from "@/lib/styledna";
import { Collapsible, btn, btnPrimary, field } from "./ui";

type Props = {
  jobId: string | null;
  running: boolean;
  selectedId: string;
  onSelect: (s: SavedStyle | null) => void;
  /** An analysis job was accepted (the parent polls it). */
  onStarted: () => void;
  /** Bumped by the parent when an analysis finished, to reload (and auto-select) the newest style. */
  refreshKey: number;
  templateActive: boolean;
};

/** Clone Style from Reference Video: ffmpeg measures it, Claude reads the look, the result is a reusable style DNA. */
export function StyleCloner({ jobId, running, selectedId, onSelect, onStarted, refreshKey, templateActive }: Props) {
  const [styles, setStyles] = useState<SavedStyle[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const firstLoad = useRef(true);
  const known = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const d = await fetch("/api/style", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    return (d?.styles as SavedStyle[] | undefined) ?? null;
  }, []);

  // initial list + reload (and auto-select the newest style) whenever an analysis finishes
  useEffect(() => {
    let alive = true;
    void load().then((list) => {
      if (!alive || !list) return;
      const fresh = list.find((s) => !known.current.has(s.id));
      setStyles(list);
      if (!firstLoad.current && fresh) onSelect(fresh);
      known.current = new Set(list.map((s) => s.id));
      firstLoad.current = false;
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, load]);

  const analyze = async () => {
    if (!file || !jobId) return;
    setBusy(true);
    setErr("");
    const body = new FormData();
    body.append("jobId", jobId);
    body.append("video", file);
    if (name.trim()) body.append("name", name.trim());
    const res = await fetch("/api/style", { method: "POST", body }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setErr(data?.error ?? "Upload failed.");
    setFile(null);
    setName("");
    if (input.current) input.current.value = "";
    onStarted();
  };

  const remove = async (s: SavedStyle) => {
    if (!confirm(`Delete the style "${s.dna.name}"?`)) return;
    const res = await fetch(`/api/style?id=${s.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (d.styles) setStyles(d.styles);
    if (selectedId === s.id) onSelect(null);
  };

  return (
    <Collapsible title="Clone style from reference video" badge={selectedId ? "style active" : styles.length ? `${styles.length} saved` : "off"}>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Upload a short reference clip (a video whose look you love). FFmpeg extracts 5 keyframes, the dominant colours and the cutting pace locally; Claude then reads the keyframes and writes a reusable <b>style-dna.json</b> (palette, background vibe, transitions, text placement, caption style, scene length). New videos use that look while keeping your Bengali content.
      </p>
      {templateActive && <p className="mb-3 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-xs text-amber-700">A template is active, so it controls the look. Clear the template in Step 1 to apply a style DNA instead.</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className={`${btn} cursor-pointer ${!jobId || running ? "pointer-events-none opacity-40" : ""}`}>
          <Upload className="size-4" /> {file ? file.name.slice(0, 28) : "Choose reference video"}
          <input ref={input} type="file" accept="video/*,.mp4,.mov,.webm,.mkv" className="sr-only" disabled={!jobId || running} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Style name (optional)" aria-label="Style name" maxLength={60} className={`${field} !w-52`} />
        <button type="button" className={btnPrimary} disabled={!file || !jobId || running || busy} onClick={() => void analyze()}>
          <ScanSearch className="size-4" /> {busy ? "Uploading…" : "Analyze & save style"}
        </button>
        {!jobId && <span className="text-xs text-accent-strong">Load a voice file first (Step 1): the analysis runs inside a project.</span>}
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}

      {styles.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {styles.map((s) => {
            const on = selectedId === s.id;
            const m = s.dna.measured;
            return (
              <li key={s.id} className={`overflow-hidden rounded-xl border bg-panel transition ${on ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-line"}`}>
                <div className="flex h-16 w-full overflow-hidden bg-ink">
                  {Array.from({ length: s.frames }, (_, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={`/api/style?id=${s.id}&frame=${i + 1}`} alt="" className="h-full min-w-0 flex-1 object-cover" loading="lazy" />
                  ))}
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <Palette className="size-4 shrink-0 text-accent-strong" />
                    <span lang="bn" className="min-w-0 flex-1 truncate font-semibold">{s.dna.name}</span>
                    <div className="flex">
                      {s.dna.look.colors.concat(s.dna.look.accent).map((c, i) => (
                        <span key={i} className="-ml-1 size-4 rounded-full ring-2 ring-panel first:ml-0" style={{ background: c }} title={c} />
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{s.dna.look.vibe}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
                    <span className="rounded-full bg-ink px-2 py-0.5">{m.pacing} pacing · {m.avgShotSec}s shots</span>
                    <span className="rounded-full bg-ink px-2 py-0.5">~{s.dna.look.sceneSeconds}s scenes</span>
                    <span className="rounded-full bg-ink px-2 py-0.5">{s.dna.look.captionStyle} captions</span>
                    <span className="rounded-full bg-ink px-2 py-0.5">{s.dna.look.transitions.join(" / ")}</span>
                  </div>
                  {s.dna.look.notes && <p className="mt-2 text-xs italic text-muted">{s.dna.look.notes}</p>}
                  <div className="mt-3 flex gap-2">
                    <button type="button" className={on ? btnPrimary : btn} onClick={() => onSelect(on ? null : s)}>
                      {on ? <><Check className="size-4" strokeWidth={3} /> Using this style</> : "Use this style"}
                    </button>
                    <button type="button" className={btn} onClick={() => void remove(s)} aria-label={`Delete style ${s.dna.name}`}><Trash2 className="size-4" /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Collapsible>
  );
}
