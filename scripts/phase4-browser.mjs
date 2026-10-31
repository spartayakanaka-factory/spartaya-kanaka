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
  } catch (error) {
    const detail =
      error instanceof assert.AssertionError && error.message.startsWith("product chart")
        ? error.message
        : "Check failed; request diagnostics withheld.";
    checks.push({ name, pass: false, error: detail });
    throw new Error("Browser check failed: " + name);
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
  await check("concurrent owner sessions share the report rate limit", async () => {
    const { createHash } = await import("node:crypto"),
      key = "p4-report:" + createHash("sha256").update(fixtures.staff[0].id).digest("hex"),
      db = getDatabase();
    const other = await session(0),
      observations = [];
    try {
      await db.authRateLimit.deleteMany({ where: { key } });
      for (let batch = 0; batch < 6; batch++)
        await Promise.all(
          Array.from({ length: 6 }, async (_, index) => {
            const day = (batch * 6 + index) % 2 ? "1901-01-01" : data.day;
            const started = performance.now(),
              response = await (index % 2 ? owner.c : other.c).request.get(
                base + "/api/admin/reports?start=" + day + "&end=" + day,
              );
            observations.push({
              status: response.status(),
              ms: Math.round(performance.now() - started),
            });
          }),
        );
      const successes = observations.filter((x) => x.status === 200).length,
        throttles = observations.filter((x) => x.status === 429).length;
      assert.equal(successes, 30);
      assert.equal(throttles, 6);
      const latencies = observations.map((x) => x.ms).sort((a, b) => a - b);
      await writeFile(
        "docs/phase4/concurrency-evidence.json",
        JSON.stringify(
          {
            requests: 36,
            concurrency: 6,
            ownerSessions: 2,
            successes,
            throttles,
            errors: 36 - successes - throttles,
            medianMs: latencies[Math.floor(latencies.length / 2)],
            p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await db.authRateLimit.deleteMany({ where: { key } });
      await db.$disconnect();
    }
  });
  await check("separate Node processes make authenticated report requests", async () => {
    const { spawn } = await import("node:child_process"),
      { createHash } = await import("node:crypto");
    const db = getDatabase(),
      key = "p4-report:" + createHash("sha256").update(fixtures.staff[0].id).digest("hex");
    try {
      await db.authRateLimit.deleteMany({ where: { key } });
      const cookie = (await owner.c.cookies()).map((c) => c.name + "=" + c.value).join("; ");
      const worker = () =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, ["scripts/phase4-http-worker.mjs"], {
            stdio: ["pipe", "pipe", "ignore"],
          });
          let output = "";
          child.stdout.on("data", (part) => {
            output += part.toString();
          });
          child.on("error", reject);
          child.on("exit", (code) => {
            if (code !== 0) return reject(Error("worker failed"));
            try {
              resolve(JSON.parse(output));
            } catch {
              reject(Error("invalid worker result"));
            }
          });
          child.stdin.end(
            JSON.stringify({
              url: base + "/api/admin/reports?start=" + data.day + "&end=" + data.day,
              cookie,
            }),
          );
        });
      const responses = (await Promise.all(Array.from({ length: 4 }, worker))).flat();
      assert.equal(responses.length, 12);
      assert.equal(responses.filter((x) => x.status === 200).length, 12);
      await writeFile(
        "docs/phase4/cross-process-http.json",
        JSON.stringify(
          { processes: 4, requests: 12, successes: 12, statuses: responses.map((x) => x.status) },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await db.authRateLimit.deleteMany({ where: { key } });
      await db.$disconnect();
    }
  });
  await check("missing limiter table rejects and recovery restores report access", async () => {
    const u = new URL(process.env.DATABASE_URL || "");
    assert.equal(u.pathname, "/sprtaya_phase4_disposable_local");
    assert.equal(u.hostname, "127.0.0.1");
    assert.equal(u.port, "33078");
    const db = getDatabase(),
      url = base + "/api/admin/reports?start=" + data.day + "&end=" + data.day;
    let moved = false;
    try {
      const existing =
        await db.$queryRaw`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='p4_rate_limit_outage_test'`;
      assert.equal(Number(existing[0].n), 0);
      await db.$executeRaw`RENAME TABLE auth_rate_limits TO p4_rate_limit_outage_test`;
      moved = true;
      const response = await owner.c.request.get(url, { timeout: 12000 });
      assert.ok([403, 500, 503].includes(response.status()));
      assert.doesNotMatch(await response.text(), /collected|outstanding|currencies/);
    } finally {
      if (moved) await db.$executeRaw`RENAME TABLE p4_rate_limit_outage_test TO auth_rate_limits`;
      await db.$disconnect();
    }
    assert.equal((await owner.c.request.get(url)).status(), 200);
  });
  await check("a blocked limiter query times out safely and recovers", async () => {
    const { createHash } = await import("node:crypto"),
      key = "p4-report:" + createHash("sha256").update(fixtures.staff[0].id).digest("hex"),
      db = getDatabase();
    const url = base + "/api/admin/reports?start=" + data.day + "&end=" + data.day;
    let unlock, ready;
    const hold = new Promise((resolve) => {
        unlock = resolve;
      }),
      locked = new Promise((resolve) => {
        ready = resolve;
      });
    const transaction = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM auth_rate_limits WHERE \`key\`=${key} FOR UPDATE`;
        ready();
        await hold;
      },
      { timeout: 15000 },
    );
    try {
      await locked;
      const response = await owner.c.request.get(url, { timeout: 12000 });
      assert.equal(response.status(), 503);
      assert.doesNotMatch(await response.text(), /collected|outstanding|currencies/);
    } finally {
      unlock();
      await transaction;
      await db.$disconnect();
    }
    assert.equal((await owner.c.request.get(url)).status(), 200);
  });
  await check(
    "database connection interrupted during report fails closed and recovers",
    async () => {
      const { createHash } = await import("node:crypto"),
        { execFile } = await import("node:child_process"),
        { promisify } = await import("node:util");
      const key = "p4-report:" + createHash("sha256").update(fixtures.staff[0].id).digest("hex"),
        db = getDatabase(),
        url = base + "/api/admin/reports?start=" + data.day + "&end=" + data.day;
      let unlock, ready;
      const hold = new Promise((resolve) => {
          unlock = resolve;
        }),
        locked = new Promise((resolve) => {
          ready = resolve;
        });
      const transaction = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM auth_rate_limits WHERE \`key\`=${key} FOR UPDATE`;
          ready();
          await hold;
        },
        { timeout: 15000 },
      );
      try {
        await locked;
        const request = owner.c.request.get(url, { timeout: 12000 });
        await promisify(execFile)("python3", ["scripts/phase4-interrupt-query.py"], {
          timeout: 5000,
        });
        const response = await request;
        assert.ok([500, 503].includes(response.status()));
        assert.doesNotMatch(await response.text(), /collected|outstanding|currencies/);
      } finally {
        unlock();
        await transaction;
        await db.$disconnect();
      }
      assert.equal((await owner.c.request.get(url)).status(), 200);
    },
  );
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
            const productRegion = owner.p.getByRole("region", {
              name: lang === "ar" ? "جدول المنتجات" : "Product table",
            });
            const dailyRegion = owner.p.getByRole("region", {
              name: lang === "ar" ? "الطلبات والتحصيل لكل يوم" : "Orders and collections by day",
            });
            await dailyRegion.focus();
            for (
              let i = 0;
              i < 12 && !(await productRegion.evaluate((e) => e === document.activeElement));
              i++
            )
              await owner.p.keyboard.press("Tab");
            assert.equal(await productRegion.evaluate((e) => e === document.activeElement), true);
            assert.notEqual(
              await productRegion.evaluate((e) => getComputedStyle(e).outlineStyle),
              "none",
            );
            assert.equal(await productRegion.getByRole("table").count(), 1);
            for (const heading of lang === "ar"
              ? [
                  "الطلبات والتحصيل اليومي",
                  "التحصيل حسب وسيلة الدفع",
                  "القطع الجاهزة والتصنيع",
                  "القطع الأكثر طلباً",
                ]
              : [
                  "Daily orders and collections",
                  "Collections by payment method",
                  "Ready-made and made-to-order",
                  "Most ordered products",
                ])
              await owner.p.getByRole("heading", { name: heading }).waitFor();
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
  await check("keyboard navigation and text alternatives in Arabic and English", async () => {
    for (const lang of ["ar", "en"]) {
      await owner.p.goto(base + "/admin/reports", { waitUntil: "networkidle" });
      if (lang === "en")
        await owner.p.getByRole("button", { name: "English", exact: true }).click();
      const from = owner.p.getByLabel(lang === "ar" ? "من" : "From", { exact: true });
      const to = owner.p.getByLabel(lang === "ar" ? "إلى" : "To", { exact: true });
      await from.focus();
      const reach = async (target) => {
        for (let i = 0; i < 8; i++) {
          await owner.p.keyboard.press("Tab");
          if (await target.evaluate((e) => e === document.activeElement)) return;
        }
        assert.fail("Keyboard focus could not reach the expected control");
      };
      await reach(to);
      await reach(
        owner.p.getByRole("button", {
          name: lang === "ar" ? "عرض التقرير" : "Show report",
          exact: true,
        }),
      );
      const region = owner.p.getByRole("region", {
        name: lang === "ar" ? "الطلبات والتحصيل لكل يوم" : "Orders and collections by day",
      });
      await region.focus();
      assert.equal(await region.evaluate((e) => e === document.activeElement), true);
      const outline = await region.evaluate((e) => getComputedStyle(e).outlineStyle);
      assert.notEqual(outline, "none");
      assert.ok(await region.getByRole("table").count());
      await owner.p
        .getByRole("heading", {
          name: lang === "ar" ? "التحصيل حسب وسيلة الدفع" : "Collections by payment method",
        })
        .waitFor();
    }
  });
  await check("deleted synthetic owner with existing cookie is denied", async () => {
    const { hashPassword } = await import("better-auth/crypto");
    const db = getDatabase(),
      password = "Local-" + randomBytes(20).toString("hex"),
      email = "deleted-owner-" + randomBytes(10).toString("hex") + "@factory.invalid";
    let synthetic;
    try {
      synthetic = await db.adminUser.create({
        data: {
          name: "Synthetic deleted owner",
          email,
          roleCode: "OWNER",
          emailVerified: true,
          forcePasswordChange: false,
        },
      });
      await db.authAccount.create({
        data: {
          id: randomBytes(16).toString("hex"),
          accountId: synthetic.id,
          userId: synthetic.id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      });
      fixtures.staff.push({ id: synthetic.id, email, password, forcePasswordChange: false });
      const removed = await session(fixtures.staff.length - 1);
      const url = base + "/api/admin/reports?start=" + data.day + "&end=" + data.day;
      assert.equal((await removed.c.request.get(url)).status(), 200);
      assert.ok((await removed.c.cookies()).length > 0);
      await db.adminUser.delete({ where: { id: synthetic.id } });
      synthetic = null;
      const denied = await removed.c.request.get(url);
      assert.equal(denied.status(), 403);
      assert.doesNotMatch(await denied.text(), /collected|outstanding|currencies/);
    } finally {
      if (synthetic) await db.adminUser.deleteMany({ where: { id: synthetic.id } });
      await db.$disconnect();
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
