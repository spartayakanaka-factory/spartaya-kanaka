// Real production server -> authenticated HTTP -> MariaDB/private S3. Synthetic data only.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright"),
  sharp = require("sharp");
const base = process.env.P3_BASE_URL,
  out = "docs/phase35";
if (base !== "http://localhost:3005")
  throw Error("Only the isolated Phase 3.5 server is permitted");
const file = path.join(process.env.P3_STATE_DIR, process.env.P35_STAFF_FILE || "staff.json"),
  fixture = JSON.parse(await readFile(file, "utf8"));
const browser = await chromium.launch({
  executablePath: process.env.P3_CHROME_EXECUTABLE,
  headless: true,
});
const checks = [],
  audits = [],
  errors = [];
const contexts = [];
await mkdir(out + "/screenshots", { recursive: true });
async function ctx() {
  const c = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-for":
        "198.18." + Math.floor(Math.random() * 255) + "." + (1 + Math.floor(Math.random() * 254)),
    },
    viewport: { width: 390, height: 900 },
  });
  contexts.push(c);
  const p = await c.newPage();
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("dialog", (d) => d.accept());
  return { c, p };
}
async function post(c, data, url = "/api/admin/commerce") {
  return c.request.post(base + url, { headers: { origin: base }, data });
}
async function read(c, id) {
  const r = await c.request.get(base + "/api/admin/commerce?id=" + id);
  assert.equal(r.status(), 200);
  return r.json();
}
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, pass: true });
    console.log("PASS " + name);
  } catch (e) {
    checks.push({ name, pass: false, error: e.message });
    throw e;
  } finally {
    await writeFile(
      out + "/factory-browser.json",
      JSON.stringify(
        { scope: "Local production mode, synthetic orders and private S3", checks, audits, errors },
        null,
        2,
      ) + "\n",
    );
  }
}
async function goto(p, url) {
  const r = await p.goto(base + url, { waitUntil: "networkidle" });
  assert.ok(r.status() < 400, url + ":" + r.status());
}
async function login(i) {
  const a = await ctx(),
    staff = fixture.staff[i];
  const r = await post(
    a.c,
    { email: staff.email, password: staff.password },
    "/api/auth/sign-in/email",
  );
  assert.equal(r.status(), 200);
  await goto(a.p, "/admin/orders");
  return a;
}
async function audit(p, name) {
  await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await p.evaluate(async () =>
    (
      await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
    ).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
  );
  audits.push({ name, violations });
  assert.deepEqual(violations, []);
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "overflow " + name,
  );
}
async function checkout(slug, method, locale = "ar") {
  const a = await ctx(),
    p = a.p;
  await goto(p, "/" + locale + "/products/" + slug);
  await p
    .getByRole("button", {
      name: locale === "ar" ? "أضف لحقيبة الاختبار" : "Add to test bag",
      exact: true,
    })
    .click();
  await p
    .getByRole("status")
    .filter({ hasText: locale === "ar" ? "أضيفت للحقيبة" : "Added to bag" })
    .waitFor();
  await goto(p, "/" + locale + "/checkout");
  await p
    .getByLabel(locale === "ar" ? "اسم المستلم" : "Recipient", { exact: true })
    .fill("Synthetic factory customer");
  await p.getByLabel(locale === "ar" ? "الهاتف" : "Phone", { exact: true }).fill("01000000000");
  await p
    .getByLabel(locale === "ar" ? "المحافظة" : "Governorate", { exact: true })
    .selectOption("TEST-CAIRO");
  await p.getByLabel(locale === "ar" ? "المدينة" : "City", { exact: true }).fill("Synthetic city");
  await p
    .getByLabel(locale === "ar" ? "العنوان بالتفصيل" : "Street address", { exact: true })
    .fill("Synthetic private delivery address");
  await p
    .getByLabel(locale === "ar" ? "خدمة التوصيل" : "Delivery service", { exact: true })
    .selectOption(fixture.rateId);
  await p
    .getByLabel(locale === "ar" ? "طريقة دفع الاختبار" : "Test payment method", { exact: true })
    .selectOption(method);
  await p
    .getByRole("button", {
      name: locale === "ar" ? "احسب الإجمالي" : "Calculate total",
      exact: true,
    })
    .click();
  await p
    .getByRole("button", {
      name: locale === "ar" ? "إنشاء طلب اختباري" : "Place test order",
      exact: true,
    })
    .click();
  await p.waitForURL(/\/orders\//);
  a.id = p.url().split("/").at(-1);
  return a;
}
async function proof(a, reference, locale = "ar") {
  const p = a.p;
  await p
    .getByRole("button", {
      name: locale === "ar" ? "عرض تعليمات التحويل" : "View transfer instructions",
      exact: true,
    })
    .click();
  const card = p
    .getByRole("region", {
      name: locale === "ar" ? "إثبات التحويل الخاص" : "Private transfer evidence",
    })
    .filter({ has: p.locator('input[name="receipt"]') })
    .last();
  await card.getByText("LOCAL-TEST-NOT-PAYABLE", { exact: true }).waitFor();
  await card.locator('input[name="transferReference"]').fill(reference);
  const buffer = await sharp(randomBytes(48 * 48 * 3), {
    raw: { width: 48, height: 48, channels: 3 },
  })
    .png()
    .toBuffer();
  await card
    .locator('input[type="file"]')
    .setInputFiles({ name: "synthetic-transfer.png", mimeType: "image/png", buffer });
  const response = p.waitForResponse(
    (r) => r.url().includes("/api/commerce/payment-evidence") && r.request().method() === "POST",
  );
  await card
    .getByRole("button", {
      name: locale === "ar" ? "إرسال الإثبات للمراجعة" : "Submit evidence for review",
      exact: true,
    })
    .click();
  assert.equal((await response).status(), 200);
  await card
    .getByRole("button", {
      name: locale === "ar" ? "عرض الصورة الخاصة" : "View private image",
      exact: true,
    })
    .click();
  const img = card.locator("img");
  await img.waitFor();
  await img.evaluate((e) => e.decode());
  const preview = await img.getAttribute("src");
  assert.equal((await (await browser.newContext()).request.get(base + preview)).status(), 401);
  return card;
}
async function transition(a, id, action) {
  const r = await post(a.c, {
    action: "fulfill",
    orderId: id,
    transition: action,
    ...(action === "dispatch" ? { reference: "SYNTHETIC-" + randomUUID() } : {}),
  });
  assert.equal(r.status(), 200, action);
}
let owner, approver, reconciler, wallet, made;
async function verify(a, paymentId, requestThroughUI = false) {
  const order = await read(owner.c, a.id),
    payment = order.payments.find((p) => p.id === paymentId);
  let finance;
  if (requestThroughUI) {
    await goto(owner.p, "/admin/orders/" + a.id);
    await owner.p.locator('select[name="kind"]').first().selectOption("VERIFY_TRANSFER");
    await owner.p.locator('select[name="paymentId"]').selectOption(paymentId);
    await owner.p
      .locator('textarea[name="reason"]')
      .fill("Synthetic receiving-account check - no real funds");
    const response = owner.p.waitForResponse(
      (r) => r.url().endsWith("/api/admin/commerce") && r.request().method() === "POST",
    );
    await owner.p.getByRole("button", { name: "إنشاء طلب مراجعة", exact: true }).click();
    assert.equal((await response).status(), 200);
    finance = await (await response).json();
  } else {
    const r = await post(owner.c, {
      action: "financeRequest",
      orderId: a.id,
      paymentId,
      kind: "VERIFY_TRANSFER",
      amount: payment.amountMinor,
      key: randomUUID(),
      reason: "Synthetic receiving account reconciliation only",
    });
    assert.equal(r.status(), 200);
    finance = await r.json();
  }
  assert.equal(
    (
      await post(owner.c, { action: "financeTransition", id: finance.id, transition: "approve" })
    ).status(),
    403,
  );
  for (const [actor, t] of [
    [approver, "approve"],
    [approver, "execute"],
    [reconciler, "reconcile"],
  ]) {
    const r = await post(actor.c, { action: "financeTransition", id: finance.id, transition: t });
    assert.equal(r.status(), 200, t);
  }
  const before = (await read(owner.c, a.id)).paidMinor;
  await post(reconciler.c, {
    action: "financeTransition",
    id: finance.id,
    transition: "reconcile",
  });
  assert.equal((await read(owner.c, a.id)).paidMinor, before);
  await a.p.reload({ waitUntil: "networkidle" });
}
try {
  await check(
    "authenticated factory staff sessions and independent customer/admin boundaries",
    async () => {
      owner = await login(0);
      approver = await login(1);
      reconciler = await login(2);
    },
  );
  await check(
    "mobile ready-made COD checkout, fulfillment, collection and separate reconciliation",
    async () => {
      const a = await checkout(fixture.ready.slug, "COD");
      let o = await read(owner.c, a.id);
      assert.equal(o.paymentMethod, "COD");
      assert.equal(o.paidMinor, "0");
      await goto(owner.p, "/admin/orders/" + a.id);
      await owner.p.getByRole("button", { name: "جاهز للشحن", exact: true }).click();
      await owner.p.locator('input[name="reference"]').fill("SYNTHETIC-COD-SHIPMENT");
      await owner.p.getByRole("button", { name: "تسجيل الشحن", exact: true }).click();
      await owner.p.getByRole("button", { name: "تأكيد التسليم", exact: true }).click();
      await owner.p.getByRole("button", { name: "تسجيل تحصيل المندوب", exact: true }).click();
      assert.equal((await read(owner.c, a.id)).paidMinor, "0");
      assert.equal(
        (
          await post(owner.c, { action: "fulfill", orderId: a.id, transition: "cod_reconciled" })
        ).status(),
        403,
      );
      await transition(reconciler, a.id, "cod_reconciled");
      o = await read(owner.c, a.id);
      assert.equal(o.paidMinor, o.totalMinor);
      await a.p.reload();
      await audit(a.p, "COD confirmation 390 RTL");
    },
  );
  await check(
    "wallet private screenshot UI, spoof/replay boundaries and authorized reconciliation",
    async () => {
      wallet = await checkout(fixture.ready.slug, "WALLET");
      await proof(wallet, "SYNTHETIC-" + randomUUID());
      const o = await read(owner.c, wallet.id);
      assert.equal(o.paidMinor, "0");
      const p = o.payments.find((x) => x.method === "WALLET");
      assert.equal(p.state, "CLAIMED");
      await verify(wallet, p.id, true);
      const done = await read(owner.c, wallet.id);
      assert.equal(done.paidMinor, done.totalMinor);
      await audit(wallet.p, "wallet proof 390 RTL");
    },
  );
  await check(
    "made-to-order InstaPay deposit, manufacturing gate and outstanding balance before dispatch",
    async () => {
      made = await checkout(fixture.made.slug, "INSTAPAY");
      let o = await read(owner.c, made.id);
      assert.ok(BigInt(o.initialMinor) < BigInt(o.totalMinor));
      assert.equal(
        (
          await post(owner.c, { action: "fulfill", orderId: made.id, transition: "start" })
        ).status(),
        409,
      );
      await proof(made, "SYNTHETIC-" + randomUUID());
      o = await read(owner.c, made.id);
      await verify(made, o.payments[0].id);
      await transition(owner, made.id, "start");
      await transition(owner, made.id, "ready");
      assert.equal(
        (
          await post(owner.c, {
            action: "fulfill",
            orderId: made.id,
            transition: "dispatch",
            reference: "SYNTHETIC-BLOCKED",
          })
        ).status(),
        409,
      );
      await proof(made, "SYNTHETIC-" + randomUUID());
      o = await read(owner.c, made.id);
      const balance = o.payments.find((p) => p.purpose === "BALANCE");
      await verify(made, balance.id);
      await transition(owner, made.id, "dispatch");
      o = await read(owner.c, made.id);
      assert.equal(o.paidMinor, o.totalMinor);
      assert.equal(o.state, "SHIPPED");
    },
  );
  await check(
    "internal production notes remain private, bilingual local notification processing",
    async () => {
      await goto(owner.p, "/admin/orders/" + made.id);
      await owner.p
        .locator('textarea[name="text"]')
        .fill("Synthetic internal factory note <script>alert(1)</script>");
      await owner.p.getByRole("button", { name: "إضافة ملاحظة داخلية", exact: true }).click();
      await owner.p
        .getByText("Synthetic internal factory note <script>alert(1)</script>", { exact: true })
        .waitFor();
      const r = await made.c.request.get(base + "/api/commerce?resource=order&id=" + made.id);
      assert.doesNotMatch(await r.text(), /Synthetic internal factory note/);
      assert.equal((await post(owner.c, { action: "jobs" })).status(), 200);
    },
  );
  await check(
    "owner shipping/payment settings and customer-account controls persist through real forms",
    async () => {
      await goto(owner.p, "/admin/commerce-settings");
      const shipping = owner.p.locator("section.admin-panel").filter({
        has: owner.p.getByRole("heading", { name: "التوصيل والدفع عند الاستلام", exact: true }),
      });
      const region = "SYNTHETIC-UI-" + randomUUID().slice(0, 8);
      for (const [name, value] of [
        ["region", region],
        ["city", "Synthetic city"],
        ["area", "Synthetic area"],
        ["carrier", "SYNTHETIC-NOT-A-CARRIER"],
        ["feeMinor", "1.23"],
        ["leadDays", "3"],
        ["codFeeMinor", "0.50"],
        ["codMaximumMinor", "500"],
      ])
        await shipping.locator('input[name="' + name + '"]').fill(value);
      await shipping.locator('input[name="enabled"]').check();
      await shipping.locator('input[name="codEnabled"]').check();
      const saved = owner.p.waitForResponse(
        (r) => r.url().endsWith("/api/admin/commerce") && r.request().method() === "POST",
      );
      await shipping.getByRole("button", { name: "إضافة الخدمة", exact: true }).click();
      assert.equal((await saved).status(), 200);
      let config = await (await owner.c.request.get(base + "/api/admin/commerce")).json();
      const rate = config.rates.find((r) => r.region === region);
      assert.ok(rate);
      assert.equal(rate.feeMinor, "123");
      assert.equal(rate.codFeeMinor, "50");
      assert.equal(rate.city, "Synthetic city");
      await goto(owner.p, "/admin/commerce-settings");
      const payment = owner.p
        .locator("section.admin-panel")
        .filter({ has: owner.p.getByRole("heading", { name: "المحافظ وInstaPay", exact: true }) })
        .locator("form")
        .first();
      await payment.locator('input[name="enabled"]').uncheck();
      let response = owner.p.waitForResponse(
        (r) => r.url().endsWith("/api/admin/commerce") && r.request().method() === "POST",
      );
      await payment.getByRole("button").click();
      assert.equal((await response).status(), 200);
      await goto(owner.p, "/admin/commerce-settings");
      assert.equal(await payment.locator('input[name="enabled"]').isChecked(), false);
      await payment.locator('input[name="enabled"]').check();
      response = owner.p.waitForResponse(
        (r) => r.url().endsWith("/api/admin/commerce") && r.request().method() === "POST",
      );
      await payment.getByRole("button").click();
      assert.equal((await response).status(), 200);
      config = await (await owner.c.request.get(base + "/api/admin/commerce")).json();
      assert.equal(config.policy.configuration.manualInstructions.WALLET.enabled, true);
      assert.equal(
        (await approver.c.request.get(base + "/api/admin/commerce?resource=customers")).status(),
        403,
      );
      await goto(owner.p, "/admin/customers");
      const customer = owner.p.locator(".factory-customer-list article").first();
      await customer
        .locator('textarea[name="reason"]')
        .fill("Synthetic reviewed customer-account access check");
      response = owner.p.waitForResponse(
        (r) => r.url().endsWith("/api/admin/commerce") && r.request().method() === "POST",
      );
      await customer.getByRole("button", { name: "إيقاف وصول الحساب", exact: true }).click();
      assert.equal((await response).status(), 200);
      await customer.getByRole("button", { name: "استعادة وصول الحساب", exact: true }).waitFor();
      await customer
        .locator('textarea[name="reason"]')
        .fill("Synthetic access restoration after acceptance");
      response = owner.p.waitForResponse(
        (r) => r.url().endsWith("/api/admin/commerce") && r.request().method() === "POST",
      );
      await customer.getByRole("button", { name: "استعادة وصول الحساب", exact: true }).click();
      assert.equal((await response).status(), 200);
      await customer.getByRole("button", { name: "إيقاف وصول الحساب", exact: true }).waitFor();
    },
  );
  for (const pass of [1, 2])
    await check(
      "visual review pass " + pass + " - new factory/payment screens at 390/768/1440",
      async () => {
        for (const width of [390, 768, 1440]) {
          for (const [p, url, name] of [
            [owner.p, "/admin/orders", "queue"],
            [owner.p, "/admin/orders/" + made.id, "manufacturing"],
            [owner.p, "/admin/commerce-settings", "settings"],
            [owner.p, "/admin/customers", "customers"],
            [wallet.p, "/ar/orders/" + wallet.id, "wallet-ar"],
            [wallet.p, "/en/orders/" + wallet.id, "wallet-en"],
          ]) {
            await p.setViewportSize({ width, height: 900 });
            await goto(p, url);
            await p.evaluate(() => document.fonts.ready);
            assert.ok(
              await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
              "overflow " + name + " " + width,
            );
            if (pass === 2) {
              await audit(p, name + " " + width);
              if (name === "settings") {
                const summaries = p.locator("details > summary");
                for (let index = 0; index < (await summaries.count()); index++) {
                  await summaries.nth(index).focus();
                  await summaries.nth(index).press("Enter");
                }
                await audit(p, "expanded advanced settings " + width);
                for (let index = 0; index < (await summaries.count()); index++)
                  await summaries.nth(index).press("Enter");
              }
              await p.screenshot({
                path: out + "/screenshots/factory-" + name + "-" + width + ".png",
                fullPage: true,
              });
            }
          }
        }
      },
    );
  assert.deepEqual(errors, []);
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
