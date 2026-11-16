/** Environment doctor: checks every tool the studio needs and can auto-fix the ones that are safe to fix. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const IS_WIN = process.platform === "win32";
const PYTHON = process.env.PYTHON || (IS_WIN ? "python" : "python3");

export type CheckStatus = "ok" | "warn" | "fail";
export type Check = {
  id: string;
  group: "System" | "Claude" | "Project";
  label: string;
  status: CheckStatus;
  detail: string;
  required: boolean;
  /** How to fix manually (shown when there is no auto-fix or the fix failed). */
  hint?: string;
  /** Id accepted by runFix(); the UI shows a "Fix" button when set. */
  fix?: string;
  fixLabel?: string;
};

type Probe = { ok: boolean; out: string };

/** Run a fixed command (never user text), capture output, kill after timeout. */
function probe(cmd: string, args: string[], timeoutMs = 15000, stdin?: string): Promise<Probe> {
  return new Promise((resolve) => {
    let out = "";
    let done = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve({ ok, out: out.trim() });
    };
    let child;
    const useShell = IS_WIN && cmd !== process.execPath;
    // cmd.exe re-splits arguments on spaces, so quote anything that needs it.
    const argv = useShell ? args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
    try {
      child = spawn(cmd, argv, { cwd: ROOT, shell: useShell, windowsHide: true, stdio: [stdin != null ? "pipe" : "ignore", "pipe", "pipe"], env: { ...process.env, ANTHROPIC_API_KEY: "" } });
    } catch {
      return resolve({ ok: false, out: "" });
    }
    timer = setTimeout(() => {
      child.kill();
      out += "\n(timed out)";
      finish(false);
    }, timeoutMs);
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
    if (stdin != null) child.stdin?.end(stdin);
  });
}

/** Pick up PATH entries added by installers (winget etc.) after this server started. */
let pathAt = 0;
async function refreshWinPath() {
  if (!IS_WIN || Date.now() - pathAt < 4000) return;
  pathAt = Date.now();
  const r = await probe("powershell.exe", ["-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"], 10000);
  if (!r.ok) return;
  const have = new Set((process.env.PATH ?? "").split(";").map((x) => x.toLowerCase()));
  const extra = r.out.split(";").map((x) => x.trim()).filter((x) => x && !have.has(x.toLowerCase()));
  if (extra.length) process.env.PATH = `${process.env.PATH};${extra.join(";")}`;
}

const first = (s: string) => s.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
const exists = (...p: string[]) => fs.existsSync(path.join(ROOT, ...p));

const REQUIRED_SKILLS = ["browser-tutorial.md", "scene-plan.md", "style-cartoon.md", "style-motion.md", "custom/remotion-core.md", "custom/cartoon-story.md", "custom/motion-graphics.md"];
const FONTS = ["HindSiliguri-Regular.ttf", "HindSiliguri-SemiBold.ttf", "HindSiliguri-Bold.ttf", "NotoSansBengali-Variable.ttf"];

function claudeLoginFileHint(): boolean {
  try {
    const home = os.homedir();
    if (fs.existsSync(path.join(home, ".claude", ".credentials.json"))) return true;
    const j = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8"));
    return !!j?.oauthAccount;
  } catch {
    return false;
  }
}

const WHISPER_PROBE = [
  "import faster_whisper, av",
  "try:",
  "    av.open('x.mp3', metadata_errors='ignore')",
  "except TypeError:",
  "    raise SystemExit(1)",
  "except Exception:",
  "    pass",
].join(String.fromCharCode(10));

