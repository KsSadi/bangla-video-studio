# Remotion Core Rules (mandatory for every video mode)

Synthesized from `_reference_skills/` (official `remotion-dev/skills` rule files: timing, sequencing,
transitions, local-fonts, arabic-text, video-layout; `digitalsamba/claude-code-video-toolkit` motion-craft
and video-design; `wshuyi/remotion-video-skill` scene architecture) plus this studio's Bengali rules.

## 1. The contract

You write exactly one file: `remotion/generated/Video.tsx`.

```tsx
import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { VoiceAudio, Captions, KineticText, Presenter, GradientBackground, BrowserRecording,
  useTime, activeCueIndex, mouthOpen, fadeInOut, enter, splitWords, splitGraphemes,
  BENGALI_FONT_STACK, FONT_HEADING, FONT_BODY, EASE_OUT } from "../lib/kit";
import { Character, CHARACTER_STYLES, type CharacterStyle, type Expression } from "../characters/Character";
import type { VideoProps, Cue } from "../lib/types";

export const GeneratedVideo: React.FC<VideoProps> = ({ audioSrc, cues, durationSec, width, height, character, recordingSrc, events }) => { ... };
```

- The export name and props type never change. `Root.tsx` sets size, fps (30) and duration from props.
- Always render `{audioSrc ? <VoiceAudio src={audioSrc} /> : null}` exactly once, at the top level, never inside a `<Sequence>` that starts late.
- Allowed imports: `react`, `remotion`, `@remotion/transitions` (+ `/fade`, `/slide`, `/wipe`), `@remotion/media`, `../lib/kit`, `../lib/types`, `../characters/Character`. Nothing else is installed.
- No network: no remote images, no Google Fonts, no `fetch`. Draw visuals with inline SVG, divs and CSS gradients.
- You may define as many helper components as you need inside the same file.

## 2. Timing: the subtitles are the clock

- All timing comes from `cues` (seconds). `const t = useTime()` gives the current second; `frame = t * fps`.
- **Never hard-code frame numbers for content.** Derive every scene boundary from cue timestamps:
  group consecutive cues into scenes, `sceneStart = cues[first].start`, `sceneEnd = cues[last + 1]?.start ?? durationSec`.
- Use the real cue values you read in the SRT to decide scene grouping, but index into the `cues` prop at runtime
  (`cues[3].start`), guarding with `?.` and fallbacks, so user subtitle edits stay in sync.
- With `<Sequence from={Math.round(start * fps)} durationInFrames={Math.round((end - start) * fps)}>`,
  `useCurrentFrame()` inside restarts at 0. `useTime()` inside a Sequence is also local. Pass absolute times
  down as props, or subtract the scene start, and be consistent.
- A visual lands **on the word that names it**: estimate a word's time by linear interpolation inside its cue
  (`cue.start + (wordIndex / wordCount) * (cue.end - cue.start)`).
- One concept = one scene component. 3-8 s per scene is typical. No more than ~3 s where nothing changes.
- The first scene starts at 0 (not at the first cue) and the last scene runs to `durationSec`: no blank frames.

## 3. Animation rules

- Everything is driven by `useCurrentFrame()` / `useTime()`. **Forbidden:** CSS transitions, CSS `animation`,
  `@keyframes`, `setTimeout`, `Date.now()`, `Math.random()` (use `random(seed)` from remotion), `useState` for
  animation. They do not render deterministically.
- `interpolate()` always gets `{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }`.
- Prefer individual transform properties (`scale`, `translate`, `rotate` style props) over `transform` strings.
- Ease by role: arrivals `Easing.out(Easing.exp)` or `EASE_OUT` (0.16,1,0.3,1); camera moves
  `Easing.inOut(Easing.cubic)`; exits `Easing.in(Easing.poly(4))`. The same ease on everything looks generated.
- Springs: `config: { damping: 200 }` = no bounce (UI, text). `damping: 12-15` = playful (cartoon props).
  Opacity and colour never bounce.
- Fast move 9-18 frames. Exit 40-50% shorter than its entrance. Word stagger 2-4 frames, list items 1-2 frames.
  Start the next element when the previous is 30-50% done.
