// Smallest check that fails if SRT parsing/serialising breaks. Run: npm run check
import assert from "node:assert/strict";
import { parseSrt, toSrt } from "../remotion/lib/types.ts";

const srt = "1\r\n00:00:00,300 --> 00:00:03,000\r\nবাংলা ভিডিও\r\nস্টুডিও\r\n\r\n2\n00:01:02.500 --> 00:01:04,000\nক্ষুদ্র প্রযুক্তি\n\nbroken block\n";
const cues = parseSrt(srt);
assert.deepEqual(cues, [
  { start: 0.3, end: 3, text: "বাংলা ভিডিও স্টুডিও" },
  { start: 62.5, end: 64, text: "ক্ষুদ্র প্রযুক্তি" },
]);
assert.deepEqual(parseSrt(toSrt(cues)), cues); // round trip
assert.equal(parseSrt("").length, 0);
console.log("ok: srt parse + round trip");

// ---- studio feature logic (pure helpers)
import { buildChapters, stamp } from "../lib/chapters.ts";
import { pickSpotCheck } from "../lib/spotcheck.ts";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../lib/settings.ts";
import { sfxPlan } from "../remotion/sfx-plan.ts";

const many = Array.from({ length: 40 }, (_, i) => ({ start: i * 6, end: i * 6 + 5, text: `line ${i}` }));
assert.equal(stamp(0), "00:00");
assert.equal(stamp(75.9), "01:15");
assert.equal(stamp(3725), "1:02:05");
const ch = buildChapters([{ cue: 5, title: "b" }, { cue: 1, title: "a" }, { cue: 6, title: "too close" }, { cue: 12, title: "c" }, { cue: 30, title: "d" }, { cue: 999, title: "bad" }], many);
assert.deepEqual(ch.map((c) => c.time), ["00:00", "00:24", "01:06", "02:54"]); // first forced to 00:00, cue 6 dropped (<10s), invalid cue ignored
assert.deepEqual(buildChapters([{ cue: 1, title: "a" }, { cue: 2, title: "b" }], many), []); // YouTube needs 3+ chapters

for (const n of [1, 3, 4, 40]) {
  const picks = pickSpotCheck(n, 4);
  assert.equal(picks.length, Math.min(n, 4));
  assert.deepEqual([...picks].sort((a, b) => a - b), picks); // ascending: plays across the timeline
  assert.ok(picks.every((p) => p >= 0 && p < n));
}
const picks40 = pickSpotCheck(40, 4, () => 0.99);
assert.deepEqual(picks40, [9, 19, 29, 39]); // one from each quarter

const s = sanitizeSettings({ captions: "bogus", bgm: "tech-explainer", bgmVolume: 7, sfx: true, assets: [{ file: "../etc/passwd", kind: "image" }, { file: "a.png", kind: "video", instruction: "x" }] });
assert.equal(s.captions, DEFAULT_SETTINGS.captions);
assert.equal(s.bgm, "tech-explainer");
assert.equal(s.bgmVolume, 1);
assert.equal(s.sfx, true);
assert.equal(s.enhanceVoice, false); // untouched features stay OFF
assert.deepEqual(s.assets, [{ file: "a.png", kind: "video", instruction: "x" }]); // path traversal rejected

const plan = sfxPlan({ cues: [{ start: 0, end: 2, text: "a" }, { start: 2.1, end: 4, text: "b" }, { start: 8, end: 9, text: "c" }], durationSec: 10, brand: { channelName: "", primary: "#000000", secondary: "#000000", showLogo: false, outro: true }, events: [{ t: 3, type: "click", vw: 1, vh: 1 }] } as never);
assert.deepEqual(plan.map((p) => p.name), ["whoosh", "pop", "chime"]);
console.log("ok: chapters, spot-check, settings validation, sfx plan");
