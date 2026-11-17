// Read-only site scan: visit the start page (log in first when TUTORIAL_EMAIL / TUTORIAL_PASSWORD are set),
// then a few same-site pages from the navigation, and write a compact map (titles, headings, buttons, links, fields).
// Nothing is clicked except the login button. The AI turns this map into suggested tutorial steps.
// Usage: node scripts/explore-site.mjs <url> <out.json>
// ponytail: max 6 pages, nav links first, no form submits. Raise MAX_PAGES if sites need a deeper scan.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { VIEWPORT } from "./recorder.mjs";

const [url, out] = process.argv.slice(2);
if (!/^https?:\/\//.test(url ?? "") || !out) {
  console.error("usage: node scripts/explore-site.mjs <http(s) url> <out.json>");
  process.exit(1);
}
const MAX_PAGES = 6;
const SKIP = /log ?out|sign ?out|delete|remove|unsubscribe|\.(pdf|zip|png|jpe?g|gif|svg|mp4|docx?|xlsx?)(\?|$)/i;
const email = process.env.TUTORIAL_EMAIL || "";
const password = process.env.TUTORIAL_PASSWORD || "";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
const settle = async () => {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
};

async function summarize() {
  return page.evaluate(() => {
    const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    };
    const texts = (sel, n) => [...new Set([...document.querySelectorAll(sel)].filter(vis).map((e) => clean(e.innerText || e.value)).filter(Boolean))].slice(0, n);
    return {
      url: location.pathname + location.search,
      title: clean(document.title),
      headings: texts("h1, h2, h3", 8),
      buttons: texts('button, [role="button"], input[type="submit"]', 14),
      menu: texts('nav a, header a, aside a, [role="navigation"] a, [role="tab"], [role="menuitem"]', 16),
      fields: [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
        .filter(vis)
        .map((e) => clean(e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.getAttribute("name") || e.type))
        .filter(Boolean)
        .slice(0, 10),
    };
  });
}

async function login() {
  if (!email || !password) return false;
  const user = page.locator('input[type="email"], input[name*="email" i], input[name*="user" i], input[name*="mobile" i], input[placeholder*="email" i], input[placeholder*="mobile" i], input[type="text"]').first();
  const pass = page.locator('input[type="password"]').first();
  if (!(await pass.isVisible({ timeout: 4000 }).catch(() => false))) return false;
  await user.fill(email).catch(() => {});
  await pass.fill(password).catch(() => {});
  const btn = page.getByRole("button", { name: /log *in|sign *in|submit|continue/i }).first();
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) await btn.click().catch(() => {});
  else await pass.press("Enter").catch(() => {});
  await settle();
  return true;
}

const pages = [];
let loggedIn = false;
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await settle();
  pages.push(await summarize());
  loggedIn = await login();
  if (loggedIn) pages.push(await summarize());

  const origin = new URL(url).origin;
  const seen = new Set(pages.map((p) => p.url));
  const links = await page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)].map((a) => ({ href: a.href, text: (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40) }));
    return [...pick('nav a[href], header a[href], aside a[href], [role="navigation"] a[href]'), ...pick("a[href]")];
  });
  for (const l of links) {
    if (pages.length >= MAX_PAGES + (loggedIn ? 1 : 0)) break;
    let u;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    const key = u.pathname + u.search;
    if (u.origin !== origin || !/^https?:$/.test(u.protocol) || seen.has(key) || SKIP.test(l.text + " " + l.href)) continue;
    seen.add(key);
    try {
      await page.goto(u.href, { waitUntil: "domcontentloaded", timeout: 20000 });
      await settle();
      pages.push(await summarize());
    } catch {
      /* unreachable page: skip */
    }
  }
} finally {
  await browser.close();
}
writeFileSync(out, JSON.stringify({ start: url, loggedIn, pages }, null, 2));
console.log(`[explore] ${pages.length} page(s) scanned${loggedIn ? " (logged in)" : ""}`);
