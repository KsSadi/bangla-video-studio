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
    { id: "a", fromCue: 2, elements: [{ type: "title", text: " শিরোনাম " }, { type: "media", src: "../secret.png" }, { type: "icons", items: [{ icon: "Rocket" }, {}] }] },
    { id: "dup", fromCue: 5, elements: [] },
    { fromCue: 99, elements: [] },
    "junk",
  ],
  accent: "red",
};
const np = normalizePlan(dirty, pc.length)!;
assert.deepEqual(np.scenes.map((x) => [x.id, x.fromCue]), [["a", 1], ["b", 5], ["s10", 10]]); // sorted, first forced to cue 1, duplicate cue dropped, cue clamped
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
assert.deepEqual(normalizePlan(tutorialPlan(), 3), tutorialPlan());
console.log("ok: scene plan validation, timing, revision targeting + merge");

// ---- pro-creator features: shorts slicing, b-roll licence filter
import { clampClip, fmtClock, normalizeClips, parseClock, sliceShort } from "../remotion/engine/slice.ts";
import { isFreeLicense } from "../lib/broll.ts";

// old .srt files with [A]/[B] speaker tags still load, tags stripped
const oldSrt = parseSrt("1\n00:00:00,000 --> 00:00:02,000\n[A] হ্যালো\n");
assert.equal(oldSrt[0].text, "হ্যালো");
assert.deepEqual(parseSrt(toSrt(oldSrt)), oldSrt);

assert.equal(parseClock("01:10"), 70);
assert.equal(parseClock("1:02:03"), 3723);
assert.equal(parseClock("০১:১০"), 70);
assert.equal(parseClock("70.5"), 70.5);
assert.equal(parseClock("abc"), null);
assert.equal(fmtClock(75.4), "01:15");

const long = Array.from({ length: 30 }, (_, i) => ({ start: i * 4, end: i * 4 + 3.5, text: `লাইন ${i + 1}` }));
const lplan = normalizePlan({ scenes: [{ id: "a", fromCue: 1, elements: [{ type: "title", text: "এক" }] }, { id: "b", fromCue: 11, elements: [{ type: "title", text: "দুই", at: 42 }], zoom: [{ at: 50, x: 0.5, y: 0.5, scale: 1.5, hold: 1 }, { at: 5, x: 0.5, y: 0.5, scale: 1.5, hold: 1 }] }, { id: "c", fromCue: 21, elements: [{ type: "title", text: "তিন" }] }] }, long.length)!;
const cut = sliceShort(lplan, long, 120, 40, 80); // cues 11..20 -> scene b only (scene c starts at 80)
assert.equal(cut.durationSec, 40);
assert.equal(cut.cues[0].start, 0);
assert.equal(cut.cues.length, 10);
assert.deepEqual(cut.plan.scenes.map((x) => x.id), ["b"]);
assert.equal(cut.plan.scenes[0].fromCue, 1);
assert.deepEqual(cut.plan.scenes[0].elements[0], { type: "title", text: "দুই", at: 2 }); // absolute `at` shifted by -start
assert.deepEqual(cut.plan.scenes[0].zoom?.map((z) => z.at), [10]); // keyframe before the window dropped, the other shifted
const cut2 = sliceShort(lplan, long, 120, 30, 90); // spans scenes a (partly), b, c (partly)
assert.deepEqual(cut2.plan.scenes.map((x) => x.id), ["a", "b", "c"]);
assert.deepEqual(cut2.plan.scenes.map((x) => x.fromCue), [1, 4, 14]); // renumbered against the sliced cues (cues 8,9,10 kept before scene b)

assert.deepEqual(clampClip("00:10", "00:12", 120), null); // under 5 s
assert.deepEqual(clampClip("01:10", "01:45", 120, "  হুক  "), { start: 70, end: 105, hookTitle: "হুক" });
assert.equal(clampClip("01:10", "09:00", 120)!.end, 120); // clamped to the video
const sug = normalizeClips({ clips: [{ start: "00:41", end: "01:12", hookTitle: "এক" }, { start: "00:45", end: "01:10", hookTitle: "overlap" }, { start: "1:40", end: "1:42" }, { start: "bad", end: "x" }] }, long, 120, 3);
assert.equal(sug.length, 2); // overlap and invalid dropped
assert.ok(sug[0].start === 40 && sug[0].end > 60); // snapped to cue boundaries
assert.deepEqual(normalizeClips("nope", long, 120), []);

