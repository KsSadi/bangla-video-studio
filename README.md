# বাংলা ভিডিও স্টুডিও (Bangla Video Studio)

Local-first AI video studio. Upload a Bengali voiceover and get an MP4: cartoon story, motion-graphics
explainer, or a recorded website tutorial.

**No API keys.** All AI work is done by the `claude` CLI (Claude Code) already installed and logged in on your
machine, spawned in headless mode (`claude -p`). Speech-to-text is local Whisper. Rendering is local Remotion.

```
voice.mp3 ─▶ faster-whisper (bn) ─▶ subtitles.srt ─▶ you fix spelling in the UI
          ─▶ claude -p + .claude/skills/<mode>.md ─▶ remotion/generated/Video.tsx (+ Playwright record.mjs)
          ─▶ [tutorial] Playwright records the browser ─▶ ffmpeg ─▶ recording.mp4
          ─▶ remotion render ─▶ jobs/<id>/final-video.mp4
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
| `WHISPER_MODEL` | `medium` | `small` is faster, `large-v3` is most accurate for Bengali. Uses GPU (CUDA) if available, else CPU. |
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
lib/jobs.ts             Pipeline: spawns python, claude, node, ffmpeg, remotion
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
jobs/<id>/              Per-job files: audio, subtitles.srt, Video.tsx, final-video.mp4
_reference_skills/      Open-source skills the studio's skills were built from (not needed at runtime)
```

Edit the files in `.claude/skills/` to change the style of every future video.
`npm run remotion:studio` opens Remotion Studio on the last generated composition.
`npm run check` runs the subtitle parser self-check.

## Good to know

- **One job at a time.** The generated composition is a single file; a second job is refused while one runs.
- **Jobs are kept in memory.** Restarting the dev server forgets the job list (files stay in `jobs/`).
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
