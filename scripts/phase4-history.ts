import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
async function main() {
  const u = new URL(process.env.DATABASE_URL || "");
  if (
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.username !== "sprtaya_phase4" ||
    u.pathname !== "/sprtaya_phase4_disposable_test"
  )
    throw Error("Wrong target");
  if (process.env.P4_RECOVERY === "1") {
    u.pathname = "/sprtaya_phase4_recovery_v3";
    process.env.DATABASE_URL = u.toString();
  }
  const { getDatabase } = await import("../src/lib/server/database"),
    db = getDatabase();
  try {
    const manifest = JSON.parse(readFileSync("docs/phase4/migration-manifest.json", "utf8"));
    const expected = manifest.migrations.slice(0, process.env.P4_RECOVERY === "1" ? 7 : 6);
    const rows = await db.$queryRaw<
      {
        migration_name: string;
        checksum: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }[]
    >`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
    if (rows.length !== expected.length) throw Error("Unexpected history length");
    for (let i = 0; i < rows.length; i++) {
      const m = expected[i],
        actual = createHash("sha256")
          .update(readFileSync(`prisma/migrations/${m.name}/migration.sql`))
          .digest("hex");
      if (
        rows[i].migration_name !== m.name ||
        rows[i].checksum !== m.sha256 ||
        actual !== m.sha256 ||
        !rows[i].finished_at ||
        rows[i].rolled_back_at
      )
        throw Error("Migration history mismatch");
    }
    console.log(
      `Verified ${rows.length} migration checksums on ${process.env.P4_RECOVERY === "1" ? "recovery" : "test"} schema.`,
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("History verification failed");
  process.exitCode = 1;
});
