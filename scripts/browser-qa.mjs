import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3001";
const out = process.env.QA_OUT || ".taste-skill/browser-qa";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [],
  failures = [],
  checks = [],
  audits = [],
  metrics = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400 && !response.url().includes("favicon.ico"))
    failures.push({ url: response.url(), status: response.status() });
});
async function check(name, work) {
  try {
    await work();
    checks.push({ name, pass: true });
    console.log("PASS " + name);
  } catch (error) {
    checks.push({ name, pass: false, error: String(error) });
    console.log("FAIL " + name + ": " + error.message);
  }
  await writeFile(
    out + "/report.json",
    JSON.stringify({ base, checks, metrics, audits, errors, failures }, null, 2),
  );
}
async function ready() {
  await page.evaluate(() => document.fonts.ready);
  await page.locator("h1").waitFor();
}
async function audit(label) {
  await page.addScriptTag({
    path: "node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.min.js",
  });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
    });
    return {
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      incomplete: r.incomplete.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    };
  });
  audits.push({ label, ...result });
  assert.equal(
    result.violations.length,
    0,
    label + " accessibility violations: " + result.violations.map((v) => v.id).join(", "),
  );
}
async function capture(label) {
  const modalOpen = (await page.locator("dialog[open]").count()) > 0;
  await page.evaluate(async () => {
    if (document.querySelector("dialog[open]")) return;
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 100));
      // Photograph a fully loaded screen, as a shopper who pauses to browse sees it.
      await Promise.all(
        [...document.images]
          .filter((image) => {
            const rect = image.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < innerHeight;
          })
          .map((image) => image.decode().catch(() => {})),
      );
    }
    scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + "/" + label + ".png", fullPage: !modalOpen });
  const m = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    width: innerWidth,
    overflow: document.documentElement.scrollWidth - innerWidth,
    broken: [...document.images].filter((i) => i.complete && !i.naturalWidth).map((i) => i.src),
    unloaded: [...document.images].filter((i) => !i.complete).map((i) => i.src),
    hero: document.querySelector(".hero-photograph")?.getBoundingClientRect().toJSON(),
    offenders: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
      })
      .slice(0, 8)
      .map((el) => ({ tag: el.tagName, cls: el.className })),
  }));
  metrics.push({ label, ...m });
  assert.equal(m.overflow, 0, "horizontal overflow at " + label);
  assert.equal(m.broken.length, 0, "broken image at " + label);
  if (!modalOpen) assert.equal(m.unloaded.length, 0, "unloaded image at " + label);
}
const raw = JSON.parse(await readFile("sprtaya-kanaka-assets/بيانات/products.json", "utf8"));
const hero = raw.find((p) => p.id === "1bfab0186a7c");
const slug = hero.url.split("/").pop();
for (const locale of ["ar", "en"]) {
  for (const width of [390, 768, 1440]) {
    await check(`${locale} homepage ${width}px`, async () => {
      await page.setViewportSize({
        width,
        height: width === 390 ? 844 : width === 768 ? 1024 : 900,
      });
      await page.goto(base + "/" + locale);
      await ready();
      assert.equal(await page.locator("html").getAttribute("dir"), locale === "ar" ? "rtl" : "ltr");
      await capture(`${locale}-home-${width}`);
      await audit(`${locale}-home-${width}`);
    });
  }
}
await check("hero switches real product photograph and destination", async () => {
  await page.goto(base + "/ar");
  await ready();
  const original = await page.locator(".hero-photo").getAttribute("src");
  await page.locator(".hero-choices button").nth(1).click();
  assert.notEqual(await page.locator(".hero-photo").getAttribute("src"), original);
  assert.equal(
    await page.locator(".hero-choices button").nth(1).getAttribute("aria-pressed"),
    "true",
  );
  await Promise.all([page.waitForURL(/\/ar\/products\//), page.locator(".hero-caption a").click()]);
  await ready();
  assert.match(page.url(), /\/ar\/products\//);
});
await check("search dialog keyboard containment, Escape and focus restoration", async () => {
  await page.goto(base + "/ar");
  await ready();
  const trigger = page
    .locator(".header-actions")
    .getByRole("button", { name: "البحث", exact: true });
  await trigger.click();
  await page.locator("dialog[open]").waitFor();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement.closest("dialog")), true);
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
});
await check("search form returns Arabic matches", async () => {
  await page.locator(".header-actions").getByRole("button", { name: "البحث", exact: true }).click();
  await page.locator("#header-search").fill("سبرتاية");
  await Promise.all([
    page.waitForURL(/\/ar\/search\?q=/),
    page.locator("#header-search").press("Enter"),
  ]);
  await ready();
  assert.match(page.url(), /\/ar\/search\?q=/);
  assert.ok((await page.locator(".product-card").count()) > 0);
});
await check("English search finds translated collection terms", async () => {
  await page.goto(base + "/en/search?q=coffee+sets");
  await ready();
  assert.ok((await page.locator(".product-card").count()) > 0);
  await audit("en-search");
});
await check("empty search recovery", async () => {
  await page.goto(base + "/ar/search?q=unlikely-no-match-93746");
  await ready();
  assert.equal(await page.locator(".product-card").count(), 0);
  assert.ok((await page.locator(".empty-state a").count()) > 0);
  await capture("ar-search-empty-1440");
  await audit("ar-search-empty");
});
await check("catalog filtering and sort persist in URL", async () => {
  await page.goto(base + "/ar/products");
  await ready();
  await page.locator("#category-filter").selectOption("atkm-kho");
  await page.locator("#sort-filter").selectOption("name-asc");
  await Promise.all([page.waitForURL(/category=atkm-kho/), page.locator(".filter-submit").click()]);
  await ready();
  const url = new URL(page.url());
  assert.equal(url.searchParams.get("category"), "atkm-kho");
  assert.equal(url.searchParams.get("sort"), "name-asc");
  assert.equal(await page.locator(".product-card").count(), 10);
  const names = await page.locator(".product-card .product-name").allTextContents();
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b, "ar")),
  );
  await capture("ar-products-filtered-1440");
  await audit("ar-products-filtered");
});
await check("pagination preserves sort and page", async () => {
  await page.goto(base + "/ar/products?sort=name-desc");
  await ready();
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get("page") === "2"),
    page
      .getByRole("navigation", { name: "التنقل بين الصفحات" })
      .getByRole("link", { name: "التالي", exact: true })
      .click(),
  ]);
  await ready();
  assert.equal(new URL(page.url()).searchParams.get("page"), "2");
  assert.equal(new URL(page.url()).searchParams.get("sort"), "name-desc");
  assert.equal(await page.locator(".product-card").count(), 24);
});
await check("language switch preserves product route and query", async () => {
  await page.goto(base + "/ar/products?category=atkm-kho&sort=name-desc&page=1");
  await ready();
  await page.locator(".header-actions .language-link").click();
  await ready();
  assert.match(page.url(), /\/en\/products\?/);
  assert.equal(new URL(page.url()).searchParams.get("category"), "atkm-kho");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(await page.locator("html").getAttribute("dir"), "ltr");
});
await check("gallery thumbnails, navigation and honest commerce state", async () => {
  await page.goto(base + "/ar/products/" + slug);
  await ready();
  const image = await page.locator(".gallery-main img").getAttribute("src");
  const counter = await page.locator(".gallery-index").boundingBox();
  const controls = await page.locator(".gallery-controls").boundingBox();
  assert.ok(counter && controls);
  assert.ok(
    counter.x + counter.width <= controls.x || controls.x + controls.width <= counter.x,
    "gallery counter must not overlap navigation",
  );
  await page.locator(".gallery-thumb").nth(1).click();
  assert.notEqual(await page.locator(".gallery-main img").getAttribute("src"), image);
  await page.getByRole("button", { name: "الصورة السابقة", exact: true }).click();
  assert.equal(await page.locator(".gallery-thumb").nth(0).getAttribute("aria-pressed"), "true");
  assert.ok((await page.locator('.product-actions a[href="tel:+201142800111"]').count()) > 0);
  assert.ok((await page.locator(".related-section .product-card").count()) > 0);
  await capture("ar-product-1440");
  await audit("ar-product");
});
await check("cart and account give clear non-transactional states", async () => {
  await page.getByRole("button", { name: "حقيبة التسوق", exact: true }).click();
  assert.match(await page.locator("dialog").innerText(), /غير متاحين/);
  await audit("ar-cart-dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "الحساب", exact: true }).click();
  assert.match(await page.locator("dialog").innerText(), /غير متاحة/);
  await page.keyboard.press("Escape");
});
await check("mobile menu closes on category navigation", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/ar");
  await ready();
  await page.getByRole("button", { name: "القائمة", exact: true }).click();
  await capture("ar-menu-390");
  await audit("ar-mobile-menu");
  await Promise.all([
    page.waitForURL(/\/collections\//),
    page.locator("dialog .dialog-links a").nth(1).click(),
  ]);
  await ready();
  assert.match(page.url(), /\/collections\//);
  assert.equal(await page.locator("dialog[open]").count(), 0);
});
for (const locale of ["ar", "en"])
  for (const route of [
    "products",
    "collections",
    "collections/atkm-kho",
    "products/" + slug,
    "about",
    "wholesale",
    "custom-orders",
    "contact",
    "policies",
  ]) {
    await check(`${locale}/${route} mobile route & accessibility`, async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const response = await page.goto(base + "/" + locale + "/" + route);
      assert.equal(response.status(), 200);
      await ready();
      await capture(`${locale}-${route.replaceAll("/", "-")}-390`);
      await audit(`${locale}/${route}-390`);
    });
  }
await check("reduced motion keeps content visible and animations stopped", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base + "/ar");
  await ready();
  assert.equal(
    await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === "running").length,
    ),
    0,
  );
  await capture("ar-reduced-motion-390");
});
await check("no-script homepage retains catalog navigation", async () => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const p = await context.newPage();
  await p.goto(base + "/ar");
  assert.equal(await p.locator("h1").count(), 1);
  assert.ok((await p.locator(".category-nav a").count()) > 0);
  assert.ok((await p.locator(".product-card a").count()) > 0);
  await context.close();
});
await check("not-found recovery is noindex; invalid locale returns 404", async () => {
  const p = await page.request.get(base + "/ar/products/does-not-exist");
  // Next.js retains HTTP 200 once the loading boundary has begun streaming.
  // Its documented notFound contract is recovery UI plus robots=noindex.
  assert.ok([200, 404].includes(p.status()));
  const html = await p.text();
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /This page is unavailable/);
  const l = await page.request.get(base + "/fr");
  assert.equal(l.status(), 404);
});
await check("no browser exceptions or failed image/script requests", async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
});
await writeFile(
  out + "/report.json",
  JSON.stringify({ base, checks, metrics, audits, errors, failures }, null, 2),
);
console.log(
  JSON.stringify(
    {
      passed: checks.filter((c) => c.pass).length,
      failed: checks.filter((c) => !c.pass).length,
      audits: audits.length,
      violations: audits.reduce((n, a) => n + a.violations.length, 0),
    },
    null,
    2,
  ),
);
await browser.close();
if (checks.some((c) => !c.pass)) process.exitCode = 1;
