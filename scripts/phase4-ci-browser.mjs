// Synthetic production-mode HTTP acceptance in the exact Phase 4 CI target.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const u = new URL(process.env.DATABASE_URL || ""),
  base = process.env.P3_BASE_URL;
if (
  process.env.P4_WORKSTREAM !== "1" ||
  base !== "http://localhost:3007" ||
  u.hostname !== "127.0.0.1" ||
  u.port !== "33078" ||
  u.pathname !== "/sprtaya_phase4_disposable_local" ||
  u.username !== "sprtaya_phase4"
)
  throw Error("Exact isolated Phase 4 target required");
const require = createRequire(import.meta.url),
  { chromium } = require("playwright"),
  state = process.env.P3_STATE_DIR;
const staff = JSON.parse(await readFile(path.join(state, "extended-staff.json"), "utf8")).staff;
const fixture = JSON.parse(await readFile(path.join(state, "report-fixture.json"), "utf8"));
const evidence = process.env.P3_EVIDENCE_DIR,
  checks = [],
  audits = [];
if (!evidence) throw Error("Synthetic CI evidence directory required");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
    executablePath: process.env.P3_CHROME_EXECUTABLE || undefined,
    headless: true,
  }),
  contexts = [];
async function context() {
  const c = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-for":
        "198.18." + Math.floor(Math.random() * 255) + "." + (1 + Math.floor(Math.random() * 254)),
    },
  });
  contexts.push(c);
  return c;
}
async function login(index) {
  const c = await context(),
    response = await c.request.post(base + "/api/auth/sign-in/email", {
      headers: { origin: base },
      data: { email: staff[index].email, password: staff[index].password },
    });
  assert.equal(response.status(), 200);
  return c;
}
async function check(name, run) {
  await run();
  checks.push(name);
  console.log("PASS " + name);
}
try {
  const url = base + "/api/admin/reports?start=" + fixture.day + "&end=" + fixture.day;
  await check("anonymous and manager denied", async () => {
    const a = await context(),
      m = await login(1);
    assert.equal((await a.request.get(url)).status(), 403);
    assert.equal((await m.request.get(url)).status(), 403);
  });
  const owner = await login(0);
  await check("owner figures and privacy", async () => {
    const r = await owner.request.get(url);
    assert.equal(r.status(), 200);
    const x = await r.json();
    assert.equal(x.totalOrders, fixture.orders);
    assert.equal(x.currencies[0].collected, fixture.collected);
    assert.equal(x.currencies[0].outstanding, fixture.outstanding);
    assert.doesNotMatch(JSON.stringify(x), /Synthetic local fixture/);
    assert.match(r.headers()["cache-control"], /no-store/);
    assert.equal((await owner.request.get(url + "&business=forged")).status(), 400);
  });
  const page = await owner.newPage();
  page.setDefaultTimeout(20000);
  for (const width of [390, 768, 1440])
    for (const lang of ["ar", "en"])
      await check(`reports ${lang} ${width}`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base + "/admin/reports", { waitUntil: "networkidle" });
        if (lang === "en") await page.getByRole("button", { name: "English", exact: true }).click();
        await page.getByLabel(lang === "ar" ? "من" : "From", { exact: true }).fill(fixture.day);
        await page.getByLabel(lang === "ar" ? "إلى" : "To", { exact: true }).fill(fixture.day);
        await page
          .getByRole("button", { name: lang === "ar" ? "عرض التقرير" : "Show report", exact: true })
          .click();
        await page
          .getByText(lang === "ar" ? "قطعة اختبار اصطناعية" : "Synthetic test piece", {
            exact: true,
          })
          .waitFor();
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
        const violations = await page.evaluate(async () =>
          (
            await window.axe.run(document, {
              runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
            })
          ).violations.map((v) => v.id),
        );
        audits.push({ lang, width, violations });
        assert.deepEqual(violations, []);
      });
  await writeFile(
    path.join(evidence, "phase4-browser.json"),
    JSON.stringify({ checks, audits }, null, 2) + "\n",
  );
} catch {
  console.error("Phase 4 synthetic browser acceptance failed; private request details withheld.");
  process.exitCode = 1;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
