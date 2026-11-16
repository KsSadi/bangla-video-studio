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

/** Run headless Claude Code locally. Prompt goes through stdin, so user text never touches the shell. */
export function claude(job: Job, prompt: string) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // force the local Claude Code login, never a paid API key
  const args = ["-p", "--allowedTools", "Read,Write,Edit,Glob,Grep", "--permission-mode", "acceptEdits", "--setting-sources", "project,local", "--output-format", "stream-json", "--verbose"];
  if (process.env.CLAUDE_MODEL && /^[\w.-]+$/.test(process.env.CLAUDE_MODEL)) args.push("--model", process.env.CLAUDE_MODEL);
  log(job, "claude -p (local Claude Code CLI) working…");
  return new Promise<void>((resolve, reject) => {
    let failed = "";
    // shell is needed on Windows because `claude` is a .cmd shim; args above are fixed tokens.
    const child = spawn("claude", args, { cwd: ROOT, env, shell: IS_WIN, windowsHide: true });
    let buf = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (ev.type === "assistant") {
            for (const part of ev.message?.content ?? []) {
              if (part.type === "text" && part.text?.trim()) log(job, `claude: ${part.text.trim().slice(0, 600)}`);
              if (part.type === "tool_use") log(job, `claude → ${part.name} ${part.input?.file_path ? path.relative(ROOT, part.input.file_path) : (part.input?.pattern ?? "")}`);
            }
          } else if (ev.type === "result" && ev.is_error) failed = String(ev.result ?? "Claude reported an error");
        } catch {
          /* non-JSON line */
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => (err = (err + c).slice(-2000)));
    child.on("error", (e) => reject(new Error(`Could not start the claude CLI: ${e.message}. Install Claude Code and log in once.`)));
    child.on("close", (code) => (code === 0 && !failed ? resolve() : reject(new Error(`claude failed (exit ${code}): ${failed || err || "no output"}`))));
    child.stdin.end(prompt);
  });
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
