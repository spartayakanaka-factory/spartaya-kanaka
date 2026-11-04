import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
import { createRuntimeDatabase } from "./runtime-db";
async function main() {
  assertCommerceEnvironment();
  if (new URL(process.env.DATABASE_URL!).pathname !== "/sprtaya_phase35_disposable_local")
    throw Error("Unexpected target");
  const db = createRuntimeDatabase();
  try {
    const orders = await db.commerceOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { items: true },
    });
    for (const o of orders) {
      const lines = o.items.map((i) => ({
        quantity: i.quantity,
        gross: (i.snapshot as { gross: string }).gross,
      }));
      const shipping = (o.snapshot as { shipping: { gross: string } }).shipping;
      assert.equal(
        lines.reduce((n, i) => n + BigInt(i.gross), BigInt(0)) + BigInt(shipping.gross),
        o.totalMinor,
      );
      assert.ok(o.paidMinor <= o.totalMinor);
    }
    writeFileSync(
      "docs/phase35/runtime-money-check.json",
      JSON.stringify(
        {
          scope: "Read-only synthetic Phase 3.5 order snapshots",
          orders: orders.length,
          itemAndShippingTotalsMatch: true,
          creditsBounded: true,
        },
        null,
        2,
      ) + "\n",
    );
    console.log("PASS synthetic order totals and bounded credits");
  } finally {
    await db.$disconnect();
  }
}
main();
