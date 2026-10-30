// A separate local workstream: fresh schemas only, never the accepted Phase 3 data.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import mariadb from "mariadb";

const root = process.cwd(),
  state = path.resolve(process.env.P35_STATE_DIR || path.join(root, "../runtime"));
const [command = "help", ...args] = process.argv.slice(2);
const names = ["sprtaya_phase35_disposable_local", "sprtaya_phase35_disposable_test"];
const privateFile = (name, value) => writeFileSync(path.join(state, name), value, { mode: 0o600 });
function run(binary, parameters, environment) {
  const r = spawnSync(binary, parameters, { cwd: root, env: environment, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}
async function main() {
  if (!process.version.startsWith("v22.")) throw Error("Use the reviewed Node 22 toolchain.");
  if (command === "init") {
    if (!process.env.P35_SOURCE_RUNTIME)
      throw Error("Explicit private local source runtime required.");
    const original = JSON.parse(
      readFileSync(path.join(process.env.P35_SOURCE_RUNTIME, "database/credentials.json")),
    );
    const db = await mariadb.createConnection({
      socketPath: path.join(process.env.P35_SOURCE_RUNTIME, "database/mariadb.sock"),
      user: "root",
      password: original.root,
    });
    try {
      const [identity] = await db.query(
        "SELECT VERSION() version,@@port port,@@bind_address bindAddress",
      );
      if (
        !identity.version.startsWith("11.8.9-MariaDB") ||
        Number(identity.port) !== 33078 ||
        identity.bindAddress !== "127.0.0.1"
      )
        throw Error("Disposable service identity mismatch.");
      const occupied = await db.query(
        "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (?,?)",
        names,
      );
      const users = await db.query("SELECT User FROM mysql.user WHERE User='sprtaya_phase35'");
      if (occupied.length || users.length)
        throw Error("Phase 3.5 target already exists; refuse to reset/reuse implicitly.");
      const app = randomBytes(32).toString("hex"),
        auth = randomBytes(32).toString("hex");
      await db.query("CREATE USER 'sprtaya_phase35'@'127.0.0.1' IDENTIFIED BY ?", [app]);
      mkdirSync(path.join(state, "database/backups"), { recursive: true, mode: 0o700 });
      for (const [i, name] of names.entries()) {
        await db.query(
          "CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        );
        await db.query("GRANT ALL ON `" + name + "`.* TO 'sprtaya_phase35'@'127.0.0.1'");
        privateFile(
          "database/" + (i ? "env.test" : "env.local"),
          `DATABASE_URL=mysql://sprtaya_phase35:${app}@127.0.0.1:33078/${name}\nDATABASE_TARGET=local\nBETTER_AUTH_SECRET=${auth}\n`,
        );
      }
      privateFile("database/credentials.json", JSON.stringify({ app, auth }));
      privateFile(
        "secrets.json",
        JSON.stringify({
          customer: randomBytes(32).toString("hex"),
          mock: randomBytes(32).toString("hex"),
        }),
      );
      console.log(
        "Created two fresh Phase 3.5 disposable schemas and a schema-scoped local user. Existing databases unchanged.",
      );
    } finally {
      await db.end();
    }
  } else {
    const test = args.includes("--test") || command === "test";
    const values = parse(
      readFileSync(path.join(state, "database", test ? "env.test" : "env.local")),
    );
    const u = new URL(values.DATABASE_URL);
    if (
      u.hostname !== "127.0.0.1" ||
      u.port !== "33078" ||
      u.pathname !== "/" + names[test ? 1 : 0] ||
      u.username !== "sprtaya_phase35"
    )
      throw Error("Exact Phase 3.5 disposable target required.");
    const secrets = JSON.parse(readFileSync(path.join(state, "secrets.json")));
    const env = {
      ...process.env,
      ...values,
      PATH: path.dirname(process.execPath) + ":" + process.env.PATH,
      P35_WORKSTREAM: "1",
      P3_STATE_DIR: state,
      P3_APP_PORT: "3005",
      P3_BASE_URL: "http://localhost:3005",
      NEXT_DIST_DIR: ".next-phase35",
      APP_ENV: "local",
      STAGING_SITE: "0",
      CATALOG_SOURCE: "mysql",
      P3_ENABLED: "1",
      P3_SIMULATION: "1",
      P3_DISPOSABLE: "1",
      PAYMENT_MODE: "MOCK",
      P3_CHECKOUT: "1",
      P3_CUSTOMER_ACCOUNTS: "1",
      P3_MOCK_PAYMENTS: "1",
      P3_MANUAL_TRANSFERS: "1",
      P3_REFUNDS: "1",
      P3_NOTIFICATIONS: "1",
      CUSTOMER_AUTH_SECRET: secrets.customer,
      MOCK_PAYMENT_SECRET: secrets.mock,
      CUSTOMER_AUTH_URL: "http://localhost:3005",
      BETTER_AUTH_URL: "http://localhost:3005",
      AUTH_TRUSTED_ORIGINS: "http://localhost:3005",
      PHASE3_DB_INTEGRATION: test ? "1" : "0",
      PHASE2_DB_INTEGRATION: test ? "1" : "0",
      P35_PAYMENT_EVIDENCE: command === "test" ? "0" : "1",
      P3_MEDIA_PORT_BASE: "39110",
    };
    const node = process.execPath;
    if (command === "media") run(node, ["scripts/phase3-media.mjs", ...args], env);
    else if (["generate", "validate"].includes(command))
      run(node, ["node_modules/prisma/build/index.js", command], env);
    else if (command === "test") run(node, ["node_modules/vitest/vitest.mjs", "run", ...args], env);
    else if (command === "lint") run(node, ["node_modules/eslint/bin/eslint.js", "."], env);
    else if (command === "typecheck")
      run(node, ["node_modules/typescript/bin/tsc", "--noEmit"], env);
    else if (command === "build") {
      run(node, ["node_modules/prisma/build/index.js", "generate"], env);
      run(node, ["node_modules/next/dist/bin/next", "build", "--webpack"], env);
    } else if (command === "start")
      run(
        node,
        ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3005"],
        env,
      );
    else if (command === "seed")
      run(node, ["--import", "tsx", "scripts/phase3-seed.ts", ...args], env);
    else if (command === "exec")
      run(node, ["--conditions=react-server", "--import", "tsx", ...args], {
        ...env,
        NODE_PATH: path.join(root, "node_modules/next/dist/compiled"),
      });
    else
      console.log(
        "Phase 3.5 local: init, media, generate, validate, lint, typecheck, test, build, start, seed, exec",
      );
  }
}
main().catch(() => {
  console.error(
    "Phase 3.5 local command failed; verify isolated target and private configuration. No credentials logged.",
  );
  process.exitCode = 1;
});
