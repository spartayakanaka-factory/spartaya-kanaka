import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { getDatabase } from "../src/lib/server/database";
import { fixtureProduct } from "../src/lib/commerce/fixtures";
import { ownerReport } from "../src/lib/server/commerce/reports";
import { cairoDayStart } from "../src/lib/reports/calendar";

async function main() {
  const u = new URL(process.env.DATABASE_URL || "");
  if (
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.pathname !== "/sprtaya_phase4_disposable_test" ||
    u.username !== "sprtaya_phase4"
  )
    throw Error("Disposable test target required");
  const db = getDatabase(),
    id = () => randomUUID(),
    date = "2098-07-15",
    when = new Date(cairoDayStart(date).getTime() + 3600000);
  const owner = await db.adminUser.create({
    data: {
      name: "Synthetic workload owner",
      email: id() + "@factory.invalid",
      roleCode: "OWNER",
      forcePasswordChange: false,
    },
  });
  const ready = await fixtureProduct(db, "workload-ready-" + id(), "READY_MADE", 0);
  const made = await fixtureProduct(db, "workload-made-" + id(), "MADE_TO_ORDER", 0);
  const results = [];
  try {
    for (const size of [100, 1000, 4000]) {
      const orders = [],
        items = [],
        payments = [],
        shipments = [],
        events = [],
        ids: string[] = [];
      for (let i = 0; i < size; i++) {
        const orderId = id(),
          method = ["WALLET", "INSTAPAY", "COD", "COD"][i % 4],
          paid = i % 4 === 2 ? 0 : 10000,
          madeOrder = i % 2 === 0;
        ids.push(orderId);
        orders.push({
          id: orderId,
          ownerKey: "guest:" + id(),
          requestKey: id(),
          requestHash: id(),
          state: i % 4 === 3 ? "DELIVERED" : "CONFIRMED",
          paymentMethod: method,
          currency: "EGP",
          totalMinor: 10000,
          initialMinor: 10000,
          paidMinor: paid,
          snapshot: {},
          locale: "ar",
          expiresAt: new Date(when.getTime() + 86400000),
          createdAt: when,
        });
        items.push({
          id: id(),
          orderId,
          variantId: madeOrder ? made.variantId : ready.variantId,
          quantity: 1,
          type: madeOrder ? "MADE_TO_ORDER" : "READY_MADE",
          snapshot: { titleAr: "منتج اختبار", titleEn: "Synthetic workload", gross: "10000" },
        });
        if (method !== "COD") {
          const paymentId = id();
          payments.push({
            id: paymentId,
            orderId,
            requestKey: id(),
            method,
            purpose: "INITIAL",
            state: "SUCCEEDED",
            amountMinor: 10000,
            currency: "EGP",
            providerReference: id(),
          });
          events.push({
            id: id(),
            orderId,
            actorKey: "staff:" + owner.id,
            kind: "payment.verified",
            operationKey: "benchmark:" + id(),
            data: { paymentId, amount: "10000", currency: "EGP" },
            createdAt: when,
          });
        } else if (paid) {
          shipments.push({ id: id(), orderId, state: "DELIVERED", collectionState: "RECONCILED" });
          events.push({
            id: id(),
            orderId,
            actorKey: "staff:" + owner.id,
            kind: "fulfillment.cod_reconciled",
            operationKey: `fulfill:${orderId}:cod_reconciled`,
            data: { reference: null },
            createdAt: when,
          });
        }
      }
      try {
        for (let n = 0; n < size; n += 400) {
          await db.commerceOrder.createMany({ data: orders.slice(n, n + 400) });
          await db.commerceOrderItem.createMany({ data: items.slice(n, n + 400) });
        }
        if (payments.length) await db.commercePayment.createMany({ data: payments });
        if (shipments.length) await db.commerceShipment.createMany({ data: shipments });
        if (events.length) await db.commerceEvent.createMany({ data: events });
        const memoryBefore = process.memoryUsage().heapUsed,
          started = performance.now();
        const report = await ownerReport(owner.id, date, date);
        const elapsedMs = performance.now() - started,
          memoryAfter = process.memoryUsage().heapUsed;
        if (
          report.totalOrders !== size ||
          report.currencies[0].collected !== String((size / 4) * 3 * 10000) ||
          report.currencies[0].outstanding !== String((size / 4) * 10000)
        )
          throw Error("Workload totals mismatch");
        results.push({
          orders: size,
          items: items.length,
          payments: payments.length,
          shipments: shipments.length,
          financialEvents: events.length,
          reportMs: Math.round(elapsedMs),
          heapDeltaBytes: memoryAfter - memoryBefore,
          totalsVerified: true,
        });
      } finally {
        await db.commerceEvent.deleteMany({ where: { orderId: { in: ids } } });
        await db.commercePayment.deleteMany({ where: { orderId: { in: ids } } });
        await db.commerceShipment.deleteMany({ where: { orderId: { in: ids } } });
        await db.commerceOrderItem.deleteMany({ where: { orderId: { in: ids } } });
        await db.commerceOrder.deleteMany({ where: { id: { in: ids } } });
      }
    }
    writeFileSync(
      "docs/phase4/workload-benchmark.json",
      JSON.stringify(
        {
          scope:
            "Actual ownerReport against synthetic isolated MariaDB data; 31-day maximum and refund-heavy workload not tested",
          engine: "MariaDB 11.8.9",
          results,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(JSON.stringify(results));
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
