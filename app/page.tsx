"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHARACTER_STYLES, Character } from "@/remotion/characters/Character";
import { parseSrt, toSrt, type CharacterId, type Cue } from "@/remotion/lib/types";

type Mode = "cartoon" | "motion" | "tutorial" | "auto";
type Step = { id: string; label: string; state: "pending" | "active" | "done" | "error" | "skipped" };
type Status = { status: "idle" | "running" | "done" | "error"; steps: Step[]; logs: string[]; logCount: number; srt: string | null; error: string | null; videoReady: boolean };

const MODES: { id: Mode; title: string; skill: string; desc: string }[] = [
  { id: "cartoon", title: "Cartoon Story", skill: "cartoon-story.md", desc: "2D characters with lip-sync, animated backgrounds, story scenes." },
  { id: "motion", title: "Motion Graphics / Explainer", skill: "motion-graphics.md", desc: "Kinetic Bengali type, charts, icons, smooth transitions." },
  { id: "tutorial", title: "App / Website Tutorial", skill: "browser-tutorial.md", desc: "Records a real browser session with auto-zoom and highlights." },
  { id: "auto", title: "Auto-Detect", skill: "Claude picks", desc: "Claude reads the subtitles and chooses the best skill." },
];

const CHARACTERS: { id: CharacterId; title: string; desc: string }[] = [
  { id: "tech-mentor", title: "Tech Mentor", desc: "Headset, confident" },
  { id: "storyteller", title: "Storyteller", desc: "Book in hand, warm" },
  { id: "friendly-teacher", title: "Friendly Teacher", desc: "Glasses, patient" },
  { id: "auto", title: "Auto-Generate", desc: "Designed from the story" },
  { id: "none", title: "No Character", desc: "Visuals only" },
];

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const card = (active: boolean) =>
  `rounded-xl border p-4 text-left transition-colors cursor-pointer ${active ? "border-accent bg-accent/10" : "border-line bg-raised hover:border-muted"}`;
const field = "w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm placeholder:text-muted";

