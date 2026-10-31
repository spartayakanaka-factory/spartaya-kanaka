import { randomUUID } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
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
    u.pathname !==
      (process.env.P4_RECOVERY_TEST === "1"
        ? "/sprtaya_phase4_recovery_v3"
        : "/sprtaya_phase4_disposable_test") ||
    u.username !== "sprtaya_phase4"
  )
    throw Error("Disposable test target required");
  const adapter = new PrismaMariaDb({
    host: u.hostname,
    port: Number(u.port),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    connectionLimit: 5,
    acquireTimeout: 10000,
    idleTimeout: 60,
    connectTimeout: 10000,
  });
  const traced = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
  let traceEnabled = false,
    queryMs = 0,
    queryCount = 0;
  traced.$on("query", (event) => {
    if (traceEnabled) {
      queryMs += event.duration;
      queryCount++;
    }
  });
  (globalThis as unknown as { prisma: typeof traced }).prisma = traced;
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
    for (const size of [100, 1000, 4000, 4900]) {
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
        if (!global.gc) throw Error("Run with P4_EXPOSE_GC=1");
        const dbTimes: number[] = [],
          queryCounts: number[] = [],
          cpuTimes: number[] = [];
        const timings: number[] = [],
          retained: number[] = [],
          sampledPeaks: number[] = [];
        for (let iteration = -2; iteration < 7; iteration++) {
          global.gc();
          const before = process.memoryUsage().heapUsed;
          let peak = before;
          const sampler = setInterval(() => {
            peak = Math.max(peak, process.memoryUsage().heapUsed);
          }, 5);
          const started = performance.now(),
            cpuStart = process.cpuUsage();
          queryMs = 0;
          queryCount = 0;
          traceEnabled = true;
          let report;
          try {
            report = await ownerReport(owner.id, date, date);
          } finally {
            clearInterval(sampler);
          }
          const elapsedMs = performance.now() - started,
            cpu = process.cpuUsage(cpuStart);
          traceEnabled = false;
          peak = Math.max(peak, process.memoryUsage().heapUsed);
          if (
            report.totalOrders !== size ||
            report.currencies[0].collected !== String((size / 4) * 3 * 10000) ||
            report.currencies[0].outstanding !== String((size / 4) * 10000)
          )
            throw Error("Workload totals mismatch");
          global.gc();
          const after = process.memoryUsage().heapUsed;
          if (iteration >= 0) {
            timings.push(elapsedMs);
            retained.push(after - before);
            sampledPeaks.push(peak);
            dbTimes.push(queryMs);
            queryCounts.push(queryCount);
            cpuTimes.push((cpu.user + cpu.system) / 1000);
          }
        }
        const rangeStart = cairoDayStart(date),
          rangeEnd = new Date(rangeStart.getTime() + 86400000);
        const eventPlanRows = await db.$queryRaw<
          { ANALYZE: string }[]
        >`ANALYZE FORMAT=JSON SELECT id FROM commerce_events WHERE createdAt >= ${rangeStart} AND createdAt < ${rangeEnd} AND kind IN ('payment.verified','fulfillment.cod_reconciled','finance.reconcile') ORDER BY id LIMIT 5001`;
        const orderPlanRows = await db.$queryRaw<
          { ANALYZE: string }[]
        >`ANALYZE FORMAT=JSON SELECT id FROM commerce_orders WHERE createdAt >= ${rangeStart} AND createdAt < ${rangeEnd} ORDER BY id LIMIT 5001`;
        const groupPlanRows = await db.$queryRaw<
          { ANALYZE: string }[]
        >`ANALYZE FORMAT=JSON SELECT p.currency,p.method,p.state,p.evidenceRequired,COUNT(*),SUM(p.amountMinor) FROM commerce_payments p JOIN commerce_orders o ON o.id=p.orderId WHERE o.createdAt >= ${rangeStart} AND o.createdAt < ${rangeEnd} AND o.state NOT IN ('CANCELLED','EXPIRED','RETURNED') AND p.state IN ('PENDING','CLAIMED','FAILED') GROUP BY p.currency,p.method,p.state,p.evidenceRequired`;
        const sorted = [...timings].sort((a, b) => a - b);
        results.push({
          orders: size,
          items: items.length,
          payments: payments.length,
          shipments: shipments.length,
          financialEvents: events.length,
          warmups: 2,
          iterations: timings.length,
          latenciesMs: timings.map((n) => Math.round(n)),
          medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
          databaseQueryMs: dbTimes,
          databaseQueryCounts: queryCounts,
          nodeProcessCpuMs: cpuTimes,
          estimatedNonQueryMs: timings.map((elapsed, index) =>
            Math.round(Math.max(0, elapsed - dbTimes[index])),
          ),
          p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
          sampledPeakHeapBytes: Math.max(...sampledPeaks),
          postGcHeapDeltaBytes: retained,
          totalsVerified: true,
          eventPlan: JSON.parse(eventPlanRows[0].ANALYZE),
          orderPlan: JSON.parse(orderPlanRows[0].ANALYZE),
          pendingGroupPlan: JSON.parse(groupPlanRows[0].ANALYZE),
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
      process.env.P4_RECOVERY_TEST === "1"
        ? "docs/phase4/workload-indexed.json"
        : "docs/phase4/workload-benchmark.json",
      JSON.stringify(
        {
          scope:
            "Actual ownerReport; 2 warmups and 7 samples, 5ms heap sampling, forced GC. Query-event time includes driver overhead; elapsed minus summed query durations is an estimate. Node CPU includes Prisma driver and Node processing, not database-server CPU.",
          engine: "MariaDB 11.8.9",
          environment:
            "Apple M1, 8 GB RAM, macOS 15.6.1, Node 22.23.4; local single-process synthetic run",
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
