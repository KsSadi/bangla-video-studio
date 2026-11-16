// Playwright recording helper used by generated projects/<id>/record.mjs scripts.
// The recording timeline equals the voiceover timeline: call `await h.at(seconds)` before each action.
//
// Self-healing (on unless SELF_HEAL=0):
//   1. If the requested element is not found, the helper tries smart fallbacks built from the target's text/label:
//      getByRole (button/link/tab/...), getByLabel, getByPlaceholder, getByText, getByTitle, getByAltText, and finally a
//      fuzzy text match over every visible interactive element. A healed action is logged as `healed`.
//   2. If everything fails the action is skipped (the recording still finishes) and the error, the URL, a screenshot and
//      the page's accessibility snapshot are written to <outDir>/failures.json. The studio shows that to `claude -p`,
//      which patches the broken selectors once before the recording is retried.
import { chromium } from "playwright";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const VIEWPORT = { width: 1280, height: 720 };
const SELF_HEAL = process.env.SELF_HEAL !== "0";

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

// ------------------------------------------------------------------ self-healing locators
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ROLE_WORDS = new Set(["button", "link", "textbox", "checkbox", "tab", "menuitem", "heading", "internal"]);

/** Words a human would use for this element: the label, and every quoted string / regex in the locator description. */
export function hintsFrom(target, label) {
  const out = [];
  const add = (t) => {
    const v = String(t ?? "").replace(/\\(.)/g, "$1").replace(/\s+/g, " ").trim();
    if (v.length >= 2 && v.length <= 60 && !ROLE_WORDS.has(v.toLowerCase()) && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  };
  add(label);
  const d = typeof target === "string" ? target : String(target);
  for (const m of d.matchAll(/"((?:\\.|[^"\\])+)"|'((?:\\.|[^'\\])+)'/g)) add(m[1] ?? m[2]);
  for (const m of d.matchAll(/\/((?:\\.|[^/\\])+)\/[a-z]*/g)) add(m[1]);
  for (const m of d.matchAll(/has-text\(["']([^"']+)["']\)|text=([^\]>]+)/g)) add(m[1] ?? m[2]);
  for (const m of d.matchAll(/(?:#|\[(?:name|id|placeholder|aria-label)=["']?)([A-Za-z0-9_-]{2,40})/g)) add(m[1].replace(/[-_]+/g, " "));
  return out.slice(0, 4);
}

const strategies = (page, hint) => {
  const re = new RegExp(escRe(hint), "i");
  return [
    ["role=button", () => page.getByRole("button", { name: re })],
    ["role=link", () => page.getByRole("link", { name: re })],
    ["role=tab", () => page.getByRole("tab", { name: re })],
    ["role=menuitem", () => page.getByRole("menuitem", { name: re })],
    ["role=textbox", () => page.getByRole("textbox", { name: re })],
    ["role=checkbox", () => page.getByRole("checkbox", { name: re })],
    ["label", () => page.getByLabel(re)],
    ["placeholder", () => page.getByPlaceholder(re)],
    ["text", () => page.getByText(re)],
    ["title", () => page.getByTitle(re)],
    ["alt", () => page.getByAltText(re)],
  ];
};

/** Last resort: score every visible interactive element by text similarity to the hints and mark the best one. */
async function fuzzyFind(page, hints) {
  const found = await page
    .evaluate((hs) => {
      const norm = (s) => String(s || "").toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
      const lev = (a, b) => {
        if (a === b) return 0;
        const m = a.length, n = b.length;
        if (!m || !n) return Math.max(m, n);
        let prev = Array.from({ length: n + 1 }, (_, j) => j);
        for (let i = 1; i <= m; i++) {
          const cur = [i];
          for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
          prev = cur;
        }
        return prev[n];
      };
      const sim = (text, hint) => {
        const a = norm(text), b = norm(hint);
        if (!a || !b) return 0;
        if (a === b) return 1;
        if (a.includes(b) || b.includes(a)) return 0.6 + 0.4 * (Math.min(a.length, b.length) / Math.max(a.length, b.length));
        const ta = new Set(a.split(" ")), tb = new Set(b.split(" "));
        const inter = [...ta].filter((x) => tb.has(x)).length;
        const jac = inter / (ta.size + tb.size - inter);
        const ed = 1 - lev(a.slice(0, 40), b.slice(0, 40)) / Math.max(Math.min(a.length, 40), Math.min(b.length, 40));
        return Math.max(jac, ed * 0.9);
      };
      const els = [...document.querySelectorAll('a,button,input,textarea,select,summary,label,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],h1,h2,h3')].filter((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && st.visibility !== "hidden" && st.display !== "none";
      });
      document.querySelectorAll("[data-studio-fuzzy]").forEach((e) => e.removeAttribute("data-studio-fuzzy"));
      let best = null, bestScore = 0;
      for (const el of els) {
        const texts = [el.innerText, el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("title"), el.getAttribute("value"), el.getAttribute("name"), el.id];
        for (const t of texts) for (const h of hs) {
          const s = sim(t, h);
          if (s > bestScore) { bestScore = s; best = el; }
        }
      }
      if (best && bestScore >= 0.55) {
        best.setAttribute("data-studio-fuzzy", "1");
        return { score: Math.round(bestScore * 100) / 100, text: norm(best.innerText || best.getAttribute("aria-label") || best.id).slice(0, 40) };
      }
      return null;
    }, hints)
    .catch(() => null);
  return found ? { ...found, locator: page.locator('[data-studio-fuzzy="1"]').first() } : null;
}

/**
 * @param {{ url: string, outDir: string, duration: number }} opts  duration = voiceover length in seconds
 * @param {(page: import('playwright').Page, h: ReturnType<typeof makeHelpers>) => Promise<void>} script
 */
export async function record({ url, outDir, duration }, script) {
  mkdirSync(outDir, { recursive: true });
  rmSync(path.join(outDir, "failures.json"), { force: true });
  rmSync(path.join(outDir, "failures"), { recursive: true, force: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: outDir, size: VIEWPORT }, // must equal the viewport or the capture is letterboxed
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const t0 = Date.now();
  const events = [];
  const failures = [];
  const heals = [];
  const h = makeHelpers(page, t0, events, { outDir, failures, heals });
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
  if (failures.length) writeFileSync(path.join(outDir, "failures.json"), JSON.stringify(failures, null, 2));
  console.log(`[recorder] done: ${events.length} events, ${heals.length} healed, ${failures.length} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function makeHelpers(page, t0, events, ctx) {
  const now = () => (Date.now() - t0) / 1000;
  const loc = (target) => (typeof target === "string" ? page.locator(target) : target).first();
  const log = (type, extra = {}) => events.push({ t: Number(now().toFixed(2)), type, vw: VIEWPORT.width, vh: VIEWPORT.height, ...extra });
  let mouse = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

  /** Find the element: the requested locator first, then (when self-healing) smart fallbacks. */
  const resolve = async (target, label, action) => {
    const primary = loc(target);
    try {
      await primary.waitFor({ state: "visible", timeout: 2500 }); // short: a missing element must not push later actions out of sync
      return primary;
    } catch (err) {
      if (!SELF_HEAL) throw err;
    }
    const hints = hintsFrom(target, label);
    for (const hint of hints) {
      for (const [how, make] of strategies(page, hint)) {
        const l = make().first();
        if (await l.isVisible().catch(() => false)) {
          console.error(`[recorder] healed ${action} "${hint}" via ${how}`);
          ctx.heals.push({ action, label: label ?? hint, via: how, hint });
          return l;
        }
      }
    }
    if (hints.length) {
      const f = await fuzzyFind(page, hints);
      if (f) {
        console.error(`[recorder] healed ${action} "${hints[0]}" via fuzzy match "${f.text}" (${f.score})`);
        ctx.heals.push({ action, label: label ?? hints[0], via: "fuzzy", hint: f.text, score: f.score });
        return f.locator;
      }
    }
    throw new Error(`element not found: ${String(typeof target === "string" ? target : target).slice(0, 160)}`);
  };

  /** Scroll the element into view, glide the cursor to it, return its centre + box. */
  const approach = async (target, label, action) => {
    const el = await resolve(target, label, action);
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    if (!b) throw new Error("no bounding box");
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y, { steps: Math.max(12, Math.round(Math.hypot(x - mouse.x, y - mouse.y) / 18)) });
    mouse = { x, y };
    return { el, x: Math.round(x), y: Math.round(y), box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } };
  };

  /** Keep the error, URL, screenshot and accessibility snapshot so Claude can patch the selector. */
  const captureFailure = async (action, args, labelIndex, err) => {
    const n = ctx.failures.length + 1;
    let aria = "";
    try {
      aria = await page.locator("body").ariaSnapshot({ timeout: 3000 });
    } catch {
      /* page may be closed or blank */
    }
    let screenshot;
    try {
      mkdirSync(path.join(ctx.outDir, "failures"), { recursive: true });
      await page.screenshot({ path: path.join(ctx.outDir, "failures", `f${n}.png`), timeout: 3000 });
      screenshot = `failures/f${n}.png`;
    } catch {
      /* optional */
    }
    const target = args[0];
    ctx.failures.push({
      n,
      t: Number(now().toFixed(2)),
      action,
      label: labelIndex >= 0 && typeof args[labelIndex] === "string" ? args[labelIndex] : undefined,
      target: typeof target === "string" ? target : target && typeof target === "object" ? String(target) : undefined,
      typed: action === "type" ? "(text hidden)" : undefined, // never store what was typed: it can be a password
      error: String(err?.message ?? err).split("\n")[0].slice(0, 300),
      url: page.url(),
      aria: aria.slice(0, 6000),
      screenshot,
    });
  };

  const safe = (name, fn, labelIndex = -1) => async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[recorder] ${name} skipped: ${String(err?.message ?? err).split("\n")[0]}`);
      await captureFailure(name, args, labelIndex, err);
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
    click: safe(
      "click",
      async (target, label) => {
        const a = await approach(target, label, "click");
        await page.waitForTimeout(250);
        log("click", { x: a.x, y: a.y, box: a.box, label });
        await a.el.click({ timeout: 5000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
      },
      1,
    ),
    /** Click a field and type with human-like speed. Use process.env values for credentials. */
    type: safe(
      "type",
      async (target, text, label) => {
        const a = await approach(target, label, "type");
        log("type", { x: a.x, y: a.y, box: a.box, label });
        await a.el.click({ timeout: 5000 });
        await a.el.pressSequentially(String(text), { delay: 70 });
      },
      2,
    ),
    /** Point at an element (cursor + highlight box in the final video) without clicking. */
    highlight: safe(
      "highlight",
      async (target, label) => {
        const a = await approach(target, label, "highlight");
        log("highlight", { x: a.x, y: a.y, box: a.box, label });
      },
      1,
    ),
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
