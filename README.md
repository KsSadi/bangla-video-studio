# বাংলা ভিডিও স্টুডিও (Bangla Video Studio)

Local-first AI video studio. Upload a Bengali voiceover and get an MP4: cartoon story, motion-graphics
explainer, or a recorded website tutorial.

**No API keys.** All AI work is done by the `claude` CLI (Claude Code) already installed and logged in on your
machine, spawned in headless mode (`claude -p`). Speech-to-text is local Whisper. Rendering is local Remotion.

```
voice.mp3 ─▶ faster-whisper (bn) ─▶ subtitles.srt ─▶ you fix spelling in the UI
          ─▶ claude -p + .claude/skills/<mode>.md ─▶ remotion/generated/Video.tsx (+ Playwright record.mjs)
          ─▶ [tutorial] Playwright records the browser ─▶ ffmpeg ─▶ recording.mp4
          ─▶ remotion render ─▶ projects/<name>/versions/vN.mp4
```

## Requirements

| Tool | Check | Notes |
| --- | --- | --- |
| Node.js 20+ | `node -v` | |
| Python 3.9+ | `python --version` | for faster-whisper |
| FFmpeg | `ffmpeg -version` | must be on PATH (includes `ffprobe`) |
| Git | `git --version` | |
| Claude Code CLI | `claude --version` | run `claude` once and log in |

## Setup (once)

```bash
npm install
npm run setup
```

`npm run setup` verifies the tools above, downloads the Bengali fonts (Hind Siliguri, Noto Sans Bengali) to
`public/fonts/`, installs `faster-whisper` with pip, and installs Playwright's Chromium. Anything it cannot do
is printed as a `MISS` line with the command to run.

## Run

```bash
npm run dev
```

Open <http://localhost:3000>.

1. **Upload Bengali Voice** – drop an `.mp3`, `.wav` or `.m4a`. Whisper generates the subtitles; edit any line
   to fix spelling (click a timestamp to hear that line).
2. **Video Mode** – Cartoon Story, Motion Graphics / Explainer, App / Website Tutorial (asks for the target URL
   and optional login), or Auto-Detect. Add optional notes/action hints.
3. **Character & Aspect Ratio** – Tech Mentor, Storyteller, Friendly Teacher, Auto-Generate, or No Character;
   16:9 (YouTube) or 9:16 (Reels/Shorts).
4. **Generate Video** – watch the steps and live console.
5. **Preview & Download** – play the result and download `final-video.mp4`.

The first transcription downloads the Whisper model, and the first render downloads Remotion's headless
browser. Both are one-time.

## Use on another PC

```bash
git clone https://github.com/KsSadi/bangla-video-studio.git
cd bangla-video-studio
npm install
npm run setup     # checks git/ffmpeg/python/claude, installs faster-whisper + Chromium
npm run dev       # http://localhost:3000
```

The skills (`.claude/skills/`), fonts (`public/fonts/`) and all code come with the repo. You only need
Node, Python, FFmpeg, Git and the logged-in `claude` CLI on that machine. Optional: re-fetch the reference
skill repos the studio skills were built from:

```bash
mkdir _reference_skills && cd _reference_skills
git clone --depth 1 https://github.com/remotion-dev/skills.git remotion-dev_skills
git clone --depth 1 https://github.com/wshuyi/remotion-video-skill.git wshuyi_remotion-video-skill
git clone --depth 1 https://github.com/athola/claude-night-market.git athola_claude-night-market
git clone --depth 1 --filter=blob:none --sparse https://github.com/digitalsamba/claude-code-video-toolkit.git digitalsamba_claude-code-video-toolkit   && git -C digitalsamba_claude-code-video-toolkit sparse-checkout set .claude/skills
```

## Settings (environment variables, all optional)

| Variable | Default | Meaning |
| --- | --- | --- |
| `WHISPER_MODEL` | `large-v3` | Most accurate for Bengali (~3 GB first download). `medium`/`small` are faster but may output Devanagari. Uses GPU (CUDA) if available, else CPU. |
| `CLAUDE_MODEL` | CLI default | Passed to `claude --model`, e.g. `sonnet` or `opus`. |
| `PYTHON` | `python` (Windows) / `python3` | Python executable to use. |

