# Skill: Motion Graphics / Explainer (kinetic Bengali typography)

Read `remotion-core.md` first; everything there applies. This skill adds explainer design rules
(adapted from the motion-craft and video-design references in `_reference_skills/`).

## Goal

A modern explainer: the voice explains, the screen shows one clear idea at a time with kinetic Bengali type,
animated charts, simple icons and purposeful transitions.

## 1. Script → scenes

1. Read every cue and label it: **hook**, **statement**, **list/steps**, **number/data**, **comparison**,
   **process**, **quote**, **call to action**.
2. Group cues into scenes (one idea each) and pick a scene type per group from section 3.
3. Write the plan as a comment at the top of the file:

```tsx
// PLAN
// S1 cues 0-1 | hook      | big question, word reveal
// S2 cues 2-4 | steps     | 3 numbered cards, one per cue
// S3 cues 5-6 | data      | bar chart, accent on the bar being named
```

4. Extract on-screen keywords **from the cue text itself** (2-5 words per scene). The caption carries the full
   sentence; the scene carries the keyword, number or diagram.

## 2. Design system (decide once, use everywhere)

```tsx
const C = { bg: "#F4F1EA", ink: "#14161A", accent: "#E4572E", soft: "#D9D4C7", field2: "#14161A" }; // example
```

- 2-3 background fields for the whole video; switch field only at a real turn (problem → solution). Neighbouring
  fields differ in lightness.
- One accent colour, used only on the thing the voice is talking about right now.
- Five type sizes, scaled by `width / 1920`: display 150-220, figure 110-130, title 64-84, label 36-44, note 28-32.
  For 9:16 scale by `width / 1080` with the same numbers reduced ~35%.
- One left edge (or one centre axis) for titles across all scenes.
- Flat shapes. No glows, glass cards, mesh gradients, drop shadows on things at rest, or decorative particles.
- Background interest comes from the subject (a grid for data, a timeline rule for steps), drawn as hairlines at
  10-16% opacity, never from blobs. `GradientBackground` is acceptable only for a hook or closing card.

## 3. Scene types

**Kinetic statement** – `<KineticText text={cue.text} start={cue.start} stagger={…} highlight={["শব্দ"]} />`
with `stagger = (cue.end - cue.start) * 0.7 / wordCount` so words land with the voice. Alternatives to vary
entrances: blur-in per word (`filter: blur(${(1 - p) * 8}px)`), grey → ink colour per word, line wipe via
`clipPath: inset(0 ${(1 - p) * 100}% 0 0)`.

**Numbered steps / list** – one card or row per cue; each enters on its cue's `start`
(`spring({ frame: frame - start * fps, fps, config: { damping: 200 } })`), the current one carries the accent,
earlier ones dim to 55%. Not a row of identical tiles: use one line/track with stops, or stacked rows.

**Big number** – count up over 0.8-1.2 s to the value spoken, `fontVariantNumeric: "tabular-nums"`; render with
Bengali digits when the SRT uses them:
`const bn = (n: number) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);`

**Bar / column chart** – SVG rects growing from the baseline (`height * p`, `Easing.out(Easing.exp)`),
staggered 3-4 frames; value labels appear after the bar lands; accent only on the named bar; 3-7 gridlines or
none; square corners. **Only chart numbers that are actually spoken in the SRT.** Never invent data.

**Line chart** – a `<path>` revealed with `strokeDasharray={len}` + `strokeDashoffset={len * (1 - p)}`
(compute `len` generously, e.g. sum of segment lengths), dot on the current point.

**Donut / progress** – `<circle>` with `strokeDasharray={2πr}` and animated `strokeDashoffset`, `rotate(-90)`.

**Comparison** – split screen, two fields with different lightness; the side being spoken scales to 1.03 and
the other dims.

**Process / flow** – nodes connected by a line that draws itself; each node pops on its word.

**Icons** – draw simple inline SVG icons (24-unit grid, 2 px stroke scaled up, round caps, single colour):
phone, user, coin (৳), check, cross, arrow, clock, globe, book, bulb, lock, chart, heart, cart, gear. Animate with
stroke draw-on or a small scale spring. No emoji (render inconsistently), no external icon sets.

## 4. Motion

- Arrivals 9-18 frames with a long tail; exits 40-50% shorter. Overlap elements 30-50%.
- Each change on screen lands on the word that names it (interpolate word time inside its cue).
- Hold a readable line for `0.5 s + 0.3 s × words` at least. The last line of the video holds ≥ 2 s.
- Exit each scene's content before the next enters (blur/fade out over 4-8 frames), or use a
  `TransitionSeries` transition with a cause (slide in reading direction, wipe on "but/কিন্তু", colour flood on a turn).
- Use 3-5 different transition kinds across the video; at most a third are hard cuts.

## 5. Presenter (optional)

If `character !== "none"`, place `<Presenter character={character} cues={cues} size={height * 0.38} />` in a
bottom corner (16:9: bottom-right; 9:16: bottom-centre above captions) on a small circular or rounded backdrop,
and keep the main visual clear of it. For `"auto"`, pass a `look` that matches the palette. The presenter is
secondary: never larger than 40% of frame height in this mode.

## 6. Checklist

- [ ] PLAN comment present; each scene has one dominant element.
- [ ] Keywords and numbers come verbatim from the SRT; no invented facts or data.
- [ ] One accent colour; ≤ 3 background fields; five type sizes.
- [ ] Entrances vary between scenes; nothing moves while it must be read.
- [ ] `<Captions cues={cues} />` present unless the scene shows the full sentence.
- [ ] Layout adapts to `portrait`.