- A landed title is still. Do not keep text drifting or scaling while it is being read.
- Vary entrances across scenes (slide, scale, blur-in, wipe, word reveal); do not fade-and-slide-up everything.

## 4. Bengali typography (never break the script)

- Every text element: `fontFamily: BENGALI_FONT_STACK` and `lang="bn"`. Headings weight 700/600 (Hind Siliguri),
  body 400-600. The fonts are loaded locally by the kit; never load others.
- **Animate words, not letters.** Bengali conjuncts (যুক্তাক্ষর: ক্ষ, ন্ত, স্ত্র) and vowel signs (কার: ি, ী, ে, ো)
  fall apart if split by code unit. Never use `text.split("")`, `[...text]` or `Array.from(text)`.
  Use `splitWords(text)`; only if a per-letter effect is essential, use `splitGraphemes(text)`.
- Never apply `letterSpacing`, `textTransform`, or faux italics to Bengali text. No `word-break: break-all`.
- `lineHeight` at least 1.4 (matras and below-base forms need room). Never clip with tight `overflow: hidden`
  boxes; give text containers vertical padding.
- Quote subtitle text exactly as written in the SRT. Never translate, transliterate or "correct" it.
  On-screen keywords must be words taken from the cue being spoken.
- Bengali digits (০-৯) stay as written in the SRT.
- Sizes (scale with `width`; these are for 1920 wide, multiply by `width / 1920`, and for 9:16 use about
  1.7x the relative size): headline 84-120 px, supporting 44-56 px, captions via `<Captions>`. Nothing readable under 28 px.
- Max two lines for a headline. Keep text 80 px from the sides and 100 px from top/bottom (safe area).
- Contrast: light text on dark or dark on light; never grey text on a coloured field.

## 5. Layout and design

- You are designing a video, not a webpage. One dominant thing per scene.
- Use `width`/`height` from props (or `useVideoConfig()`), never fixed 1920x1080 pixel positions.
  `const portrait = height > width`: in 9:16 stack vertically (visual top, character/caption bottom);
  in 16:9 use side-by-side layouts.
- Palette: 2-3 background fields for the whole video, changing only when the story turns; neighbours differ in
  lightness. One accent colour for the thing being talked about.
- Avoid the generated look: dark void with small floating things, glow/neon/particles as decoration,
  everything centred, everything fading in at once.
- Captions: include `<Captions cues={cues} />` unless the scene already shows the full spoken sentence as
  kinetic text. Keep the caption zone (bottom ~18%) free of other content.

## 6. Scene transitions

```tsx
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={a}>…</TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
  <TransitionSeries.Sequence durationInFrames={b}>…</TransitionSeries.Sequence>
</TransitionSeries>
```

- A transition overlaps both scenes, so the series gets shorter by the transition length. To stay in sync with
  the voice, add the transition frames to the outgoing scene's `durationInFrames`
  (scene N duration = its cue span + next transition length). Simpler and always safe: plain `<Sequence>`s with
  per-scene enter/exit animation via `fadeInOut(t, start, end)`.
- All `durationInFrames` must be integers >= 1 (`Math.max(1, Math.round(...))`).
- 3-5 kinds of transition per video, each with a reason. Never cross-fade through black between every scene.

## 7. Before you finish (self-check; you cannot run code)

- [ ] File compiles under `strict` TypeScript: no unused-import errors matter, but no undefined names, every
      array index guarded (`cues[i]?.start ?? fallback`), all JSX closed, keys on mapped elements.
- [ ] `GeneratedVideo` exported with `React.FC<VideoProps>`; `VoiceAudio` rendered once.
- [ ] No forbidden APIs (section 3), no remote assets, no packages outside section 1.
- [ ] Works for both aspect ratios; nothing positioned off-screen in 9:16.
- [ ] Scenes cover 0 → `durationSec` with no gaps; every `durationInFrames` is a positive integer.
- [ ] All Bengali text uses `BENGALI_FONT_STACK`, word-level animation only.
