import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRuntimeDatabase } from "./runtime-db";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
async function main() {
  assertCommerceEnvironment();
  const db = createRuntimeDatabase();
  try {
    const expected = new URL(process.env.DATABASE_URL!).pathname.slice(1);
    const identity = await db.$queryRaw<
      { databaseName: string; port: number; version: string; user: string }[]
    >`SELECT DATABASE() databaseName, @@port port, VERSION() version, CURRENT_USER() user`;
    if (
      identity[0]?.databaseName !== expected ||
      Number(identity[0].port) !== 33078 ||
      !identity[0].version.startsWith("11.8.9-MariaDB") ||
      identity[0].user !== "sprtaya_phase3@127.0.0.1"
    )
      throw Error("Disposable identity mismatch");
    const tables = await db.$queryRaw<
      { tableName: string }[]
    >`SELECT TABLE_NAME tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()`;
    const hasHistory = tables.some((t) => t.tableName === "_prisma_migrations");
    if (!hasHistory && tables.length !== 0)
      throw Error("Unmanaged existing schema; refusing migration");
    const history = hasHistory
      ? await db.$queryRaw<
          {
            migration_name: string;
            finished_at: Date | null;
            rolled_back_at: Date | null;
            checksum: string;
          }[]
        >`SELECT migration_name, finished_at, rolled_back_at, checksum FROM _prisma_migrations`
      : [];
    if (history.some((h) => !h.finished_at || h.rolled_back_at))
      throw Error("Unresolved migration history");
    const baseline = ["20261027000000_phase2_initial", "20261027120000_phase2_2_review_safety"];
    if (
      tables.length > 0 &&
      !baseline.every((name) => history.some((h) => h.migration_name === name))
    )
      throw Error("Baseline missing");
    const counts =
      tables.length > 0
        ? await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) n FROM legacy_product_mappings`
        : [{ n: BigInt(0) }];
    if (Number(counts[0].n) !== 0) throw Error("Imported catalog found: refusal to migrate");
    const backupDir = path.resolve(process.env.P3_STATE_DIR!, "database/backups");
    const backups = readdirSync(backupDir).filter((f) => f.endsWith(".sql"));
    if (
      !backups.some(
        (f) =>
          statSync(path.join(backupDir, f)).size > 1000 &&
          (() => {
            try {
              const verified = JSON.parse(
                readFileSync(path.join(backupDir, f) + ".verified.json", "utf8"),
              );
              return (
                verified.verified === true &&
                verified.verificationKind === "exact-artifact-v1" &&
                verified.port === 33078 &&
                verified.databases.includes(expected) &&
                verified.sha256 ===
                  createHash("sha256")
                    .update(readFileSync(path.join(backupDir, f)))
                    .digest("hex")
              );
            } catch {
              return false;
            }
          })() &&
          Date.now() - statSync(path.join(backupDir, f)).mtimeMs < 3600000,
      )
    )
      throw Error("Recent private backup required");
    const manifest = JSON.parse(readFileSync("docs/phase3/migration-manifest.json", "utf8"));
    for (const applied of history) {
      const reviewed = manifest.migrations.find(
        (m: { name: string; sha256: string }) => m.name === applied.migration_name,
      );
      if (!reviewed || reviewed.sha256 !== applied.checksum)
        throw Error("Unknown or modified migration history");
    }
    for (const entry of manifest.migrations) {
      const sql = readFileSync(`prisma/migrations/${entry.name}/migration.sql`);
      if (createHash("sha256").update(sql).digest("hex") !== entry.sha256)
        throw Error("Reviewed migration digest mismatch");
      if (/(^|;)\s*(DROP|TRUNCATE|DELETE|RENAME)\b/im.test(sql.toString()))
        throw Error("Destructive SQL blocked");
    }
    console.log(
      JSON.stringify({
        database: expected,
        engine: identity[0].version,
        baselineHistory: history.map((h) => h.migration_name),
        tables: tables.length,
        legacyProducts: 0,
        backupPresent: true,
      }),
    );
    const result = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { stdio: "inherit", env: process.env },
    );
    if (result.status !== 0) throw Error("Migration command failed; inspect history before retry");
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error && !error.message.includes("mysql:")
      ? error.message
      : "Phase 3 migration preflight/execution failed. No credentials logged.",
  );
  process.exitCode = 1;
});
