/** Pure helpers for chunked rendering (no Node/Remotion imports, so scripts/check.ts can test them). */

/** Env overrides make the feature testable on short clips: STUDIO_CHUNK_SEC (default 90), STUDIO_CHUNK_MIN (default 180). */
export function chunkSettings(env: Record<string, string | undefined> = {}) {
  const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return { chunkSec: num(env.STUDIO_CHUNK_SEC, 90), minSec: num(env.STUDIO_CHUNK_MIN, 180) };
}

/**
 * Inclusive frame ranges [from, to] covering 0..totalFrames-1 in chunks of ~chunkSec.
 * A tiny tail (< 25% of a chunk) is merged into the previous chunk so the last part is never a few frames.
 */
export function planChunks(totalFrames: number, fps: number, chunkSec: number): [number, number][] {
  const total = Math.max(1, Math.floor(totalFrames));
  const size = Math.max(1, Math.round(chunkSec * fps));
  const out: [number, number][] = [];
  for (let from = 0; from < total; from += size) out.push([from, Math.min(from + size, total) - 1]);
  if (out.length > 1) {
    const last = out[out.length - 1];
    if (last[1] - last[0] + 1 < size * 0.25) {
      out.pop();
      out[out.length - 1][1] = last[1];
    }
  }
  return out;
}
