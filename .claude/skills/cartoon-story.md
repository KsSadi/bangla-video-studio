# Skill: Cartoon Story (2D SVG characters, Bengali narration)

Read `remotion-core.md` first; everything there applies. This skill adds storytelling rules.

## Goal

Turn the Bengali voiceover into an animated 2D cartoon: characters that talk in sync with the voice, blink and
react, living backgrounds, and scenes that change with the story beats in the SRT.

## 1. Break the story into scenes

1. Read every cue. Mark the beats: setting introduced, character introduced, problem, action, turn, ending/moral.
2. Group consecutive cues into 3-8 scenes. A new scene starts when the **place, time of day, or who is on screen** changes.
3. For each scene write down (as a comment at the top of the file): cue range, location, who is on screen, one key
   prop or action, mood (colour). This comment is your storyboard.

```tsx
// STORYBOARD
// S1 cues 0-2  | village morning | narrator      | sun rises           | warm yellow
// S2 cues 3-6  | river bank      | boy + fish    | boy throws net      | teal
```

## 2. Characters

The kit gives a rigged character: `Character` (pure SVG, 400x600 viewBox) and `Presenter` (auto lip-sync wrapper).

```tsx
<Presenter character={character} cues={cues} size={height * 0.55} expression="happy" wave={t < 2} style={{ position: "absolute", left: width * 0.08, bottom: 0 }} />
```

- `character` prop values: `"tech-mentor" | "storyteller" | "friendly-teacher"` use the pre-built look.
  `"auto"`: design looks that fit the story and pass `look={{ skin, hair, hairStyle: "short" | "bun" | "long", outfit, accent, accessory: "headset" | "glasses" | "book" | "none" }}`.
  `"none"`: no people on screen; tell the story with scenery, props and kinetic text.
- **Lip-sync:** `mouthOpen(cues, t)` returns 0..1 while a cue is spoken and 0 in pauses. `Presenter` applies it
  automatically. For a second character, use `<Character look={…} t={t} mouth={isTheirLine ? mouthOpen(cues, t) : 0} />`
  so only the speaker's mouth moves. Decide who speaks per cue (narrator vs. quoted dialogue in the text).
- **Blinking and breathing** are built in (driven by `t`). Always pass `t={useTime()}`, never a constant.
- **Expressions** (`"neutral" | "happy" | "surprised" | "thinking"`): pick per cue from its meaning, e.g. question →
  `thinking`, good news → `happy`, twist → `surprised`. Change expression at cue boundaries, not mid-sentence.
- **Acting:** `wave` for greetings/goodbyes. Move characters with `translate` (walk in from off-screen over
  0.6-1 s, add a small `Math.sin(t * 10) * 6` vertical bob while walking), flip with `scale: "-1 1"` to face each
  other. Keep feet on the ground line.
- Non-human characters or extra props (animals, sun, tree, house, boat, phone): draw them as your own small SVG
  components with simple shapes, flat fills, 3-5 colours, rounded strokes, consistent outline weight. Give each
  one a tiny idle motion (tail wag, leaf sway) from `Math.sin(t * k)`.
- Staging: speaker at 55-65% of frame height in 16:9, 35-45% in 9:16. Never cover a face with captions.

## 3. Animated backgrounds

Build each location as a layered SVG/div scene with parallax depth:

- **Sky layer:** gradient by time of day (morning `#FFE9B0→#9ADCF7`, noon `#8FD3FF→#DFF6FF`, evening `#FF9E6B→#5B3F8C`, night `#0B1340→#27326B` with stars).
- **Far layer:** hills/skyline, moves slowly (`translate: ${Math.sin(t * 0.1) * 10}px`).
- **Mid layer:** trees, houses; gentle sway (`rotate: ${Math.sin(t * 1.2 + i) * 1.5}deg` with `transformOrigin: bottom`).
- **Ground layer:** solid ground band at the bottom 22-28% so characters stand on something.
- Ambient life: 2-3 clouds drifting (`(t * 12 + offset) % (width + 400) - 200`), birds, water ripples, a sun/moon
  that slowly rises. Use `random("seed" + i)` from remotion for stable placement, never `Math.random()`.
- Bangladeshi/Bengali settings when the story suggests them (village, river boat, rickshaw, paddy field, tin-roof
  house, city street). Do not invent details that contradict the narration.
- Background elements must not compete with the characters: lower contrast and saturation than the cast.

## 4. Scene changes

- Change location with a clear transition: slide in the direction of travel, or a quick iris/wipe. Same location
  → no transition, just move the camera (scale 1 → 1.08 on the scene wrapper, `Easing.inOut(Easing.cubic)`).
- Each scene gets an entrance for its key prop **on the word that names it**.
- Emphasis: on a twist or the moral, punch in on the speaker (scale to ~1.15 over 10 frames) and switch expression.

## 5. Text on screen

- Always show `<Captions cues={cues} />` (story audiences read along).
- Optional: a title card for the first 1.5-2.5 s (story name from the first cue, `KineticText`) and a moral/closing
  card over the last cue. Speech bubbles are optional; if used, put only the quoted words in them.

## 6. Checklist

- [ ] Storyboard comment present; scenes cover 0 → `durationSec`.
- [ ] Only the current speaker's mouth moves; mouths are closed in pauses.
- [ ] Characters blink (pass live `t`), stand on a ground line, and have an expression that matches each cue.
- [ ] Every background has at least two moving ambient elements.
- [ ] `character === "none"` path renders no people. `"auto"` passes a custom `look`.
- [ ] Layout checked for both 16:9 and 9:16.
