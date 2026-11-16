/** Process helpers: spawn local tools (no shell, argument arrays) and stream their output into the job log. */
import { spawn } from "node:child_process";
import path from "node:path";
import { ROOT, log, type Job } from "@/lib/store";

export const IS_WIN = process.platform === "win32";
export const PYTHON = process.env.PYTHON || (IS_WIN ? "python" : "python3");

export type RunOpts = { env?: Record<string, string>; stdin?: string; shell?: boolean; onLine?: (line: string) => void; quiet?: boolean; timeoutMs?: number };

/** Spawn a command, stream its output into the job log, resolve with full stdout, reject on non-zero exit. */
export function run(job: Job, cmd: string, args: string[], opts: RunOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...opts.env }, shell: opts.shell ?? false, windowsHide: true });
    let out = "";
    const tail: string[] = [];
    const feed = (stream: NodeJS.ReadableStream, isOut: boolean) => {
      let buf = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        if (isOut) out += chunk;
        buf += chunk;
        const lines = buf.split(/\r?\n|\r/);
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          tail.push(line);
          if (tail.length > 40) tail.shift();
          if (opts.onLine) opts.onLine(line);
          else if (!opts.quiet) log(job, line);
        }
      });
    };
    feed(child.stdout, true);
    feed(child.stderr, false);
    const timer = opts.timeoutMs ? setTimeout(() => child.kill(), opts.timeoutMs) : null;
    child.on("error", (err) => reject(new Error(`Could not start "${cmd}": ${err.message}`)));
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(cmd)} exited with code ${code}\n${tail.join("\n")}`));
    });
    if (opts.stdin != null) child.stdin.end(opts.stdin);
  });
}

export const node = (job: Job, script: string, args: string[], opts?: RunOpts) => run(job, process.execPath, [script, ...args], opts);
export const ffmpeg = (job: Job, args: string[], opts?: RunOpts) => run(job, "ffmpeg", ["-y", "-loglevel", "error", ...args], opts);

// ---------------------------------------------------------------- claude CLI + smart model routing
export type Tier = "light" | "heavy";
const okModel = (m: string | undefined) => (m && /^[\w.\-\[\]]+$/.test(m) ? m : undefined);

/**
 * Which model a task runs on.
 *   Token Saver (hybrid): light tasks (metadata, chapters, single-scene JSON edits) -> Haiku, heavy (scene planning,
 *   custom code, Playwright scripts) -> Sonnet.   Max Quality: everything on your CLI default (or CLAUDE_MODEL).
 * Override with CLAUDE_MODEL_LIGHT / CLAUDE_MODEL_HEAVY.
 */
export function modelFor(tier: Tier, tokenSaver: boolean): string | undefined {
  if (!tokenSaver) return okModel(process.env.CLAUDE_MODEL);
  return tier === "light" ? (okModel(process.env.CLAUDE_MODEL_LIGHT) ?? "claude-haiku-4-5") : (okModel(process.env.CLAUDE_MODEL_HEAVY) ?? okModel(process.env.CLAUDE_MODEL) ?? "sonnet");
}

type ClaudeRun = { text: string; stderr: string; code: number | null; failed: string };

/** Spawn `claude -p`. Prompt goes through stdin, so user text never touches the shell. Logs activity + token usage. */
function spawnClaude(job: Job, args: string[], prompt: string, label: string): Promise<ClaudeRun> {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // force the local Claude Code login, never a paid API key
  return new Promise((resolve, reject) => {
    // shell is needed on Windows because `claude` is a .cmd shim; args are fixed tokens (never user text).
    const child = spawn("claude", args, { cwd: ROOT, env, shell: IS_WIN, windowsHide: true });
    let buf = "";
    let stderr = "";
    let text = "";
    let failed = "";
    const onLine = (line: string) => {
      try {
        const ev = JSON.parse(line);
        if (ev.type === "assistant") {
          for (const part of ev.message?.content ?? []) {
            if (part.type === "text" && part.text?.trim()) {
              text += part.text;
              if (label !== "json") log(job, `claude: ${part.text.trim().slice(0, 600)}`);
            }
            if (part.type === "tool_use") log(job, `claude → ${part.name} ${part.input?.file_path ? path.relative(ROOT, part.input.file_path) : (part.input?.pattern ?? "")}`);
          }
        } else if (ev.type === "result") {
          if (ev.is_error) failed = String(ev.result ?? "Claude reported an error");
          else if (typeof ev.result === "string" && ev.result.trim()) text = ev.result;
          const u = ev.usage;
          if (u) {
            const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
            log(job, `claude usage: ${input} input tokens (${u.cache_read_input_tokens ?? 0} cached), ${u.output_tokens ?? 0} output tokens, ${ev.num_turns ?? "?"} turn(s)`);
            job.tokens = { input: (job.tokens?.input ?? 0) + input, output: (job.tokens?.output ?? 0) + (u.output_tokens ?? 0) };
          }
        }
      } catch {
        /* non-JSON line */
      }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.forEach(onLine);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => (stderr = (stderr + c).slice(-2000)));
    child.on("error", (e) => reject(new Error(`Could not start the claude CLI: ${e.message}. Install Claude Code and log in once.`)));
    child.on("close", (code) => {
      if (buf.trim()) onLine(buf);
      resolve({ text, stderr, code, failed });
    });
    child.stdin.end(prompt);
  });
}

/** Tool-using Claude Code run (reads/writes project files). Only for work that truly needs code: custom TSX and Playwright scripts. */
export async function claude(job: Job, prompt: string, tier: Tier = "heavy") {
  const model = modelFor(tier, job.settings.tokenSaver);
  const args = ["-p", "--allowedTools", "Read,Write,Edit,Glob,Grep", "--permission-mode", "acceptEdits", "--setting-sources", "project,local", "--output-format", "stream-json", "--verbose"];
  if (model) args.push("--model", model);
  log(job, `claude -p (${model ?? "default model"}, tools) working…`);
  const r = await spawnClaude(job, args, prompt, "tools");
  if (r.code !== 0 || r.failed) throw new Error(`claude failed (exit ${r.code}): ${r.failed || r.stderr || "no output"}`);
}

const LEAN_SYSTEM = "You are a JSON generator inside a video studio. Reply with one valid JSON value and nothing else: no prose, no markdown fences, no tool calls.";

/** First balanced-looking JSON object in a model reply (tolerates code fences and stray prose). */
export function extractJson(text: string): unknown {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON object in the reply");
  return JSON.parse(text.slice(a, b + 1));
}

/**
 * Minimum-token Claude call: one turn, no tools, tiny system prompt, everything needed is inlined in `prompt`,
 * and the answer is a JSON value read from stdout. Retries once on unparsable output.
 */
export async function claudeJson(job: Job, prompt: string, tier: Tier, modelOverride?: string): Promise<unknown> {
  const model = okModel(modelOverride) ?? modelFor(tier, job.settings.tokenSaver);
  const base = ["-p", "--output-format", "stream-json", "--verbose", "--setting-sources", "project,local"];
  if (model) base.push("--model", model);
  log(job, `claude -p (${model ?? "default model"}, JSON only, no tools) working…`);
  let lean = true;
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const args = lean ? [...base, "--system-prompt", LEAN_SYSTEM] : base;
    const r = await spawnClaude(job, args, attempt > 0 && lastErr ? `${prompt}\n\nYour previous reply was rejected (${lastErr}). Reply with ONLY the JSON object.` : prompt, "json");
    if (r.code !== 0 || r.failed) {
      // older CLIs without --system-prompt: fall back to the default system prompt once
      if (lean && /unknown option|unrecognized|system-prompt/i.test(r.stderr + r.failed)) {
        lean = false;
        continue;
      }
      throw new Error(`claude failed (exit ${r.code}): ${r.failed || r.stderr || "no output"}`);
    }
    try {
      return extractJson(r.text);
    } catch (e) {
      lastErr = (e as Error).message;
      log(job, `Claude's reply was not valid JSON (${lastErr}); retrying…`);
    }
  }
  throw new Error(`Claude did not return valid JSON: ${lastErr}`);
}