Example (PowerShell): `$env:WHISPER_MODEL = "large-v3"; npm run dev`

## Project layout

```
app/                    Next.js UI (page.tsx) and API routes
  api/transcribe        POST audio -> starts Whisper, returns { jobId }
  api/generate-video    POST job settings -> starts the pipeline
  api/status            GET job steps, logs, subtitles
  api/video             GET final MP4 (stream / download)
lib/pipeline.ts         Pipeline: spawns python, claude, node, ffmpeg, remotion (lib/store.ts = projects, lib/media.ts = FFmpeg audio)
.claude/skills/         Skills Claude reads per mode
  remotion-core.md      Shared rules: timing, animation, Bengali typography
  cartoon-story.md      2D characters, lip-sync, backgrounds
  motion-graphics.md    Kinetic type, charts, icons, transitions
  browser-tutorial.md   Playwright script + recording wrap
remotion/
  lib/kit.tsx           Reusable blocks: fonts, Captions, KineticText, Presenter, BrowserRecording
  characters/           Rigged SVG character (blink, lip-sync, expressions)
  template/Video.tsx    Baseline video (works without AI)
  generated/Video.tsx   Written by Claude for each job
scripts/
  transcribe.py         faster-whisper -> SRT
  recorder.mjs          Playwright recording helper (cursor, click log, sync)
  inspect-page.mjs      Dumps page elements so Claude writes real selectors
  setup.mjs             One-time setup
projects/<name>/         Auto-saved project: audio, subtitles.srt, project.json (settings, revisions), Video.tsx, versions/v1.mp4…, thumbnail.png, metadata.json
_reference_skills/      Open-source skills the studio's skills were built from (not needed at runtime)
```

Edit the files in `.claude/skills/` to change the style of every future video.
`npm run remotion:studio` opens Remotion Studio on the last generated composition.
`npm run check` runs the subtitle parser self-check.

## Good to know

- **One job at a time.** The generated composition is a single file; a second job is refused while one runs.
- **Jobs are kept in memory.** Restarting the dev server forgets the job list (files stay in `projects/`; reopen them from Recent Projects).
- **Tutorial mode runs generated code.** Claude writes a Playwright script that is executed on your machine
  against the URL you entered. Login email/password are passed to that script as environment variables only;
  they are not written to disk and not sent to Claude. Use a test account for sites that matter.
- **Lip-sync is subtitle-driven** (mouth moves while a cue is spoken), not phoneme-accurate.
- **Tutorial selectors:** only the first page is inspected in advance. For multi-page flows, add action hints
  ("click the blue Sign up button at 0:05") for better accuracy.
- The server listens on `127.0.0.1` only.
- If `claude` fails with a login error, run `claude` in a terminal once and sign in.

## Credits

