/**
 * Chunked rendering for long videos (RAM + crash protection).
 * One Remotion process rendering 10+ minutes keeps a lot in memory and loses everything if it dies, so videos longer than
 * CHUNK_MIN seconds are rendered as separate Remotion runs over frame ranges (`--frames=a-b`) of the SAME composition,
 * so transitions and timing stay exactly continuous. Frames are rendered muted, the whole audio mix is rendered once
 * (audio-only render), and ffmpeg's concat demuxer joins the parts with the audio, with no re-encode of the video.
 */
import fs from "node:fs";
import path from "node:path";
import { ffmpeg, node, remotionBrowserArgs } from "@/lib/exec";
import { log, setProgress, type Job } from "@/lib/store";
import { REMOTION, renderLine } from "@/lib/render-util";
import { planChunks } from "@/lib/chunk-plan";

export { planChunks, chunkSettings } from "@/lib/chunk-plan";

type Opts = {
  /** Output .mp4 */
  out: string;
  propsFile: string;
  publicDir: string;
  crf: number;
  fps: number;
  totalFrames: number;
  chunkSec: number;
  workDir: string;
};

/** Render `totalFrames` as several muted parts + one audio file, then stitch. Reports real progress on the "render" step. */
export async function renderChunked(job: Job, o: Opts): Promise<void> {
  const ranges = planChunks(o.totalFrames, o.fps, o.chunkSec);
  fs.rmSync(o.workDir, { recursive: true, force: true });
  fs.mkdirSync(o.workDir, { recursive: true });
  log(job, `Long video (${(o.totalFrames / o.fps / 60).toFixed(1)} min): rendering in ${ranges.length} chunks of ~${o.chunkSec}s so memory stays low, then stitching with ffmpeg.`);
  const common = ["--log=info", ...remotionBrowserArgs()];
  const share = 92; // % of the bar for video chunks; audio + stitch take the rest

  const parts: string[] = [];
  for (const [i, [a, b]] of ranges.entries()) {
    const part = path.join(o.workDir, `part-${String(i).padStart(3, "0")}.mp4`);
    const tag = `Chunk ${i + 1}/${ranges.length}`;
    setProgress(job, "render", (i / ranges.length) * share, `${tag} · starting`);
    const onLine = renderLine(job, (pct, label) => setProgress(job, "render", ((i + pct / 100) / ranges.length) * share, `${tag} · ${label}`));
    await node(job, REMOTION, ["render", "remotion/index.ts", "Main", part, `--props=${o.propsFile}`, `--public-dir=${o.publicDir}`, `--crf=${o.crf}`, `--frames=${a}-${b}`, "--muted", ...common], { timeoutMs: 60 * 60_000, onLine });
    parts.push(part);
    log(job, `${tag} done (frames ${a}-${b}).`);
  }

  setProgress(job, "render", share, "Rendering the audio mix");
  const audio = path.join(o.workDir, "audio.aac");
  await node(job, REMOTION, ["render", "remotion/index.ts", "Main", audio, `--props=${o.propsFile}`, `--public-dir=${o.publicDir}`, "--codec=aac", ...common], { timeoutMs: 30 * 60_000, onLine: renderLine(job, (pct) => setProgress(job, "render", share + (pct / 100) * 4, "Rendering the audio mix")) });

  setProgress(job, "render", 97, "Stitching chunks with ffmpeg");
  const list = path.join(o.workDir, "list.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${path.basename(p)}'`).join("\n") + "\n");
  await ffmpeg(job, ["-f", "concat", "-safe", "0", "-i", list, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", "-shortest", o.out], { quiet: true });
  fs.rmSync(o.workDir, { recursive: true, force: true });
  log(job, `Stitched ${ranges.length} chunks into one MP4.`);
}
