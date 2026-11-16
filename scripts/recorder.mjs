// Playwright recording helper used by generated jobs/<id>/record.mjs scripts.
// The recording timeline equals the voiceover timeline: call `await h.at(seconds)` before each action.
// Every helper is failure-tolerant: a missing element is logged and skipped so the recording still finishes.
import { chromium } from "playwright";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const VIEWPORT = { width: 1280, height: 720 };

const COOKIE_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "#CybotCookiebotDialogBodyButtonAccept",
  ".cc-btn.cc-dismiss",
  '[class*="cookie"] button[class*="accept"]',
  '[class*="consent"] button[class*="accept"]',
  'button:has-text("Accept all")',
  'button:has-text("Accept cookies")',
  'button:has-text("Got it")',
];

// Visible fake cursor (Playwright video has no real one). Re-injected on every navigation.
const CURSOR_SCRIPT = `(() => {
  const add = () => {
    if (document.getElementById('__studio_cursor') || !document.body) return;
    const c = document.createElement('div');
    c.id = '__studio_cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-4px 0 0 -4px;z-index:2147483647;pointer-events:none;' +
      'background:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27><path d=%27M4 2l16 9-7 2-3 7z%27 fill=%27black%27 stroke=%27white%27 stroke-width=%271.5%27/></svg>") no-repeat;' +
      'transform:translate(-100px,-100px)';
    document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
  };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', add) : add();
})();`;

/**
 * @param {{ url: string, outDir: string, duration: number }} opts  duration = voiceover length in seconds
 * @param {(page: import('playwright').Page, h: ReturnType<typeof makeHelpers>) => Promise<void>} script
 */
export async function record({ url, outDir, duration }, script) {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: outDir, size: VIEWPORT }, // must equal the viewport or the capture is letterboxed
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const t0 = Date.now();
  const events = [];
  const h = makeHelpers(page, t0, events);
  try {
    await h.goto(url);
    await script(page, h);
    await h.at(duration + 0.5);
  } catch (err) {
    console.error("[recorder] script error (recording kept):", err?.message ?? err);
  }
  const video = page.video();
  await context.close(); // flushes the video file
  await browser.close();
  renameSync(await video.path(), path.join(outDir, "recording.webm"));
  writeFileSync(path.join(outDir, "events.json"), JSON.stringify(events, null, 2));
  console.log(`[recorder] done: ${events.length} events, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function makeHelpers(page, t0, events) {
  const now = () => (Date.now() - t0) / 1000;
  const loc = (target) => (typeof target === "string" ? page.locator(target) : target).first();
  const log = (type, extra = {}) => events.push({ t: Number(now().toFixed(2)), type, vw: VIEWPORT.width, vh: VIEWPORT.height, ...extra });
  let mouse = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

  /** Scroll the element into view, glide the cursor to it, return its centre + box (or null if not found). */
  const approach = async (target) => {
    const el = loc(target);
    await el.waitFor({ state: "visible", timeout: 2500 }); // short: a missing element must not push later actions out of sync
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    if (!b) throw new Error("no bounding box");
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y, { steps: Math.max(12, Math.round(Math.hypot(x - mouse.x, y - mouse.y) / 18)) });
    mouse = { x, y };
    return { el, x: Math.round(x), y: Math.round(y), box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } };
  };

  const safe = (name, fn) => async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[recorder] ${name} skipped: ${String(err?.message ?? err).split("\n")[0]}`);
    }
  };

  return {
    now,
    /** Wait until the voiceover reaches `sec`. Call before every action to stay in sync. */
    at: async (sec) => {
      const wait = sec - now();
      if (wait > 0) await page.waitForTimeout(wait * 1000);
    },
    goto: safe("goto", async (url) => {
      log("goto", { label: url });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      for (const sel of COOKIE_SELECTORS) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 100 }).catch(() => false)) {
          await btn.click({ timeout: 500 }).catch(() => {});
          break;
        }
      }
    }),
    /** Move to an element and click it. `target`: selector string or Playwright Locator. */
    click: safe("click", async (target, label) => {
      const a = await approach(target);
      await page.waitForTimeout(250);
      log("click", { x: a.x, y: a.y, box: a.box, label });
      await a.el.click({ timeout: 5000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
    }),
    /** Click a field and type with human-like speed. Use process.env values for credentials. */
    type: safe("type", async (target, text, label) => {
      const a = await approach(target);
      log("type", { x: a.x, y: a.y, box: a.box, label });
      await a.el.click({ timeout: 5000 });
      await a.el.pressSequentially(String(text), { delay: 70 });
    }),
    /** Point at an element (cursor + highlight box in the final video) without clicking. */
    highlight: safe("highlight", async (target, label) => {
      const a = await approach(target);
      log("highlight", { x: a.x, y: a.y, box: a.box, label });
    }),
    /** Smooth scroll by `dy` CSS pixels (negative = up). */
    scroll: safe("scroll", async (dy) => {
      log("scroll", { label: String(dy) });
      const steps = Math.max(8, Math.round(Math.abs(dy) / 40));
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dy / steps);
        await page.waitForTimeout(25);
      }
    }),
    press: safe("press", async (key) => page.keyboard.press(key)),
  };
}
