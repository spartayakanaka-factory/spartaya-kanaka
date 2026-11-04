import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state = path.join(root, ".local/phase2");
const args = process.argv.slice(2);
const command = args.shift() || "help";
const node = process.execPath;
const env = { ...process.env, PATH: path.dirname(node) + path.delimiter + process.env.PATH };

function run(binary, parameters, environment = env) {
  const result = spawnSync(binary, parameters, { cwd: root, env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function localEnvironment(test = false) {
  const values = parse(readFileSync(path.join(state, test ? "env.test" : "env.local")));
  const url = new URL(values.DATABASE_URL);
  const expected = test ? "sprtaya_phase2_test" : "sprtaya_phase2_local";
  if (values.DATABASE_TARGET !== "local" || url.hostname !== "127.0.0.1" || url.port !== "33077" || url.pathname !== "/" + expected) {
    throw new Error("The local runner only accepts this workspace's isolated loopback databases.");
  }
  return { ...env, ...values, APP_ENV: "local", STAGING_SITE: "0" };
}

if (command === "db") {
  run("python3", ["scripts/local-mariadb.py", ...args]);
} else if (command === "tools") {
  run("python3", ["scripts/local-tools.py"]);
} else if (command === "media") {
  run(node, ["scripts/local-media.mjs", ...args]);
} else if (command === "init") {
  run(node, ["node_modules/prisma/build/index.js", "generate"], localEnvironment());
  for (const test of [false, true]) {
    const local = localEnvironment(test);
    run(node, ["--import", "tsx", "scripts/deploy-migrations.ts"], local);
    run(node, ["--import", "tsx", "scripts/seed-database.ts"], local);
  }
} else if (command === "import") {
  run(node, ["--import", "tsx", "scripts/import-legacy-catalog.ts", ...args], localEnvironment());
} else if (command === "bootstrap") {
  const test = args.includes("--test");
  const file = path.join(state, test ? "owner-test.json" : "owner.json");
  const owner = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { email: "local-owner@example.invalid", name: "مالك الاختبار المحلي", password: randomBytes(32).toString("hex") };
  if (!existsSync(file)) {
    writeFileSync(file, JSON.stringify(owner, null, 2) + "\n", { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  run(node, ["--import", "tsx", "scripts/bootstrap-owner.ts", owner.email, owner.name, "--confirm-local"], {
    ...localEnvironment(test),
    OWNER_BOOTSTRAP_EMAIL: owner.email,
    OWNER_BOOTSTRAP_PASSWORD: owner.password,
    OWNER_BOOTSTRAP_PASSWORD_CONFIRM: owner.password,
  });
} else if (command === "test") {
  run(node, ["node_modules/vitest/vitest.mjs", "run", ...args], localEnvironment(true));
} else if (["validate", "typecheck", "lint"].includes(command)) {
  const commands = { validate: ["node_modules/prisma/build/index.js", "validate"], typecheck: ["node_modules/typescript/bin/tsc", "--noEmit"], lint: ["node_modules/eslint/bin/eslint.js", "."] };
  run(node, commands[command], localEnvironment());
} else if (command === "dev" || command === "start") {
  const local = localEnvironment();
  local.NEXT_DIST_DIR = command === "dev" ? ".next-phase2" : ".next-local";
  run(node, ["node_modules/next/dist/bin/next", command, ...(command === "dev" ? ["--webpack"] : []), "--hostname", "127.0.0.1", "--port", "3002"], local);
} else if (command === "build") {
  const local = localEnvironment();
  local.NEXT_DIST_DIR = ".next-local";
  run(node, ["node_modules/prisma/build/index.js", "generate"], local);
  run(node, ["node_modules/next/dist/bin/next", "build", "--webpack"], local);
} else if (command === "pnpm") {
  run(node, [path.join(state, "tools/pnpm/bin/pnpm.cjs"), ...args], localEnvironment());
} else {
  console.log("Local Phase 2: db setup|start|stop|status|backup [--verify], tools, media start|stop, init, bootstrap [--test], import [--apply], dev, build, start, validate, typecheck, lint, test, pnpm <command>");
}
