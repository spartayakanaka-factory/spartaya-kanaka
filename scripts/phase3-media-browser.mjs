// Actual admin browser -> API -> signed S3 PUT -> finalizer -> product gallery.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.P3_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.P3_BASE_URL || "http://localhost:3003",
  evidence = process.env.P3_EVIDENCE_DIR || "docs/phase3/master-execution/qa";
if (
  !(process.env.P4_WORKSTREAM === "1"
    ? base === "http://localhost:3007"
    : /^http:\/\/localhost:300[345]$/.test(base)) ||
  !(process.env.P4_WORKSTREAM === "1"
    ? process.env.MEDIA_S3_ENDPOINT === "http://127.0.0.1:39210"
    : ["http://127.0.0.1:39010", "http://127.0.0.1:39110"].includes(process.env.MEDIA_S3_ENDPOINT))
)
  throw Error("Only the isolated local browser/storage target is permitted.");
const fixtures = JSON.parse(
  await readFile(
    path.join(process.env.P3_STATE_DIR, process.env.P3_STAFF_FILE || "staff.json"),
    "utf8",
  ),
);
const browser = await chromium.launch({
    executablePath: process.env.P3_CHROME_EXECUTABLE || undefined,
    headless: true,
  }),
  context = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-for":
        "198.18." + Math.floor(Math.random() * 255) + "." + (1 + Math.floor(Math.random() * 254)),
    },
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  const login = await context.request.post(base + "/api/auth/sign-in/email", {
    headers: { origin: base },
    data: { email: fixtures.staff[0].email, password: fixtures.staff[0].password },
  });
  assert.equal(login.status(), 200);
  await page.goto(base + "/admin/products/" + fixtures.ready.id, { waitUntil: "networkidle" });
  const prior = await page
    .locator('input[name="mediaIds"]')
    .evaluateAll((elements) => elements.map((e) => e.value));
  assert.ok(prior.length);
  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles({
    name: "rejected.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await page.getByText(/الصورة يجب أن تكون JPG/).waitFor();
  const label = "synthetic-browser-" + Date.now(),
    buffer = await require("sharp")({
      create: { width: 48, height: 48, channels: 3, background: "#93613c" },
    })
      .jpeg()
      .toBuffer();
  const signedResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/admin/media/upload-url") && r.request().method() === "POST",
  );
  await upload.setInputFiles({ name: label + ".jpg", mimeType: "image/jpeg", buffer });
  const signed = await (await signedResponse).json();
  await page
    .getByText("تم رفع الصور وإضافتها إلى القائمة. احفظ المنتج لتثبيت ارتباطها.", { exact: true })
    .waitFor();
  await page.getByLabel(/اختر صور المنتج من مكتبة الوسائط/).selectOption({ label });
  const selected = await page.locator('input[name="mediaIds"]').inputValue();
  assert.match(selected, /^[a-f0-9-]{36}$/);
  async function save() {
    await page.getByRole("button", { name: "حفظ التغييرات", exact: true }).click();
    await page.waitForURL(
      (u) => u.pathname.endsWith(fixtures.ready.id) && u.searchParams.get("saved") === "1",
    );
  }
  await save();
  assert.equal(await page.locator('input[name="mediaIds"]').inputValue(), selected);
  await page.goto(base + "/ar/products/" + fixtures.ready.slug, { waitUntil: "networkidle" });
  const image = page
    .locator('img[src*="' + new URL(process.env.MEDIA_S3_ENDPOINT).host + '/"]')
    .first();
  await image.waitFor();
  await image.evaluate((el) => el.decode());
  assert.ok(await image.evaluate((el) => el.naturalWidth > 0));
  assert.equal(
    (
      await context.request.get(
        process.env.MEDIA_PUBLIC_BASE_URL +
          "/" +
          new URL(await image.getAttribute("src")).pathname.split("/").slice(2).join("/"),
      )
    ).status(),
    200,
  );
  const privateRead = await context.request.get(
    process.env.MEDIA_S3_ENDPOINT + "/" + process.env.MEDIA_S3_ORIGINALS_BUCKET + "/" + signed.key,
  );
  assert.equal(privateRead.status(), 403);
  await mkdir(evidence + "/screenshots", { recursive: true });
  await page.screenshot({
    path: evidence + "/screenshots/admin-browser-upload.png",
    fullPage: true,
  });
  // Restore this new synthetic product's original genuine-photo association.
  // Keep the new S3 asset for inspection; no retention/deletion policy is invented.
  await page.goto(base + "/admin/products/" + fixtures.ready.id, { waitUntil: "networkidle" });
  await page.getByLabel(/اختر صور المنتج من مكتبة الوسائط/).selectOption(prior);
  await save();
  assert.deepEqual(
    await page
      .locator('input[name="mediaIds"]')
      .evaluateAll((elements) => elements.map((e) => e.value)),
    prior,
  );
  assert.deepEqual(errors, []);
  checks.push({
    name: "real admin browser upload/replacement/retrieval and association restoration",
    pass: true,
    privateOriginalAnonymousStatus: 403,
    publicDisplayStatus: 200,
    invalidMimeRejected: true,
    genuinePhotoAssociationRestored: true,
  });
  await writeFile(
    evidence + "/media-browser.json",
    JSON.stringify(
      { productionMode: true, checks, errors, signedUrlsOrCredentialsRecorded: false },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS real admin browser upload, replacement, public/private reads and original photo restoration.",
  );
} finally {
  await browser.close();
}
