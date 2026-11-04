import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state = path.resolve(process.env.P3_STATE_DIR || path.join(root, ".local/phase3-runtime"));
const appPort = process.env.P3_APP_PORT || "3003";
if (!["3003", "3004"].includes(appPort)) throw Error("Use a reviewed loopback test port (3003 or 3004).");
const appUrl = "http://localhost:" + appPort;
const node = process.execPath;
const [command = "help", ...args] = process.argv.slice(2);
const base = {
  ...process.env,
  PATH: path.dirname(node) + ":" + process.env.PATH,
  P3_STATE_DIR: state,
  P2_RUNTIME_DIR: process.env.P2_RUNTIME_DIR || path.join(root, ".local/phase2-runtime"),
};
function run(binary, parameters, env = base) {
  const r = spawnSync(binary, parameters, { cwd: root, env, stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}
function environment(test = false) {
  const file = path.join(state, "database", test ? "env.test" : "env.local");
  const values = parse(readFileSync(file));
  const url = new URL(values.DATABASE_URL);
  const name = test ? "sprtaya_phase3_disposable_test" : "sprtaya_phase3_disposable_local";
  if (url.hostname !== "127.0.0.1" || url.port !== "33078" || url.pathname !== "/" + name)
    throw Error("Disposable Phase 3 target required.");
  const secretFile = path.join(state, "secrets.json");
  if (!existsSync(secretFile))
    writeFileSync(
      secretFile,
      JSON.stringify({
        customer: randomBytes(32).toString("hex"),
        mock: randomBytes(32).toString("hex"),
      }),
      { mode: 0o600 },
    );
  const secrets = JSON.parse(readFileSync(secretFile));
  return {
    ...base,
    ...values,
    P3_CHECKOUT: "1",
    P3_CUSTOMER_ACCOUNTS: "1",
    P3_MOCK_PAYMENTS: "1",
    P3_MANUAL_TRANSFERS: "1",
    P3_REFUNDS: "1",
    P3_NOTIFICATIONS: "1",
    P3_ENABLED: "1",
    P3_SIMULATION: "1",
    PAYMENT_MODE: "MOCK",
    P3_DISPOSABLE: "1",
    P3_STATE_DIR: state,
    PHASE3_DB_INTEGRATION: test ? "1" : "0",
    PHASE2_DB_INTEGRATION: test ? "1" : "0",
    CUSTOMER_AUTH_SECRET: secrets.customer,
    MOCK_PAYMENT_SECRET: secrets.mock,
    CUSTOMER_AUTH_URL: appUrl,
    BETTER_AUTH_URL: appUrl,
    AUTH_TRUSTED_ORIGINS: appUrl,
    NEXT_DIST_DIR: ".next-phase3",
    APP_ENV: "local",
    STAGING_SITE: "0",
    CATALOG_SOURCE: "mysql",
  };
}
if(command === "jobs")run(node,["--conditions=react-server","--import","tsx","scripts/phase3-jobs.ts",...args],{...environment(),NODE_PATH:path.join(root,"node_modules/next/dist/compiled")});
else if (command === "media") run(node, ["scripts/phase3-media.mjs", ...args]);
else if (command === "db") run("python3", ["scripts/phase3-db.py", ...args]);
else if (command === "generate")
  run(node, ["node_modules/prisma/build/index.js", "generate"], environment());
else if (command === "migrate")
  run(
    node,
    ["--import", "tsx", "scripts/phase3-migrate.ts", ...args],
    environment(args.includes("--test")),
  );
else if (command === "seed")
  run(node, ["--import", "tsx", "scripts/phase3-seed.ts", ...args], environment(args.includes("--test")));
else if (command === "baseline") {
  throw new Error(
    "Use db backup --verify, then migrate; initialization must pass the reviewed disposable preflight.",
  );
} else if (command === "test")
  run(node, ["node_modules/vitest/vitest.mjs", "run", ...args], environment(true));
else if (command === "validate")
  run(node, ["node_modules/prisma/build/index.js", "validate"], environment());
else if (command === "typecheck")
  run(node, ["node_modules/typescript/bin/tsc", "--noEmit"], environment());
else if (command === "lint") run(node, ["node_modules/eslint/bin/eslint.js", "."], environment());
else if (command === "build") {
  run(node,["node_modules/prisma/build/index.js","generate"],environment());
  run(node, ["node_modules/next/dist/bin/next", "build", "--webpack"], environment());
}
else if (command === "dev" || command === "start")
  run(
    node,
    [
      "node_modules/next/dist/bin/next",
      command,
      ...(command === "dev" ? ["--webpack"] : []),
      "--hostname",
      "127.0.0.1",
      "--port",
      appPort,
    ],
    environment(),
  );
else if (command === "exec")
  run(node, ["--import", "tsx", ...args], environment(args.includes("--test")));
else
  console.log(
    "Phase 3: db setup|status|backup --verify, generate, jobs [--watch], migrate [--test], seed [--test], test, validate, typecheck, lint, build, dev, start, exec <script>",
  );