export async function runChecks(): Promise<Check[]> {
  await refreshWinPath();
  const chromiumProbe = "const p=require('playwright');process.exit(require('fs').existsSync(p.chromium.executablePath())?0:1)";
  const [git, ffmpeg, ffprobe, python, claudeV, whisper, chromium, edgeTts] = await Promise.all([
    probe("git", ["--version"]),
    probe("ffmpeg", ["-version"]),
    probe("ffprobe", ["-version"]),
    probe(PYTHON, ["--version"]),
    probe("claude", ["--version"]),
    probe(PYTHON, ["-c", WHISPER_PROBE], 30000),
    probe(process.execPath, ["-e", chromiumProbe], 20000),
    probe(PYTHON, ["-c", "import edge_tts"], 20000),
  ]);
  const claudeAuth = claudeV.ok ? await probe("claude", ["auth", "status"], 20000) : { ok: false, out: "" };

  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  add({ id: "node", group: "System", label: "Node.js 20+", required: true, status: nodeMajor >= 20 ? "ok" : "fail", detail: `v${process.versions.node}`, hint: "Install Node.js 20 or newer: https://nodejs.org" });
  add({ id: "git", group: "System", label: "Git", required: false, status: git.ok ? "ok" : "warn", detail: git.ok ? first(git.out) : "not found", hint: IS_WIN ? "winget install --id Git.Git -e" : "https://git-scm.com/downloads" });
  add({ id: "ffmpeg", group: "System", label: "FFmpeg", required: true, status: ffmpeg.ok ? "ok" : "fail", detail: ffmpeg.ok ? first(ffmpeg.out).slice(0, 60) : "not found on PATH", hint: IS_WIN ? "winget install --id Gyan.FFmpeg -e   (then restart npm run dev)" : "Install ffmpeg and make sure it is on PATH", fix: IS_WIN && !ffmpeg.ok ? "ffmpeg" : undefined, fixLabel: "Install with winget" });
  add({ id: "ffprobe", group: "System", label: "FFprobe", required: true, status: ffprobe.ok ? "ok" : "fail", detail: ffprobe.ok ? "ok" : "not found (ships with FFmpeg)", hint: "Comes with FFmpeg; reinstall FFmpeg and restart the dev server" });
  add({ id: "python", group: "System", label: "Python 3.9+", required: true, status: python.ok ? "ok" : "fail", detail: python.ok ? first(python.out) : "not found", hint: IS_WIN ? "winget install --id Python.Python.3.12 -e   (then restart npm run dev)" : "https://www.python.org/downloads/", fix: IS_WIN && !python.ok ? "python" : undefined, fixLabel: "Install with winget" });
  add({ id: "whisper", group: "System", label: "faster-whisper (Bengali speech-to-text)", required: false, status: whisper.ok ? "ok" : python.ok ? "fail" : "warn", detail: whisper.ok ? "installed" : python.ok ? "not installed (needed unless you always upload an .srt)" : "needs Python first", hint: `${PYTHON} -m pip install faster-whisper "av>=14,<18"`, fix: python.ok && !whisper.ok ? "whisper" : undefined, fixLabel: "pip install" });
  add({ id: "edge-tts", group: "System", label: "edge-tts (Auto-Voice from a typed script)", required: false, status: edgeTts.ok ? "ok" : python.ok ? "warn" : "warn", detail: edgeTts.ok ? "installed (free Bengali neural voices, internet needed when used)" : python.ok ? "not installed (optional: only for Write/Paste Script mode)" : "needs Python first", hint: `${PYTHON} -m pip install edge-tts`, fix: python.ok && !edgeTts.ok ? "edge-tts" : undefined, fixLabel: "pip install" });
  add({ id: "chromium", group: "System", label: "Playwright Chromium (website tutorials)", required: false, status: chromium.ok ? "ok" : "warn", detail: chromium.ok ? "installed" : "not installed (only needed for App/Website Tutorial mode)", hint: "npx playwright install chromium", fix: chromium.ok ? undefined : "chromium", fixLabel: "Install Chromium" });

  add({ id: "claude-cli", group: "Claude", label: "Claude Code CLI", required: true, status: claudeV.ok ? "ok" : "fail", detail: claudeV.ok ? first(claudeV.out) : "`claude` not found on PATH", hint: "npm i -g @anthropic-ai/claude-code", fix: claudeV.ok ? undefined : "claude-cli", fixLabel: "Install CLI" });
  let loginStatus: CheckStatus = "fail";
  let loginDetail = "needs the CLI first";
  if (claudeV.ok) {
    let parsed: { loggedIn?: boolean; email?: string; authMethod?: string; subscriptionType?: string } | null = null;
    try {
      parsed = JSON.parse(claudeAuth.out);
    } catch {
      /* plain-text output */
    }
    const txt = claudeAuth.out.toLowerCase();
    const loggedOut = parsed ? parsed.loggedIn === false : /not logged|logged out|no active|unauthenticated/.test(txt);
    if (claudeAuth.ok && !loggedOut) {
      loginStatus = "ok";
      loginDetail = parsed ? [parsed.email, parsed.subscriptionType, parsed.authMethod].filter(Boolean).join(" · ") || "logged in" : first(claudeAuth.out).slice(0, 80) || "logged in";
    } else if (!loggedOut && claudeLoginFileHint()) {
      loginStatus = "ok";
      loginDetail = "login found (press Test to verify)";
    } else {
      loginDetail = "not logged in";
    }
  }
  add({ id: "claude-login", group: "Claude", label: "Claude account login", required: true, status: loginStatus, detail: loginDetail, hint: "Run `claude` in a terminal, then /login with your Claude account", fix: claudeV.ok && loginStatus !== "ok" ? "claude-login" : undefined, fixLabel: "Open login window" });
  add({ id: "api-key", group: "Claude", label: "No paid API key interfering", required: false, status: process.env.ANTHROPIC_API_KEY ? "warn" : "ok", detail: process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY is set (the studio ignores it and uses your login)" : "not set", hint: "Nothing to do: the studio removes the key for its Claude calls" });

  const missingSkills = REQUIRED_SKILLS.filter((f) => !exists(".claude", "skills", ...f.split("/")));
  add({ id: "skills", group: "Project", label: "Skill files (.claude/skills)", required: true, status: missingSkills.length ? "fail" : "ok", detail: missingSkills.length ? `missing: ${missingSkills.join(", ")}` : `${REQUIRED_SKILLS.length} skills present`, hint: "git checkout -- .claude/skills", fix: missingSkills.length && exists(".git") ? "skills" : undefined, fixLabel: "Restore from git" });
  const missingFonts = FONTS.filter((f) => !exists("public", "fonts", f));
  add({ id: "fonts", group: "Project", label: "Bengali fonts", required: true, status: missingFonts.length ? "fail" : "ok", detail: missingFonts.length ? `missing ${missingFonts.length} font file(s)` : "Hind Siliguri + Noto Sans Bengali", hint: "npm run setup", fix: missingFonts.length ? "fonts" : undefined, fixLabel: "Download fonts" });
  add({ id: "deps", group: "Project", label: "npm packages", required: true, status: exists("node_modules", "remotion") && exists("node_modules", "playwright") ? "ok" : "fail", detail: exists("node_modules", "remotion") ? "installed" : "node_modules incomplete", hint: "npm install" });
  let writable = true;
  try {
    for (const d of ["projects", "data"]) {
      fs.mkdirSync(path.join(ROOT, d), { recursive: true });
      fs.accessSync(path.join(ROOT, d), fs.constants.W_OK);
    }
  } catch {
    writable = false;
  }
  add({ id: "dirs", group: "Project", label: "Writable projects/ and data/ folders", required: true, status: writable ? "ok" : "fail", detail: writable ? "ok" : "cannot write to the project folder", hint: "Check folder permissions" });
  return checks;
}

// ------------------------------------------------------------------ fixes (allow-listed; never user-supplied commands)
const OFL = "https://raw.githubusercontent.com/google/fonts/main/ofl";
const FONT_URLS: Record<string, string> = {
  "HindSiliguri-Regular.ttf": `${OFL}/hindsiliguri/HindSiliguri-Regular.ttf`,
  "HindSiliguri-SemiBold.ttf": `${OFL}/hindsiliguri/HindSiliguri-SemiBold.ttf`,
  "HindSiliguri-Bold.ttf": `${OFL}/hindsiliguri/HindSiliguri-Bold.ttf`,
  "NotoSansBengali-Variable.ttf": `${OFL}/notosansbengali/NotoSansBengali%5Bwdth%2Cwght%5D.ttf`,
};

export type FixResult = { ok: boolean; message: string };

export async function runFix(id: string): Promise<FixResult> {
  const T = 10 * 60 * 1000;
  const tail = (p: Probe) => p.out.split(/\r?\n/).slice(-6).join("\n");
  switch (id) {
    case "fonts": {
      const dir = path.join(ROOT, "public", "fonts");
      fs.mkdirSync(dir, { recursive: true });
      for (const [file, url] of Object.entries(FONT_URLS)) {
        if (fs.existsSync(path.join(dir, file))) continue;
        const res = await fetch(url).catch(() => null);
        if (!res?.ok) return { ok: false, message: `Could not download ${file} (check your internet).` };
        fs.writeFileSync(path.join(dir, file), Buffer.from(await res.arrayBuffer()));
      }
      return { ok: true, message: "Fonts downloaded." };
    }
    case "whisper": {
      const r = await probe(PYTHON, ["-m", "pip", "install", "faster-whisper", "av>=14,<18"], T);
      return { ok: r.ok, message: r.ok ? "faster-whisper installed." : tail(r) };
    }
    case "edge-tts": {
      const r = await probe(PYTHON, ["-m", "pip", "install", "edge-tts"], T);
      return { ok: r.ok, message: r.ok ? "edge-tts installed." : tail(r) };
    }
    case "chromium": {
      const r = await probe("npx", ["playwright", "install", "chromium"], T);
      return { ok: r.ok, message: r.ok ? "Chromium installed." : tail(r) };
    }
    case "claude-cli": {
      const r = await probe("npm", ["install", "-g", "@anthropic-ai/claude-code"], T);
      return { ok: r.ok, message: r.ok ? "Claude Code installed. If it still shows missing, restart `npm run dev` so PATH refreshes." : tail(r) };
    }
    case "claude-login": {
      if (!IS_WIN) return { ok: false, message: "Open a terminal, run `claude`, then /login." };
      spawn("cmd", ["/c", "start", "Claude login", "cmd", "/k", "claude"], { cwd: ROOT, detached: true, stdio: "ignore" }).unref();
      return { ok: true, message: "A terminal window opened. Type /login there, finish in the browser, then come back (this page re-checks automatically)." };
    }
    case "claude-test": {
      const r = await probe("claude", ["-p"], 90000, "Reply with the single word: ok");
      return { ok: r.ok && /ok/i.test(r.out), message: r.ok ? `Claude replied: ${r.out.slice(0, 60)}` : tail(r) || "No reply from Claude." };
    }
    case "skills": {
      const r = await probe("git", ["checkout", "--", ".claude/skills"], 30000);
      return { ok: r.ok, message: r.ok ? "Skill files restored." : tail(r) };
    }
    case "ffmpeg": {
      const r = await probe("winget", ["install", "--id", "Gyan.FFmpeg", "-e", "--disable-interactivity", "--accept-package-agreements", "--accept-source-agreements"], T);
      const ok = r.ok || /already installed|no available upgrade|no newer package/i.test(r.out);
      pathAt = 0;
      await refreshWinPath();
      return { ok, message: ok ? "FFmpeg is installed. PATH refreshed, re-checking." : tail(r) };
    }
    case "python": {
      const r = await probe("winget", ["install", "--id", "Python.Python.3.12", "-e", "--accept-package-agreements", "--accept-source-agreements"], T);
      const ok = r.ok || /already installed|no available upgrade|no newer package/i.test(r.out);
      pathAt = 0;
      await refreshWinPath();
      return { ok, message: ok ? "Python is installed. PATH refreshed, re-checking." : tail(r) };
    }
    default:
      return { ok: false, message: "Unknown fix." };
  }
}
