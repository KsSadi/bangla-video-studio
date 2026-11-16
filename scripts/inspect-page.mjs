// Dump the interactive elements of a page so Claude can write real selectors.
// Usage: node scripts/inspect-page.mjs <url> <out.json>
// ponytail: first page only (no login). Later pages rely on role/text locators in record.mjs.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { VIEWPORT } from "./recorder.mjs";

const [url, out] = process.argv.slice(2);
if (!/^https?:\/\//.test(url ?? "") || !out) {
  console.error("usage: node scripts/inspect-page.mjs <http(s) url> <out.json>");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

const map = await page.evaluate(() => {
  const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const els = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], h1, h2, h3')];
  return {
    title: document.title,
    url: location.href,
    pageHeight: document.documentElement.scrollHeight,
    elements: els
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || undefined,
          type: el.getAttribute("type") || undefined,
          id: el.id || undefined,
          name: el.getAttribute("name") || undefined,
          text: clean(el.innerText || el.value) || undefined,
          placeholder: el.getAttribute("placeholder") || undefined,
          ariaLabel: el.getAttribute("aria-label") || undefined,
          href: el.getAttribute("href")?.slice(0, 120) || undefined,
          y: Math.round(r.top + scrollY),
        };
      })
      .filter(Boolean)
      .slice(0, 150),
  };
});

writeFileSync(out, JSON.stringify(map, null, 2));
console.log(`[inspect] ${map.elements.length} elements from ${map.url}`);
await browser.close();
