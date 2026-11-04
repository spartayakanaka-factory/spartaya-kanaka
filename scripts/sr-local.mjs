// Local-only synthetic application sandbox. Never accepts a hosted target.
import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import mariadb from "mariadb";

const root = process.cwd();
const state = path.resolve(root, "../../sr-local/runtime");
const source = path.resolve(root, "../../phase3/runtime/database");
const schema = "sprtaya_sr_staging_local",
  runtimeUser = "sprtaya_sr_runtime",
  migrator = "sprtaya_sr_migrator";
const command = process.argv[2];
const secureWrite = (file, content) => writeFileSync(file, content, { mode: 0o600, flag: "wx" });
const run = (binary, args, env) => {
  const result = spawnSync(binary, args, { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Local sandbox command failed.");
};

async function init() {
  if (existsSync(state)) throw new Error("Local sandbox state exists; refusing to overwrite.");
  const rootSecret = JSON.parse(readFileSync(path.join(source, "credentials.json"), "utf8")).root;
  const admin = await mariadb.createConnection({
    socketPath: path.join(source, "mariadb.sock"),
    user: "root",
    password: rootSecret,
  });
  try {
    const [identity] = await admin.query(
      "SELECT VERSION() AS version, @@port AS port, @@bind_address AS binding",
    );
    if (
      !identity.version.startsWith("11.8.9-MariaDB") ||
      Number(identity.port) !== 33078 ||
      identity.binding !== "127.0.0.1"
    )
      throw new Error("Wrong local database service.");
    const schemas = await admin.query(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [schema],
    );
    const users = await admin.query("SELECT User FROM mysql.user WHERE User IN (?, ?)", [
      runtimeUser,
      migrator,
    ]);
    if (schemas.length || users.length)
      throw new Error("Sandbox database or account exists; refusing reuse.");
    const manifest = JSON.parse(readFileSync("docs/phase4/migration-manifest.json", "utf8"));
    const directories = readdirSync("prisma/migrations", { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    if (
      JSON.stringify(directories) !== JSON.stringify(manifest.migrations.map((m) => m.name).sort())
    )
      throw new Error("Unexpected migrations.");
    for (const m of manifest.migrations)
      if (
        createHash("sha256")
          .update(readFileSync(`prisma/migrations/${m.name}/migration.sql`))
          .digest("hex") !== m.sha256
      )
        throw new Error("Migration checksum mismatch.");
    const app = randomBytes(32).toString("hex"),
      migrationSecret = randomBytes(32).toString("hex");
    const auth = randomBytes(32).toString("hex"),
      customer = randomBytes(32).toString("hex"),
      mock = randomBytes(32).toString("hex");
    mkdirSync(path.join(state, "database"), { recursive: true, mode: 0o700 });
    secureWrite(
      path.join(state, "database/env.local"),
      `DATABASE_URL=mysql://${runtimeUser}:${app}@127.0.0.1:33078/${schema}\nDATABASE_TARGET=local\nBETTER_AUTH_SECRET=${auth}\n`,
    );
    secureWrite(path.join(state, "secrets.json"), JSON.stringify({ customer, mock }));
    await admin.query(
      `CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await admin.query(`CREATE USER '${runtimeUser}'@'127.0.0.1' IDENTIFIED BY ?`, [app]);
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${schema}\`.* TO '${runtimeUser}'@'127.0.0.1'`,
    );
    await admin.query(`CREATE USER '${migrator}'@'127.0.0.1' IDENTIFIED BY ?`, [migrationSecret]);
    try {
      await admin.query(`GRANT ALL PRIVILEGES ON \`${schema}\`.* TO '${migrator}'@'127.0.0.1'`);
      const env = {
        ...process.env,
        DATABASE_URL: `mysql://${migrator}:${migrationSecret}@127.0.0.1:33078/${schema}`,
      };
      run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], env);
      const history = await admin.query(
        `SELECT migration_name, checksum, finished_at, rolled_back_at FROM \`${schema}\`._prisma_migrations ORDER BY migration_name`,
      );
      if (
        history.length !== manifest.migrations.length ||
        history.some(
          (h, i) =>
            h.migration_name !== manifest.migrations[i].name ||
            h.checksum !== manifest.migrations[i].sha256 ||
            !h.finished_at ||
            h.rolled_back_at,
        )
      )
        throw new Error("Migration history mismatch.");
    } finally {
      await admin.query(`DROP USER '${migrator}'@'127.0.0.1'`);
    }
    console.log(
      "Fresh local-only schema created and verified; migration user removed and runtime user limited to its schema.",
    );
  } finally {
    await admin.end();
  }
}

function environment() {
  const values = parse(readFileSync(path.join(state, "database/env.local")));
  const u = new URL(values.DATABASE_URL || "");
  if (
    u.protocol !== "mysql:" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.pathname !== "/" + schema ||
    u.username !== runtimeUser
  )
    throw new Error("Wrong local sandbox target.");
  const secrets = JSON.parse(readFileSync(path.join(state, "secrets.json"), "utf8"));
  let mediaIdentity = {};
  const staffFile = path.join(state, "staff.json"),
    customerFile = path.join(state, "customer.json");
  const staffIds = existsSync(staffFile)
    ? JSON.parse(readFileSync(staffFile, "utf8")).staff.map((x) => x.id)
    : [];
  const customerIds = existsSync(customerFile)
    ? [JSON.parse(readFileSync(customerFile, "utf8")).id]
    : [];
  if (
    ![...staffIds, ...customerIds].every(
      (id) => typeof id === "string" && /^[a-zA-Z0-9-]{1,191}$/.test(id),
    )
  )
    throw new Error("Invalid fixture registry.");
  if (Object.keys(values).some((key) => key.startsWith("MEDIA_"))) {
    const media = JSON.parse(readFileSync(path.join(state, "media/credentials.json"), "utf8"));
    if (
      values.MEDIA_S3_ENDPOINT !== "http://127.0.0.1:39310" ||
      values.MEDIA_S3_ORIGINALS_BUCKET !== "sprtaya-phase3-originals" ||
      values.MEDIA_S3_DISPLAY_BUCKET !== "sprtaya-phase3-display" ||
      values.MEDIA_PUBLIC_BASE_URL !== "http://127.0.0.1:39310/sprtaya-phase3-display" ||
      values.MEDIA_ACCESS_KEY_ID !== media.app ||
      values.MEDIA_SECRET_ACCESS_KEY !== media.secret
    )
      throw new Error("Wrong disposable storage identity.");
    mediaIdentity = {
      SR_LOCAL_MEDIA_ACCESS_KEY_ID: media.app,
      SR_LOCAL_MEDIA_SECRET_ACCESS_KEY: media.secret,
    };
  }
  const inherited = { ...process.env };
  for (const key of Object.keys(inherited)) if (key.startsWith("MEDIA_")) delete inherited[key];
  return {
    ...inherited,
    ...values,
    SR_LOCAL_MEDIA_ACCESS_KEY_ID: "",
    SR_LOCAL_MEDIA_SECRET_ACCESS_KEY: "",
    ...mediaIdentity,
    APP_ENV: "local",
    STAGING_SITE: "0",
    SR_LOCAL_ISOLATION: "1",
    SR_LOCAL_ALLOWED_STAFF_IDS: staffIds.join(","),
    SR_LOCAL_ALLOWED_CUSTOMER_IDS: customerIds.join(","),
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
    P35_WORKSTREAM: "1",
    P35_PAYMENT_EVIDENCE: "1",
    P4_OWNER_REPORTS: "1",
    CATALOG_SOURCE: "mysql",
    P3_STATE_DIR: state,
    P3_BASE_URL: "http://localhost:3008",
    P3_APP_PORT: "3008",
    BETTER_AUTH_URL: "http://localhost:3008",
    AUTH_TRUSTED_ORIGINS: "http://localhost:3008",
    CUSTOMER_AUTH_URL: "http://localhost:3008",
    CUSTOMER_AUTH_SECRET: secrets.customer,
    MOCK_PAYMENT_SECRET: secrets.mock,
    NEXT_DIST_DIR: ".next-phase4",
    P3_MEDIA_PORT_BASE: "39310",
  };
}

try {
  if (!process.version.startsWith("v22.")) throw new Error("Node 22 required.");
  if (command === "init") await init();
  else {
    const env = environment();
    if (command === "seed") {
      run(process.execPath, ["--import", "tsx", "scripts/seed-database.ts"], env);
      run(process.execPath, ["--import", "tsx", "scripts/phase3-seed.ts"], env);
      if (!existsSync(path.join(state, "staff.json")))
        throw new Error("Partial fixture seed requires inspection.");
    } else if (command === "recover-seed")
      run(process.execPath, ["--import", "tsx", "scripts/sr-resume-fixtures.ts"], env);
    else if (command === "provision-customer")
      run(process.execPath, ["--import", "tsx", "scripts/sr-provision-customer.ts"], env);
    else if (command === "media")
      run(process.execPath, ["scripts/phase3-media.mjs", ...process.argv.slice(3)], env);
    else if (command === "build") {
      run(process.execPath, ["node_modules/prisma/build/index.js", "generate"], env);
      run(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], env);
    } else if (command === "start") {
      if (!env.SR_LOCAL_ALLOWED_STAFF_IDS || !env.SR_LOCAL_ALLOWED_CUSTOMER_IDS)
        throw new Error("Fixture registry required.");
      run(
        process.execPath,
        ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3008"],
        env,
      );
    } else if (command === "exec")
      run(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", ...process.argv.slice(3)],
        env,
      );
    else
      throw new Error(
        "Use init, seed, recover-seed, provision-customer, media, build, start, or exec.",
      );
  }
} catch {
  console.error(
    "Local sandbox operation failed; private diagnostics suppressed. Existing state was not reset.",
  );
  process.exitCode = 1;
}
