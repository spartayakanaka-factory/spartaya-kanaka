import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3001";
const out = process.env.QA_OUT || ".taste-skill/refinement/round-1";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
const reports = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
for (const locale of ["ar", "en"])
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 });
    await page.goto(base + "/" + locale);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 100));
        await Promise.all(
          [...document.images]
            .filter((i) => {
              let r = i.getBoundingClientRect();
              return r.top < innerHeight && r.bottom > 0;
            })
            .map((i) => i.decode().catch(() => {})),
        );
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.waitForTimeout(250);
    const label = locale + "-" + width;
    await page.screenshot({ path: out + "/" + label + "-fold.png" });
    await page.screenshot({ path: out + "/" + label + "-page.png", fullPage: true });
    await page
      .locator(".category-section")
      .screenshot({ path: out + "/" + label + "-categories.png" });
    await page.locator(".contact-band").screenshot({ path: out + "/" + label + "-contact.png" });
    await page.locator(".site-footer").screenshot({ path: out + "/" + label + "-footer.png" });
    await page.addScriptTag({
      path: "node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.min.js",
    });
    const accessibility = await page.evaluate(async () => {
      let r = await axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
        },
      });
      return {
        violations: r.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        })),
        incomplete: r.incomplete.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        })),
      };
    });
    const metrics = await page.evaluate(() => {
      const rect = (s) => {
        let e = document.querySelector(s);
        return e ? Math.round(e.getBoundingClientRect().height) : 0;
      };
      return {
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        width: innerWidth,
        height: document.documentElement.scrollHeight,
        header: rect(".site-masthead") + rect(".category-nav"),
        categories: rect(".category-section"),
        categoryCount: document.querySelectorAll(".category-section .category-card").length,
        featuredCount: document.querySelectorAll(".product-section .product-card").length,
        footer: rect(".site-footer"),
        contact: rect(".contact-band"),
        overflow: document.documentElement.scrollWidth - innerWidth,
        unloaded: [...document.images].filter((i) => !i.complete || !i.naturalWidth).length,
      };
    });
    reports.push({ locale, width, ...metrics, ...accessibility });
    console.log(JSON.stringify(reports.at(-1)));
    await writeFile(out + "/report.json", JSON.stringify({ base, reports, errors }, null, 2));
  }
await browser.close();
if (errors.length || reports.some((r) => r.overflow || r.unloaded || r.violations.length))
  process.exitCode = 1;
