/** Small helpers shared by the pipeline, chunked rendering and Shorts (kept in their own module to avoid import cycles). */
import path from "node:path";
import { log, setProgress, type Job } from "@/lib/store";

export const REMOTION = path.join("node_modules", "@remotion", "cli", "remotion-cli.js");

/** Remotion CLI output -> live "render" step progress, plus one log line per 10%. `onPct` lets other jobs (Shorts) remap the percent. */
export function renderLine(job: Job, onPct?: (pct: number, label: string) => void) {
  let last = "";
  return (line: string) => {
    const m = line.match(/(\d+)%/);
    const frac = line.match(/(\d+)\/(\d+)/);
    const pct = m ? Number(m[1]) : frac ? (Number(frac[1]) / Math.max(1, Number(frac[2]))) * 100 : -1;
    if (pct >= 0) {
      const eta = line.match(/remaining:\s*([^\s,)]+)/i)?.[1];
      const label = `${/encod/i.test(line) ? "Encoding" : "Rendering frames"} ${Math.round(pct)}%${eta ? ` · ${eta} left` : ""}`;
      if (onPct) onPct(pct, label);
      else setProgress(job, "render", pct, label);
    }
    const key = pct >= 0 ? `${line.replace(/[\d.,/]+/g, "").slice(0, 12)}${Math.floor(pct / 10)}` : line;
    if (key !== last) log(job, line);
    last = key;
  };
}
