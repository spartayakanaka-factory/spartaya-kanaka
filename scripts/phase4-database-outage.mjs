import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { parse } from "dotenv";
import mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "better-auth/crypto";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright"),
  alt = "http://localhost:3011";
const vars = parse(await readFile(process.env.P3_STATE_DIR + "/outage-isolated/database/env.test"));
const u = new URL(vars.DATABASE_URL);
if (
  u.hostname !== "127.0.0.1" ||
  u.port !== "33079" ||
  u.pathname !== "/sprtaya_phase4_outage_test" ||
  u.username !== "sprtaya_phase3"
)
  throw Error("Wrong isolated outage target");
const config = {
  host: u.hostname,
  port: Number(u.port),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  connectionLimit: 3,
};
const db = new PrismaClient({ adapter: new PrismaMariaDb(config) }),
  email = "outage-" + randomBytes(12).toString("hex") + "@factory.invalid",
  password = "Local-" + randomBytes(24).toString("hex");
const browser = await chromium.launch({
    executablePath: process.env.P3_CHROME_EXECUTABLE,
    headless: true,
  }),
  context = await browser.newContext();
let phase = "initialization";
let child,
  lock,
  isolatedRunning = true;
const run = promisify(execFile);
async function control(command) {
  await run("python3", ["scripts/phase4-isolated-db.py", command], { timeout: 30000 });
  isolatedRunning = command !== "stop";
}
async function stopApp() {
  if (child) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    child = undefined;
  }
}
try {
  phase = "creating synthetic owner";
  await db.adminRole.upsert({
    where: { code: "OWNER" },
    create: { code: "OWNER", nameAr: "مالك اختباري" },
    update: {},
  });
  const owner = await db.adminUser.create({
    data: {
      name: "Synthetic outage owner",
      email,
      roleCode: "OWNER",
      emailVerified: true,
      forcePasswordChange: false,
    },
  });
  await db.authAccount.create({
    data: {
      id: randomUUID(),
      accountId: owner.id,
      userId: owner.id,
      providerId: "credential",
      password: await hashPassword(password),
    },
  });
  await db.$disconnect();
  phase = "starting application";
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3011"],
    {
      env: {
        ...process.env,
        DATABASE_URL: vars.DATABASE_URL,
        BETTER_AUTH_URL: alt,
        AUTH_TRUSTED_ORIGINS: alt,
        NODE_ENV: "production",
      },
      stdio: "ignore",
    },
  );
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw Error("server failed");
    try {
      await fetch(alt + "/admin/login");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  phase = "authenticating synthetic owner";
  const login = await context.request.post(alt + "/api/auth/sign-in/email", {
    headers: { origin: alt },
    data: { email, password },
  });
  assert.equal(login.status(), 200);
  let session = await context.request.get(alt + "/api/auth/get-session");
  assert.equal(session.status(), 200);
  assert.equal((await session.json()).user.id, owner.id);
  phase = "locking isolated session table";
  lock = await mariadb.createConnection(config);
  lock.on("error", () => {});
  await lock.query("LOCK TABLES auth_sessions WRITE");
  const started = Date.now(),
    request = context.request.get(alt + "/api/admin/reports?start=1901-01-01&end=1901-01-01", {
      timeout: 20000,
    });
  phase = "waiting for in-flight request";
  const pending = await Promise.race([
    request.then(
      () => false,
      () => false,
    ),
    new Promise((resolve) => setTimeout(() => resolve(true), 500)),
  ]);
  assert.equal(pending, true);
  phase = "stopping isolated database during request";
  await control("stop");
  const response = await request;
  assert.ok([403, 500, 503].includes(response.status()));
  assert.doesNotMatch(await response.text(), /collected|outstanding|currencies/);
  const elapsed = Date.now() - started;
  try {
    await lock.end();
  } catch {}
  lock = undefined;
  phase = "restarting isolated database";
  await control("start");
  let recovered = false;
  for (let i = 0; i < 15; i++) {
    try {
      session = await context.request.get(alt + "/api/auth/get-session", { timeout: 3000 });
      const body = await session.json();
      if (session.status() === 200 && body?.user?.id === owner.id) {
        recovered = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.equal(recovered, true);
  await writeFile(
    "docs/phase4/database-outage-during-request.json",
    JSON.stringify(
      {
        scope:
          "Entire separate loopback-only MariaDB instance stopped while a real authenticated report request was waiting on its session table; the shared Phase 2–4 service was not stopped.",
        requestWasPendingBeforeShutdown: true,
        responseStatus: response.status(),
        elapsedMs: elapsed,
        financialDataExposed: false,
        databaseRestarted: true,
        sessionRecovered: true,
        reportAfterRecovery:
          "The separate instance is intentionally excluded by the commerce safety guard; successful report recovery is separately verified in outage-evidence.json.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS separate MariaDB shutdown during an authenticated report request and session recovery",
  );
} catch (error) {
  console.error(
    "Isolated outage test failed during " +
      phase +
      " (" +
      error.name +
      ", code " +
      (typeof error.code === "string" ? error.code : "none") +
      "); private details withheld.",
  );
  process.exitCode = 1;
} finally {
  if (lock)
    try {
      await lock.end();
    } catch {}
  await stopApp();
  await context.close();
  await browser.close();
  if (isolatedRunning)
    try {
      await control("stop");
    } catch {
      console.error("Could not stop isolated outage database; inspect its private runtime.");
      process.exitCode = 1;
    }
}
