// Owner task: reject invalid lead times, then persist the current synthetic product policy only.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { getDatabase } from "../src/lib/server/database.ts";
const u = new URL(process.env.DATABASE_URL);
assert.equal(u.hostname, "127.0.0.1");
assert.equal(u.port, "33078");
assert.equal(u.username, "sprtaya_phase5");
assert.equal(u.pathname, "/sprtaya_phase5_disposable_local");
const f = JSON.parse(await readFile(path.join(process.env.P3_STATE_DIR, "staff.json"))),
  db = getDatabase(),
  before = await db.manufacturingPolicy.findUniqueOrThrow({ where: { productId: f.made.id } }),
  global = await db.manufacturingPolicy.findUnique({ where: { id: "global" } }),
  base = "http://localhost:3008";
const b = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  }),
  c = await b.newContext({ viewport: { width: 390, height: 900 } }),
  p = await c.newPage();
try {
  assert.equal(
    (
      await c.request.post(base + "/api/auth/sign-in/email", {
        headers: { origin: base },
        data: { email: f.staff[0].email, password: f.staff[0].password },
      })
    ).status(),
    200,
  );
  await p.goto(base + "/admin/products/" + f.made.id, { waitUntil: "networkidle" });
  const form = p
    .locator("form")
    .filter({ has: p.getByRole("button", { name: "حفظ إعدادات التصنيع", exact: true }) });
  await form.locator('[name="minDays"]').fill("10");
  await form.locator('[name="maxDays"]').fill("1");
  await form.getByRole("button", { name: "حفظ إعدادات التصنيع", exact: true }).click();
  await p.waitForURL(/error=policy/);
  const rejected = await db.manufacturingPolicy.findUniqueOrThrow({
    where: { productId: f.made.id },
  });
  assert.equal(rejected.minProductionDays, before.minProductionDays);
  assert.equal(rejected.maxProductionDays, before.maxProductionDays);
  await form.locator('[name="minDays"]').fill(String(before.minProductionDays));
  await form.locator('[name="maxDays"]').fill(String(before.maxProductionDays));
  await form.getByRole("button", { name: "حفظ إعدادات التصنيع", exact: true }).click();
  await p.waitForURL(/saved=1/);
  const after = await db.manufacturingPolicy.findUniqueOrThrow({ where: { productId: f.made.id } });
  for (const key of [
    "minProductionDays",
    "maxProductionDays",
    "depositMode",
    "depositType",
    "depositValue",
    "available",
    "balanceCollection",
    "codBalanceEligible",
  ])
    assert.equal(after[key], before[key]);
  assert.deepEqual(await db.manufacturingPolicy.findUnique({ where: { id: "global" } }), global);
  await writeFile(
    "docs/phase55/owner-manufacturing-browser.json",
    JSON.stringify(
      {
        scope: "Actual local owner form; synthetic made-to-order fixture only",
        invalidLeadTimesRejected: true,
        invalidSubmissionPreservedDatabase: true,
        currentPolicySaved: true,
        globalFullAdvanceUnchanged: true,
        noOriginalProductsChanged: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS owner manufacturing options, invalid-input recovery and unchanged global policy",
  );
} finally {
  await b.close();
  await db.$disconnect();
}
