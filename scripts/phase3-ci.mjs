// GitHub-hosted ephemeral Linux runner only. No factory credentials, deploy,
// hosted DB connections or use of an existing database/container are supported.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import mariadb from "mariadb";
import sharp from "sharp";
import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { ciTargets } from "./ci-targets.mjs";
if (
  process.argv.slice(2).some((a) => !["--phase35", "--phase4"].includes(a)) ||
  process.argv.slice(2).length > 1
)
  throw Error("Unknown CI option");
const target = ciTargets(
    process.argv.includes("--phase4")
      ? "phase4"
      : process.argv.includes("--phase35")
        ? "phase35"
        : "phase3",
  ),
  runner = target.runner,
  base = "http://localhost:" + target.appPort,
  endpoint = "http://127.0.0.1:" + target.storagePort;
if (
  process.env.CI !== "true" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.platform !== "linux" ||
  !process.version.startsWith("v22.")
)
  throw Error("Only an ephemeral GitHub Linux/Node22 runner is supported.");
const root = process.cwd(),
  state = mkdtempSync(path.join(os.tmpdir(), "sprtaya-ci-"));
const evidence = target.evidence,
  assets = path.join(state, "assets");
mkdirSync(evidence, { recursive: true });
mkdirSync(path.join(state, "database"), { recursive: true, mode: 0o700 });
const secrets = Object.fromEntries(
  ["root", "app", "auth", "s3", "s3admin", "customer", "mock"].map((k) => [
    k,
    randomBytes(32).toString("hex"),
  ]),
);
const owned = [];
let app, connection;
function run(binary, args, env = process.env, capture = false) {
  const r = spawnSync(binary, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (r.status !== 0)
    throw Error(
      "CI command failed: " + binary + " " + args[0] + (capture ? "\n" + (r.stderr || "") : ""),
    );
  return r.stdout?.trim();
}
function redact(value) {
  let text = String(value);
  for (const secret of Object.values(secrets)) text = text.split(secret).join("[REDACTED]");
  return text.replace(/mysql:\/\/[^\s]+/g, "[REDACTED_DATABASE_URL]");
}
function file(name, value) {
  writeFileSync(name, value, { mode: 0o600 });
}
file(
  path.join(state, "secrets.json"),
  JSON.stringify({ customer: secrets.customer, mock: secrets.mock }),
);
const env = {
  ...process.env,
  P3_STATE_DIR: state,
  P35_STATE_DIR: state,
  P4_STATE_DIR: state,
  LEGACY_ASSET_ROOT: assets,
  P3_EVIDENCE_DIR: evidence,
  P35_EVIDENCE_DIR: evidence + "/factory",
  P3_BASE_URL: base,
  P3_APP_PORT: String(target.appPort),
  P3_STAGING_TEST_PORT: String(target.stagingPort),
  P35_STAFF_FILE: "factory-staff.json",
  P3_EXTENDED_JOURNEYS: "1",
  P3_STAFF_FILE: "extended-staff.json",
};
async function main() {
  console.log("Starting newly named, loopback-only disposable containers.");
  const id = run(
    "docker",
    [
      "run",
      "-d",
      "--label",
      "sprtaya.disposable-ci=1",
      "--publish",
      "127.0.0.1:33078:33078",
      "--env",
      "MARIADB_ROOT_PASSWORD",
      "mariadb:11.8.9",
      "--port=33078",
      "--bind-address=0.0.0.0",
    ],
    { ...env, MARIADB_ROOT_PASSWORD: secrets.root },
    true,
  );
  owned.push(id);
  for (let i = 0; i < 90; i++)
    try {
      connection = await mariadb.createConnection({
        host: "127.0.0.1",
        port: 33078,
        user: "root",
        password: secrets.root,
        connectTimeout: 1000,
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  if (!connection) throw Error("Fresh MariaDB container did not become ready.");
  console.log("PASS fresh MariaDB connection; verifying identity and scoped schemas.");
  const identity = await connection.query("SELECT VERSION() v,@@port p");
  if (!identity[0].v.startsWith("11.8.9-MariaDB") || Number(identity[0].p) !== 33078)
    throw Error("CI database identity mismatch.");
  for (const name of target.schemas)
    await connection.query(
      "CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    );
  await connection.query("CREATE USER '" + target.user + "'@'%' IDENTIFIED BY ?", [secrets.app]);
  for (const name of target.schemas)
    await connection.query("GRANT ALL ON `" + name + "`.* TO '" + target.user + "'@'%'");
  const s3file = path.join(state, "s3.json");
  file(
    s3file,
    JSON.stringify({
      identities: [
        { name: "anonymous", actions: ["Read:sprtaya-phase3-display"] },
        {
          name: "app",
          credentials: [{ accessKey: "ci-app", secretKey: secrets.s3 }],
          actions: [
            "Read:sprtaya-phase3-originals",
            "Write:sprtaya-phase3-originals",
            "Read:sprtaya-phase3-display",
            "Write:sprtaya-phase3-display",
          ],
        },
        {
          name: "bootstrap",
          credentials: [{ accessKey: "ci-admin", secretKey: secrets.s3admin }],
          actions: ["Admin", "Read", "Write", "List"],
        },
      ],
    }),
  );
  console.log("Starting fresh disposable S3 and checking private/public buckets.");
  // The official entrypoint drops to seaweed. Keep credentials mode 0600;
  // grant that image user ownership of this one disposable bind-mounted file.
  // This short helper has no network; the actual service keeps its normal
  // unprivileged entrypoint and a read-only configuration mount.
  run(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "0:0",
      "--entrypoint",
      "chown",
      "--mount",
      `type=bind,source=${s3file},target=/s3.json`,
      "chrislusf/seaweedfs:4.51",
      "seaweed:seaweed",
      "/s3.json",
    ],
    env,
    true,
  );
  const media = run(
    "docker",
    [
      "run",
      "-d",
      "--label",
      "sprtaya.disposable-ci=1",
      "--publish",
      "127.0.0.1:" + target.storagePort + ":" + target.storagePort,
      "--mount",
      `type=bind,source=${s3file},target=/s3.json,readonly`,
      "chrislusf/seaweedfs:4.51",
      "mini",
      "-dir=/data",
      "-ip=127.0.0.1",
      "-ip.bind=0.0.0.0",
      "-s3.port=" + target.storagePort,
      "-s3.config=/s3.json",
      "-s3.allowedOrigins=" + base,
      "-master.telemetry=false",
      "-admin.ui=false",
      "-webdav=false",
      "-s3.iam=false",
    ],
    env,
    true,
  );
  owned.push(media);
  const s3 = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: "ci-admin", secretAccessKey: secrets.s3admin },
  });
  let ready = false;
  for (let i = 0; i < 90; i++)
    try {
      for (const Bucket of ["sprtaya-phase3-originals", "sprtaya-phase3-display"]) {
        try {
          await s3.send(new HeadBucketCommand({ Bucket }));
        } catch {
          await s3.send(new CreateBucketCommand({ Bucket }));
        }
      }
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  s3.destroy();
  if (!ready) throw Error("Fresh S3 container did not become ready.");
  console.log("PASS fresh disposable S3; applying checked migrations to fresh owned schemas only.");
  for (const test of [false, true]) {
    const name = target.schemas[test ? 1 : 0];
    const values = {
      DATABASE_URL: `mysql://${target.user}:${secrets.app}@127.0.0.1:33078/${name}`,
      DATABASE_TARGET: "local",
      BETTER_AUTH_SECRET: secrets.auth,
      MEDIA_S3_ENDPOINT: endpoint,
      MEDIA_S3_REGION: "us-east-1",
      MEDIA_S3_FORCE_PATH_STYLE: "true",
      MEDIA_S3_ORIGINALS_BUCKET: "sprtaya-phase3-originals",
      MEDIA_S3_DISPLAY_BUCKET: "sprtaya-phase3-display",
      MEDIA_ACCESS_KEY_ID: "ci-app",
      MEDIA_SECRET_ACCESS_KEY: secrets.s3,
      MEDIA_PUBLIC_BASE_URL: endpoint + "/sprtaya-phase3-display",
    };
    file(
      path.join(state, "database", test ? "env.test" : "env.local"),
      Object.entries(values)
        .map(([k, v]) => k + "=" + v)
        .join("\n") + "\n",
    );
    if (!test) run(process.execPath, [runner, "generate"], env);
    // Direct deploy is confined to brand-new, privately generated containers
    // and the two app-user schemas; it cannot be used for hosted promotion.
    const manifest = JSON.parse(
      readFileSync(
        target.phase4
          ? "docs/phase4/migration-manifest.json"
          : "docs/phase3/migration-manifest.json",
      ),
    );
    const folders = readdirSync("prisma/migrations", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    if (JSON.stringify(folders) !== JSON.stringify(manifest.migrations.map((m) => m.name).sort()))
      throw Error("CI migration directory differs from its reviewed manifest.");
    for (const m of manifest.migrations)
      if (
        createHash("sha256")
          .update(readFileSync(`prisma/migrations/${m.name}/migration.sql`))
          .digest("hex") !== m.sha256
      )
        throw Error("CI migration manifest differs.");
    run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      ...env,
      ...values,
    });
    run(
      process.execPath,
      [runner, "exec", "scripts/seed-database.ts", ...(test ? ["--test"] : [])],
      env,
    );
  }
  // Explicit synthetic CI image, never a replacement for preserved factory photos.
  const folder = path.join(assets, "المنتجات", "CI-SYNTHETIC-ONLY");
  mkdirSync(folder, { recursive: true });
  await sharp({ create: { width: 64, height: 64, channels: 3, background: "#98663d" } })
    .webp()
    .toFile(path.join(folder, "synthetic.webp"));
  run(process.execPath, [runner, "seed"], env);
  run(process.execPath, [runner, "exec", "scripts/phase3-extended-fixtures.ts"], env);
  for (const command of ["validate", "lint", "build", "typecheck"])
    run(process.execPath, [runner, command], env);
  run(
    process.execPath,
    [
      runner,
      "test",
      "--testTimeout=30000",
      "--reporter=json",
      "--outputFile=" + evidence + "/regression-tests.json",
    ],
    env,
  );
  const report = JSON.parse(readFileSync(evidence + "/regression-tests.json"));
  if (report.numFailedTests || report.numFailedTestSuites || report.numPendingTests)
    throw Error("CI requires all database/storage tests enabled and passing.");
  if (target.phase4) {
    for (const required of [
      "reports.integration.test.ts",
      "factory.integration.test.ts",
      "local-db.integration.test.ts",
      "commerce.integration.test.ts",
    ]) {
      const suite = report.testResults.find((result) => result.name.endsWith("/" + required));
      if (!suite || suite.status !== "passed" || !suite.assertionResults.length)
        throw Error("Required integration suite missing or unsuccessful: " + required);
    }
  }
  app = spawn(process.execPath, [runner, "start"], { env, stdio: "inherit", detached: true });
  let healthy = false;
  for (let i = 0; i < 100; i++)
    try {
      const r = await fetch(base + "/ar");
      if (r.status === 200) {
        healthy = true;
        break;
      }
    } catch {
    } finally {
      if (!healthy) await new Promise((r) => setTimeout(r, 200));
    }
  if (!healthy) throw Error("CI production server did not become healthy.");
  for (const script of [
    "phase3-independent-browser.mjs",
    "phase3-inventory-review.mjs",
    "phase3-staging-http.mjs",
    "phase3-media-browser.mjs",
  ])
    run(process.execPath, [runner, "exec", "scripts/" + script], env);
  if (target.phase35) {
    run(process.execPath, [runner, "exec", "scripts/phase35-browser-fixtures.ts", "--fresh"], env);
    run(process.execPath, [runner, "exec", "scripts/phase35-browser.mjs"], env);
  }
  if (target.phase4) {
    run(process.execPath, [runner, "exec", "scripts/phase4-browser-fixtures.ts"], env);
    run(process.execPath, [runner, "exec", "scripts/phase4-ci-browser.mjs"], env);
  }
  console.log(
    "PASS fresh disposable CI acceptance; no deployment commands or production credentials used.",
  );
}
try {
  await main();
} catch (error) {
  console.error(
    "CI acceptance failed: " +
      redact(error instanceof Error ? error.message : "unknown stage error"),
  );
  for (const id of owned) {
    for (const args of [
      ["inspect", "--format", "{{.State.Status}} {{.State.ExitCode}} {{.State.Error}}", id],
      ["logs", "--tail", "40", id],
    ]) {
      const result = spawnSync("docker", args, { encoding: "utf8" });
      console.error(redact((result.stdout || "") + (result.stderr || "")));
    }
  }
  process.exitCode = 1;
} finally {
  if (app)
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {}
  if (connection) await connection.end();
  for (const id of owned.reverse()) spawnSync("docker", ["rm", "--force", id], { stdio: "ignore" });
}
