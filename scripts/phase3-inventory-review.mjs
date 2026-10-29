import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const evidence = process.env.P3_EVIDENCE_DIR || "docs/phase3/integration";
const { chromium } = require(process.env.P3_PLAYWRIGHT_MODULE || "playwright");
const fixtures = JSON.parse(await readFile(path.join(process.env.P3_STATE_DIR, process.env.P3_STAFF_FILE || "staff.json"), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.P3_CHROME_EXECUTABLE || undefined, headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], checks = [];
page.on("pageerror", e => errors.push(e.message));
try {
  const result = await context.request.post((process.env.P3_BASE_URL || "http://localhost:3003") + "/api/auth/sign-in/email", { headers: { origin: (process.env.P3_BASE_URL || "http://localhost:3003") }, data: { email: fixtures.staff[0].email, password: fixtures.staff[0].password } });
  assert.equal(result.status(), 200);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal((await page.goto((process.env.P3_BASE_URL || "http://localhost:3003") + "/admin/inventory", { waitUntil: "networkidle" })).status(), 200);
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const region = document.querySelector(".inventory-table-region");
      region.focus();
      return { pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, focused: document.activeElement === region, tableWidth: region.querySelector("table").getBoundingClientRect().width, regionWidth: region.clientWidth };
    });
    assert.equal(geometry.pageOverflow, false);
    assert.equal(geometry.focused, true);
    assert.ok(geometry.tableWidth >= 999);
    await page.addScriptTag({ path: process.env.P3_AXE_PATH || require.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => ({ id: v.id, impact: v.impact })));
    assert.deepEqual(violations, []);
    await page.screenshot({ path: `${evidence}/screenshots/pass2-ar-admin-inventory-${width}.png`, fullPage: true });
    checks.push({ width, geometry, violations, pass: true });
  }
  assert.deepEqual(errors, []);
  await writeFile(evidence + "/inventory-final-review.json", JSON.stringify({ productionMode: true, checks, errors }, null, 2) + "\n");
  console.log("PASS final inventory: three sizes, focus, overflow and axe");
} finally { await browser.close(); }
