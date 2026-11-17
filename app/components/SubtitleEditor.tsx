"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Verification } from "@/lib/settings";
import { toSrt, type Cue } from "@/remotion/lib/types";
import { pickSpotCheck } from "@/lib/spotcheck";
import { Toggle, btn, field, fmt } from "./ui";

type Props = {
  cues: Cue[];
  setCues: (fn: (cs: Cue[]) => Cue[]) => void;
  audioUrl: string | null;
  verification: Verification;
  setVerification: (v: Verification) => void;
  requireVerified: boolean;
  setRequireVerified: (v: boolean) => void;
  onSave: () => Promise<boolean>;
  onRegenerate?: () => void;
  disabled?: boolean;
  source: string;
};

export function SubtitleEditor({ cues, setCues, audioUrl, verification, setVerification, requireVerified, setRequireVerified, onSave, onRegenerate, disabled, source }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const checkRef = useRef<{ indices: number[]; pos: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  const [active, setActive] = useState(-1);
  const [check, setCheck] = useState<{ indices: number[]; pos: number; done: boolean } | null>(null);
  const [saved, setSaved] = useState<"" | "saving" | "saved" | "error">("");

  const playSlice = useCallback((i: number, lead = 0) => {
    const a = audioRef.current;
    const c = cuesRef.current[i];
    if (!a || !c) return;
    a.currentTime = Math.max(0, c.start - lead);
    stopAt.current = c.end;
    setActive(i);
    void a.play();
  }, []);

  const advance = useCallback(() => {
    const ck = checkRef.current;
    if (!ck) return;
    const next = ck.pos + 1;
    if (next >= ck.indices.length) {
      checkRef.current = null;
      setCheck({ indices: ck.indices, pos: ck.pos, done: true });
      return;
    }
    checkRef.current = { indices: ck.indices, pos: next };
    setCheck({ indices: ck.indices, pos: next, done: false });
    timer.current = setTimeout(() => playSlice(ck.indices[next], 0.4), 600);
  }, [playSlice]);

  // Real-time highlight of the line being heard, and slice stop.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let raf = 0;
    const tick = () => {
      const t = a.currentTime;
      const i = cuesRef.current.findIndex((c) => t >= c.start && t < c.end);
      setActive((prev) => (i === prev ? prev : i));
      if (stopAt.current !== null && t >= stopAt.current) {
        stopAt.current = null;
        a.pause();
        advance();
      }
      raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => cancelAnimationFrame(raf);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    return () => {
      cancelAnimationFrame(raf);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
    };
  }, [advance, audioUrl]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const stopCheck = () => {
    if (timer.current) clearTimeout(timer.current);
    checkRef.current = null;
    stopAt.current = null;
    audioRef.current?.pause();
    setCheck(null);
  };

  const startSpotCheck = () => {
    if (!cues.length) return;
    stopCheck();
    const indices = pickSpotCheck(cues.length, cues.length >= 12 ? 4 : 3);
    checkRef.current = { indices, pos: 0 };
    setCheck({ indices, pos: 0, done: false });
    playSlice(indices[0], 0.4);
  };

  const edit = (i: number, patch: Partial<Cue>) => {
    if (("start" in patch || "end" in patch) && verification === "verified") setVerification("unchecked"); // timing changed: needs a fresh look
    setCues((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };
  const playhead = () => Math.round((audioRef.current?.currentTime ?? 0) * 100) / 100;
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== "" ? Math.max(0, Number(v)) : fallback);

  const save = async () => {
    setSaved("saving");
    setSaved((await onSave()) ? "saved" : "error");
    setTimeout(() => setSaved(""), 2500);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([toSrt(cues)], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "subtitles.srt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const badge =
    verification === "verified"
      ? { text: "Timestamps Verified ✓", cls: "border-emerald-500/60 bg-emerald-500/15 text-emerald-700" }
      : verification === "skipped"
        ? { text: "Check skipped", cls: "border-line bg-ink text-muted" }
        : { text: "Not verified yet", cls: "border-accent/60 bg-accent/10 text-accent" };

  return (
    <div className="mt-4 rounded-xl border border-line bg-raised p-4">
      {audioUrl && <audio ref={audioRef} src={audioUrl} controls preload="metadata" className="mb-4 w-full" />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-semibold">Subtitle timeline ({cues.length})</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`} role="status">{badge.text}</span>
        <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-muted">{source === "srt" ? "from your .srt" : source === "whisper" ? "from Whisper" : source === "tts" ? "from Auto-Voice (exact timings)" : ""}</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={startSpotCheck} disabled={disabled || !audioUrl}>Check timing (random sample)</button>
        <button type="button" className={btn} onClick={() => { stopCheck(); setVerification("skipped"); }} disabled={disabled}>Skip Check</button>
        <button type="button" className={btn} onClick={save} disabled={disabled}>{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved ✓" : saved === "error" ? "Save failed" : "Save subtitles.srt"}</button>
        <button type="button" className={btn} onClick={download}>Download .srt</button>
        {onRegenerate && (
          <button type="button" className={btn} onClick={() => confirm("Run Whisper again? This replaces the current subtitles, including your edits.") && onRegenerate()} disabled={disabled}>
            Re-create subtitles
          </button>
        )}
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Toggle label="Subtitle timing checked" desc="Flip on once the lines match the audio. Changing a start/end time resets it." checked={verification === "verified"} onChange={(v) => setVerification(v ? "verified" : "unchecked")} disabled={disabled} />
        <Toggle label="Must check timing first" desc="Optional gate. Off = you can always generate." checked={requireVerified} onChange={setRequireVerified} disabled={disabled} />
      </div>

      {check && (
        <div role="status" className="mb-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm">
          {check.done ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Spot-check finished. Did each highlighted line match what you heard?</span>
              <button type="button" className={btn} onClick={() => { setVerification("verified"); setCheck(null); }}>Yes, mark verified</button>
              <button type="button" className={btn} onClick={() => { setVerification("unchecked"); setCheck(null); }}>No, I will fix times</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Checking {check.pos + 1}/{check.indices.length}: line {check.indices[check.pos] + 1} at {fmt(cues[check.indices[check.pos]]?.start ?? 0)}
              </span>
              <button type="button" className={btn} onClick={stopCheck}>Stop</button>
            </div>
          )}
        </div>
      )}

      <ol className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
        {cues.map((c, i) => {
          const bad = c.end <= c.start;
          const spot = check && !check.done && check.indices[check.pos] === i;
          return (
            <li key={i} aria-current={active === i} className={`flex flex-wrap items-start gap-2 rounded-lg border p-1.5 transition-colors ${active === i ? "border-accent bg-accent/10" : spot ? "border-accent/50" : "border-transparent"}`}>
              <button type="button" onClick={() => { stopCheck(); playSlice(i); }} className="mt-1 shrink-0 rounded-md bg-ink px-2.5 py-1.5 font-mono text-xs text-muted hover:text-accent" aria-label={`Play line ${i + 1}, ${fmt(c.start)} to ${fmt(c.end)}`}>
                ▶ {i + 1}
              </button>
              <div className="mt-1 flex shrink-0 items-center gap-1 font-mono text-xs">
                <input type="number" step="0.05" min="0" aria-label={`Line ${i + 1} start (seconds)`} value={c.start} onChange={(e) => edit(i, { start: num(e.target.value, c.start) })} className={`${field} w-20 !px-1.5 !py-1 ${bad ? "!border-red-500" : ""}`} />
                <button type="button" title="Set start to current playhead" className="rounded bg-ink px-1.5 py-1 text-muted hover:text-accent" onClick={() => edit(i, { start: playhead() })}>⌖</button>
                <span className="text-muted">→</span>
                <input type="number" step="0.05" min="0" aria-label={`Line ${i + 1} end (seconds)`} value={c.end} onChange={(e) => edit(i, { end: num(e.target.value, c.end) })} className={`${field} w-20 !px-1.5 !py-1 ${bad ? "!border-red-500" : ""}`} />
                <button type="button" title="Set end to current playhead" className="rounded bg-ink px-1.5 py-1 text-muted hover:text-accent" onClick={() => edit(i, { end: playhead() })}>⌖</button>
              </div>
              <textarea lang="bn" rows={1} value={c.text} onChange={(e) => edit(i, { text: e.target.value })} aria-label={`Subtitle ${i + 1}`} className={`${field} min-h-9 min-w-48 flex-1 resize-y text-base leading-relaxed`} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
