import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const base = "http://localhost:3002";
const out = ".local/phase2/acceptance";
await mkdir(out, { recursive: true });
const ownerFile = ".local/phase2/owner.json";
const owner = JSON.parse(await readFile(ownerFile, "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const checks = [], errors = [], audits = [];
page.on("pageerror", (error) => errors.push(error.message));
const report = async () => writeFile(out + "/browser-report.json", JSON.stringify({ checks, errors, audits }, null, 2));
async function check(name, run) {
  try { await run(); checks.push({ name, pass: true }); console.log("PASS " + name); }
  catch (error) { checks.push({ name, pass: false, error: error.message }); await report(); throw error; }
  await report();
}
async function goto(url) { const response = await page.goto(base + url, { waitUntil: "domcontentloaded" }); assert.ok(response.status() < 400, url + " HTTP " + response.status()); await page.locator("h1").waitFor(); }
async function screenshot(name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let y = 0; y < document.documentElement.scrollHeight; y += 650) {
      scrollTo({ top: y, behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 100));
      await Promise.all([...document.images].filter((image) => {
        const rect = image.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0;
      }).map((image) => image.decode().catch(() => {})));
    }
    scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({ path: out + "/" + name + ".png", fullPage: true });
}
async function unavailable(response) {
  // Next.js can stream a not-found page with HTTP 200 after headers are sent.
  assert.ok([200, 404].includes(response.status()));
  const body = await response.text();
  assert.ok(body.includes("الصفحة غير موجودة"));
  assert.ok(!body.includes("منتج اصطناعي لاختبار المتصفح"));
  assert.ok(/noindex/.test(body));
}
const slug = "browser-acceptance-" + Date.now();
let productId, categoryId, displayUrl, originalKey;

try {
  await check("anonymous admin and media writes are protected; public signup disabled", async () => {
    await goto("/admin"); assert.ok(page.url().endsWith("/admin/login"));
    const response = await context.request.post(base + "/api/admin/media/upload-url", { data: {}, headers: { origin: base } }); assert.equal(response.status(), 403);
    const signup = await context.request.post(base + "/api/auth/sign-up/email", { data: { email: "disabled@example.invalid", password: "Synthetic-password-only", name: "Disabled Signup" }, headers: { origin: base } }); assert.ok([400,403,404].includes(signup.status()));
  });
  await check("invalid owner password is rejected", async () => {
    await page.getByLabel("البريد الإلكتروني").fill(owner.email);
    await page.getByLabel("كلمة المرور", { exact: true }).fill("Incorrect-local-test-password");
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await page.getByRole("alert").waitFor(); assert.ok(page.url().endsWith("/admin/login"));
  });
  await check("owner login and mandatory first-password change", async () => {
    await page.getByLabel("كلمة المرور", { exact: true }).fill(owner.password);
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await page.waitForURL(/\/admin(?:\/password)?$/);
    if (page.url().endsWith("/admin/password")) {
      const next = randomBytes(32).toString("hex");
      await page.getByLabel("كلمة المرور الحالية").fill(owner.password);
      await page.getByLabel("كلمة المرور الجديدة").fill(next);
      await page.getByLabel("تأكيد كلمة المرور").fill(next);
      await page.getByRole("button", { name: "تغيير كلمة المرور", exact: true }).click();
      await page.waitForURL(base + "/admin");
      owner.password = next;
      await writeFile(ownerFile, JSON.stringify(owner, null, 2) + "\n", { mode: 0o600 });
    }
    await page.reload(); await page.getByRole("heading", { name: /^أهلاً/ }).waitFor();
  });
  await check("Arabic category creation through the real server action", async () => {
    await goto("/admin/categories");
    await page.locator('[name="nameAr"]').fill("فئة اختبار المتصفح");
    await page.locator('[name="slug"]').fill(slug);
    await page.locator('[name="reviewRequired"]').check(); await page.locator('[name="visible"]').check();
    await page.getByRole("button", { name: "حفظ التصنيف", exact: true }).click();
    await page.waitForURL(/saved=1/);
    const row = page.getByRole("row").filter({ hasText: slug });
    categoryId = new URL(await row.getByRole("link", { name: "تعديل", exact: true }).getAttribute("href"), base).searchParams.get("edit");
    assert.ok(categoryId);
  });
  await check("real private-original upload, conversion and public display persistence", async () => {
    await goto("/admin/products/new");
    const records = JSON.parse(await readFile("sprtaya-kanaka-assets/بيانات/products.json", "utf8"));
    const file = records[0].images.find((image) => image.status === "downloaded").local_path;
    const finalized = page.waitForResponse((response) => response.url().endsWith("/api/admin/media/finalize") && response.request().method() === "POST").then((response) => ({ response }), (error) => ({ error }));
    const signing = page.waitForResponse((response) => response.url().endsWith("/api/admin/media/upload-url") && response.request().method() === "POST");
    const original = await readFile(path.resolve("sprtaya-kanaka-assets", file));
    const metadata = await sharp(original).metadata();
    const format = metadata.format === "jpeg" ? "jpg" : metadata.format;
    // The extraction archive contains WebP bytes under .jpg names. Supply the
    // genuine format to the browser without changing any archived file.
    await page.getByLabel("رفع صور جديدة").setInputFiles({ name: "factory-original." + format, mimeType: "image/" + metadata.format, buffer: original });
    const signResponse = await signing; assert.equal(signResponse.status(), 200, await signResponse.text());
    const signed = await signResponse.json(); originalKey = signed.key;
    const final = await finalized;
    if (final.error) throw new Error("Image finalization did not run: " + await page.locator(".admin-media-picker").innerText());
    const result = final.response; assert.equal(result.status(), 200, await result.text());
    displayUrl = (await result.json()).url;
    await page.getByText("تم رفع الصور وإضافتها إلى القائمة.", { exact: false }).waitFor();
    const privateRead = await context.request.get("http://127.0.0.1:39000/sprtaya-local-originals/" + originalKey); assert.equal(privateRead.status(), 403);
    const display = await context.request.get(displayUrl); assert.equal(display.status(), 200); assert.match(display.headers()["content-type"], /image\/webp/);
    const denied = await context.request.post(base + "/api/admin/media/upload-url", { data: { contentType: "image/jpeg", size: 1 }, headers: { origin: "https://untrusted.invalid" } }); assert.equal(denied.status(), 403);
  });
  await check("product creation with Arabic price, actual image and counted local fixture stock", async () => {
    await page.locator('[name="titleAr"]').fill("منتج اصطناعي لاختبار المتصفح");
    await page.locator('[name="descriptionAr"]').fill("منتج اختبار محلي فقط. السعر والرصيد اصطناعيان ولا يخصان كتالوج المصنع.");
    await page.locator('[name="categoryIds"]').selectOption(categoryId);
    await page.locator('[name="type"]').selectOption("READY_MADE");
    await page.locator('[name="price"]').fill("١٢٣٫٤٥");
    await page.locator('[name="detailsReviewed"]').check(); await page.locator('[name="featured"]').check();
    const variant = page.getByRole("group", { name: "المتغير 1" });
    await variant.getByLabel("الاسم بالعربية", { exact: true }).fill("متغير اختبار"); await variant.getByLabel("كمية البداية", { exact: false }).fill("3");
    await page.getByText("خيارات إضافية", { exact: true }).click(); await page.locator('[name="slug"]').fill(slug);
    await page.getByRole("button", { name: "حفظ كمسودة", exact: true }).click();
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]+\?saved=1/); productId = new URL(page.url()).pathname.split("/").pop();
    await writeFile(out + "/fixtures.json", JSON.stringify({ productId, categoryId, slug, displayUrl, originalKey }, null, 2));
    const draft = await context.request.get(base + "/ar/products/" + slug); await unavailable(draft);
  });
  await check("bulk review updates verified price and publishes without code changes", async () => {
    await goto("/admin/products/review?q=" + slug);
    await page.locator(`[name="price_${productId}"]`).fill("٢٣٤٫٥٦");
    await page.locator('[name="selectedIds"]').check();
    await page.getByRole("button", { name: "حفظ ونشر المحدد", exact: true }).click(); await page.waitForURL(/saved=published/);
    const publicPage = await browser.newPage();
    for (const locale of ["ar", "en"]) {
      const response = await publicPage.goto(base + "/" + locale + "/products/" + slug); assert.equal(response.status(), 200);
      await publicPage.getByRole("heading", { name: "منتج اصطناعي لاختبار المتصفح", exact: true }).waitFor();
      assert.equal(await publicPage.locator("html").getAttribute("dir"), locale === "ar" ? "rtl" : "ltr");
    }
    await publicPage.close();
  });
  await check("Arabic inventory adjustment commits and records a reason", async () => {
    await goto("/admin/inventory");
    const row = page.getByRole("row").filter({ has: page.locator(`a[href="/admin/products/${productId}"]`) }).first();
    await row.locator('[name="delta"]').fill("-1"); await row.locator('[name="reason"]').fill("اختبار متصفح محلي");
    await row.locator('form').filter({ has: page.locator('[name="delta"]') }).getByRole("button", { name: "حفظ", exact: true }).click();
    await page.waitForURL(/saved=1/); await page.getByText("تم تحديث المخزون.", { exact: true }).waitFor();
  });
  await check("responsive Arabic admin and bilingual storefront: 390, 768 and 1440 pixels", async () => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [url, name] of [["/admin", "admin"], ["/admin/products/review?q=" + slug, "review"], ["/ar", "store-ar"], ["/en", "store-en"]]) {
        await goto(url); await screenshot(`${name}-${width}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + " horizontal overflow at " + width);
        const broken = await page.locator("img").evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).length); assert.equal(broken, 0);
      }
    }
  });
  await check("accessibility audit of dashboard, review and product form", async () => {
    for (const url of ["/admin", "/admin/products/review?q=" + slug, "/admin/products/" + productId]) {
      await goto(url);
      await page.addScriptTag({ path: "node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.min.js" });
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })));
      audits.push({ url, violations }); assert.equal(violations.length, 0, JSON.stringify(violations));
    }
  });
  await check("unpublish removes the product immediately; logout invalidates admin access", async () => {
    await goto("/admin/products?q=" + slug);
    await page.getByRole("button", { name: "إلغاء النشر", exact: true }).click(); await page.waitForURL(/saved=1/);
    const response = await context.request.get(base + "/ar/products/" + slug); await unavailable(response);
    await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click(); await page.waitForURL(base + "/admin/login");
    await goto("/admin"); assert.ok(page.url().endsWith("/admin/login"));
  });
  assert.deepEqual(errors, []);
  await writeFile(out + "/fixtures.json", JSON.stringify({ productId, categoryId, slug, displayUrl, originalKey }, null, 2));
} finally { await report(); await browser.close(); }
