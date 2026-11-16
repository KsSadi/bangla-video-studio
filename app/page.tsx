"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHARACTER_STYLES, Character } from "@/remotion/characters/Character";
import { parseSrt, toSrt, type CharacterId, type Cue } from "@/remotion/lib/types";
import { BGM_IDS, DEFAULT_SETTINGS, type BgmId, type BrandKit, type CaptionStyle, type Mode, type Quality, type RevisionInfo, type SeoPack, type StudioSettings, type VersionInfo } from "@/lib/settings";
import { BrandKitDrawer } from "./components/BrandKit";
import { MediaPanel } from "./components/MediaPanel";
import { Player, SeoPanel } from "./components/Player";
import { RecentProjects } from "./components/RecentProjects";
import { SubtitleEditor } from "./components/SubtitleEditor";
import { Section, Toggle, btn, btnPrimary, card, field } from "./components/ui";

type Step = { id: string; label: string; state: "pending" | "active" | "done" | "error" | "skipped" };
type Status = {
  status: "idle" | "running" | "done" | "error";
  steps: Step[];
  logs: string[];
  logCount: number;
  srt: string | null;
  subtitlesSource: string;
  error: string | null;
  videoReady: boolean;
  versions: VersionInfo[];
  revisions: RevisionInfo[];
  seo: SeoPack | null;
  thumbnail: boolean;
};

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

const CAPTION_OPTIONS: { id: CaptionStyle; title: string; desc: string }[] = [
  { id: "kinetic", title: "Kinetic", desc: "Words pop in, active word highlighted" },
  { id: "classic", title: "Classic", desc: "Clean subtitle bar" },
  { id: "none", title: "None", desc: "No subtitles" },
];
const BGM_LABEL: Record<BgmId, string> = { none: "None", "soft-storytelling": "Soft Storytelling", "tech-explainer": "Tech Explainer" };

const normalizeSrt = (srt: string) => toSrt(parseSrt(srt));