/** tsc the generated composition; feed errors back to Claude (max 2 rounds) before spending time on a render. */
export async function typecheckWithRepair(job: Job) {
  for (let round = 0; ; round++) {
    const errors = await node(job, path.join("node_modules", "typescript", "bin", "tsc"), ["--noEmit", "-p", "tsconfig.json"], { quiet: true }).then(
      () => "",
      (e: Error) => e.message,
    );
    const relevant = errors.split("\n").filter((l) => l.includes("remotion/generated") || l.includes("remotion\\generated")).join("\n");
    if (!relevant) return log(job, "Type check passed.");
    if (round === 2) throw new Error(`Generated video code still has type errors:\n${relevant.slice(0, 1500)}`);
    log(job, `Type errors found; asking Claude to fix (round ${round + 1})…`);
    await claude(job, `remotion/generated/Video.tsx has TypeScript errors. Fix them. Only edit that file; keep the GeneratedVideo export contract.\n\n${relevant.slice(0, 3000)}`);
  }
}

/** Extra Remotion CLI flags. Set REMOTION_BROWSER_EXECUTABLE to use an installed Chrome/Chromium (offline setups). */
export const remotionBrowserArgs = (): string[] => {
  const exe = process.env.REMOTION_BROWSER_EXECUTABLE;
  return exe ? [`--browser-executable=${exe}`, "--chrome-mode=chrome-for-testing"] : [];
};
