/** Pick one random cue from each of `n` equal slices of the timeline (so the check covers start, middle and end). */
export function pickSpotCheck(count: number, n = 4, rnd: () => number = Math.random): number[] {
  if (count <= n) return Array.from({ length: count }, (_, i) => i);
  return Array.from({ length: n }, (_, k) => {
    const lo = Math.floor((k * count) / n);
    const hi = Math.floor(((k + 1) * count) / n);
    return lo + Math.floor(rnd() * Math.max(1, hi - lo));
  });
}

