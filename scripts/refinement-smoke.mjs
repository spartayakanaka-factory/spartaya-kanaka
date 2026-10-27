import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3002";
const out = ".taste-skill/refinement/refinement-smoke.json";
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const checks = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.stack || error.message));
try {
  for (const locale of ["ar", "en"]) {
    await page.goto(base + "/" + locale);
    const categories = await page
      .locator(".category-grid-compact > a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    assert.equal(categories.length, 8);
    assert.equal(new Set(categories).size, 8);
    const products = await page
      .locator(".featured-products .product-card-link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    assert.equal(products.length, 4);
    assert.equal(await page.locator(".contact-band form").count(), 0);
    assert.equal(await page.locator(".contact-band a").count(), 1);
    assert.equal(await page.locator(".contact-phone").getAttribute("href"), "tel:+201142800111");
    checks.push({
      name: locale + " genuine category/product counts and phone-only contact",
      pass: true,
    });
    for (const href of [...categories, ...products]) {
      const response = await page.goto(base + href);
      assert.equal(response.status(), 200, href);
      assert.equal(await page.locator("main h1").count(), 1, href);
      assert.equal(await page.locator('meta[name="robots"][content="noindex"]').count(), 0, href);
    }
    checks.push({
      name: locale + " all eight category and four featured product destinations",
      pass: true,
    });
    const route = products[0] + "?ref=footer#details";
    await page.goto(base + route);
    await page.locator(".footer-contact .language-link").click();
    const expected = route.replace(/^\/(ar|en)\//, locale === "ar" ? "/en/" : "/ar/");
    await page.waitForURL(base + expected);
    assert.equal(await page.locator("html").getAttribute("dir"), locale === "ar" ? "ltr" : "rtl");
    checks.push({
      name: locale + " footer language switch preserves product, query and anchor",
      pass: true,
    });
  }
  assert.deepEqual(errors, []);
} finally {
  await mkdir(".taste-skill/refinement", { recursive: true });
  await writeFile(out, JSON.stringify({ base, checks, errors }, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify({ passed: checks.length, errors: errors.length }));