assert.ok(isFreeLicense("CC0") && isFreeLicense("Public domain") && isFreeLicense("PD-old"));
assert.ok(!isFreeLicense("CC BY-SA 4.0") && !isFreeLicense(""));
import { cuesFromLines, readSeconds } from "../lib/silent.ts";
const sc = cuesFromLines("এক দুই\n\n  তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো  \n");
assert.equal(sc.length, 2); // blank lines skipped
assert.equal(sc[0].start, 0.5);
assert.equal(sc[0].end - sc[0].start, 2.5); // short line: minimum on-screen time
assert.ok(sc[1].start > sc[0].end); // back to back, no overlap
assert.equal(readSeconds("শব্দ ".repeat(40)), 9); // long line capped
console.log("ok: silent subtitle timing");
console.log("ok: shorts slicing, clip validation, b-roll licence filter");

// ---- reliability upgrades: chunk planning, auto-replace dictionary, presets
import { chunkSettings, planChunks } from "../lib/chunk-plan.ts";
import { applyRules, applyToCues, cleanRules } from "../lib/dictionary-core.ts";
import { PRESET_KEYS, presetFromSettings } from "../lib/settings.ts";

assert.deepEqual(planChunks(600, 15, 15), [[0, 224], [225, 449], [450, 599]]); // 40 s at 15 fps in 15 s chunks
assert.deepEqual(planChunks(100, 30, 90), [[0, 99]]); // shorter than a chunk
assert.deepEqual(planChunks(2700 * 2 + 30, 30, 90), [[0, 2699], [2700, 5429]]); // tiny 1 s tail merged into the previous chunk
const big = planChunks(30 * 600, 30, 90); // 10 minutes
assert.equal(big.length, 7);
assert.equal(big[0][0], 0);
assert.equal(big[big.length - 1][1], 30 * 600 - 1);
assert.ok(big.every(([a, b], i) => i === 0 || a === big[i - 1][1] + 1 && b >= a)); // gapless, no overlap
assert.deepEqual(chunkSettings({}), { chunkSec: 90, minSec: 180 });
assert.deepEqual(chunkSettings({ STUDIO_CHUNK_SEC: "5", STUDIO_CHUNK_MIN: "x" }), { chunkSec: 5, minSec: 180 });

const rules = cleanRules([{ from: "রিয়্যাক্ট", to: "React" }, { from: "এপিআই", to: "API" }, { from: "api", to: "API" }, { from: " ", to: "x" }, { from: "same", to: "same" }, { from: "ক্লড", to: "Claude" }, { from: "এপিআই", to: "dup" }]);
assert.equal(rules.length, 4); // empty, identical and duplicate rules dropped
assert.deepEqual(applyRules("রিয়্যাক্ট দিয়ে এপিআইকে ডাকুন, ক্লড ভালো", rules), { text: "React দিয়ে APIকে ডাকুন, Claude ভালো", count: 3 });
assert.equal(applyRules("call the Api and API", rules).text, "call the API and API"); // Latin rules ignore case
assert.equal(applyRules("এপিআই", [{ from: "এপিআই", to: "এপিআই-2" }, { from: "এপিআই-2", to: "boom" }]).text, "এপিআই-2"); // one pass: replacements are never re-replaced
const fixedCues = applyToCues([{ start: 0, end: 1, text: "রিয়্যাক্ট" }, { start: 1, end: 2, text: "কিছু না" }], rules);
assert.deepEqual([fixedCues.count, fixedCues.lines, fixedCues.cues[0].text, fixedCues.cues[1].text], [1, 1, "React", "কিছু না"]);

const preset = presetFromSettings({ ...DEFAULT_SETTINGS, mode: "tutorial", bgm: "soft-storytelling", hints: "per-video note", tutorialUrl: "https://x.y", captions: "classic", showLogo: true });
assert.equal(preset.mode, "tutorial");
assert.equal(preset.bgm, "soft-storytelling");
assert.equal(preset.captions, "classic");
assert.equal(preset.showLogo, true);
assert.ok(!("hints" in preset) && !("tutorialUrl" in preset) && !("assets" in preset)); // per-video fields are not part of a preset
assert.equal(Object.keys(preset).length, PRESET_KEYS.length);
console.log("ok: chunk planning, auto-replace dictionary, studio presets");