export default function Studio() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [password, setPassword] = useState("");
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [videoKey, setVideoKey] = useState(0);
  const [selected, setSelected] = useState(0);
  const [reuse, setReuse] = useState(false);
  const [projectsRev, setProjectsRev] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [source, setSource] = useState("");

  const consoleRef = useRef<HTMLPreElement>(null);
  const logCount = useRef(0);
  const srtLoaded = useRef(false);
  const lastSavedSrt = useRef("");
  const wasRunning = useRef(false);

  const running = status?.status === "running";
  const versions = status?.versions ?? [];
  const patch = (p: Partial<StudioSettings>) => setSettings((s) => ({ ...s, ...p }));

  const applyStatus = useCallback((s: Status) => {
    logCount.current = s.logCount;
    if (s.logs.length) setLogs((l) => [...l, ...s.logs]);
    if (s.srt && !srtLoaded.current) {
      srtLoaded.current = true;
      lastSavedSrt.current = normalizeSrt(s.srt);
      setCues(parseSrt(s.srt));
    }
    setSource(s.subtitlesSource);
    setStatus(s);
  }, []);

  // Poll job status while something is running.
  useEffect(() => {
    if (!jobId || !running) return;
    const tick = async () => {
      const res = await fetch(`/api/status?id=${jobId}&from=${logCount.current}`).catch(() => null);
      if (res?.ok) applyStatus(await res.json());
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [jobId, running, applyStatus]);

  // When a run finishes: jump to the newest version and refresh the player + recent list.
  useEffect(() => {
    if (wasRunning.current && !running && versions.length) {
      setSelected(versions[versions.length - 1].n);
      setVideoKey((k) => k + 1);
      setProjectsRev((n) => n + 1);
    }
    wasRunning.current = running;
  }, [running, versions]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [logs]);

  // Auto-save: settings/toggles and subtitle edits go to projects/<id>/ shortly after every change.
  useEffect(() => {
    if (!jobId) return;
    const t = setTimeout(() => {
      void fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, settings, name: projectName }) });
    }, 800);
    return () => clearTimeout(t);
  }, [jobId, settings, projectName]);

  const saveSubtitles = useCallback(
    async (verification?: StudioSettings["verification"]) => {
      if (!jobId || !cues.length) return false;
      const srt = toSrt(cues);
      const res = await fetch("/api/subtitles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, srt, verification }) }).catch(() => null);
      if (res?.ok) lastSavedSrt.current = srt;
      return !!res?.ok;
    },
    [jobId, cues],
  );

  useEffect(() => {
    if (!jobId || !cues.length || toSrt(cues) === lastSavedSrt.current) return;
    const t = setTimeout(() => void saveSubtitles(), 1200);
    return () => clearTimeout(t);
  }, [jobId, cues, saveSubtitles]);

  const resetProject = () => {
    setCues([]);
    setLogs([]);
    setStatus(null);
    setSelected(0);
    logCount.current = 0;
    srtLoaded.current = false;
    lastSavedSrt.current = "";
  };

  // Step 1: send audio (+ optional .srt). With an .srt the server skips Whisper.
  const start = async () => {
    if (!audioFile) return;
    setError("");
    setUploading(true);
    resetProject();
    const body = new FormData();
    body.append("audio", audioFile);
    if (srtFile) body.append("srt", srtFile);
    if (projectName.trim()) body.append("name", projectName.trim());
    const res = await fetch("/api/transcribe", { method: "POST", body }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setUploading(false);
    if (!res?.ok) return setError(data?.error ?? "Upload failed.");
    setJobId(data.jobId);
    setProjectName(data.name ?? projectName);
    setAudioUrl(URL.createObjectURL(audioFile));
    setSettings({ ...settings, verification: "unchecked", assets: [] });
    setProjectsRev((n) => n + 1);
    if (data.srt) {
      srtLoaded.current = true;
      lastSavedSrt.current = normalizeSrt(data.srt);
      setCues(parseSrt(data.srt));
      setSource("srt");
      setStatus({ status: "idle", steps: [], logs: [], logCount: 0, srt: data.srt, subtitlesSource: "srt", error: null, videoReady: false, versions: [], revisions: [], seo: null, thumbnail: false });
    } else {
      setStatus({ status: "running", steps: [], logs: [], logCount: 0, srt: null, subtitlesSource: "whisper", error: null, videoReady: false, versions: [], revisions: [], seo: null, thumbnail: false });
    }
  };

  const regenerateWhisper = async () => {
    if (!jobId) return;
    setError("");
    const res = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, action: "whisper" }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not start Whisper.");
    srtLoaded.current = false;
    logCount.current = 0;
    setLogs([]);
    setCues([]);
    patch({ verification: "unchecked" });
    setStatus((s) => s && { ...s, status: "running", srt: null, error: null });
  };

  const openProject = async (id: string) => {
    if (running) return;
    setError("");
    const res = await fetch(`/api/projects?id=${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not open project.");
    resetProject();
    setLogs([]);
    setJobId(id);
    setProjectName(data.name);
    setAudioFile(null);
    setSrtFile(null);
    setAudioUrl(`/api/audio?id=${id}`);
    setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    setPassword("");
    const st = await fetch(`/api/status?id=${id}&from=0`).then((r) => r.json()).catch(() => null);
    if (st) {
      applyStatus({ ...st, srt: data.srt });
      if (st.versions?.length) setSelected(st.versions[st.versions.length - 1].n);
      setVideoKey((k) => k + 1);
    }
    if (data.srt) {
      srtLoaded.current = true;
      lastSavedSrt.current = normalizeSrt(data.srt);
      setCues(parseSrt(data.srt));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const post = async (body: Record<string, unknown>) => {
    setError("");
    const res = await fetch("/api/generate-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, srt: toSrt(cues), settings, password, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not start.");
    setStatus((s) => s && { ...s, status: "running", error: null });
  };
  const render = (quality: Quality) => post({ action: reuse && versions.length ? "rerender" : "generate", quality, baseVersion: reuse && versions.length ? selected || undefined : undefined });
  const revise = (feedback: string, quality: Quality) => post({ action: "revise", quality, feedback, baseVersion: selected || undefined });

  const transcribing = running && cues.length === 0;
  const gated = settings.requireVerified && settings.verification === "unchecked";
  const tutorialOk = settings.mode !== "tutorial" || /^https?:\/\/\S+/.test(settings.tutorialUrl);
  const canGenerate = !!jobId && cues.length > 0 && !running && tutorialOk && !gated;
  const reason = !jobId || cues.length === 0 ? "Load a voice file first (Step 1)." : gated ? "Verification is required: run the spot-check or click Skip Check." : !tutorialOk ? "Enter the target URL (https://…)." : "";
  const currentVersion = versions.find((v) => v.n === selected) ?? versions[versions.length - 1];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8 sm:py-12">
      <header className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Local-first · no API keys</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">বাংলা ভিডিও স্টুডিও</h1>
        <p className="mt-2 max-w-2xl text-muted">Upload a Bengali voiceover. Whisper (or your own .srt) provides subtitles, Claude Code plans and codes the video, Remotion renders the MP4. Everything runs on this machine, and every optional feature has its own switch.</p>
      </header>

      <RecentProjects currentId={jobId} onOpen={(id) => void openProject(id)} refreshKey={projectsRev} />

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <Section n={1} title="Voice & Subtitles" hint=".mp3 · .wav · .m4a  +  optional .srt">
        <div className="grid gap-3 sm:grid-cols-2">
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
              if (f && /\.(mp3|wav|m4a)$/i.test(f.name) && !running) setAudioFile(f);
            }}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging ? "border-accent bg-accent/10" : "border-line hover:border-muted"} ${running ? "pointer-events-none opacity-60" : ""}`}
          >
            <input type="file" accept=".mp3,.wav,.m4a,audio/*" className="sr-only" disabled={running} onChange={(e) => e.target.files?.[0] && setAudioFile(e.target.files[0])} />
            <span className="font-semibold">{audioFile?.name || (jobId && audioUrl ? "Project audio loaded" : "Bengali voice file")}</span>
            <span className="text-sm text-muted">{audioFile ? "Click to choose another" : "Drop or click to browse"}</span>
          </label>
          <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center transition-colors hover:border-muted ${running ? "pointer-events-none opacity-60" : ""}`}>
            <input type="file" accept=".srt,text/plain" className="sr-only" disabled={running} onChange={(e) => setSrtFile(e.target.files?.[0] ?? null)} />
            <span className="font-semibold">{srtFile?.name || "Subtitles .srt (optional)"}</span>
            <span className="text-sm text-muted">{srtFile ? <button type="button" className="underline" onClick={(e) => { e.preventDefault(); setSrtFile(null); }}>Remove</button> : "Provide one to skip Whisper entirely"}</span>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Toggle label="Enhance Voice Audio" desc="Local FFmpeg polish before render: highpass 80 Hz, lowpass 12 kHz, noise reduction, loudness leveling. OFF uses your audio untouched." checked={settings.enhanceVoice} onChange={(v) => patch({ enhanceVoice: v })} />
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Project name (optional)</span>
            <input lang="bn" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Defaults to the audio file name" className={field} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} disabled={!audioFile || running || uploading} onClick={() => void start()}>
            {uploading ? "Uploading…" : srtFile ? "Load audio + .srt (skip Whisper)" : "Load audio & transcribe with Whisper"}
          </button>
          {transcribing && <span className="text-sm text-muted">Transcribing with local Whisper… (see console below)</span>}
          {!audioFile && !jobId && <span className="text-sm text-muted">Choose an audio file first.</span>}
        </div>

        {cues.length > 0 && (
          <SubtitleEditor
            cues={cues}
            setCues={(fn) => setCues(fn)}
            audioUrl={audioUrl}
            verification={settings.verification}
            setVerification={(v) => patch({ verification: v })}
            requireVerified={settings.requireVerified}
            setRequireVerified={(v) => patch({ requireVerified: v })}
            onSave={() => saveSubtitles(settings.verification)}
            onRegenerate={() => void regenerateWhisper()}
            disabled={running}
            source={source}
          />
        )}
      </Section>

      <Section n={2} title="Video Mode" hint="Each mode loads its skill from .claude/skills/">
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <button type="button" key={m.id} aria-pressed={settings.mode === m.id} onClick={() => patch({ mode: m.id })} className={card(settings.mode === m.id)}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{m.title}</span>
                <code className="rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] text-muted">{m.skill}</code>
              </div>
              <p className="mt-1 text-sm text-muted">{m.desc}</p>
            </button>
          ))}
        </div>

        {settings.mode === "tutorial" && (
          <div className="mt-4 grid gap-3 rounded-xl border border-line bg-raised p-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold">Target App URL</span>
              <input type="url" required placeholder="https://example.com" value={settings.tutorialUrl} onChange={(e) => patch({ tutorialUrl: e.target.value })} className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Login Email (optional)</span>
              <input type="email" autoComplete="off" value={settings.tutorialEmail} onChange={(e) => patch({ tutorialEmail: e.target.value })} className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Login Password (optional)</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            </label>
            <p className="text-xs text-muted sm:col-span-2">Credentials stay on this machine: the password is passed to the local browser as an environment variable, never saved in the project, never written to disk and never sent to Claude.</p>
          </div>
        )}

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-semibold">{settings.mode === "tutorial" ? "Action hints (optional)" : "Creative notes (optional)"}</span>
          <textarea rows={2} value={settings.hints} onChange={(e) => patch({ hints: e.target.value })} placeholder={settings.mode === "tutorial" ? 'e.g. "Click Sign up at 0:05, then scroll to Pricing at 0:12"' : 'e.g. "Village setting, warm colours" or "Use a bar chart for the three numbers"'} className={field} />
        </label>

        <div className="mt-4">
          <MediaPanel jobId={jobId} assets={settings.assets} notes={settings.mediaNotes} onAssets={(assets) => patch({ assets })} onNotes={(mediaNotes) => patch({ mediaNotes })} disabled={running} />
        </div>
      </Section>

      <Section n={3} title="Character & Aspect Ratio">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CHARACTERS.map((c) => (
            <button type="button" key={c.id} aria-pressed={settings.character === c.id} onClick={() => patch({ character: c.id })} className={`${card(settings.character === c.id)} flex flex-col items-center !p-3 text-center`}>
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
              <button type="button" key={a} role="radio" aria-checked={settings.aspect === a} onClick={() => patch({ aspect: a })} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${settings.aspect === a ? "bg-accent text-accent-ink" : "text-muted hover:text-white"}`}>
                {a} {a === "16:9" ? "YouTube" : "Reels / Shorts"}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section n={4} title="Captions, Audio & Branding" hint="All optional">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Bengali captions (Hind Siliguri / Noto Sans Bengali)</h3>
            <div role="radiogroup" aria-label="Caption style" className="grid gap-2 sm:grid-cols-3">
              {CAPTION_OPTIONS.map((c) => (
                <button type="button" role="radio" aria-checked={settings.captions === c.id} key={c.id} onClick={() => patch({ captions: c.id })} className={`${card(settings.captions === c.id)} !p-3`}>
                  <span className="block text-sm font-semibold">{c.title}</span>
                  <span className="block text-xs text-muted">{c.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Background music &amp; effects</h3>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                Music
                <select value={settings.bgm} onChange={(e) => patch({ bgm: e.target.value as BgmId })} className={`${field} !w-auto`} aria-label="Background music">
                  {BGM_IDS.map((b) => (
                    <option key={b} value={b}>{BGM_LABEL[b]}</option>
                  ))}
                </select>
              </label>
              <label className={`flex flex-1 items-center gap-2 text-sm ${settings.bgm === "none" ? "opacity-40" : ""}`}>
                Volume
                <input type="range" min={0} max={0.6} step={0.01} value={settings.bgmVolume} disabled={settings.bgm === "none"} onChange={(e) => patch({ bgmVolume: Number(e.target.value) })} className="min-w-24 flex-1 accent-[var(--color-accent)]" aria-label="Music volume" />
                <span className="w-10 font-mono text-xs text-muted">{Math.round(settings.bgmVolume * 100)}%</span>
              </label>
            </div>
            <p className="text-xs text-muted">Music is synthesized locally and automatically ducks under the voiceover.</p>
            <Toggle label="UI & Transition SFX" desc="Soft whooshes on scene changes, pops on clicks, a chime at the outro." checked={settings.sfx} onChange={(v) => patch({ sfx: v })} />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <BrandKitDrawer onChange={setBrand} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle label="Show Corner Logo Watermark" desc="Top-right logo (or channel name) from the Brand Kit." checked={settings.showLogo} onChange={(v) => patch({ showLogo: v })} />
            <Toggle label="Add Animated Subscribe/Follow Outro" desc="Adds a 4-second branded outro after the voiceover." checked={settings.outro} onChange={(v) => patch({ outro: v })} />
          </div>
          {(settings.showLogo || settings.outro) && brand && !brand.hasLogo && !brand.channelName && <p className="text-xs text-accent">Open the Brand Kit and add a channel name or logo, otherwise these overlays have nothing to show.</p>}
        </div>
      </Section>

      <Section n={5} title="Render & Live Progress">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Toggle label="Generate Auto-Thumbnail (thumbnail.png)" desc="Main visual + bold Bengali headline. Runs on Final HD renders." checked={settings.thumbnail} onChange={(v) => patch({ thumbnail: v })} />
          <Toggle label="Generate YouTube/Social Metadata & Chapters" desc="Bengali/English titles, description, hashtags and 00:00 chapters from your SRT. Runs on Final HD renders." checked={settings.metadata} onChange={(v) => patch({ metadata: v })} />
        </div>

        {versions.length > 0 && (
          <div className="mb-4">
            <Toggle label="Reuse the current design (no AI, just re-render)" desc={`Re-renders v${currentVersion?.n} with the latest subtitles and toggles at the quality you pick. Off = Claude designs a brand-new video.`} checked={reuse} onChange={setReuse} />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void render("draft")} disabled={!canGenerate} className={`${btnPrimary} !bg-raised !text-white border border-accent`}>
            {running && !transcribing ? "Working…" : "⚡ Fast Draft Preview (480p / 15fps)"}
          </button>
          <button type="button" onClick={() => void render("final")} disabled={!canGenerate} className={btnPrimary}>
            🎬 Final HD Render (1080p / 30fps)
          </button>
        </div>
        {!canGenerate && !running && reason && <p className="mt-2 text-sm text-muted">{reason}</p>}
        <p className="mt-2 text-xs text-muted">Draft renders in a fraction of the time to check timing, animations and browser actions. When it looks right, tick “Reuse the current design” and render Final HD.</p>

        {status && status.steps.length > 0 && (
          <ol className="mt-4 grid gap-2 sm:grid-cols-3">
            {status.steps.map((s) => (
              <li key={s.id} className={`rounded-lg border px-3 py-2 text-sm ${s.state === "active" ? "border-accent bg-accent/10 text-accent" : s.state === "done" ? "border-emerald-500/50 text-emerald-300" : s.state === "error" ? "border-red-500/60 text-red-300" : "border-line text-muted"}`}>
                <span aria-hidden className="mr-1.5">{s.state === "done" ? "✓" : s.state === "active" ? "●" : s.state === "error" ? "✕" : s.state === "skipped" ? "–" : "○"}</span>
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

      <Section n={6} title="Preview, Revise & Download">
        {versions.length > 0 && jobId ? (
          <>
            <Player jobId={jobId} versions={versions} selected={selected} onSelect={setSelected} revisions={status?.revisions ?? []} portrait={settings.aspect === "9:16"} busy={running} onRevise={(f, q) => void revise(f, q)} videoKey={videoKey} />
            <SeoPanel jobId={jobId} seo={status?.seo ?? null} thumbnail={!!status?.thumbnail} rev={videoKey} />
          </>
        ) : (
          <p className="text-sm text-muted">Your video appears here when rendering finishes.</p>
        )}
      </Section>
    </main>
  );
}
