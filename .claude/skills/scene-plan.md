# Skill: scene-plan.json (the default way every video is made)

You do NOT write code. You write one compact JSON object. The studio's pre-built component library
(`remotion/library/`) and scene engine (`remotion/engine/SceneEngine.tsx`) render it: animated backgrounds,
camera drift, spring entrances, scene transitions, captions, music and branding are all
automatic. The studio inlines this file into the prompt, so you never need to read files or use tools.

<!-- schema -->
## Schema

```
{ "version": 1,
  "accent": "#RRGGBB",                                        // optional highlight colour
  "scenes": [ {
    "id": "s1",                       // short unique id
    "fromCue": 1,                     // 1-based cue number where the scene starts; it runs until the next scene
    "bg": "gradient|particles|grid",
    "colors": ["#dark", "#mid", "#glow"],            // 2-3 hex colours, dark first (text is white)
    "transition": "fade|slide-left|slide-up|zoom|wipe",   // how this scene enters
    "elements": [ ...1-2 elements, max 3... ],
    "zoom": [ { "at": 12.5, "x": 0.7, "y": 0.4, "scale": 1.4, "hold": 1.5 } ]   // optional camera emphasis; x,y are 0..1 of the frame
  } ] }
```

Elements (each may add `"at": seconds` on the voiceover clock for when it appears; default = staggered from scene start):

| type | fields | use for |
| --- | --- | --- |
| `title` | `text` (2-6 words), `sub?` | the key phrase of the scene |
| `icons` | `items: [{ "icon": "<lucide icon name>", "label?": "1-2 words" }]` (1-4) | steps, features, concepts |
| `illustration` | `name: laptop|phone|idea|growth|team`, `label?` | one hero picture |
| `list` | `items: ["short line", …]` (2-5) | steps or points, one per spoken item |
| `chart` | `chart: bar|line|progress`, `values: [numbers]`, `labels?`, `unit?`, `highlight?` (index) | numbers that are spoken |
| `media` | `src: "assets/<file>"`, `frame?: browser|phone|polaroid|card`, `caption?` | ONLY files listed under EXTRA MEDIA |

Icon names are lucide icons in PascalCase (`Rocket`, `Smartphone`, `ShieldCheck`, `ChartBar`, `Users`, `Lightbulb`,
`Wallet`, `BookOpen`, `Globe`, `Clock`, `Heart`, `MessageCircle`, `Search`, `Lock`, `Zap`, `Target`, `TrendingUp` …).
An unknown name falls back to a generic icon, so prefer common ones.

## Rules

- All on-screen text (`text`, `sub`, `label`, `items`, `labels`, `caption`) is Bengali taken from, or a faithful
  shortening of, the words spoken in that scene's cues. Never translate, transliterate or invent facts. Keep Bengali
  digits as spoken. No full sentences: the studio already shows the full subtitle as a caption.
- Chart `values` must be numbers actually spoken in those cues. No spoken numbers = no chart.
- Keep ids stable and `fromCue` ascending. Output valid JSON only (no comments, no trailing commas).
<!-- /schema -->

## Planning a new video

1. One idea = one scene. Start a new scene where the topic changes; typical scene 4-9 s, never more than ~12 s.
   Scene 1 has `fromCue: 1`. A 60 s video is usually 8-12 scenes.
2. Every scene needs a visual that matches its words: pick the element type from the table. Vary types across
   neighbouring scenes; do not use the same layout three times in a row.
3. Time `at` to the cue where the thing is named (cue start + ~0.2 s) when a scene covers several cues.
4. Palette: 2-3 colour sets for the whole video, changing only when the story turns. Vary `bg` and `transition`
   (3+ kinds per video).
5. Use `zoom` sparingly (0-2 per video) to punch in on the thing being named.
