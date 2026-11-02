// Real local production server, synthetic accounts only. Never persist session cookies.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright");
const base = "http://localhost:3008",
  pass = process.env.P5_VISUAL_PASS || "1";
if (process.env.P5_WORKSTREAM !== "1" || process.env.P3_BASE_URL !== base)
  throw Error("Phase 5 local only");
const fixture = JSON.parse(await readFile(path.join(process.env.P3_STATE_DIR, "staff.json")));
const out = `${process.env.P5_UI_EVIDENCE_DIR || "docs/phase5"}/visual-pass-${pass}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({
  extraHTTPHeaders: { "x-forwarded-for": "198.18.50." + (10 + Number(pass)) },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const checks = [],
  audits = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function report() {
  await writeFile(out + "/review.json", JSON.stringify({ pass, checks, audits, errors }, null, 2));
}
try {
  const login = await context.request.post(base + "/api/auth/sign-in/email", {
    headers: { origin: base },
    data: { email: fixture.staff[0].email, password: fixture.staff[0].password },
  });
  assert.equal(login.status(), 200);
  const orderResponse = await context.request.get(base + "/api/admin/commerce");
  assert.equal(orderResponse.status(), 200);
  const orderData = await orderResponse.json();
  const customerResponse = await context.request.get(
    base + "/api/admin/commerce?resource=customers",
  );
  const customers = await customerResponse.json();
  const order = orderData.orders?.[0],
    customer = customers.customers?.[0];
  const screens = [
    ["dashboard", "/admin"],
    ["categories", "/admin/categories"],
    ["products", "/admin/products"],
    ["product-form", "/admin/products/new"],
    ["bulk-review", "/admin/products/review"],
    ["orders", "/admin/orders"],
    ["inventory", "/admin/inventory"],
    ["customers", "/admin/customers"],
    ["shipping-payments", "/admin/commerce-settings"],
    ["reports", "/admin/reports"],
    ["staff", "/admin/staff"],
    ["settings", "/admin/settings"],
    ["audit", "/admin/audit"],
  ];
  if (order) screens.push(["order-detail", "/admin/orders/" + order.id]);
  if (customer) screens.push(["customer-history", "/admin/customers/" + customer.id]);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const [name, url] of screens) {
      const response = await page.goto(base + url, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200, name);
      await page.locator("h1").waitFor();
      assert.equal(new URL(page.url()).pathname, url.split("?")[0], name + " unexpected redirect");
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
      );
      audits.push({ name, width, violations });
      await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
      checks.push({ name, width, status: response.status(), overflow });
      await report();
    }
    await page.goto(base + "/admin", { waitUntil: "networkidle" });
    assert.equal(
      await page.locator('a[aria-current="page"]:visible').count(),
      width > 1100 ? 1 : 0,
    );
    if (width <= 1100) {
      await page.locator(".admin-mobile-menu summary").click();
      assert.equal(await page.locator('a[aria-current="page"]:visible').count(), 1);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".admin-mobile-menu").getAttribute("open"), null);
      assert.equal(
        await page
          .locator(".admin-mobile-menu summary")
          .evaluate((e) => document.activeElement === e),
        true,
      );
    }
  }
  await page.goto(base + "/admin/reports", { waitUntil: "networkidle" });
  const english = page.getByRole("button", { name: "English", exact: true });
  if (await english.count()) {
    await english.click();
    assert.equal(await page.locator('[lang="en"][dir="ltr"]').getAttribute("dir"), "ltr");
  }
  assert.deepEqual(errors, []);
  assert.equal(checks.filter((c) => c.overflow).length, 0, "Page overflow recorded in review.json");
  assert.equal(
    audits.flatMap((a) => a.violations).length,
    0,
    "Accessibility violations recorded in review.json",
  );
  console.log(
    JSON.stringify({
      screens: checks.length,
      audits: audits.length,
      violations: 0,
      keyboardNavigation: "PASS",
      errors: errors.length,
    }),
  );
} finally {
  await report();
  await browser.close();
}
