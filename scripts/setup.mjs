// One-time setup: verify system deps, download Bengali fonts, install Whisper + Chromium.
// Run: npm run setup
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "pipe", encoding: "utf8" }).trim();
const has = (cmd) => {
  try {
    return run(cmd).split("\n")[0];
  } catch {
    return null;
  }
};

let missing = 0;
for (const [name, cmd, hint] of [
  ["git", "git --version", "https://git-scm.com/downloads"],
  ["ffmpeg", "ffmpeg -version", "https://ffmpeg.org/download.html (add to PATH)"],
  ["python", "python --version", "https://www.python.org/downloads/"],
  ["claude", "claude --version", "npm i -g @anthropic-ai/claude-code, then run `claude` once to log in"],
]) {
  const v = has(cmd);
  console.log(v ? `ok   ${name}: ${v}` : `MISS ${name} -> install: ${hint}`);
  if (!v) missing++;
}

const OFL = "https://raw.githubusercontent.com/google/fonts/main/ofl";
const fonts = {
  "HindSiliguri-Regular.ttf": `${OFL}/hindsiliguri/HindSiliguri-Regular.ttf`,
  "HindSiliguri-SemiBold.ttf": `${OFL}/hindsiliguri/HindSiliguri-SemiBold.ttf`,
  "HindSiliguri-Bold.ttf": `${OFL}/hindsiliguri/HindSiliguri-Bold.ttf`,
  "NotoSansBengali-Variable.ttf": `${OFL}/notosansbengali/NotoSansBengali%5Bwdth%2Cwght%5D.ttf`,
  "OFL-HindSiliguri.txt": `${OFL}/hindsiliguri/OFL.txt`,
  "OFL-NotoSansBengali.txt": `${OFL}/notosansbengali/OFL.txt`,
};
const fontDir = path.join(root, "public", "fonts");
mkdirSync(fontDir, { recursive: true });
for (const [file, url] of Object.entries(fonts)) {
  const dest = path.join(fontDir, file);
  if (existsSync(dest)) continue;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`MISS font ${file}: HTTP ${res.status}`);
    missing++;
    continue;
  }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`ok   font ${file}`);
}

if (has("python --version")) {
  if (!has('python -c "import faster_whisper"')) {
    console.log("...  installing faster-whisper (pip)");
    try {
      execSync("python -m pip install faster-whisper", { cwd: root, stdio: "inherit" });
    } catch {
      console.log("MISS faster-whisper -> run: python -m pip install faster-whisper");
      missing++;
    }
  } else console.log("ok   faster-whisper");
}

console.log("...  installing Playwright Chromium (skips if present)");
try {
  execSync("npx playwright install chromium", { cwd: root, stdio: "inherit" });
} catch {
  console.log("MISS playwright chromium -> run: npx playwright install chromium");
  missing++;
}

console.log(missing ? `\n${missing} item(s) need attention (see MISS lines).` : "\nAll set. Run: npm run dev");
process.exit(missing ? 1 : 0);
