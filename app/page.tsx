"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Save, LayoutTemplate, Mic, PenLine, Pencil, Plus, Trash2, AudioLines, Captions, Check, Clapperboard, FileText, Globe, Loader2, Moon, MonitorPlay, Rocket, ShieldCheck, Smartphone, Sparkles, Sun, Tv, UserRound, UploadCloud, WandSparkles, Zap, Film } from "lucide-react";
import { CHARACTER_STYLES, Character } from "@/remotion/characters/Character";
import { parseSrt, toSrt, type CharacterId, type Cue } from "@/remotion/lib/types";
import { BGM_IDS, DEFAULT_SETTINGS, type BgmId, type BrandKit, type Mode, type Quality, type RevisionInfo, type SeoPack, type ShortClip, type StudioSettings, type VersionInfo } from "@/lib/settings";
import type { SavedCharacter } from "@/lib/characters";
import type { SavedStyle } from "@/lib/styledna";
import type { TemplateSummary } from "@/lib/templates";
import { BrandKitDrawer } from "./components/BrandKit";
import { CaptionsPanel } from "./components/CaptionsPanel";
import { CharacterBuilder } from "./components/CharacterBuilder";
import { DictionaryPanel } from "./components/DictionaryPanel";
import { PresetBar } from "./components/PresetBar";
import { StyleCloner } from "./components/StyleCloner";
import { TemplatesTab } from "./components/TemplatesTab";
import { ShortsPanel } from "./components/ShortsPanel";
import { MediaPanel } from "./components/MediaPanel";
import { Player, SeoPanel } from "./components/Player";
import { RecentProjects } from "./components/RecentProjects";
import { Monitor, overallProgress, useNow, type StepView } from "./components/Monitor";
import { SetupCheck } from "./components/SetupCheck";
import { SubtitleEditor } from "./components/SubtitleEditor";
import { ProgressBar, Section, Segmented, Toggle, btn, btnPrimary, card, field } from "./components/ui";

const LivePreview = dynamic(() => import("./components/LivePreview"), {
  ssr: false,
  loading: () => <div className="grid size-full place-items-center text-white/70"><Loader2 className="size-6 animate-spin" /></div>,
});

type Status = {
  status: "idle" | "running" | "done" | "error";
  steps: StepView[];
  tokens?: { input: number; output: number } | null;
  previewRev?: number;
  shorts?: ShortClip[];
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

const MODE_ICON: Record<Mode, React.ReactNode> = {
  cartoon: <Film className="size-5" />,
  motion: <WandSparkles className="size-5" />,
  tutorial: <Globe className="size-5" />,
  auto: <Sparkles className="size-5" />,
};

const SEED_STEPS: StepView[] = [
  { id: "transcribe", label: "Generating Bengali SRT", state: "active" },
  { id: "prepare", label: "Preparing Audio & Assets", state: "pending" },
  { id: "plan", label: "Planning Scenes", state: "pending" },
  { id: "record", label: "Recording Browser", state: "pending" },
  { id: "render", label: "Rendering MP4", state: "pending" },
  { id: "extras", label: "Thumbnail & YouTube Pack", state: "pending" },
];

/** Upload with real progress (fetch cannot report upload progress). */
function uploadForm(body: FormData, onPct: (n: number) => void): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open("POST", "/api/transcribe");
    x.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(x.responseText);
      } catch {
        /* keep empty */
      }
      resolve({ ok: x.status >= 200 && x.status < 300, data });
    };
    x.onerror = () => resolve({ ok: false, data: {} });
    x.send(body);
  });
}

const CHARACTERS: { id: Exclude<CharacterId, "custom">; title: string; desc: string }[] = [
  { id: "tech-mentor", title: "Tech Mentor", desc: "Headset, confident" },
  { id: "storyteller", title: "Storyteller", desc: "Book in hand, warm" },
  { id: "friendly-teacher", title: "Friendly Teacher", desc: "Glasses, patient" },
  { id: "auto", title: "Auto-Generate", desc: "Designed from the story" },
  { id: "none", title: "No Character", desc: "No narrator on screen. Best for dramas / stories" },
];

const BGM_LABEL: Record<BgmId, string> = { none: "None", "soft-storytelling": "Soft Storytelling", "tech-explainer": "Tech Explainer" };

const normalizeSrt = (srt: string) => toSrt(parseSrt(srt));

