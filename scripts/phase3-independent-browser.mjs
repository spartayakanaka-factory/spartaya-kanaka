import { createRequire } from "node:module";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
const require = createRequire(import.meta.url);
const {
  chromium,
} = require(process.env.P3_PLAYWRIGHT_MODULE || "playwright");
const base = (process.env.P3_BASE_URL || "http://localhost:3003"),
  out = "docs/phase3/integration/screenshots";
await mkdir(out, { recursive: true });
const state = process.env.P3_STATE_DIR,
  staffFile = path.join(state, "staff.json"),
  fixtures = JSON.parse(await readFile(staffFile, "utf8"));
const browser = await chromium.launch({
  executablePath: process.env.P3_CHROME_EXECUTABLE || undefined,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage();
page.setDefaultTimeout(20000);
const checks = [],
  errors = [],
  audits = [];
let orderId;
page.on("pageerror", (e) => errors.push(e.message));
async function report() {
  await writeFile(
    "docs/phase3/integration/browser-evidence.json",
    JSON.stringify({ base, productionMode: true, checks, errors, audits }, null, 2),
  );
}
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, pass: true });
    console.log("PASS " + name);
  } catch (e) {
    checks.push({ name, pass: false, error: e.message });
    await report();
    throw e;
  }
  await report();
}
async function goto(url) {
  const r = await page.goto(base + url, { waitUntil: "networkidle" });
  assert.ok(r.status() < 400, url + " status " + r.status());
}
async function shot(name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const img of document.images) await img.decode().catch(() => {});
  });
  await page.screenshot({ path: out + "/" + name + ".png", fullPage: true });
}
try {
  await check("production HTTP smoke, noindex, anonymous administrative boundaries", async () => {
    for (const url of ["/", "/ar", "/en", "/ar/account", "/en/cart", "/robots.txt"]) {
      const r = await context.request.get(base + url);
      assert.equal(r.status(), 200, url);
      assert.match(r.headers()["x-robots-tag"], /noindex/);
      if (url === "/robots.txt") assert.match(await r.text(), /Disallow: \//);
    }
    const denied = await context.request.post(base + "/api/admin/commerce", {
      data: { action: "jobs" },
      headers: { origin: base },
    });
    assert.equal(denied.status(), 403);
    await goto("/admin");
    assert.ok(page.url().endsWith("/admin/login"));
  });
  await check("guest browse, add, persist and review checkout in Arabic", async () => {
    await goto("/ar/products/" + fixtures.ready.slug);
    await page.getByRole("button", { name: "أضف لحقيبة الاختبار", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "أضيفت للحقيبة" }).waitFor();
    await page.getByRole("link", { name: "عرض الحقيبة", exact: true }).click();
    await page.getByRole("heading", { name: "قطعك المختارة" }).waitFor();
    await page.reload();
    await page.getByRole("link", { name: "مراجعة الطلب", exact: true }).click();
    await page.getByLabel("اسم المستلم", { exact: true }).fill("مستلم اصطناعي للاختبار");
    await page.getByLabel("الهاتف", { exact: true }).fill("01000000000");
    await page.getByLabel("منطقة التوصيل", { exact: true }).selectOption("TEST-CAIRO");
    await page.getByLabel("المدينة", { exact: true }).fill("مدينة اختبار");
    await page
      .getByLabel("العنوان بالتفصيل", { exact: true })
      .fill("عنوان اصطناعي محلي للاختبار فقط");
    await page.getByLabel("خدمة التوصيل", { exact: true }).selectOption(fixtures.rateId);
    await page.getByRole("button", { name: "احسب الإجمالي", exact: true }).click();
    await page.getByRole("button", { name: "إنشاء طلب اختباري", exact: true }).waitFor();
    await shot("pass1-ar-checkout-desktop");
    await page.getByRole("button", { name: "إنشاء طلب اختباري", exact: true }).click();
    await page.waitForURL(/\/ar\/orders\//);
    orderId = page.url().split("/").at(-1);
    await page.getByRole("button", { name: "محاكاة دفع محلي", exact: true }).click();
    await page.getByText("مؤكد", { exact: true }).waitFor();
  });
  await check(
    "invalid credentials/CSRF and unowned order access are rejected by live server",
    async () => {
      const foreign = await browser.newContext();
      const r = await foreign.request.get(base + "/api/commerce?resource=order&id=" + orderId);
      assert.equal(r.status(), 401);
      const csrf = await context.request.post(base + "/api/commerce", {
        data: { action: "cancel", id: orderId },
        headers: { origin: "https://evil.invalid" },
      });
      assert.equal(csrf.status(), 403);
      const customerToAdmin = await context.request.post(base + "/api/admin/commerce", {
        data: { action: "jobs" },
        headers: { origin: base },
      });
      assert.equal(customerToAdmin.status(), 403);
      await foreign.close();
    },
  );
  await check(
    "customer registration, private verification, login, profile and saved address persist",
    async () => {
      await goto("/en/account");
      await page.getByRole("button", { name: "Register", exact: true }).click();
      const email = "browser-" + Date.now() + "@phase3.invalid",
        password = randomBytes(20).toString("base64url");
      await page.getByLabel("Name", { exact: true }).fill("Synthetic Browser Customer");
      await page.getByLabel("Synthetic email (.invalid)", { exact: true }).fill(email);
      await page.getByLabel("Password (at least 12 characters)", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Request accepted" }).waitFor();
      let url;
      for (const f of await readdir(path.join(state, "notification-capture"))) {
        const c = JSON.parse(await readFile(path.join(state, "notification-capture", f), "utf8"));
        if (c.kind === "verify-email" && c.recipient === email) url = c.payload.url;
      }
      assert.ok(url);
      await page.goto(url, { waitUntil: "networkidle" });
      await goto("/en/account");
      await page.getByLabel("Synthetic email (.invalid)", { exact: true }).fill(email);
      await page.getByLabel("Password (at least 12 characters)", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("heading", { name: "Profile", exact: true }).waitFor();
      await page.getByLabel("Phone", { exact: true }).first().fill("01000000000");
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
      await page.getByLabel("Recipient", { exact: true }).fill("Synthetic Recipient");
      await page.getByLabel("Phone", { exact: true }).last().fill("01000000000");
      await page.getByLabel("Governorate / region", { exact: true }).fill("TEST-CAIRO");
      await page.getByLabel("City", { exact: true }).fill("Synthetic City");
      await page.getByLabel("Street address", { exact: true }).fill("Synthetic local address only");
      await page.getByRole("button", { name: "Save address", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Address saved" }).waitFor();
      await page.reload();
      await page
        .getByText("Synthetic local address only · Synthetic City", { exact: true })
        .waitFor();
      assert.equal(
        (
          await context.request.post(base + "/api/admin/commerce", {
            data: { action: "jobs" },
            headers: { origin: base },
          })
        ).status(),
        403,
      );
      await shot("pass1-en-account-desktop");
    },
  );

  await check("two real customer sessions cannot enumerate each other's orders or obtain staff authority",async()=>{
    const api=async(ctx,data)=>{const r=await ctx.request.post(base+"/api/commerce",{headers:{origin:base},data});assert.equal(r.status(),200);return r.json();};
    await api(context,{action:"cart",variantId:fixtures.ready.variantId,quantity:1});
    const input={address:{label:"Test",recipient:"Synthetic customer A",phone:"01000000000",country:"EG",region:"TEST-CAIRO",city:"Synthetic City",line1:"Private synthetic customer A address"},rateId:fixtures.rateId,method:"MOCK_CARD",locale:"en"};
    const q=await api(context,{action:"quote",...input});const aOrder=await api(context,{action:"checkout",...input,quoteHash:q.quoteHash,requestKey:randomBytes(16).toString("hex")});
    assert.ok(!("ownerKey" in aOrder));assert.ok(!("events" in aOrder));assert.ok(!("requestHash" in aOrder));
    const other=await browser.newContext();try{
      const email="audit-b-"+Date.now()+"@phase3.invalid",password=randomBytes(20).toString("base64url");
      const signup=await other.request.post(base+"/api/customer-auth/sign-up/email",{headers:{origin:base},data:{name:"Synthetic customer B",email,password,roleCode:"OWNER",forcePasswordChange:false}});assert.equal(signup.status(),200);
      let verification;for(const f of await readdir(path.join(state,"notification-capture"))){const capture=JSON.parse(await readFile(path.join(state,"notification-capture",f),"utf8"));if(capture.kind==="verify-email"&&capture.recipient===email)verification=capture.payload.url;}assert.ok(verification);await other.request.get(verification);
      assert.equal((await other.request.post(base+"/api/customer-auth/sign-in/email",{headers:{origin:base},data:{email,password}})).status(),200);
      const forbidden=await other.request.get(base+"/api/commerce?resource=order&id="+aOrder.id);assert.equal(forbidden.status(),404);assert.ok(!(await forbidden.text()).includes("Private synthetic"));
      assert.equal((await other.request.post(base+"/api/admin/commerce",{headers:{origin:base},data:{action:"jobs"}})).status(),403);
      assert.equal((await other.request.post(base+"/api/commerce",{headers:{origin:base},data:{action:"cancel",id:aOrder.id}})).status(),404);
      const own=await context.request.get(base+"/api/commerce?resource=order&id="+aOrder.id);assert.equal(own.status(),200);
    }finally{await other.close();}
  });
  await check("owner login, password rotation and Arabic order dashboard", async () => {
    const owner = fixtures.staff[0];
    await goto("/admin/login");
    await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(owner.email);
    await page.getByLabel("كلمة المرور", { exact: true }).fill(owner.password);
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await page.waitForURL(/\/admin(?:\/password)?$/);
    if (page.url().endsWith("/admin/password")) {
      const rotated = randomBytes(24).toString("base64url");
      await page.getByLabel("كلمة المرور الحالية").fill(owner.password);
      await page.getByLabel("كلمة المرور الجديدة", { exact: true }).fill(rotated);
      await page.getByLabel("تأكيد كلمة المرور").fill(rotated);
      await page.getByRole("button", { name: "تغيير كلمة المرور", exact: true }).click();
      await page.waitForURL(base + "/admin");
      owner.password = rotated;
      owner.forcePasswordChange = false;
      await writeFile(staffFile, JSON.stringify(fixtures, null, 2), { mode: 0o600 });
    }
    await goto("/admin/orders");
    await page.getByRole("heading", { name: "إدارة الطلبات" }).waitFor();
    await page
      .getByRole("link", { name: orderId.slice(0, 8), exact: true })
      .first()
      .click();
    await page.getByRole("heading", { name: /طلب / }).waitFor();
    await page.getByRole("button", { name: "جاهز للشحن", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "تم تسجيل العملية" }).waitFor();
    await shot("pass1-ar-admin-order-desktop");
  });
  await check(
    "three real staff sessions enforce refund request, approval, execution and reconciliation",
    async () => {
      await page.getByLabel("المبلغ بالجنيه المصري", { exact: true }).fill("25.00");
      await page.getByLabel("سبب موثق", { exact: true }).fill("Synthetic local refund review only");
      const requested = page.waitForResponse(
        (r) => r.url().endsWith("/api/admin/commerce") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "إنشاء طلب مراجعة", exact: true }).click();
      const requestResponse = await requested;
      assert.equal(requestResponse.status(), 200);
      const finance = await requestResponse.json();
      assert.equal(finance.amountMinor, "2500");
      const self = await context.request.post(base + "/api/admin/commerce", {
        headers: { origin: base },
        data: { action: "financeTransition", id: finance.id, transition: "approve" },
      });
      assert.equal(self.status(), 403);
      async function switchStaff(index) {
        await context.request.post(base + "/api/auth/sign-out", {
          headers: { origin: base },
          data: {},
        });
        const account = fixtures.staff[index];
        await goto("/admin/login");
        await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(account.email);
        await page.getByLabel("كلمة المرور", { exact: true }).fill(account.password);
        await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
        await page.waitForURL(/\/admin(?:\/password)?$/);
        if (page.url().endsWith("/admin/password")) {
          const rotated = randomBytes(24).toString("base64url");
          await page.getByLabel("كلمة المرور الحالية").fill(account.password);
          await page.getByLabel("كلمة المرور الجديدة", { exact: true }).fill(rotated);
          await page.getByLabel("تأكيد كلمة المرور").fill(rotated);
          await page.getByRole("button", { name: "تغيير كلمة المرور", exact: true }).click();
          await page.waitForURL(base + "/admin");
          account.password = rotated;
          account.forcePasswordChange = false;
          await writeFile(staffFile, JSON.stringify(fixtures, null, 2), { mode: 0o600 });
        }
        await goto("/admin/orders");
      }
      const row = () =>
        page
          .locator(".admin-finance-row")
          .filter({ has: page.locator('a[href="/admin/orders/' + orderId + '"]') })
          .filter({ hasText: "استرداد" })
          .last();
      async function step(label, transition) {
        const response = page.waitForResponse(
          (r) => r.url().endsWith("/api/admin/commerce") && r.request().method() === "POST",
        );
        await row().getByRole("button", { name: label, exact: true }).click();
        assert.equal((await response).status(), 200, transition);
        await page.getByRole("status").filter({ hasText: "تم تسجيل العملية" }).waitFor();
      }
      await switchStaff(1);
      await step("اعتماد", "approve");
      await step("تنفيذ وهمي", "execute");
      const same = await context.request.post(base + "/api/admin/commerce", {
        headers: { origin: base },
        data: { action: "financeTransition", id: finance.id, transition: "reconcile" },
      });
      assert.equal(same.status(), 403);
      await switchStaff(2);
      await step("تسوية", "reconcile");
      const detail = await context.request.get(base + "/api/admin/commerce?id=" + orderId);
      assert.equal((await detail.json()).refundedMinor, "2500");
      await switchStaff(0);
    },
  );
  await context.request.post(base + "/api/commerce", {
    data: { action: "cart", variantId: fixtures.ready.variantId, quantity: 1 },
    headers: { origin: base },
  });
  for (const pass of [1, 2])
    for (const width of [390, 768, 1440])
      for (const locale of ["ar", "en"])
        await check(`visual pass ${pass} ${locale} ${width}px`, async () => {
          await page.setViewportSize({ width, height: 900 });
          for (const view of ["account", "cart", "checkout"]) {
            await goto("/" + locale + "/" + view);
            assert.equal(
              await page.locator("html").getAttribute("dir"),
              locale === "ar" ? "rtl" : "ltr",
            );
            await page.evaluate(() => document.fonts.ready);
            assert.ok(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
              "horizontal overflow " + view,
            );
            if (pass === 2) {
              await shot(`pass2-${locale}-${view}-${width}`);
              await page.addScriptTag({
                path: process.env.P3_AXE_PATH || require.resolve("axe-core/axe.min.js"),
              });
              const violations = await page.evaluate(async () =>
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
              audits.push({ view, locale, width, violations });
              assert.deepEqual(violations, []);
            }
          }
          await goto("/admin/orders");
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            "admin overflow",
          );
          if (pass === 2) {
            await shot(`pass2-ar-admin-orders-${width}`);
            if (locale === "ar")
              for (const route of [
                "/admin/orders",
                "/admin/orders/" + orderId,
                "/admin/commerce-settings",
                "/admin/inventory",
              ]) {
                await goto(route);
                await page.addScriptTag({
                  path: process.env.P3_AXE_PATH || require.resolve("axe-core/axe.min.js"),
                });
                const violations = await page.evaluate(async () =>
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
                audits.push({ view: route, locale: "ar", width, violations });
                assert.deepEqual(violations, []);
                assert.ok(
                  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
                );
                if (route !== "/admin/orders")
                  await shot(
                    `pass2-ar-admin-${route.endsWith("commerce-settings") ? "settings" : route.endsWith("inventory") ? "inventory" : "detail"}-${width}`,
                  );
              }
          }
        });
  assert.deepEqual(errors, []);
  console.log("Production browser acceptance complete.");
} finally {
  await report();
  await browser.close();
}
