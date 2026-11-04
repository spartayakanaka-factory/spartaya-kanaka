import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRuntimeDatabase } from "./runtime-db";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
async function main() {
  assertCommerceEnvironment();
  const u = new URL(process.env.DATABASE_URL!);
  if (
    u.username !== "sprtaya_phase35" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    !["/sprtaya_phase35_disposable_local", "/sprtaya_phase35_disposable_test"].includes(u.pathname)
  )
    throw Error("Exact new disposable Phase 3.5 target required.");
  const db = createRuntimeDatabase();
  try {
    const [identity] = await db.$queryRaw<
      { name: string; user: string; version: string; port: number; fk: number; checks: number }[]
    >`SELECT DATABASE() name,CURRENT_USER() user,VERSION() version,@@port port,@@foreign_key_checks fk,@@check_constraint_checks checks`;
    if (
      identity.name !== u.pathname.slice(1) ||
      identity.user !== "sprtaya_phase35@127.0.0.1" ||
      !identity.version.startsWith("11.8.9-MariaDB") ||
      Number(identity.port) !== 33078 ||
      Number(identity.fk) !== 1 ||
      Number(identity.checks) !== 1
    )
      throw Error("Connected disposable identity mismatch.");
    const inventory = await db.$queryRaw<
      { n: bigint }[]
    >`SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()`;
    // This entry point initializes only fresh empty schemas. Existing data uses
    // the separately reviewed backup/promotion rehearsal, never an implicit reset.
    const manifest = JSON.parse(readFileSync("docs/phase3/migration-manifest.json", "utf8"));
    if (Number(inventory[0].n) !== 0) {
      const tables = await db.$queryRaw<
        { name: string }[]
      >`SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()`;
      const history = await db.$queryRaw<
        {
          migration_name: string;
          checksum: string;
          finished_at: Date | null;
          rolled_back_at: Date | null;
        }[]
      >`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
      if (
        history.some(
          (h, i) =>
            h.migration_name !== manifest.migrations[i]?.name ||
            h.checksum !== manifest.migrations[i]?.sha256 ||
            !h.finished_at ||
            h.rolled_back_at,
        )
      )
        throw Error("Unexpected migration history.");
      for (const { name } of tables) {
        if (name === "_prisma_migrations") continue;
        if (!/^[A-Za-z0-9_]+$/.test(name)) throw Error("Invalid identifier.");
        const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
          "SELECT COUNT(*) n FROM `" + name + "`",
        );
        if (Number(rows[0].n)) throw Error("Existing rows: use backup/rehearsal procedure.");
      }
    }
    for (const m of manifest.migrations) {
      const sql = readFileSync(`prisma/migrations/${m.name}/migration.sql`);
      if (
        createHash("sha256").update(sql).digest("hex") !== m.sha256 ||
        /\b(?:DROP\s+(?:TABLE|DATABASE)|TRUNCATE|DELETE\s+FROM|RENAME\s+TABLE)\b/i.test(
          sql.toString(),
        )
      )
        throw Error("Migration manifest or safety review mismatch.");
    }
    console.log(
      "PASS exact empty disposable target, engine/enforcement and migration manifest; no pre-existing rows.",
    );
    const result = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { env: process.env, stdio: "inherit" },
    );
    if (result.status !== 0) throw Error("Migration failed; inspect history before retry.");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Phase 3.5 fresh disposable migration guard refused/failed; no credentials logged.",
  );
  process.exitCode = 1;
});