const VOICE_OPTIONS = (
  <>
    <optgroup label="Bangladesh">
      <option value="bn-BD-NabanitaNeural">Nabanita · female</option>
      <option value="bn-BD-PradeepNeural">Pradeep · male</option>
    </optgroup>
    <optgroup label="West Bengal">
      <option value="bn-IN-TanishaaNeural">Tanishaa · female</option>
      <option value="bn-IN-BashkarNeural">Bashkar · male</option>
    </optgroup>
  </>
);

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
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [library, setLibrary] = useState<SavedCharacter[]>([]);
  const [builder, setBuilder] = useState<{ open: boolean; editing: SavedCharacter | null }>({ open: false, editing: null });
  const [shorts, setShorts] = useState<ShortClip[]>([]);
  const [voiceTab, setVoiceTab] = useState<"upload" | "script" | "templates">("upload");
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templatesRev, setTemplatesRev] = useState(0);
  const [tplName, setTplName] = useState("");
  const [tplMsg, setTplMsg] = useState("");
  const [styleRefresh, setStyleRefresh] = useState(0);
  const cloneStarted = useRef(false);
  const prevRunning = useRef(false);
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState("bn-BD-NabanitaNeural");
  const [voiceB, setVoiceB] = useState("bn-BD-PradeepNeural");
  const [rate, setRate] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [current, setCurrent] = useState(1);
  const [source, setSource] = useState("");
  const [envReady, setEnvReady] = useState(true);

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
    if (s.shorts) setShorts(s.shorts);
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
    if (prevRunning.current && !running && cloneStarted.current) {
      cloneStarted.current = false;
      setStyleRefresh((n) => n + 1);
    }
    prevRunning.current = running;
  }, [running]);

  const applyTemplate = (id: string | null, tplSettings?: Partial<StudioSettings>) => setSettings((st) => ({ ...st, ...(tplSettings ?? {}), template: id ?? "" }));
  const selectStyle = (st: SavedStyle | null) => setSettings((cur) => ({ ...cur, styleDna: st?.id ?? "", ...(st ? { captions: st.dna.look.captionStyle, captionPosition: st.dna.look.captionPosition } : {}) }));
  const saveAsTemplate = async () => {
    if (!jobId) return;
    setTplMsg("");
    const res = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, name: tplName.trim() || projectName }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) return setTplMsg(d?.error ?? "Could not save the template.");
    setTemplatesRev((n) => n + 1);
    setTplName("");
    setTplMsg(`Saved "${d.template.name}". Find it under Step 1, My Templates.`);
  };
  const activeTemplate = templates.find((t) => t.id === settings.template);

  // Character Builder library (data/characters.json)
  const loadLibrary = useCallback(async () => {
    const d = await fetch("/api/characters", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.characters) setLibrary(d.characters as SavedCharacter[]);
  }, []);
  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);
  const removeCharacter = async (c: SavedCharacter) => {
    if (!confirm(`Delete "${c.name}" from your library?`)) return;
    await fetch(`/api/characters?id=${c.id}`, { method: "DELETE" });
    if (settings.customCharacter === c.id) patch({ character: "tech-mentor", customCharacter: "" });
    if (settings.customCharacterB === c.id) patch({ characterB: "friendly-teacher", customCharacterB: "" });
    void loadLibrary();
  };

  // Theme: read the saved/applied theme once, then keep <html data-theme> + localStorage in sync.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("bvs-theme", next);
    } catch {
      /* private mode */
    }
  };

  // Scroll-spy for the left rail.
  useEffect(() => {
    const els = [1, 2, 3, 4, 5, 6].map((n) => document.getElementById(`step-${n}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setCurrent(Number(vis.target.id.replace("step-", "")));
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

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
    setShorts([]);
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
    setUploadPct(0);
    const { ok, data: raw } = await uploadForm(body, setUploadPct);
    const data = raw as { jobId: string; name?: string; srt?: string | null; error?: string };
    setUploadPct(null);
    setUploading(false);
    if (!ok) return setError(data?.error ?? "Upload failed.");
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
      setStatus({ status: "running", steps: SEED_STEPS.map((x) => (x.id === "transcribe" ? { ...x, startedAt: Date.now() } : x)), logs: [], logCount: 0, srt: null, subtitlesSource: "whisper", error: null, videoReady: false, versions: [], revisions: [], seo: null, thumbnail: false });
    }
  };

  // Step 1 (alternative): type/paste a Bengali script; edge-tts makes the voice AND the exact .srt, no Whisper needed.
  const startScript = async () => {
    if (!script.trim()) return;
    setError("");
    setUploading(true);
    resetProject();
    const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: script, voice, voiceB, rate, pitch, name: projectName.trim() || undefined }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setUploading(false);
    if (!res?.ok) return setError(data?.error ?? "Could not start Auto-Voice.");
    const tagged = /^\s*[ab]\s*[:：]/im.test(script);
    setJobId(data.jobId);
    setProjectName(data.name ?? projectName);
    setAudioFile(null);
    setSrtFile(null);
    setAudioUrl(`/api/audio?id=${data.jobId}`);
    setSource("tts");
    setSettings({ ...settings, verification: "verified", assets: [], ...(tagged ? { dialogue: true } : {}) }); // timings come from the voice itself
    setProjectsRev((n) => n + 1);
    setStatus({ status: "running", steps: SEED_STEPS.map((x) => (x.id === "transcribe" ? { ...x, startedAt: Date.now() } : x)), logs: [], logCount: 0, srt: null, subtitlesSource: "tts", error: null, videoReady: false, versions: [], revisions: [], seo: null, thumbnail: false });
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
    if (typeof data.script === "string") {
      setScript(data.script);
      setVoiceTab("script");
    } else setVoiceTab("upload");
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
  const canGenerate = envReady && !!jobId && cues.length > 0 && !running && tutorialOk && !gated;
  const reason = !envReady ? "Fix the required items in the environment check above first." : !jobId || cues.length === 0 ? "Load a voice file first (Step 1)." : gated ? "Verification is required: run the spot-check or click Skip Check." : !tutorialOk ? "Enter the target URL (https://…)." : "";
  const currentVersion = versions.find((v) => v.n === selected) ?? versions[versions.length - 1];

  const now = useNow(running || uploadPct != null);
  const stepsView: StepView[] = status?.steps ?? [];
  const overall = overallProgress(stepsView, now);
  const activeStep = stepsView.find((x) => x.state === "active");
  const latest = versions.find((v) => v.n === selected) ?? versions[versions.length - 1];
  const videoSrc = jobId && latest ? `/api/video?id=${jobId}&v=${latest.n}&k=${videoKey}` : null;
  const previewRev = status?.previewRev ?? 0;
  const liveNode = settings.livePreview && jobId && previewRev > 0 ? <LivePreview jobId={jobId} rev={previewRev} /> : undefined;
  const dialogueOn = settings.dialogue && settings.character !== "none";
  const showMonitorMobile = !!liveNode || running || uploadPct != null || !!videoSrc || logs.length > 0;

  const STEPS = [
    { n: 1, label: "Voice & Subtitles", icon: AudioLines, done: cues.length > 0 },
    { n: 2, label: "Video Mode", icon: Clapperboard, done: false },
    { n: 3, label: "Character & Aspect", icon: UserRound, done: false },
    { n: 4, label: "Captions & Branding", icon: Captions, done: false },
    { n: 5, label: "Render", icon: Rocket, done: versions.length > 0 },
    { n: 6, label: "Preview & Export", icon: MonitorPlay, done: versions.length > 0 },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-panel/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-accent-ink shadow-md shadow-accent/30">
              <Film className="size-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold">ভিডিও স্টুডিও</div>
              <div className="hidden text-[10px] uppercase tracking-widest text-muted sm:block">Bangla Video Studio</div>
            </div>
          </div>

          {jobId && (
            <div className="ml-2 hidden min-w-0 items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1 text-sm md:flex">
              <span className="text-muted">Project</span>
              <span lang="bn" className="max-w-56 truncate font-semibold">{projectName || "Untitled"}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {(running || uploadPct != null) && (
              <a href="#live" className="flex max-w-[16rem] items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-strong">
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
                <span className="truncate">{uploadPct != null ? `Uploading ${uploadPct}%` : `${activeStep?.label ?? "Working"} · ${overall}%`}</span>
              </a>
            )}
            <a href="#env" className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold sm:flex ${envReady ? "border-line text-muted hover:text-fg" : "border-red-500/50 bg-red-500/10 text-red-600"}`}>
              <ShieldCheck className="size-3.5" /> {envReady ? "Environment ready" : "Setup needed"}
            </a>
            <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} className="grid size-9 place-items-center rounded-lg border border-line bg-panel text-muted transition hover:border-accent hover:text-accent-strong">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
        {(running || uploadPct != null) && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-line">
            <div className="h-full bg-gradient-to-r from-accent to-accent-strong transition-[width] duration-500" style={{ width: `${uploadPct != null ? uploadPct : overall}%` }} />
          </div>
        )}
      </header>

      <div className="mx-auto flex max-w-[1680px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line p-4 lg:flex">
          <nav aria-label="Steps">
            <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-muted">Workflow</h3>
            <ol className="relative space-y-0.5">
              {STEPS.map((st) => {
                const Icon = st.icon;
                const on = current === st.n;
                const doneNow = st.done && !!jobId;
                return (
                  <li key={st.n}>
                    <a href={`#step-${st.n}`} aria-current={on ? "step" : undefined} className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition ${on ? "bg-panel font-semibold shadow-card ring-1 ring-line" : "text-muted hover:bg-panel/70 hover:text-fg"}`}>
                      <span className={`grid size-7 shrink-0 place-items-center rounded-lg transition ${doneNow ? "bg-accent text-accent-ink" : on ? "bg-accent/15 text-accent-strong" : "bg-raised text-muted ring-1 ring-line"}`}>
                        {doneNow ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4" />}
                      </span>
                      {st.label}
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          <RecentProjects currentId={jobId} onOpen={(id) => void openProject(id)} refreshKey={projectsRev} />

          <div className="mt-auto rounded-xl border border-line bg-panel p-3 text-xs text-muted shadow-card">
            <div className="mb-1 flex items-center gap-2 font-semibold text-fg">
              <span className={`size-2 rounded-full ${running ? "pulse-ring bg-accent" : "bg-muted/60"}`} />
              {running ? "Working…" : jobId ? "Project active" : "Idle"}
            </div>
            Local-first · no API keys. Whisper + Claude Code + Remotion run on this machine.
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 xl:px-8">
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_470px]">
            <div className="order-2 flex min-w-0 flex-col gap-6 xl:order-1">
              <div className="rise rounded-2xl border border-line bg-gradient-to-br from-panel to-raised p-6 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-widest text-accent-strong">Bengali AI video studio</p>
                <h1 className="mt-1 text-2xl font-bold sm:text-3xl">নতুন ভিডিও তৈরি করুন</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted">Upload a Bengali voiceover. Whisper (or your own .srt) provides subtitles, Claude Code plans the video, Remotion renders the MP4. Everything runs on this machine.</p>
              </div>

              <details className="rounded-xl border border-line bg-panel p-4 shadow-card lg:hidden">
                <summary className="cursor-pointer text-sm font-semibold">Recent projects</summary>
                <div className="mt-3">
                  <RecentProjects currentId={jobId} onOpen={(id) => void openProject(id)} refreshKey={projectsRev} />
                </div>
              </details>

              <PresetBar settings={settings} disabled={running} onLoad={(p) => setSettings((st) => ({ ...st, ...p }))} />

              <div id="env" className="scroll-mt-20">
                <SetupCheck onReady={setEnvReady} />
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

      <Section n={1} icon={<AudioLines className="size-5" />} title="Voice & Subtitles" hint=".mp3 · .wav · .m4a  +  optional .srt">
        <div role="tablist" aria-label="Voice source" className="mb-4 inline-flex rounded-xl border border-line bg-ink p-1">
          {([
            ["upload", "Upload voice", Mic],
            ["script", "Write / paste script (Auto-Voice)", PenLine],
            ["templates", "My Templates", LayoutTemplate],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={voiceTab === id} onClick={() => setVoiceTab(id)} disabled={running} className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${voiceTab === id ? "bg-panel text-accent-strong shadow-sm ring-1 ring-line" : "text-muted hover:text-fg"}`}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {settings.template && voiceTab !== "templates" && (
          <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            <LayoutTemplate className="size-4 text-accent-strong" /> Template <b lang="bn">{activeTemplate?.name ?? settings.template}</b> will give this video its structure.
            <button type="button" className="ml-auto text-xs font-semibold underline" onClick={() => applyTemplate(null)}>Clear</button>
          </p>
        )}

        {voiceTab === "upload" ? (
          <>
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
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging ? "border-accent bg-accent/10" : "border-line bg-ink/40 hover:border-accent/50 hover:bg-accent/5"} ${running ? "pointer-events-none opacity-60" : ""}`}
          >
            <input type="file" accept=".mp3,.wav,.m4a,audio/*" className="sr-only" disabled={running} onChange={(e) => e.target.files?.[0] && setAudioFile(e.target.files[0])} />
            <span className="mb-1 grid size-12 place-items-center rounded-full bg-accent/10 text-accent-strong"><UploadCloud className="size-6" /></span>
            <span className="max-w-full truncate font-semibold">{audioFile?.name || (jobId && audioUrl ? "Project audio loaded" : "Bengali voice file")}</span>
            <span className="text-sm text-muted">{audioFile ? "Click to choose another" : "Drop or click to browse"}</span>
          </label>
          <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center transition-colors hover:border-muted ${running ? "pointer-events-none opacity-60" : ""}`}>
            <input type="file" accept=".srt,text/plain" className="sr-only" disabled={running} onChange={(e) => setSrtFile(e.target.files?.[0] ?? null)} />
            <span className="mb-1 grid size-12 place-items-center rounded-full bg-raised text-muted ring-1 ring-line"><FileText className="size-6" /></span>
            <span className="max-w-full truncate font-semibold">{srtFile?.name || "Subtitles .srt (optional)"}</span>
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

          </>
        ) : voiceTab === "templates" ? (
          <TemplatesTab selectedId={settings.template} onUse={applyTemplate} refreshKey={templatesRev} onGoTo={setVoiceTab} disabled={running} onList={setTemplates} />
        ) : (
          <div role="tabpanel" className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Bengali script</span>
              <textarea lang="bn" rows={9} value={script} maxLength={30000} onChange={(e) => setScript(e.target.value)} disabled={running} placeholder={"আপনার স্ক্রিপ্ট এখানে লিখুন বা পেস্ট করুন…\n\nদুইজনের কথোপকথনের জন্য লাইন শুরু করুন  A:  বা  B:  দিয়ে।"} className={`${field} text-base leading-relaxed`} />
              <span className="mt-1 flex justify-between text-xs text-muted">
                <span>Tips: <b>A:</b> / <b>B:</b> lines = two voices. <b>[দৃশ্য ১: ...]</b> in brackets = a scene direction (not spoken; it plans the visuals).</span>
                <span className="tabular">{script.length.toLocaleString()} / 30,000</span>
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Voice (A)</span>
                <select value={voice} onChange={(e) => setVoice(e.target.value)} className={field}>
                  {VOICE_OPTIONS}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Voice (B lines)</span>
                <select value={voiceB} onChange={(e) => setVoiceB(e.target.value)} className={field}>
                  {VOICE_OPTIONS}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Speed <span className="tabular font-mono text-xs font-normal text-muted">{rate > 0 ? "+" : ""}{rate}%</span></span>
                <input type="range" min={-30} max={30} step={5} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-accent)]" aria-label="Speech speed" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Pitch <span className="tabular font-mono text-xs font-normal text-muted">{pitch > 0 ? "+" : ""}{pitch} Hz</span></span>
                <input type="range" min={-30} max={30} step={2} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-accent)]" aria-label="Voice pitch" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Project name (optional)</span>
              <input lang="bn" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Defaults to the first words of the script" className={field} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={btnPrimary} disabled={!script.trim() || running || uploading} onClick={() => void startScript()}>
                <Mic className="size-4" /> {uploading ? "Starting…" : "Generate voice + subtitles"}
              </button>
              {transcribing && <span className="text-sm text-muted">Synthesizing the voice… (see the live monitor)</span>}
            </div>
            <p className="text-xs text-muted">Uses the free Microsoft neural Bengali voices through the open-source <code className="font-mono">edge-tts</code> package: no API key, no account. It needs an internet connection only for this step; subtitles come from the voice&apos;s own timings, so they match the audio exactly.</p>
          </div>
        )}

        {voiceTab === "upload" && <div className="mt-4"><DictionaryPanel cues={cues} setCues={(fn) => setCues(fn)} disabled={running} /></div>}

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
            dialogue={dialogueOn}
          />
        )}
      </Section>

      <Section n={2} icon={<Clapperboard className="size-5" />} title="Video Mode" hint="Each mode loads its skill from .claude/skills/">
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <button type="button" key={m.id} aria-pressed={settings.mode === m.id} onClick={() => patch({ mode: m.id })} className={card(settings.mode === m.id)}>
              <div className="flex items-start gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${settings.mode === m.id ? "bg-accent text-accent-ink" : "bg-raised text-muted ring-1 ring-line"}`}>{MODE_ICON[m.id]}</span>
                <div className="min-w-0">
                  <div className="font-semibold">{m.title}</div>
                  <p className="mt-0.5 text-sm text-muted">{m.desc}</p>
                  <code className="mt-1.5 inline-block rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-muted">{m.skill}</code>
                </div>
                {settings.mode === m.id && <Check className="ml-auto size-5 shrink-0 text-accent-strong" strokeWidth={3} />}
              </div>
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
            <div className="sm:col-span-2">
              <Toggle label="Self-healing recorder" desc="If a button or field is not found, try smart fallbacks (role, label, text, fuzzy match). Failed actions are captured with a page snapshot and Claude patches the selectors once before re-recording, so the tutorial never crashes mid-way." checked={settings.selfHeal} onChange={(v) => patch({ selfHeal: v })} />
            </div>
            <p className="text-xs text-muted sm:col-span-2">Credentials stay on this machine: the password is passed to the local browser as an environment variable, never saved in the project, never written to disk and never sent to Claude.</p>
          </div>
        )}

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-semibold">{settings.mode === "tutorial" ? "Action hints (optional)" : "Creative notes (optional)"}</span>
          <textarea rows={2} value={settings.hints} onChange={(e) => patch({ hints: e.target.value })} placeholder={settings.mode === "tutorial" ? 'e.g. "Click Sign up at 0:05, then scroll to Pricing at 0:12"' : 'e.g. "Village setting, warm colours" or "Use a bar chart for the three numbers"'} className={field} />
        </label>

        <div className="mt-4">
          <StyleCloner jobId={jobId} running={running} selectedId={settings.styleDna} onSelect={selectStyle} onStarted={() => { cloneStarted.current = true; setStatus((st) => st && { ...st, status: "running", error: null }); }} refreshKey={styleRefresh} templateActive={!!settings.template} />
        </div>

        <div className="mt-4">
          <MediaPanel jobId={jobId} assets={settings.assets} notes={settings.mediaNotes} onAssets={(assets) => patch({ assets })} onNotes={(mediaNotes) => patch({ mediaNotes })} disabled={running} />
        </div>
      </Section>

      <Section n={3} icon={<UserRound className="size-5" />} title="Character & Aspect Ratio">
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

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold">My characters</h3>
            <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-muted">{library.length} saved</span>
            <button type="button" className={`${btn} ml-auto`} onClick={() => setBuilder({ open: true, editing: null })}><Plus className="size-4" /> Create character</button>
          </div>
          {library.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">Mix hair, skin tone, glasses and outfits (Panjabi, suit, hoodie, saree) and save your own SVG characters for future videos.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {library.map((c) => {
                const on = settings.character === "custom" && settings.customCharacter === c.id;
                return (
                  <div key={c.id} className="relative">
                    <button type="button" aria-pressed={on} onClick={() => patch({ character: "custom", customCharacter: c.id })} className={`${card(on)} flex w-full flex-col items-center !p-3 text-center`}>
                      <div className="grid h-28 place-items-center"><Character look={c.look} size={112} expression="happy" /></div>
                      <span lang="bn" className="mt-1 max-w-full truncate text-sm font-semibold">{c.name}</span>
                    </button>
                    <div className="absolute right-1.5 top-1.5 flex gap-1">
                      <button type="button" aria-label={`Edit ${c.name}`} onClick={() => setBuilder({ open: true, editing: c })} className="grid size-7 place-items-center rounded-md border border-line bg-panel/90 text-muted hover:text-fg"><Pencil className="size-3.5" /></button>
                      <button type="button" aria-label={`Delete ${c.name}`} onClick={() => void removeCharacter(c)} className="grid size-7 place-items-center rounded-md border border-line bg-panel/90 text-muted hover:text-red-600"><Trash2 className="size-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-line bg-raised/50 p-4">
          <Toggle
            label="Dialogue Mode (2 speakers)"
            desc="Two characters share the screen. Tag each subtitle line Speaker A or B in Step 1 (or auto-alternate); the spotlight and lip-sync follow whoever is speaking."
            checked={settings.dialogue}
            onChange={(v) => patch({ dialogue: v })}
          />
          {settings.dialogue && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-14 text-sm">
              {settings.character === "none" && <span className="text-amber-700">Pick a character above: Dialogue Mode needs characters on screen.</span>}
              <span className="font-semibold">Speaker A</span>
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent-strong">{settings.character === "custom" ? (library.find((c) => c.id === settings.customCharacter)?.name ?? "custom") : settings.character}</span>
              <label className="flex items-center gap-2">
                <span className="font-semibold">Speaker B</span>
                <select
                  aria-label="Speaker B character"
                  className={`${field} !w-auto !py-1`}
                  value={settings.characterB === "custom" ? `custom:${settings.customCharacterB}` : settings.characterB}
                  onChange={(e) => (e.target.value.startsWith("custom:") ? patch({ characterB: "custom", customCharacterB: e.target.value.slice(7) }) : patch({ characterB: e.target.value as StudioSettings["characterB"] }))}
                >
                  <option value="tech-mentor">Tech Mentor</option>
                  <option value="storyteller">Storyteller</option>
                  <option value="friendly-teacher">Friendly Teacher</option>
                  {library.map((c) => (
                    <option key={c.id} value={`custom:${c.id}`}>{c.name} (custom)</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">Aspect ratio</span>
          <Segmented
            label="Aspect ratio"
            value={settings.aspect}
            onChange={(v) => patch({ aspect: v })}
            options={[
              { id: "16:9", label: (<><Tv className="size-4" /> 16:9 YouTube</>) },
              { id: "9:16", label: (<><Smartphone className="size-4" /> 9:16 Reels / Shorts</>) },
            ]}
          />
        </div>
      </Section>

      <Section n={4} icon={<Captions className="size-5" />} title="Captions, Audio & Branding" hint="All optional">
        <div className="grid gap-6 lg:grid-cols-2">
          <CaptionsPanel settings={settings} patch={patch} />

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

      <Section n={5} icon={<Rocket className="size-5" />} title="Render" hint="Progress shows in the live monitor">
        <div className="mb-4 grid gap-4 rounded-xl border border-line bg-raised/50 p-4 sm:grid-cols-2">
          <Toggle label="Instant live preview (in-browser)" desc="Play and scrub the scene plan in the monitor as soon as it exists, without waiting for the MP4." checked={settings.livePreview} onChange={(v) => patch({ livePreview: v })} />
          <Toggle label="Long-to-Shorts clipper (9:16)" desc="After a video exists, cut vertical Shorts from it: AI-picked or manual timestamps." checked={settings.shorts} onChange={(v) => patch({ shorts: v })} />
          <Toggle label="Auto-fetch real photos / B-roll" desc="Public-domain / CC0 photos from Wikimedia Commons (free, no key) for scenes about real places and things. Off = pure vector graphics." checked={settings.autoBroll} onChange={(v) => patch({ autoBroll: v })} />
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Toggle label="Generate Auto-Thumbnail (thumbnail.png)" desc="Main visual + bold Bengali headline. Runs after Final HD renders; for a draft use “Generate now” in Step 6." checked={settings.thumbnail} onChange={(v) => patch({ thumbnail: v })} />
          <Toggle label="Generate YouTube/Social Metadata & Chapters" desc="Bengali/English titles, description, hashtags and 00:00 chapters from your SRT. Runs after Final HD renders; for a draft use “Generate now” in Step 6." checked={settings.metadata} onChange={(v) => patch({ metadata: v })} />
        </div>

        <div className="mb-4 grid gap-4 rounded-xl border border-line bg-raised p-4 sm:grid-cols-2">
          <Toggle
            label="Token Saver Mode (Haiku/Sonnet Hybrid)"
            desc={settings.tokenSaver ? "Light tasks (metadata, chapters, single-scene edits) run on Haiku; scene planning on Sonnet. Saves your Claude Code usage." : "Max Quality Mode: every task runs on your Claude Code default model."}
            checked={settings.tokenSaver}
            onChange={(v) => patch({ tokenSaver: v })}
          />
          <Toggle
            label="Custom one-off TSX visual"
            desc={settings.engine === "custom" ? "Claude writes bespoke React code for this video. Uses many times more tokens and is slower." : "OFF (recommended): Claude only writes a compact scene-plan.json; the pre-built component library renders it."}
            checked={settings.engine === "custom"}
            onChange={(v) => patch({ engine: v ? "custom" : "json" })}
          />
          <Toggle label="Chunked rendering for long videos" desc="Videos over 3 minutes render in 90-second chunks (one Remotion run each) and are stitched with ffmpeg, so long YouTube videos do not run out of RAM or lose everything on a crash." checked={settings.chunkedRender} onChange={(v) => patch({ chunkedRender: v })} />
        </div>

        {versions.length > 0 && (
          <div className="mb-4">
            <Toggle label="Reuse the current design (no AI, just re-render)" desc={`Re-renders v${currentVersion?.n} with the latest subtitles and toggles at the quality you pick. Off = Claude designs a brand-new video.`} checked={reuse} onChange={setReuse} />
          </div>
        )}

        {(settings.template || settings.styleDna) && (
          <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {settings.template && <span className="inline-flex items-center gap-1.5 font-semibold text-accent-strong"><LayoutTemplate className="size-3.5" /> Template: {activeTemplate?.name ?? settings.template}</span>}
            {settings.styleDna && !settings.template && <span className="inline-flex items-center gap-1.5 font-semibold text-accent-strong">Style DNA active</span>}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void render("draft")} disabled={!canGenerate} className={`${btn} !border-accent !px-5 !py-2.5 !text-accent-strong`}>
            <Zap className="size-4" />
            {running && !transcribing ? "Working…" : "Fast Draft (480p / 15fps)"}
          </button>
          <button type="button" onClick={() => void render("final")} disabled={!canGenerate} className={btnPrimary}>
            <Rocket className="size-4" />
            Final HD Render (1080p / 30fps)
          </button>
        </div>
        {!canGenerate && !running && reason && <p className="mt-2 text-sm text-muted">{reason}</p>}
        <p className="mt-2 text-xs text-muted">Draft renders in a fraction of the time to check timing, animations and browser actions. When it looks right, tick “Reuse the current design” and render Final HD.</p>

        {running && (
          <div className="mt-5 rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-semibold"><Loader2 className="size-4 shrink-0 animate-spin text-accent-strong" /><span className="truncate">{activeStep?.label ?? "Working"}</span></span>
              <span className="tabular font-mono font-semibold text-accent-strong">{overall}%</span>
            </div>
            <ProgressBar value={overall} />
            <p className="mt-2 truncate text-xs text-muted">{activeStep?.detail ?? "Working…"} <a href="#live" className="font-semibold text-accent-strong xl:hidden">Open live monitor</a></p>
          </div>
        )}
      </Section>

      <Section n={6} icon={<MonitorPlay className="size-5" />} title="Preview, Revise & Download">
        {versions.length > 0 && jobId ? (
          <>
            <Player jobId={jobId} versions={versions} selected={selected} onSelect={setSelected} revisions={status?.revisions ?? []} portrait={settings.aspect === "9:16"} busy={running} onRevise={(f, q) => void revise(f, q)} videoKey={videoKey} />
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised/50 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-bold"><LayoutTemplate className="size-4 text-accent-strong" /> Save as reusable template</div>
                <p className="text-xs text-muted">Keeps this video&apos;s structure (scene pacing, look, character, camera, subtitle design, music, brand) without its audio, subtitles or text. Reuse it from Step 1, My Templates.</p>
                {tplMsg && <p role="status" className="mt-1 text-xs font-semibold text-accent-strong">{tplMsg}</p>}
              </div>
              <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name, e.g. Tech Explainer" aria-label="Template name" maxLength={50} lang="bn" className={`${field} !w-56`} />
              <button type="button" className={btnPrimary} disabled={running || !tplName.trim()} onClick={() => void saveAsTemplate()}><Save className="size-4" /> Save template</button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised/50 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">Thumbnail &amp; YouTube pack</div>
                <p className="text-xs text-muted">{status?.seo || status?.thumbnail ? "Ready below. Generate again to refresh it from the selected version." : `Not generated yet. It runs automatically after Final HD renders when switched on in Step 5; draft renders skip it. Build it now from v${currentVersion?.n}.`}</p>
              </div>
              <button type="button" className={btnPrimary} disabled={running || !canGenerate} onClick={() => void post({ action: "extras", quality: "draft", baseVersion: selected || undefined })}>
                <Sparkles className="size-4" /> {status?.seo || status?.thumbnail ? "Regenerate" : "Generate now"}
              </button>
            </div>
            <SeoPanel jobId={jobId} seo={status?.seo ?? null} thumbnail={!!status?.thumbnail} rev={videoKey} />
          </>
        ) : (
          <p className="text-sm text-muted">Your video appears here when rendering finishes.</p>
        )}
        {settings.shorts && jobId && previewRev > 0 && settings.mode !== "tutorial" && (
          <div className="mt-6">
            <ShortsPanel jobId={jobId} shorts={shorts} setShorts={setShorts} busy={running} onStarted={() => setStatus((st) => st && { ...st, status: "running", error: null })} />
          </div>
        )}
      </Section>
            </div>

            <aside id="live" className={`order-1 min-w-0 scroll-mt-20 xl:order-2 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto ${showMonitorMobile ? "" : "hidden xl:block"}`}>
              <Monitor
                steps={stepsView}
                logs={logs}
                running={running}
                uploadPct={uploadPct}
                uploadName={audioFile?.name}
                videoSrc={videoSrc}
                videoLabel={latest ? `v${latest.n} · ${latest.quality === "final" ? "Final 1080p" : "Draft 480p"}` : undefined}
                portrait={settings.aspect === "9:16"}
                tokens={status?.tokens ?? null}
                error={status?.error ?? null}
                projectName={projectName}
                live={liveNode}
              />
            </aside>
          </div>
        </main>
      </div>
      {builder.open && (
        <CharacterBuilder
          initial={builder.editing}
          onClose={() => setBuilder({ open: false, editing: null })}
          onSaved={(c) => {
            setBuilder({ open: false, editing: null });
            void loadLibrary();
            patch({ character: "custom", customCharacter: c.id });
          }}
        />
      )}
    </div>
  );
}