// ---- subtitle themes + style DNA + templates
import { applyStyleDna, dnaFromMeasure, dominantColors, normalizeDna, pacingFromCuts, parseCutTimes, parseStoredDna, summarizePalette } from "../remotion/engine/styledna.ts";
import { blueprintFromPlan, fillPromptBody, fillSkeleton, skeletonFromBlueprint } from "../remotion/engine/template.ts";
import { effectiveCaptions } from "../lib/settings.ts";

const legacy = sanitizeSettings({ captions: "none" });
assert.equal(legacy.captionsOn, false); // old projects stored OFF as a style
assert.equal(effectiveCaptions(legacy), "none");
assert.equal(effectiveCaptions(sanitizeSettings({ captions: "pill", captionsOn: true })), "pill");
assert.equal(sanitizeSettings({ captionSize: 9 }).captionSize, 1.6);
assert.equal(sanitizeSettings({ captionSize: "x" }).captionSize, 1);
assert.equal(sanitizeSettings({ captionPosition: "top" }).captionPosition, "bottom");
assert.equal(sanitizeSettings({ captions: "glow" }).captions, "glow");

// median-cut: 70% navy + 30% orange pixels
const px: number[] = [];
for (let i = 0; i < 700; i++) px.push(10, 20, 80);
for (let i = 0; i < 300; i++) px.push(240, 120, 20);
const dom = dominantColors(px, 3);
assert.equal(dom[0], "#0A1450"); // most common first
assert.equal(dom[1], "#F07814");
const sum = summarizePalette(dom);
assert.equal(sum.palette[0], "#0A1450"); // darkest first
assert.equal(sum.saturation, "vivid");
assert.deepEqual(parseCutTimes(["foo", "[Parsed_showinfo_1] n: 0 pts: 1 pts_time:2.5 pos: 3", "pts_time:7.25"]), [2.5, 7.25]);
assert.deepEqual(pacingFromCuts([2.5, 5, 7.5], 10), { cuts: 3, avgShotSec: 2.5, pacing: "medium" });
assert.equal(pacingFromCuts([1, 2, 3, 4, 5, 6, 7, 8, 9], 10).pacing, "fast");
assert.equal(pacingFromCuts([], 30).pacing, "slow");

const measure = { durationSec: 30, width: 1920, height: 1080, cuts: 9, avgShotSec: 3, pacing: "medium" as const, palette: ["#0A1450", "#F07814"], brightness: "dark" as const, saturation: "vivid" as const };
const baseDna = dnaFromMeasure("Ref", measure);
assert.equal(baseDna.look.accent, "#F07814"); // most saturated palette colour
const dna = normalizeDna({ vibe: "neon tech", colors: ["#101030", "bad", "#7C3AED", "#22D3EE"], accent: "#22d3ee", transitions: ["zoom", "nope", "wipe"], captionStyle: "glow", sceneSeconds: 4.26, zoomStyle: "punchy", bgs: ["grid", "x"] }, "Ref", measure);
assert.deepEqual(dna.look.colors, ["#101030", "#7C3AED", "#22D3EE"]); // invalid colour skipped
assert.equal(dna.look.accent, "#22D3EE");
assert.deepEqual(dna.look.transitions, ["zoom", "wipe"]);
assert.deepEqual(dna.look.bgs, ["grid"]);
assert.equal(dna.look.captionStyle, "glow");
assert.equal(dna.look.sceneSeconds, 4.3);
assert.deepEqual(normalizeDna("garbage", "Ref", measure), baseDna); // unusable reply -> measured defaults
assert.deepEqual(parseStoredDna(JSON.parse(JSON.stringify(dna)))?.look, dna.look); // survives save/load
assert.equal(parseStoredDna({ nope: 1 }), null);
const styled = applyStyleDna(lplan, dna);
assert.equal(styled.accent, "#22D3EE");
assert.ok(styled.scenes.every((x) => x.colors?.length === 3));
assert.equal(styled.scenes[1].transition, "zoom");
assert.equal(styled.scenes[2].transition, "wipe");
assert.equal(styled.scenes[0].transition, lplan.scenes[0].transition); // first scene keeps its entrance
assert.deepEqual(styled.scenes.map((x) => x.elements), lplan.scenes.map((x) => x.elements)); // content untouched

