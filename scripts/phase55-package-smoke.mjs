// Smoke the extracted source-only package with no database, provider or storage credentials.
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, open } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const folder = path.resolve("../releases/clean-check"),
  base = "http://127.0.0.1:3011",
  secret = randomBytes(32).toString("base64url"),
  auth = "Basic " + Buffer.from("local-package-test:" + secret).toString("base64");
const env = {
  PATH: path.dirname(process.execPath) + ":/usr/bin:/bin",
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  NODE_ENV: "production",
  APP_ENV: "staging",
  STAGING_SITE: "1",
  STAGING_ACCESS_USERNAME: "local-package-test",
  STAGING_ACCESS_PASSWORD: secret,
  CATALOG_SOURCE: "local",
  LEGACY_ASSET_ROOT: path.resolve("../../../sprtaya-kanaka-assets"),
  P3_ENABLED: "0",
  P3_NOTIFICATIONS: "0",
  P3_CHECKOUT: "0",
  PAYMENT_MODE: "MOCK",
};
const log = await open("../releases/package-runtime.log", "w"),
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3011"],
    { cwd: folder, env, stdio: ["ignore", log.fd, log.fd] },
  ),
  checks = [];
const get = (url, authorization) =>
  fetch(base + url, { redirect: "manual", headers: authorization ? { authorization } : {} });
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await get("/ar")).status === 401) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (child.exitCode !== null) throw Error("Package server stopped");
  }
  const body = await (await get("/ar", auth)).text();
  const js = [...body.matchAll(/(?:src|href)="([^" ]+\.js(?:\?[^" ]*)?)"/g)]
    .map((x) => x[1])
    .find((v) => v.startsWith("/_next/"));
  const css = [...body.matchAll(/href="([^" ]+\.css(?:\?[^" ]*)?)"/g)]
    .map((x) => x[1])
    .find((v) => v.startsWith("/_next/"));
  assert.ok(js && css);
  const records = JSON.parse(
      await readFile(path.join(folder, "sprtaya-kanaka-assets/بيانات/products.json")),
    ),
    image = records[0].images.find((i) => i.status === "downloaded").local_path,
    imageUrl = "/assets/" + image.split("/").map(encodeURIComponent).join("/");
  for (const route of [
    "/",
    "/ar",
    "/en",
    "/admin/login",
    "/api/admin/media",
    "/api/admin/commerce",
    "/api/auth/get-session",
    "/api/staging-database-preflight",
    "/robots.txt",
    "/sitemap.xml",
    "/icon.svg",
    js,
    css,
    imageUrl,
  ]) {
    for (const [kind, header] of [
      ["anonymous", undefined],
      ["invalid", "Basic invalid"],
    ]) {
      const r = await get(route, header);
      assert.equal(r.status, 401, kind + " " + route);
      assert.match(r.headers.get("x-robots-tag"), /noindex/);
      checks.push({ route, kind, status: r.status });
    }
  }
  for (const route of ["/ar", "/en", "/admin/login", js, css, imageUrl, "/robots.txt"]) {
    const r = await get(route, auth);
    assert.equal(r.status, 200, route);
    assert.match(r.headers.get("x-robots-tag"), /noindex/);
    if (route === "/robots.txt") assert.match(await r.text(), /Disallow: \/(\s|$)/);
    if (route === imageUrl) {
      const original = await readFile(path.join(env.LEGACY_ASSET_ROOT, image)),
        bytes = Buffer.from(await r.arrayBuffer());
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        createHash("sha256").update(original).digest("hex"),
      );
      assert.equal(r.headers.get("content-type"), "image/webp");
    }
    checks.push({ route, kind: "valid-site", status: r.status });
  }
  for (const route of [
    "/api/admin/media",
    "/api/admin/commerce",
    "/api/staging-database-preflight",
    "/api/commerce?resource=cart",
  ]) {
    const r = await get(route, auth);
    assert.ok(r.status >= 400, route);
    checks.push({ route, kind: "site-auth-no-staff-or-db", status: r.status });
  }
  for (const route of [
    "/.env",
    "/.git/config",
    "/package.json",
    "/prisma/schema.prisma",
    "/src/app/page.tsx",
    "/RELEASE-MANIFEST.json",
    "/sprtaya-phase55-preview.zip",
  ]) {
    const r = await get(route, auth);
    assert.equal(r.status, 404, route);
    checks.push({ route, kind: "private-source-probe", status: r.status });
  }
  const result = {
    scope:
      "Clean extracted package, real production-mode Next server, no database/service credentials; local routing only",
    checks,
    proxyEnforced: true,
    originalArabicImageHashMatches: true,
    imageContentType: "image/webp",
    disabledCommerce: true,
    hostingerRoutingVerified: false,
  };
  await writeFile("docs/phase55/package-runtime.json", JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      checks: checks.length,
      pass: true,
      databaseCredentials: false,
      hostedExecution: false,
    }),
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 4000).unref();
  });
  await log.close();
}
