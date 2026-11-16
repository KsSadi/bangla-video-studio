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

// ---- JSON scene engine (plan validation, timing, surgical revisions)
import { autoPlan, mergeScenes, normalizePlan, parseRevisionTarget, revisionSlice, sceneSpans, tutorialPlan } from "../remotion/engine/plan.ts";

const pc = Array.from({ length: 10 }, (_, i) => ({ start: i * 5, end: i * 5 + 4, text: `লাইন ${i + 1} কথা` }));
const dirty = {
  scenes: [
    { id: "b", fromCue: 5, bg: "lava", transition: "wipe", elements: [{ type: "chart", values: [1, "x", 3], highlight: 9 }, { type: "nope" }] },
    { id: "a", fromCue: 2, character: { emotion: "angry", side: "left" }, elements: [{ type: "title", text: " শিরোনাম " }, { type: "media", src: "../secret.png" }, { type: "icons", items: [{ icon: "Rocket" }, {}] }] },
    { id: "dup", fromCue: 5, elements: [] },
    { fromCue: 99, elements: [] },
    "junk",
  ],
  accent: "red",
};
const np = normalizePlan(dirty, pc.length)!;
assert.deepEqual(np.scenes.map((x) => [x.id, x.fromCue]), [["a", 1], ["b", 5], ["s10", 10]]); // sorted, first forced to cue 1, duplicate cue dropped, cue clamped
assert.equal(np.scenes[0].character?.emotion, "explaining"); // unknown emotion -> safe default
assert.deepEqual(np.scenes[0].elements.map((e) => e.type), ["title", "icons"]); // path-traversal media rejected
assert.deepEqual(np.scenes[1].elements, [{ type: "chart", chart: "bar", values: [1, 3] }]); // bad values/highlight/element dropped
assert.equal(np.scenes[1].bg, undefined);
assert.equal(np.accent, undefined);
assert.equal(normalizePlan({ scenes: [] }, 10), null);
assert.equal(normalizePlan("nope", 10), null);

const spans = sceneSpans(np, pc, 50);
assert.deepEqual(spans.map((x) => [x.start, x.end]), [[0, 20], [20, 45], [45, 50]]); // gapless 0 -> duration

assert.deepEqual(parseRevisionTarget("০:১৫ সেকেন্ডে ক্যারেক্টারটাকে বড় করো"), { sec: 15 });
assert.deepEqual(parseRevisionTarget("Change scene at 1:05 please"), { sec: 65 });
assert.deepEqual(parseRevisionTarget("২২ সেকেন্ডে আইকন বদলাও"), { sec: 22 });
assert.deepEqual(parseRevisionTarget("at 40s zoom in"), { sec: 40 });
assert.deepEqual(parseRevisionTarget("দৃশ্য ৩ এর রং বদলাও"), { scene: 3 });
assert.equal(parseRevisionTarget("make everything calmer"), null);
assert.deepEqual(revisionSlice(np, pc, 50, { sec: 22 }), { index: 1, neighbour: 2 });
assert.deepEqual(revisionSlice(np, pc, 50, { sec: 48 }), { index: 2, neighbour: 1 }); // last scene: previous is the neighbour

const m = mergeScenes(np, [{ id: "b", fromCue: 1, bg: "grid", elements: [{ type: "title", text: "নতুন" }] }, { id: "a", fromCue: 1, elements: [] }], pc.length, new Set(["b"]));
assert.deepEqual(m.changed, ["b"]); // only the allowed scene changes
assert.equal(m.plan.scenes[1].fromCue, 5); // cannot jump before its neighbour
assert.equal(m.plan.scenes[1].bg, "grid");
assert.deepEqual(m.plan.scenes[0], np.scenes[0]);
assert.equal(m.plan.scenes.length, 3);

const ap = autoPlan(pc);
assert.ok(ap.scenes.length >= 4 && ap.scenes[0].fromCue === 1);
assert.deepEqual(normalizePlan(ap, pc.length), ap); // built-in plans are already valid
assert.deepEqual(normalizePlan(tutorialPlan(true), 3), tutorialPlan(true));
console.log("ok: scene plan validation, timing, revision targeting + merge");
