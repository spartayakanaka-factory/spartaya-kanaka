import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { getDatabase } from "../src/lib/server/database";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright"),
  base = "http://localhost:3007",
  alt = "http://localhost:3011";
const u = new URL(process.env.DATABASE_URL || "");
if (
  u.hostname !== "127.0.0.1" ||
  u.port !== "33078" ||
  u.pathname !== "/sprtaya_phase4_disposable_local" ||
  u.username !== "sprtaya_phase4"
)
  throw Error("Disposable local target required");
const staff = JSON.parse(await readFile(path.join(process.env.P3_STATE_DIR, "staff.json"), "utf8"))
  .staff[0];
const browser = await chromium.launch({
    executablePath: process.env.P3_CHROME_EXECUTABLE,
    headless: true,
  }),
  context = await browser.newContext(),
  page = await context.newPage();
let child, blackhole;
const sockets = new Set();
let maxSockets = 0;
async function stop() {
  if (child) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    child = undefined;
  }
}
async function start(url) {
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3011"],
    { env: { ...process.env, DATABASE_URL: url, NODE_ENV: "production" }, stdio: "ignore" },
  );
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw Error("Local test server failed");
    try {
      await fetch(alt + "/admin/login");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw Error("Local test server startup timed out");
}
try {
  await page.goto(base + "/admin/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(staff.email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(staff.password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL(/\/admin$/);
  const db = getDatabase(),
    key = "p4-report:" + createHash("sha256").update(staff.id).digest("hex");
  await db.authRateLimit.deleteMany({ where: { key } });
  await db.$disconnect();
  const bad = new URL(process.env.DATABASE_URL);
  bad.port = "33079";
  if (process.env.P4_BLACKHOLE === "1") {
    blackhole = createServer((socket) => {
      sockets.add(socket);
      maxSockets = Math.max(maxSockets, sockets.size);
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise((resolve, reject) => {
      blackhole.once("error", reject);
      blackhole.listen(33079, "127.0.0.1", resolve);
    });
  }
  await start(bad.toString());
  const started = Date.now();
  const responses = await Promise.all(
    Array.from({ length: process.env.P4_BLACKHOLE === "1" ? 5 : 1 }, () =>
      context.request.get(alt + "/api/admin/reports?start=1901-01-01&end=1901-01-01", {
        timeout: 20000,
      }),
    ),
  );
  const statuses = responses.map((r) => r.status()),
    unavailable = statuses[0],
    latencyMs = Date.now() - started;
  for (const response of responses) {
    assert.ok([403, 500, 503].includes(response.status()));
    assert.doesNotMatch(await response.text(), /collected|outstanding|currencies/);
  }
  if (process.env.P4_BLACKHOLE === "1") {
    assert.ok(maxSockets > 0 && maxSockets <= 5);
  }
  let res;
  await stop();
  await start(process.env.DATABASE_URL);
  res = await context.request.get(alt + "/api/admin/reports?start=1901-01-01&end=1901-01-01", {
    timeout: 20000,
  });
  assert.equal(res.status(), 200);
  await writeFile(
    process.env.P4_BLACKHOLE === "1"
      ? "docs/phase4/outage-timeout-evidence.json"
      : "docs/phase4/outage-evidence.json",
    JSON.stringify(
      {
        scope:
          process.env.P4_BLACKHOLE === "1"
            ? "Separate local production server with a nonresponsive loopback MariaDB handshake, followed by restart with the correct disposable database; no database shutdown."
            : "Separate local production server with unreachable loopback database port, followed by restart with the correct disposable database; no database shutdown.",
        unavailableStatus: unavailable,
        statuses,
        simulatedHandshakeTimeout: process.env.P4_BLACKHOLE === "1",
        maximumObservedSockets: maxSockets,
        unavailableLatencyMs: latencyMs,
        recoveredStatus: res.status(),
        leakedReportFields: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("PASS local unreachable database and recovery");
} catch {
  console.error("Local outage test failed; private request details suppressed.");
  process.exitCode = 1;
} finally {
  await stop();
  for (const socket of sockets) socket.destroy();
  if (blackhole) await new Promise((resolve) => blackhole.close(resolve));
  await context.close();
  await browser.close();
}
