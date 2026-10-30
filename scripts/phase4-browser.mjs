import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { getDatabase } from "../src/lib/server/database";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright"),
  base = "http://localhost:3007",
  state = process.env.P3_STATE_DIR;
const file = path.join(state, "staff.json"),
  fixtures = JSON.parse(await readFile(file, "utf8")),
  data = JSON.parse(await readFile(path.join(state, "report-fixture.json"), "utf8"));
const browser = await chromium.launch({
    executablePath: process.env.P3_CHROME_EXECUTABLE,
    headless: true,
  }),
  checks = [],
  audits = [],
  errors = [],
  contexts = [];
await mkdir("docs/phase4/screenshots", { recursive: true });
async function check(name, run) {
  try {
    await run();
    checks.push({ name, pass: true });
    console.log("PASS " + name);
  } catch (e) {
    checks.push({ name, pass: false, error: e.message });
    throw e;
  } finally {
    await writeFile(
      "docs/phase4/browser-evidence.json",
      JSON.stringify({ productionMode: true, checks, audits, errors }, null, 2) + "\n",
    );
  }
}
async function session(index) {
  const c = await browser.newContext({
    viewport: { width: 390, height: 900 },
    extraHTTPHeaders: {
      "x-forwarded-for":
        "198.18." + Math.floor(Math.random() * 255) + "." + (1 + Math.floor(Math.random() * 254)),
    },
  });
  contexts.push(c);
  const p = await c.newPage(),
    a = fixtures.staff[index];
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/admin/login");
  await p.getByLabel("البريد الإلكتروني", { exact: true }).fill(a.email);
  await p.getByLabel("كلمة المرور", { exact: true }).fill(a.password);
  await p.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await p.waitForURL(/\/admin(?:\/password)?$/);
  if (p.url().endsWith("/admin/password")) {
    const next = randomBytes(24).toString("base64url");
    await p.getByLabel("كلمة المرور الحالية").fill(a.password);
    await p.getByLabel("كلمة المرور الجديدة", { exact: true }).fill(next);
    await p.getByLabel("تأكيد كلمة المرور").fill(next);
    await p.getByRole("button", { name: "تغيير كلمة المرور", exact: true }).click();
    await p.waitForURL(base + "/admin");
    a.password = next;
    a.forcePasswordChange = false;
    await writeFile(file, JSON.stringify(fixtures, null, 2), { mode: 0o600 });
  }
  return { c, p };
}
let owner, manager;
try {
  await check("anonymous and manager report access is rejected", async () => {
    const guest = await browser.newContext();
    contexts.push(guest);
    assert.equal(
      (
        await guest.request.get(base + "/api/admin/reports?start=" + data.day + "&end=" + data.day)
      ).status(),
      403,
    );
    manager = await session(1);
    assert.equal(
      (
        await manager.c.request.get(
          base + "/api/admin/reports?start=" + data.day + "&end=" + data.day,
        )
      ).status(),
      403,
    );
  });
  await check("valid customer session cannot read owner reports", async () => {
    const customer = await browser.newContext();
    contexts.push(customer);
    const email = "report-" + randomBytes(10).toString("hex") + "@factory.invalid";
    const password = "Local-" + randomBytes(20).toString("hex");
    const signUp = await customer.request.post(base + "/api/customer-auth/sign-up/email", {
      headers: { origin: base },
      data: { name: "Synthetic customer", email, password },
    });
    assert.equal(signUp.status(), 200);
    const db = getDatabase();
    try {
      await db.customerUser.update({ where: { email }, data: { emailVerified: true } });
    } finally {
      await db.$disconnect();
    }
    const signIn = await customer.request.post(base + "/api/customer-auth/sign-in/email", {
      headers: { origin: base },
      data: { email, password },
    });
    assert.equal(signIn.status(), 200);
    const customerSession = await customer.request.get(base + "/api/customer-auth/get-session");
    assert.equal(customerSession.status(), 200);
    assert.equal((await customerSession.json()).user.email, email);
    const denied = await customer.request.get(
      base + "/api/admin/reports?start=" + data.day + "&end=" + data.day,
    );
    assert.equal(denied.status(), 403);
    assert.doesNotMatch(await denied.text(), /collected|outstanding|currencies/);
  });
  await check(
    "tampered cookie, forged identity and malformed authorization do not grant access",
    async () => {
      const guest = await browser.newContext();
      contexts.push(guest);
      const response = await guest.request.get(
        base + "/api/admin/reports?start=" + data.day + "&end=" + data.day,
        {
          headers: {
            cookie: "better-auth.session_token=tampered",
            authorization: "Bearer invalid",
            "x-owner-id": fixtures.staff[0].id,
          },
        },
      );
      assert.equal(response.status(), 403);
      assert.doesNotMatch(await response.text(), /collected|outstanding|currencies/);
    },
  );
  await check("clear previous synthetic owner reporting window", async () => {
    const { createHash } = await import("node:crypto");
    const key = "p4-report:" + createHash("sha256").update(fixtures.staff[0].id).digest("hex");
    const db = getDatabase();
    try {
      await db.authRateLimit.deleteMany({ where: { key } });
    } finally {
      await db.$disconnect();
    }
  });
  await check("owner API returns correct synthetic values with no customer details", async () => {
    owner = await session(0);
    const r = await owner.c.request.get(
      base + "/api/admin/reports?start=" + data.day + "&end=" + data.day,
    );
    assert.equal(r.status(), 200);
    const body = await r.json();
    assert.equal(body.totalOrders, data.orders);
    assert.equal(body.currencies[0].collected, data.collected);
    assert.equal(body.currencies[0].outstanding, data.outstanding);
    assert.equal(body.products[0].units, 2);
    assert.equal(body.daily[0].orders, 2);
    assert.equal(body.daily[0].currencies[0].collected, data.collected);
    assert.doesNotMatch(JSON.stringify(body), /Synthetic local fixture/);
    assert.match(r.headers()["cache-control"], /no-store/);
    assert.equal(
      (
        await owner.c.request.get(
          base + "/api/admin/reports?start=" + data.day + "&end=" + data.day + "&business=other",
        )
      ).status(),
      400,
    );
  });
  await check(
    "owner can filter and switch language, including a genuinely empty period",
    async () => {
      await owner.p.goto(base + "/admin/reports", { waitUntil: "networkidle" });
      await owner.p.getByLabel("من", { exact: true }).fill(data.day);
      await owner.p.getByLabel("إلى", { exact: true }).fill(data.day);
      await owner.p.getByRole("button", { name: "عرض التقرير", exact: true }).click();
      await owner.p.getByText("قطعة اختبار اصطناعية", { exact: true }).waitFor();
      await owner.p.getByRole("button", { name: "English", exact: true }).click();
      await owner.p.getByText("Synthetic test piece", { exact: true }).waitFor();
      await owner.p.getByRole("heading", { name: "Daily orders and collections" }).waitFor();
      await owner.p.getByRole("heading", { name: "Collections by payment method" }).waitFor();
      await owner.p.getByRole("heading", { name: "Ready-made and made-to-order" }).waitFor();
      await owner.p.getByLabel("From", { exact: true }).fill("2026-01-01");
      await owner.p.getByLabel("To", { exact: true }).fill("2026-12-31");
      await owner.p.getByRole("button", { name: "Show report", exact: true }).click();
      await owner.p.getByText("Choose a valid period of at most 31 days.").waitFor();
      await owner.p.getByLabel("From", { exact: true }).fill("1901-01-01");
      await owner.p.getByLabel("To", { exact: true }).fill("1901-01-01");
      await owner.p.getByRole("button", { name: "Show report", exact: true }).click();
      await owner.p.getByText("No orders in this period.", { exact: true }).waitFor();
    },
  );
  await check(
    "suspending the existing owner session immediately blocks report access",
    async () => {
      const db = getDatabase();
      try {
        await db.adminUser.update({ where: { id: fixtures.staff[0].id }, data: { banned: true } });
        assert.equal(
          (
            await owner.c.request.get(
              base + "/api/admin/reports?start=" + data.day + "&end=" + data.day,
            )
          ).status(),
          403,
        );
      } finally {
        await db.adminUser.update({ where: { id: fixtures.staff[0].id }, data: { banned: false } });
        await db.$disconnect();
      }
    },
  );
  for (const pass of [1, 2])
    for (const width of [390, 768, 1440])
      for (const lang of ["ar", "en"])
        await check(`visual pass ${pass} ${lang} ${width}`, async () => {
          await owner.p.setViewportSize({ width, height: 900 });
          await owner.p.goto(base + "/admin/reports", { waitUntil: "networkidle" });
          if (lang === "en")
            await owner.p.getByRole("button", { name: "English", exact: true }).click();
          assert.equal(
            await owner.p.locator(`div[lang="${lang}"]`).getAttribute("dir"),
            lang === "ar" ? "rtl" : "ltr",
          );
          assert.ok(
            await owner.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          if (pass === 2) {
            await owner.p.getByLabel(lang === "ar" ? "من" : "From", { exact: true }).fill(data.day);
            await owner.p.getByLabel(lang === "ar" ? "إلى" : "To", { exact: true }).fill(data.day);
            await owner.p
              .getByRole("button", {
                name: lang === "ar" ? "عرض التقرير" : "Show report",
                exact: true,
              })
              .click();
            await owner.p
              .getByText(lang === "ar" ? "قطعة اختبار اصطناعية" : "Synthetic test piece", {
                exact: true,
              })
              .waitFor();
            assert.ok(
              await owner.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            );
            await owner.p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
            const violations = await owner.p.evaluate(async () =>
              (
                await window.axe.run(document, {
                  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
                })
              ).violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                nodes: v.nodes.map((n) => n.target),
              })),
            );
            audits.push({ lang, width, violations });
            assert.deepEqual(violations, []);
            await owner.p.screenshot({
              path: `docs/phase4/screenshots/reports-${lang}-${width}.png`,
              fullPage: true,
            });
          }
        });
  await check("expired owner session is rejected", async () => {
    const db = getDatabase();
    try {
      await db.authSession.updateMany({
        where: { userId: fixtures.staff[0].id },
        data: { expiresAt: new Date("2000-01-01T00:00:00Z") },
      });
      assert.equal(
        (
          await owner.c.request.get(
            base + "/api/admin/reports?start=" + data.day + "&end=" + data.day,
          )
        ).status(),
        403,
      );
    } finally {
      await db.$disconnect();
    }
    owner = await session(0);
  });
  await check("revoked owner session is rejected", async () => {
    const db = getDatabase();
    try {
      await db.authSession.deleteMany({ where: { userId: fixtures.staff[0].id } });
      assert.equal(
        (
          await owner.c.request.get(
            base + "/api/admin/reports?start=" + data.day + "&end=" + data.day,
          )
        ).status(),
        403,
      );
    } finally {
      await db.$disconnect();
    }
  });
  assert.deepEqual(errors, []);
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
