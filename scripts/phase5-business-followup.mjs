// Keep one real synthetic unpaid order for an observable balance/report acceptance.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { formatMoneyMinor } from "../src/lib/money.ts";
import { cairoDate } from "../src/lib/reports/calendar.ts";
const base = "http://localhost:3008";
if (process.env.P5_WORKSTREAM !== "1" || process.env.P3_BASE_URL !== base)
  throw Error("Local Phase 5 only");
const f = JSON.parse(await readFile(path.join(process.env.P3_STATE_DIR, "staff.json"))),
  customer = JSON.parse(await readFile(path.join(process.env.P3_STATE_DIR, "customer.json")));
const b = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const c = await b.newContext({ viewport: { width: 390, height: 900 } }),
  p = await c.newPage();
const a = await b.newContext({ viewport: { width: 1280, height: 720 } }),
  admin = await a.newPage();
try {
  const login = await c.request.post(base + "/api/customer-auth/sign-in/email", {
    headers: { origin: base },
    data: customer,
  });
  assert.equal(login.status(), 200);
  await p.goto(base + "/ar/products/" + f.made.slug, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "أضف لحقيبة الاختبار", exact: true }).click();
  await p.getByRole("status").filter({ hasText: "أضيفت للحقيبة" }).waitFor();
  await p.goto(base + "/ar/checkout", { waitUntil: "networkidle" });
  for (const [label, value] of [
    ["اسم المستلم", "عميل اصطناعي محلي"],
    ["الهاتف", "01000000000"],
    ["المدينة", "مدينة اختبار محلية"],
    ["العنوان بالتفصيل", "عنوان اصطناعي محلي غير صالح للشحن"],
  ])
    await p.getByLabel(label, { exact: true }).fill(value);
  await p.getByLabel("المحافظة", { exact: true }).selectOption("TEST-CAIRO");
  await p.getByLabel("خدمة التوصيل", { exact: true }).selectOption(f.rateId);
  await p.getByLabel("طريقة دفع الاختبار", { exact: true }).selectOption("INSTAPAY");
  await p.getByRole("button", { name: "احسب الإجمالي", exact: true }).click();
  await p.getByRole("button", { name: "إنشاء طلب اختباري", exact: true }).click();
  await p.waitForURL(/\/orders\//);
  const id = p.url().split("/").at(-1);
  assert.equal(
    (
      await a.request.post(base + "/api/auth/sign-in/email", {
        headers: { origin: base },
        data: { email: f.staff[0].email, password: f.staff[0].password },
      })
    ).status(),
    200,
  );
  const r = await a.request.get(base + "/api/admin/commerce?id=" + id);
  assert.equal(r.status(), 200);
  const order = await r.json();
  assert.equal(order.state, "AWAITING_PAYMENT");
  assert.equal(order.paidMinor, "0");
  assert.ok(BigInt(order.initialMinor) < BigInt(order.totalMinor));
  await admin.goto(base + "/admin/orders/" + id, { waitUntil: "networkidle" });
  const amount = admin
    .locator("dl.admin-order-money > div")
    .filter({ has: admin.getByText("الرصيد المستحق", { exact: true }) })
    .locator("dd");
  assert.equal((await amount.innerText()).trim(), formatMoneyMinor(order.totalMinor, "ar"));
  const day = cairoDate(new Date()),
    report = await (
      await a.request.get(base + "/api/admin/reports?start=" + day + "&end=" + day)
    ).json();
  assert.ok(
    BigInt(report.currencies.find((r) => r.currency === "EGP").outstanding) >=
      BigInt(order.totalMinor),
  );
  await admin.screenshot({
    path: "docs/phase5/screenshots/pending-balance-1280.png",
    fullPage: true,
  });
  await admin.goto(base + "/admin", { waitUntil: "networkidle" });
  const metric = admin.locator('a[href="/admin/orders?state=AWAITING_PAYMENT"] strong');
  assert.ok(
    Number((await metric.innerText()).replace(/[٠-٩]/g, (n) => "٠١٢٣٤٥٦٧٨٩".indexOf(n))) >= 1,
  );
  await metric.click();
  await admin.waitForURL(/state=AWAITING_PAYMENT/);
  await admin.getByRole("link", { name: id.slice(0, 8), exact: true }).waitFor();
  await writeFile(
    "docs/phase5/pending-balance-browser.json",
    JSON.stringify(
      {
        scope: "Real local browser and MariaDB; synthetic unpaid order only",
        customerCheckout: true,
        paidMinor: order.paidMinor,
        initialMinor: order.initialMinor,
        totalMinor: order.totalMinor,
        outstandingDisplayExact: true,
        reportIncludesBalance: true,
        dashboardQueueLinkFiltersCorrectly: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS unpaid order, exact balance display, report outstanding and dashboard-to-filter navigation",
  );
} finally {
  await b.close();
}
