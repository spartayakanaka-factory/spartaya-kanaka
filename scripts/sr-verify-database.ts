import assert from "node:assert/strict";
import mariadb from "mariadb";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
import { createRuntimeDatabase } from "./runtime-db";

async function main() {
  assertCommerceEnvironment();
  const u = new URL(process.env.DATABASE_URL!);
  if (
    process.env.SR_LOCAL_ISOLATION !== "1" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.username !== "sprtaya_sr_runtime" ||
    u.pathname !== "/sprtaya_sr_staging_local"
  )
    throw new Error("Unexpected local target.");
  const client = await mariadb.createConnection({
    host: u.hostname,
    port: Number(u.port),
    user: u.username,
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  });
  const db = createRuntimeDatabase();
  try {
    const [who] = await client.query("SELECT DATABASE() AS db, CURRENT_USER() AS account");
    assert.equal(who.db, "sprtaya_sr_staging_local");
    assert.equal(who.account.split("@")[0], "sprtaya_sr_runtime");
    await assert.rejects(
      client.query("SELECT COUNT(*) FROM `sprtaya_phase4_disposable_test`.products"),
    );
    const products = await db.product.count(),
      migrations = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.ok(products >= 2);
    assert.equal(
      await db.product.count({ where: { NOT: { slug: { startsWith: "p3-synthetic-" } } } }),
      0,
    );
    assert.equal(await db.legacyProductMapping.count(), 0);
    assert.equal(Number(migrations[0].count), 7);
    console.log(
      "PASS local app Prisma read, seven applied migrations, synthetic-only fixture products, and cross-schema denial.",
    );
  } finally {
    await db.$disconnect();
    await client.end();
  }
}
main().catch(() => {
  console.error("Local database verification failed; diagnostics suppressed.");
  process.exitCode = 1;
});