Skills were synthesized from these open-source projects (cloned to `_reference_skills/`):
[remotion-dev/skills](https://github.com/remotion-dev/skills),
[digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit),
[wshuyi/remotion-video-skill](https://github.com/wshuyi/remotion-video-skill),
[athola/claude-night-market](https://github.com/athola/claude-night-market).
Fonts: Hind Siliguri and Noto Sans Bengali (SIL Open Font License). Remotion has its own
[license](https://www.remotion.dev/license) (free for individuals and small teams).


## Studio features (every one is optional, with its own ON/OFF control; OFF = the backend step is skipped)

| Feature | Where | Notes |
| --- | --- | --- |
| Manual `.srt` upload | Step 1 | Skips Whisper; "Re-generate with Whisper" stays available |
| Enhance Voice Audio | Step 1 | FFmpeg `highpass=80, lowpass=12000, afftdn, loudnorm`; OFF = raw audio |
| Sync spot-check | Step 1 editor | Random 3-4 slice playback with live line highlight, click-to-play rows, editable start/end, Verified / Skip, save `subtitles.srt`, optional "require verification" gate |
| Extra media / B-roll | Step 2 panel | Files go to `projects/<name>/public/assets/`; Claude places them with `<MediaFrame>` |
| Captions | Step 4 | Kinetic / Classic / None, drawn by the studio overlay (Hind Siliguri / Noto Sans Bengali) |
| BGM + SFX | Step 4 | Synthesized locally with FFmpeg (no downloads), auto-ducked under the voice |
| Brand kit, watermark, outro | Step 4 | Brand kit is saved in `data/brand/` and shared by all projects |
| Draft vs Final | Step 5 | Fast Draft 480p/15fps, Final HD 1080p/30fps; "Reuse current design" re-renders without calling Claude |
| Revise video | Step 6 | Chat-to-edit (Bengali/English) edits only the requested parts; every render is a version (`v1.mp4`, `v2.mp4`…) with a switcher and compare |
| Thumbnail + YouTube pack | Step 5 | Run on Final HD renders; chapters are computed from the SRT, never by the model |

Offline Remotion: set `REMOTION_BROWSER_EXECUTABLE` to a Chrome/Chromium path to skip Remotion's browser download.


## Creative controls (each has its own ON/OFF control)

| Feature | Where | How it works |
| --- | --- | --- |
| **Subtitles master switch + 4 themes** | Step 4 | "Show Subtitles" OFF renders a completely clean video (the `.srt` still times the scenes, and the layout reclaims the caption band). ON offers **Viral Word-Pop** (spoken word scales up in the accent colour), **Cinema Pill** (frosted-glass pill), **Gradient Glow** (soft glow + gradient keyword) and **Minimalist Classic** (bottom bar), all in Hind Siliguri / Noto Sans Bengali, plus font size (60-160%) and Bottom / Center position. Old projects that stored "none" load as switch OFF. |
| **Clone style from a reference video** | Step 2 | FFmpeg extracts 5 keyframes, the dominant colours (median-cut) and the cutting pace (scene detection); `claude -p` reads the keyframes and writes `style-dna.json` (palette, backgrounds, transitions, text placement, caption style, scene length, notes). Saved in `data/styles/`. Colours, accent and transitions are stamped onto the new plan deterministically; pacing and composition go into the planning prompt. If Claude is unavailable the measured palette + pacing are used. |
| **Reusable templates** | Step 6 "Save as reusable template", Step 1 "My Templates" | `data/templates/<id>.json` stores the structure only: scene boundaries as ratios of the total length, background / colours / transition / character / camera per scene, element slots (counts and types, never text), plus the workflow settings (subtitle design, music, brand toggles, style DNA). A new voice or `.srt` is mapped onto it (nearest cue per ratio) and Claude only fills the content slots, so the new video follows the same proven structure for a fraction of the tokens. |

## Reliability upgrades (each has its own ON/OFF control)

| Upgrade | Where | How it works |
| --- | --- | --- |
| **Auto-Voice from a script** | Step 1, tab "Write / paste script" | `scripts/tts.py` uses the free `edge-tts` package (Microsoft neural voices `bn-BD-NabanitaNeural` / `bn-BD-PradeepNeural`, no API key) and builds the `.srt` from the voice's own word timings. Lines starting with `A:` / `B:` use two voices and turn on Dialogue Mode. Needs internet only for this step; retries automatically when the free service hiccups. |
| **Auto-Replace Dictionary** | Step 1, collapsible | Saved find-and-replace rules (`data/dictionary.json`, e.g. `রিয়্যাক্ট -> React`). Applied automatically to every Whisper `.srt`; "Apply to current subtitles" fixes an existing one. One pass, longest rule first, so replacements are never re-replaced. |
| **Self-healing Playwright tutorials** | Step 2 (Tutorial mode), "Self-healing recorder" | `scripts/recorder.mjs` first tries the given locator, then `getByRole` / `getByLabel` / `getByPlaceholder` / `getByText` fallbacks built from the target's text, then a fuzzy text match over visible elements. Anything still failing is skipped (the recording finishes) and saved to `failures.json` with the error, URL, screenshot and accessibility snapshot. `claude -p` (light model) then patches only those selectors once and the studio re-records once. |
| **Chunked rendering** | Step 5 toggle | Videos over 3 minutes render as separate Remotion runs over frame ranges (`--frames=a-b`) of the same composition (about 90 s each, so transitions stay continuous), muted. The audio mix is rendered once, and `ffmpeg -f concat` stitches video + audio without re-encoding. Tune with `STUDIO_CHUNK_SEC` / `STUDIO_CHUNK_MIN`. |
| **Studio presets** | Top of the workspace | Save the reusable workflow (mode, character, dialogue, music, captions, brand toggles, engine and feature switches) under a name and load it in one click (`data/presets.json`). Per-video items (notes, URL, login, media) are not part of a preset. |

## Pro-creator features (each has its own ON/OFF switch, all local, no paid API keys)

| Feature | Where | How it works |
| --- | --- | --- |
| **Instant live preview** | Step 5 toggle, shown in the Live Monitor | `@remotion/player` plays the real "Main" composition from `projects/<id>/preview.json` as soon as `scene-plan.json` exists (and again after every revision), so you can scrub and inspect before any MP4 render. `staticFile()` is pointed at `/api/pub/<id>/`. |
| **Long-to-Shorts (9:16)** | Step 6, after a video exists | **Option A:** one `claude-haiku-4-5` call reads only the subtitles and returns up to 3 timestamp ranges. **Option B:** type start/end (+ optional Bengali hook) for 0 tokens. Both then use deterministic code (`remotion/engine/slice.ts` + ffmpeg) to cut the existing plan and audio, switch to 1080x1920 with the safe zones from `.claude/skills/reels-shorts.md`, and render locally to `projects/<id>/shorts/`. |
| **Dialogue Mode (2 speakers)** | Step 3 toggle + A/B selector per subtitle row | Speaker tags are stored in the `.srt` as `[A]` / `[B]`. Two characters share the screen; the spotlight, scale and the real-waveform lip-sync follow the active speaker. |
| **Character Customizer** | Step 3 "My characters" | Mix hair, skin tone, glasses, beard, bindi and outfits (shirt, Panjabi, formal suit, hoodie, saree). Saved to `data/characters.json` and reusable in any project (as speaker A or B). |
| **Auto B-roll** | Step 5 toggle | Claude adds a 1-3 word English `photo` query to up to 4 scenes (a few tokens). The studio then searches the free Wikimedia Commons API (no key), keeps only public-domain / CC0 images, and places them in animated frames. OFF = pure vector graphics. |

## Architecture: component library + JSON scene engine (low-token by design)

```
subtitles ─▶ claude -p (ONE turn, no tools) ─▶ scene-plan.json ─▶ remotion/engine/SceneEngine ─▶ MP4
                                                   ▲ validated by remotion/engine/plan.ts
```

- **`remotion/library/`** holds the pre-built components: `TalkingCharacter` (waveform lip-sync via
  `@remotion/media-utils`, blinking, emotions), `SceneBackground`, `IconSpotlight` / `IconRow` (lucide-react +
  built-in illustrations), `DataChart`, `SmartZoomContainer`, `KineticSubtitles`.
- **`scene-plan.json`** is all Claude writes: scenes keyed to subtitle cue numbers, each picking a background,
  transition, character emotion and 1-3 elements (title, icons, illustration, list, chart, media). The guide the
  model sees is `.claude/skills/scene-plan.md` + `style-*.md`, inlined into the prompt (no file reads).
- **Invalid output cannot break a render:** the plan is sanitized, unknown icons fall back, and if Claude returns
  nothing usable a built-in automatic plan is used. Tutorial videos need no AI plan at all (only `record.mjs`).
- **Surgical revisions:** feedback that names a moment (`0:15`, `১৫ সেকেন্ডে`, `scene 3`) sends only that scene
  object, one neighbour and their cues; the reply is merged back by id and only that scene may change.
- **Model routing:** Token Saver mode runs light tasks (YouTube pack, single-scene edits) on
  `claude-haiku-4-5` and planning on `sonnet`; Max Quality uses your CLI default for everything. Override with
  `CLAUDE_MODEL_LIGHT` / `CLAUDE_MODEL_HEAVY` / `CLAUDE_MODEL`. Token usage of every call is printed in the console.
- **Custom one-off TSX** remains as an opt-in toggle (skills in `.claude/skills/custom/`).
