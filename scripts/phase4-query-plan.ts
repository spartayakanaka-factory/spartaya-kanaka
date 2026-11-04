import { writeFileSync } from "node:fs";
import { getDatabase } from "../src/lib/server/database";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
async function main() {
  assertCommerceEnvironment();
  if (new URL(process.env.DATABASE_URL!).pathname !== "/sprtaya_phase4_disposable_test")
    throw Error("Only the disposable test schema is permitted");
  const db = getDatabase();
  try {
    const from = new Date("2026-01-01T00:00:00Z"),
      to = new Date("2026-02-01T00:00:00Z");
    const started = performance.now();
    const plan =
      await db.$queryRaw`EXPLAIN SELECT id FROM commerce_events WHERE createdAt >= ${from} AND createdAt < ${to} AND kind IN ('payment.verified','fulfillment.cod_reconciled','finance.reconcile')`;
    const elapsedMs = Math.round(performance.now() - started);
    writeFileSync(
      "docs/phase4/query-plan.json",
      JSON.stringify(
        {
          scope: "Read-only EXPLAIN on disposable MariaDB; plans depend on data volume",
          elapsedMs,
          plan,
        },
        (_, v) => (typeof v === "bigint" ? String(v) : v),
        2,
      ) + "\n",
    );
    console.log("Recorded local read-only report query plan.");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Read-only query plan failed");
  process.exitCode = 1;
});
