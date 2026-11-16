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