function Section({ n, title, children, hint }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
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

export default function Studio() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [character, setCharacter] = useState<CharacterId>("tech-mentor");
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const [tutorial, setTutorial] = useState({ url: "", email: "", password: "" });
  const [hints, setHints] = useState("");
  const [videoKey, setVideoKey] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const consoleRef = useRef<HTMLPreElement>(null);
  const logCount = useRef(0);
  const srtLoaded = useRef(false);

  const running = status?.status === "running";

  // Poll job status while something is running.
  useEffect(() => {
    if (!jobId || !running) return;
    const tick = async () => {
      const res = await fetch(`/api/status?id=${jobId}&from=${logCount.current}`).catch(() => null);
      if (!res?.ok) return;
      const s: Status = await res.json();
      logCount.current = s.logCount;
      if (s.logs.length) setLogs((l) => [...l, ...s.logs]);
      if (s.srt && !srtLoaded.current) {
        srtLoaded.current = true;
        setCues(parseSrt(s.srt));
      }
      if (s.videoReady) setVideoKey((k) => k + 1);
      setStatus(s);
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [jobId, running]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [logs]);

  const upload = useCallback(async (file: File) => {
    setError("");
    if (!/\.(mp3|wav|m4a)$/i.test(file.name)) return setError("Only .mp3, .wav and .m4a files are supported.");
    const body = new FormData();
    body.append("audio", file);
    setFileName(file.name);
    setAudioUrl(URL.createObjectURL(file));
    setCues([]);
    setLogs([]);
    logCount.current = 0;
    srtLoaded.current = false;
    const res = await fetch("/api/transcribe", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Upload failed.");
    setJobId(data.jobId);
    setStatus({ status: "running", steps: [], logs: [], logCount: 0, srt: null, error: null, videoReady: false });
  }, []);

  const generate = async () => {
    setError("");
    const res = await fetch("/api/generate-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, srt: toSrt(cues), mode, character, aspect, hints, ...(mode === "tutorial" ? tutorial : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not start generation.");
    setStatus((s) => s && { ...s, status: "running", videoReady: false, error: null });
  };

  const editCue = (i: number, text: string) => setCues((cs) => cs.map((c, j) => (j === i ? { ...c, text } : c)));
  const seek = (t: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = t;
    void audioRef.current.play();
  };
  const transcribing = running && cues.length === 0;
  const canGenerate = !!jobId && cues.length > 0 && !running && (mode !== "tutorial" || /^https?:\/\/\S+/.test(tutorial.url));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8 sm:py-12">
      <header className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Local-first · no API keys</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">বাংলা ভিডিও স্টুডিও</h1>
        <p className="mt-2 max-w-2xl text-muted">Upload a Bengali voiceover. Whisper writes the subtitles, Claude Code plans and codes the video, Remotion renders the MP4. Everything runs on this machine.</p>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <Section n={1} title="Upload Bengali Voice" hint=".mp3 · .wav · .m4a">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f && !running) void upload(f);
          }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${dragging ? "border-accent bg-accent/10" : "border-line hover:border-muted"} ${running ? "pointer-events-none opacity-60" : ""}`}
        >
          <input type="file" accept=".mp3,.wav,.m4a,audio/*" className="sr-only" disabled={running} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <span className="font-semibold">{fileName || "Drop your voice file here, or click to browse"}</span>
          <span className="text-sm text-muted">{transcribing ? "Transcribing with local Whisper… (see console below)" : fileName ? "Drop another file to start over" : "Bengali subtitles are generated automatically"}</span>
        </label>

        {audioUrl && <audio ref={audioRef} src={audioUrl} controls className="mt-4 w-full" />}

        {cues.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">Subtitle timeline ({cues.length})</span>
              <span className="text-muted">Fix spelling here. Click a time to listen.</span>
            </div>
            <ol className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
              {cues.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <button type="button" onClick={() => seek(c.start)} className="mt-1 w-32 shrink-0 rounded-md bg-raised px-2 py-1.5 font-mono text-xs text-muted hover:text-accent" aria-label={`Play from ${fmt(c.start)}`}>
                    {fmt(c.start)} → {fmt(c.end)}
                  </button>
                  <textarea lang="bn" rows={1} value={c.text} onChange={(e) => editCue(i, e.target.value)} aria-label={`Subtitle ${i + 1}`} className={`${field} min-h-9 resize-y text-base leading-relaxed`} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </Section>

      <Section n={2} title="Video Mode" hint="Each mode loads its skill from .claude/skills/">
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <button type="button" key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={card(mode === m.id)}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{m.title}</span>
                <code className="rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] text-muted">{m.skill}</code>
              </div>
              <p className="mt-1 text-sm text-muted">{m.desc}</p>
            </button>
          ))}
        </div>

        {mode === "tutorial" && (
          <div className="mt-4 grid gap-3 rounded-xl border border-line bg-raised p-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold">Target App URL</span>
              <input type="url" required placeholder="https://example.com" value={tutorial.url} onChange={(e) => setTutorial({ ...tutorial, url: e.target.value })} className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Login Email (optional)</span>
              <input type="email" autoComplete="off" value={tutorial.email} onChange={(e) => setTutorial({ ...tutorial, email: e.target.value })} className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Login Password (optional)</span>
              <input type="password" autoComplete="new-password" value={tutorial.password} onChange={(e) => setTutorial({ ...tutorial, password: e.target.value })} className={field} />
            </label>
            <p className="text-xs text-muted sm:col-span-2">Credentials stay on this machine: passed to the local browser as environment variables, never written to disk or sent to Claude.</p>
          </div>
        )}

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-semibold">{mode === "tutorial" ? "Action hints (optional)" : "Creative notes (optional)"}</span>
          <textarea rows={2} value={hints} onChange={(e) => setHints(e.target.value)} placeholder={mode === "tutorial" ? 'e.g. "Click Sign up at 0:05, then scroll to Pricing at 0:12"' : 'e.g. "Village setting, warm colours" or "Use a bar chart for the three numbers"'} className={field} />
        </label>
      </Section>

      <Section n={3} title="Character & Aspect Ratio">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CHARACTERS.map((c) => (
            <button type="button" key={c.id} aria-pressed={character === c.id} onClick={() => setCharacter(c.id)} className={`${card(character === c.id)} flex flex-col items-center !p-3 text-center`}>
              <div className="grid h-28 place-items-center">
                {c.id === "none" ? (
                  <span className="text-4xl text-muted" aria-hidden>∅</span>
                ) : c.id === "auto" ? (
                  <span className="text-4xl text-accent" aria-hidden>✦</span>
                ) : (
                  <Character look={CHARACTER_STYLES[c.id]} size={112} expression="happy" />
                )}
              </div>
              <span className="mt-1 text-sm font-semibold">{c.title}</span>
              <span className="text-xs text-muted">{c.desc}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">Aspect ratio</span>
          <div role="radiogroup" aria-label="Aspect ratio" className="inline-flex rounded-lg border border-line bg-ink p-1">
            {(["16:9", "9:16"] as const).map((a) => (
              <button type="button" key={a} role="radio" aria-checked={aspect === a} onClick={() => setAspect(a)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${aspect === a ? "bg-accent text-accent-ink" : "text-muted hover:text-white"}`}>
                {a} {a === "16:9" ? "YouTube" : "Reels / Shorts"}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section n={4} title="Generate & Live Progress">
        <button type="button" onClick={generate} disabled={!canGenerate} className="w-full rounded-xl bg-accent px-6 py-3 text-base font-bold text-accent-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
          {running && !transcribing ? "Generating…" : "Generate Video"}
        </button>
        {!canGenerate && !running && <p className="mt-2 text-sm text-muted">{cues.length === 0 ? "Upload a voice file first." : mode === "tutorial" ? "Enter the target URL (https://…)." : ""}</p>}

        {status && status.steps.length > 0 && (
          <ol className="mt-4 grid gap-2 sm:grid-cols-4">
            {status.steps.map((s) => (
              <li key={s.id} className={`rounded-lg border px-3 py-2 text-sm ${s.state === "active" ? "border-accent text-accent" : s.state === "done" ? "border-emerald-600/60 text-emerald-300" : s.state === "error" ? "border-red-500/60 text-red-300" : "border-line text-muted"}`}>
                <span className="mr-1.5" aria-hidden>{s.state === "done" ? "✓" : s.state === "error" ? "✕" : s.state === "active" ? "●" : s.state === "skipped" ? "–" : "○"}</span>
                {s.label}
                <span className="sr-only"> ({s.state})</span>
              </li>
            ))}
          </ol>
        )}

        {status?.error && (
          <div role="alert" className="mt-3 whitespace-pre-wrap rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-200">
            {status.error}
          </div>
        )}

        <pre ref={consoleRef} aria-label="Progress console" aria-live="polite" className="mt-4 h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-ink p-3 font-mono text-xs leading-relaxed text-slate-300">
          {logs.length ? logs.join("\n") : "Logs appear here once a job starts."}
        </pre>
      </Section>

      <Section n={5} title="Preview & Download">
        {status?.videoReady && jobId ? (
          <div className="flex flex-col items-center gap-4">
            <video key={videoKey} src={`/api/video?id=${jobId}&v=${videoKey}`} controls className={`w-full rounded-xl bg-black ${aspect === "9:16" ? "max-w-xs" : ""}`} />
            <a href={`/api/video?id=${jobId}&download=1`} className="rounded-xl bg-accent px-6 py-3 font-bold text-accent-ink">
              Download MP4
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted">Your video appears here when rendering finishes.</p>
        )}
      </Section>
    </main>
  );
}
