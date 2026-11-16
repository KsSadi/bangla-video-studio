# Skill: App / Website Tutorial (Playwright recording + Remotion wrap)

Read `remotion-core.md` first. In this mode you write **two** files:

1. `jobs/<id>/record.mjs` – a Playwright script that performs the actions the Bengali voice describes.
2. `remotion/generated/Video.tsx` – the composition that wraps the recording.

The studio then runs `record.mjs`, converts the capture to `recording.mp4`, and passes `recordingSrc` and
`events` (logged clicks with coordinates) to the composition as props. You never see the recording, so the
composition must be **data-driven by `events`**, not by guessed coordinates.

(Recording patterns adapted from the `playwright-recording` skill in `_reference_skills/`.)

## 1. Map the voice to actions

Read the SRT and `jobs/<id>/page-map.json` (interactive elements of the first page: tag, text, id, name,
placeholder, ariaLabel, href, y). Build an action table as a comment at the top of `record.mjs`:

```js
// 0.0s  cue 1 "প্রথমে ওয়েবসাইটে যান"       -> page already open (recorder opens TUTORIAL_URL)
// 4.2s  cue 2 "সাইন আপ বাটনে ক্লিক করুন"    -> click  link "Sign up"
// 9.0s  cue 3 "আপনার ইমেইল লিখুন"           -> type   #email
// 14.5s cue 4 "নিচে স্ক্রল করুন"            -> scroll 600
```

- Bengali action verbs: ক্লিক/চাপুন/প্রেস → click · লিখুন/টাইপ → type · স্ক্রল/নিচে যান → scroll ·
  খুলুন/যান/ভিজিট → goto or click a link · দেখুন/লক্ষ্য করুন/এখানে → highlight · লগইন → login flow.
- Start each action **0.3-0.6 s after its cue starts** so the viewer hears the instruction first.
- A cue with no action: highlight the element being discussed, or do nothing. Never click randomly.
- User "action hints" in the prompt take priority over your guesses for what to click.

## 2. `record.mjs` template (follow exactly)

```js
import { record } from "../../scripts/recorder.mjs";

await record(
  { url: process.env.TUTORIAL_URL, outDir: process.env.JOB_DIR, duration: Number(process.env.DURATION) },
  async (page, h) => {
    await h.at(4.5);
    await h.click(page.getByRole("link", { name: /sign up/i }), "Sign up");

    await h.at(9.4);
    await h.type(page.getByLabel(/email/i), process.env.TUTORIAL_EMAIL, "Email");

    await h.at(14.9);
    await h.scroll(600);
  },
);
```

Helper API (`scripts/recorder.mjs`; read it):

| Helper | Does |
| --- | --- |
| `h.at(sec)` | Waits until the voiceover reaches `sec`. Call before **every** action. This is the sync mechanism. |
| `h.click(target, label?)` | Scrolls into view, glides the cursor, logs a click event, clicks. |
| `h.type(target, text, label?)` | Click + human-speed typing. |
| `h.highlight(target, label?)` | Points at an element without clicking (gets a highlight box + zoom in the video). |
| `h.scroll(dy)` | Smooth wheel scroll by CSS px (negative = up). |
| `h.goto(url)` | Navigate (also dismisses common cookie banners). |
| `h.press(key)` | Keyboard key, e.g. `"Enter"`. |

`target` is a selector string or a Playwright `Locator`.

Rules:

- The recorder opens `TUTORIAL_URL`, records at 1280x720 CSS px, stops at `DURATION`, and writes
  `recording.webm` + `events.json`. Do **not** launch a browser, set `recordVideo`, or call `page.close()` yourself.
- Do not use raw `page.click` / `page.fill`: they are not logged, so the video gets no zoom or highlight.
  Do not use `page.waitForTimeout` for sync; use `h.at()`.
- Helpers never throw: a missing element is logged and skipped, the recording continues. Still, pick robust locators.
- Locator priority: `page.getByRole("button", { name: /…/i })` → `getByLabel` → `getByPlaceholder` → `getByText`
  → `#id` / `[name=…]` from `page-map.json` → CSS as a last resort. Use case-insensitive regex names. Avoid
  nth-child chains and generated class names.