// template blueprint: pacing as ratios, no text, then re-mapped onto a different voice
const tplPlan = normalizePlan({ accent: "#FBBF24", scenes: [
  { id: "a", fromCue: 1, bg: "grid", colors: ["#111111", "#222222", "#333333"], transition: "zoom", elements: [{ type: "title", text: "গোপন লেখা", sub: "আরও গোপন" }] },
  { id: "b", fromCue: 11, bg: "particles", elements: [{ type: "list", items: ["এক", "দুই", "তিন"] }, { type: "chart", chart: "bar", values: [1, 2, 3, 4], unit: "%" }], zoom: [{ at: 50, x: 0.5, y: 0.5, scale: 1.5, hold: 1 }] },
  { id: "c", fromCue: 21, elements: [{ type: "icons", items: [{ icon: "star" }, { icon: "bolt" }] }] },
] }, long.length)!;
const bp = blueprintFromPlan(tplPlan, long, 120);
assert.equal(bp.scenes.length, 3);
assert.deepEqual(bp.scenes.map((x) => [x.from, x.to]), [[0, 0.3333], [0.3333, 0.6667], [0.6667, 1]]); // cue 11 starts at 40 s, cue 21 at 80 s of 120 s
assert.deepEqual(bp.scenes[0].slots, [{ type: "title", hasSub: true }]);
assert.deepEqual(bp.scenes[1].slots, [{ type: "list", count: 3 }, { type: "chart", chart: "bar", count: 4, unit: "%" }]);
assert.ok(!JSON.stringify(bp).includes("গোপন") && !JSON.stringify(bp).includes("এক")); // all text stripped
assert.equal(bp.scenes[1].zoom?.[0].at, 0.4167);
const newCues = Array.from({ length: 12 }, (_, i) => ({ start: i * 5, end: i * 5 + 4.5, text: `নতুন লাইন ${i + 1}` })); // a 60 s voice
const skel = skeletonFromBlueprint(bp, newCues, 60);
assert.deepEqual(skel.scenes.map((x) => x.fromCue), [1, 5, 9]); // 1/3 and 2/3 of 60 s = 20 s, 40 s
assert.equal(skel.scenes[0].bg, "grid");
assert.equal(skel.scenes[0].transition, "zoom");
assert.equal(skel.scenes[1].zoom?.[0].at, 25); // 0.4167 * 60
assert.equal(skel.accent, "#FBBF24");
assert.deepEqual(normalizePlan(skel, newCues.length)?.scenes.length, 3); // placeholders are a valid plan
assert.ok(fillPromptBody(skel, newCues).includes("s2|cues 5-8|list(3), chart(bar,4,%)"));
const filled = fillSkeleton(skel, { scenes: [{ id: "s1", elements: [{ type: "title", text: "নতুন শিরোনাম", sub: "উপশিরোনাম" }], bg: "grid" }, { id: "s2", elements: [{ type: "list", items: ["ক", "খ", "গ"] }] }, { id: "s9", elements: [] }] }, newCues);
assert.deepEqual(filled.scenes[0].elements, [{ type: "title", text: "নতুন শিরোনাম", sub: "উপশিরোনাম" }]);
assert.equal(filled.scenes[1].fromCue, 5); // structure always from the skeleton
assert.equal(filled.scenes[2].elements[0].type, "icons" === filled.scenes[2].elements[0].type ? "icons" : "title"); // skipped scene falls back
assert.equal((filled.scenes[2].elements[0] as { text: string }).text, "নতুন লাইন 9"); // fallback title = first words of its cue
console.log("ok: subtitle themes, style DNA, template blueprint + skeleton");
const skel2 = skeletonFromBlueprint(bp, [{ start: 0, end: 3.5, text: "a" }, { start: 3.7, end: 6, text: "b" }, { start: 6.5, end: 8, text: "c" }, { start: 8.8, end: 11, text: "d" }, { start: 11.9, end: 13, text: "e" }], 13.2);
assert.deepEqual(skel2.scenes.map((x) => x.fromCue), [1, 2, 4]); // 1/3 of 13.2 s = 4.5 s -> cue at 3.7 s (0.8 s away) beats the one at 6.5 s; 2/3 = 8.8 s -> exact
console.log("ok: template maps to the nearest cue");
