// Manual, separately approved empty staging initialization. Never called by build/start.
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertSafeDatabaseTarget } from "./database-target";
import { runHostingerPhase2Preflight } from "./preflight-hostinger-phase2";
import { reviewedPhase55Migrations, requirePhase55Initialization } from "./phase55-migration-plan";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  args = process.argv.slice(2);
async function main() {
  const migrations = reviewedPhase55Migrations(root);
  if (!args.includes("--apply")) {
    console.log(
      JSON.stringify(
        {
          mode: "prepare-only",
          databaseAccess: false,
          migrations,
          execution:
            "Requires separate owner approval, exact packaged source, fresh verified empty target, backup and restore attestations",
        },
        null,
        2,
      ),
    );
    return;
  }
  const release = JSON.parse(readFileSync(path.join(root, "RELEASE-MANIFEST.json"), "utf8"));
  if (release.uncommittedPreview !== false)
    throw Error("Only a committed reviewed release may initialize staging");
  for (const [name, hash] of Object.entries(release.members) as [string, string][]) {
    if (name.startsWith("prisma/") || name === "docs/phase4/migration-manifest.json") {
      const { createHash } = await import("node:crypto");
      if (
        createHash("sha256")
          .update(readFileSync(path.join(root, name)))
          .digest("hex") !== hash
      )
        throw Error("Packaged migration material changed");
    }
  }
  if (
    process.env.DATABASE_TARGET !== "hostinger-phase2-test" ||
    process.env.NODE_ENV !== "production" ||
    process.env.APP_ENV !== "staging" ||
    process.env.STAGING_SITE !== "1" ||
    process.env.PAYMENT_MODE !== "MOCK" ||
    ["P3_ENABLED", "P3_CHECKOUT", "P3_CUSTOMER_ACCOUNTS", "P3_NOTIFICATIONS"].some(
      (k) => process.env[k] === "1",
    )
  )
    throw Error("Protected staging with commerce and notifications disabled required");
  assertSafeDatabaseTarget({ allowHostingerPhase2Test: true });
  // Validate all operator attestations before opening the database connection.
  requirePhase55Initialization(
    args,
    release.sourceCommit,
    { tableCount: 0, appliedMigrations: [], pendingMigrations: migrations.map((m) => m.name) },
    migrations,
  );
  const state = await runHostingerPhase2Preflight();
  requirePhase55Initialization(args, release.sourceCommit, state, migrations);
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { cwd: root, env: process.env, stdio: "inherit" },
  );
  if (result.error || result.status !== 0)
    throw Error("Migration command failed; preserve maintenance and inspect history before retry");
  const after = await runHostingerPhase2Preflight();
  if (
    after.pendingMigrations.length ||
    JSON.stringify(after.appliedMigrations) !== JSON.stringify(migrations.map((m) => m.name))
  )
    throw Error("Post-migration ledger differs; preserve maintenance");
  console.log(
    "Reviewed empty staging initialization verified. No seed, owner provisioning or import was performed.",
  );
}
main().catch(() => {
  console.error(
    "Staging initialization blocked or failed; keep maintenance and review private operator evidence. No credentials logged.",
  );
  process.exitCode = 1;
});