- Pages after the first are not in `page-map.json`: use role/text locators based on what the voice says.
- Times passed to `h.at()` must increase. An action takes about 1-2 s (cursor travel + click); leave ≥ 1.5 s
  between actions, more after navigation (page load).
- **Credentials:** only `process.env.TUTORIAL_EMAIL` and `process.env.TUTORIAL_PASSWORD`. Never hard-code,
  log or print them. If the prompt says no login was provided, do not attempt to log in.
- Do not submit payments, delete data, send messages or change account settings unless the voice explicitly
  describes that step. When unsure, `h.highlight` the control instead of clicking it.
- Plain ESM JavaScript (`.mjs`), no TypeScript syntax, no extra imports beyond `../../scripts/recorder.mjs`.

## 3. `Video.tsx`: wrap the recording

`<BrowserRecording src={recordingSrc} events={events} />` (from the kit) already provides: 16:9 browser frame,
**auto-zoom on every click/type/highlight** (ease in before the action, hold, ease out), **click ripples**, and
**highlight boxes** around the target element. Give it a width via its parent; it keeps 16:9.

Guard for the baseline case: `if (!recordingSrc) { /* render a simple title + captions fallback */ }`.

Layout:

- **16:9:** recording fills ~88-92% of the width, slightly above centre, on a calm background (flat field or
  `GradientBackground` with muted colours); captions in the bottom band.
- **9:16:** recording full width in the upper-middle (it is 16:9, so it uses ~32% of the height); above it a step
  title; below it the presenter and captions.

Additions you build on top (all timed from `cues` and `events`):

- **Intro card** (0 → first cue or ~2 s): what the tutorial teaches, taken from the first cue, `KineticText`.
- **Step chips:** a small "ধাপ ১ / Step 1" label + short keyword from the current cue, top-left of the frame;
  advance the step at each `click`/`type` event (`events.filter(e => e.type === "click" || e.type === "type")`).
- **Arrows / callouts:** for the active event (`Math.abs(t - e.t) < 1.2`), draw an SVG arrow or label outside the
  browser frame edge nearest to the target, using `e.x / e.vw` and `e.y / e.vh` as percentages of the frame.
  Never hard-code pixel coordinates of page elements.
- **Progress bar:** thin bar at the very top, `width: (t / durationSec) * 100 + "%"`.
- **Outro card** over the last cue if it is a closing line.

Picture-in-picture presenter (optional): if `character !== "none"`, put
`<Presenter character={character} cues={cues} size={height * 0.32} />` in a rounded or circular PiP badge in the
bottom-right (16:9) or below the recording (9:16). It lip-syncs automatically. It must never cover the recording
area where the current event is: if the active event is in the bottom-right quadrant
(`e.x / e.vw > 0.6 && e.y / e.vh > 0.6`), slide the PiP to the bottom-left.

## 4. Checklist

- [ ] `record.mjs` starts with the action table comment; every action preceded by `h.at(sec)` with increasing times.
- [ ] Only `h.*` helpers perform actions; locators are role/label/text first.
- [ ] No hard-coded credentials; no destructive actions the voice did not ask for.
- [ ] `Video.tsx` uses `<BrowserRecording>` with `events` from props and handles missing `recordingSrc`.
- [ ] Overlays are positioned from `events` percentages, not guessed pixels.
- [ ] No `<Captions>` (studio-owned); PiP presenter does not hide the action; the recording gets a gentle CameraDrift/spring entrance and never sits perfectly static (remotion-core section 8).

## Cinematic motion (applies to the whole video)

Follow remotion-core section 8. The browser frame springs in (`SPRING.soft`) instead of appearing, sits on a
`<Parallax depth={0.3}>` layer over a drifting gradient, and the whole composition has a very gentle
`<CameraDrift push={0.03}>` on top of the kit's own click-zoom. Highlight callouts and labels spring in
(`SPRING.snappy`), and the presenter PiP slides in with a spring. When the viewer must read UI text, keep the
camera still for that moment.
