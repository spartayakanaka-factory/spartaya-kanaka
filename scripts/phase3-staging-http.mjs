// Local production-mode staging simulation. No hosted requests or live credentials.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3005";
const username = "local-security-review", password = randomBytes(32).toString("hex");
const valid = "Basic " + Buffer.from(username + ":" + password).toString("base64");
const checks = [];
async function scenario(configured) {
  const env = { ...process.env, APP_ENV: "staging", STAGING_SITE: "1", STAGING_ACCESS_USERNAME: configured ? username : "", STAGING_ACCESS_PASSWORD: configured ? password : "", CATALOG_SOURCE: "local", BETTER_AUTH_URL: base, AUTH_TRUSTED_ORIGINS: base, CUSTOMER_AUTH_URL: base, P3_ENABLED: "0", PAYMENT_MODE: "DISABLED" };
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3005"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  server.stdout.on("data", c => { logs += c; });
  server.stderr.on("data", c => { logs += c; });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw Error("Local staging simulation exited before readiness.");
      try { await fetch(base); ready = true; break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert.ok(ready);
    async function check(route, expected, auth, method = "GET") {
      const r = await fetch(base + route, { method, redirect: "manual", headers: { ...(auth ? { authorization: auth } : {}), origin: base, ...(method === "POST" ? { "content-type": "application/json" } : {}) }, ...(method === "POST" ? { body: "{}" } : {}) });
      assert.ok([].concat(expected).includes(r.status), `${route}: ${r.status}`);
      assert.match(r.headers.get("x-robots-tag") || "", /noindex/);
      checks.push({ configured, route, method, credentialKind: auth === valid ? "valid" : auth ? "invalid" : "absent", status: r.status, noindex: true });
      return r;
    }
    for (const route of ["/", "/admin", "/robots.txt", "/api/commerce"]) {
      await check(route, configured ? 401 : 503);
      await check(route, configured ? 401 : 503, "Basic " + Buffer.from("invalid:invalid").toString("base64"));
    }
    if (configured) {
      for (const route of ["/ar", "/en", "/admin/login"]) await check(route, 200, valid);
      const robots = await check("/robots.txt", 200, valid);
      assert.match(await robots.text(), /User-agent: \*\nDisallow: \//);
      await check("/api/admin/commerce", 503, valid, "POST");
      await check("/api/admin/media/upload-url", [401, 403], valid, "POST");
      await check("/api/customer-auth/get-session", 503, valid);
    }
    assert.doesNotMatch(logs, /Cannot find module|MODULE_NOT_FOUND|Unhandled|Error:/);
  } finally {
    const exited = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
  }
}
await scenario(false);
await scenario(true);
await writeFile("docs/phase3/integration/staging-http-local.json", JSON.stringify({ scope: "LOCAL simulation only; not Hostinger acceptance", node: process.version, checks, runtimeExceptions: [] }, null, 2) + "\n");
console.log(`PASS ${checks.length} local staging HTTP checks; secrets remained in memory.`);
