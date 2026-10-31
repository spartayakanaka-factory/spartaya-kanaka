import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { getDatabase } from "../src/lib/server/database";
import { fixtureProduct } from "../src/lib/commerce/fixtures";
import { ownerReport } from "../src/lib/server/commerce/reports";
import { cairoDayStart, nextDate } from "../src/lib/reports/calendar";
async function main() {
  const u = new URL(process.env.DATABASE_URL || "");
  if (
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.pathname !== "/sprtaya_phase4_disposable_test" ||
    u.username !== "sprtaya_phase4"
  )
    throw Error("Wrong test target");
  const db = getDatabase(),
    id = () => randomUUID(),
    start = "2055-01-15",
    end = "2055-02-14";
  const owner = await db.adminUser.create({
    data: {
      name: "Synthetic financial workload owner",
      email: id() + "@factory.invalid",
      roleCode: "OWNER",
      forcePasswordChange: false,
    },
  });
  const ready = await fixtureProduct(db, "finance-ready-" + id(), "READY_MADE", 0),
    made = await fixtureProduct(db, "finance-made-" + id(), "MADE_TO_ORDER", 0);
  const orders = [],
    items = [],
    payments = [],
    shipments = [],
    refunds = [],
    events = [],
    ids: string[] = [];
  for (let i = 0; i < 100; i++) {
    const kind = i % 5,
      orderId = id(),
      method = kind === 0 || kind === 4 ? "WALLET" : kind === 1 ? "INSTAPAY" : "COD",
      paid = kind === 2 ? 0 : kind === 0 || kind === 4 ? 5000 : 10000,
      refunded = kind === 0 ? 1000 : kind === 1 ? 3000 : 0,
      date = nextDate(start, i % 30),
      when = new Date(cairoDayStart(date).getTime() + 3600000),
      refundWhen = new Date(cairoDayStart(nextDate(date)).getTime() + 3600000);
    ids.push(orderId);
    orders.push({
      id: orderId,
      ownerKey: "guest:" + id(),
      requestKey: id(),
      requestHash: id(),
      state: kind === 4 ? "CANCELLED" : kind === 3 ? "DELIVERED" : "CONFIRMED",
      paymentMethod: method,
      currency: "EGP",
      totalMinor: 10000,
      initialMinor: kind === 0 ? 5000 : 10000,
      paidMinor: paid,
      refundedMinor: refunded,
      creditedMinor: refunded,
      snapshot: {},
      locale: "ar",
      expiresAt: new Date(when.getTime() + 86400000),
      createdAt: when,
    });
    items.push({
      id: id(),
      orderId,
      variantId: kind === 0 ? made.variantId : ready.variantId,
      quantity: 1,
      type: kind === 0 ? "MADE_TO_ORDER" : "READY_MADE",
      snapshot: { titleAr: "منتج اصطناعي", titleEn: "Synthetic", gross: "10000" },
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
        amountMinor: paid,
        currency: "EGP",
        providerReference: id(),
      });
      events.push({
        id: id(),
        orderId,
        actorKey: "staff:" + owner.id,
        kind: "payment.verified",
        operationKey: "financial-workload:" + id(),
        data: { paymentId, amount: String(paid), currency: "EGP" },
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
    if (refunded) {
      for (const amount of kind === 0 ? [1000] : [1000, 2000]) {
        const requestId = id();
        refunds.push({
          id: requestId,
          orderId,
          kind: "REFUND",
          amountMinor: amount,
          state: "RECONCILED",
          requestKey: id(),
          requestedBy: owner.id,
          reason: "Synthetic refund",
        });
        events.push({
          id: id(),
          orderId,
          actorKey: "staff:" + owner.id,
          kind: "finance.reconcile",
          operationKey: "financial-refund:" + id(),
          data: { requestId, kind: "REFUND", amount: String(amount) },
          createdAt: refundWhen,
        });
      }
      refunds.push({
        id: id(),
        orderId,
        kind: "REFUND",
        amountMinor: 500,
        state: "REQUESTED",
        requestKey: id(),
        requestedBy: owner.id,
        reason: "Synthetic pending refund",
      });
    }
  }
  try {
    await db.commerceOrder.createMany({ data: orders });
    await db.commerceOrderItem.createMany({ data: items });
    await db.commercePayment.createMany({ data: payments });
    await db.commerceShipment.createMany({ data: shipments });
    await db.commerceFinanceRequest.createMany({ data: refunds });
    await db.commerceEvent.createMany({ data: events });
    const r = await ownerReport(owner.id, start, end),
      money = r.currencies[0] as Record<string, string>,
      expected = {
        orderValue: "800000",
        collected: "600000",
        wallet: "200000",
        instapay: "200000",
        cod: "200000",
        refunded: "80000",
        netCollected: "520000",
        outstanding: "300000",
        deposits: "100000",
      };
    const actual = Object.fromEntries(Object.keys(expected).map((k) => [k, money[k]]));
    if (r.totalOrders !== 100 || JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error("Financial totals mismatch");
    const dailyCollected = r.daily.reduce(
      (n, d) =>
        n + BigInt((d.currencies[0] as Record<string, string> | undefined)?.collected || "0"),
      BigInt(0),
    );
    const dailyRefunds = r.daily.reduce(
      (n, d) =>
        n + BigInt((d.currencies[0] as Record<string, string> | undefined)?.refunded || "0"),
      BigInt(0),
    );
    if (String(dailyCollected) !== expected.collected || String(dailyRefunds) !== expected.refunded)
      throw Error("Daily event attribution mismatch");
    writeFileSync(
      "docs/phase4/financial-workload.json",
      JSON.stringify(
        {
          scope:
            "100 synthetic orders across 31 Cairo days, including partial advances, unpaid and paid COD, cancelled orders, 60 completed and 40 pending refunds",
          period: [start, end],
          orders: r.totalOrders,
          completedRefunds: 60,
          pendingRefunds: 40,
          expected,
          actual,
          dailyCollected: String(dailyCollected),
          dailyRefunds: String(dailyRefunds),
        },
        null,
        2,
      ) + "\n",
    );
    console.log("PASS 100-order refund-heavy Cairo-period totals");
  } finally {
    await db.commerceEvent.deleteMany({ where: { orderId: { in: ids } } });
    await db.commerceFinanceRequest.deleteMany({ where: { orderId: { in: ids } } });
    await db.commercePayment.deleteMany({ where: { orderId: { in: ids } } });
    await db.commerceShipment.deleteMany({ where: { orderId: { in: ids } } });
    await db.commerceOrderItem.deleteMany({ where: { orderId: { in: ids } } });
    await db.commerceOrder.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Synthetic financial workload failed; no private values logged");
  process.exitCode = 1;
});
