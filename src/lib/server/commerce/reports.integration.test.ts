import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { getDatabase } from "../database";
import { ownerReport } from "./reports";
import { cairoDayStart, nextDate } from "@/lib/reports/calendar";
import { fixtureProduct } from "@/lib/commerce/fixtures";
const enabled = process.env.P4_WORKSTREAM === "1" && process.env.PHASE3_DB_INTEGRATION === "1";
describe.skipIf(!enabled)("owner reporting against disposable MariaDB", () => {
  const db = getDatabase(),
    id = () => randomUUID(),
    day = nextDate("2060-01-01", Math.floor(Math.random() * 10000)),
    dayStart = cairoDayStart(day);
  let owner: string, manager: string, order: string, payment: string;
  beforeAll(async () => {
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/sprtaya_phase4_disposable_test");
    owner = (
      await db.adminUser.create({
        data: {
          name: "Synthetic report owner",
          email: id() + "@factory.invalid",
          roleCode: "OWNER",
          forcePasswordChange: false,
        },
      })
    ).id;
    manager = (
      await db.adminUser.create({
        data: {
          name: "Synthetic manager",
          email: id() + "@factory.invalid",
          roleCode: "MANAGER",
          forcePasswordChange: false,
        },
      })
    ).id;
    const o = await db.commerceOrder.create({
      data: {
        ownerKey: "guest:" + id(),
        requestKey: id(),
        requestHash: "synthetic",
        state: "CONFIRMED",
        paymentMethod: "WALLET",
        currency: "EGP",
        totalMinor: 10000,
        initialMinor: 5000,
        paidMinor: 5000,
        snapshot: { address: { recipient: "private synthetic customer" } },
        locale: "ar",
        expiresAt: new Date(dayStart.getTime() + 86400000),
        createdAt: new Date(dayStart.getTime() + 900000),
      },
    });
    order = o.id;
    const product = await fixtureProduct(db, "report-" + id(), "READY_MADE", 5);
    await db.commerceOrderItem.create({
      data: {
        orderId: order,
        variantId: product.variantId,
        quantity: 2,
        type: "READY_MADE",
        snapshot: { titleAr: "منتج اختباري", titleEn: "Synthetic item", gross: "10000" },
      },
    });
    const p = await db.commercePayment.create({
      data: {
        orderId: order,
        requestKey: id(),
        method: "WALLET",
        purpose: "INITIAL",
        amountMinor: 5000,
        currency: "EGP",
        providerReference: id(),
        state: "SUCCEEDED",
      },
    });
    payment = p.id;
    await db.commerceEvent.create({
      data: {
        orderId: order,
        actorKey: "staff:" + owner,
        kind: "payment.verified",
        operationKey: "synthetic:" + id(),
        data: { paymentId: payment, amount: "5000", currency: "EGP" },
        createdAt: new Date(dayStart.getTime() + 1200000),
      },
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it("uses the Cairo event date, exact values, and excludes customer data", async () => {
    const r = await ownerReport(owner, day, day);
    expect(r.totalOrders).toBe(1);
    expect(r.currencies[0]).toMatchObject({
      orderValue: "10000",
      outstanding: "5000",
      collected: "5000",
      wallet: "5000",
    });
    expect(r.products[0]).toMatchObject({ units: 2, valueMinor: "10000", type: "READY_MADE" });
    expect(JSON.stringify(r)).not.toContain("private synthetic customer");
  });
  it("rejects managers and newly suspended owners", async () => {
    await expect(ownerReport(manager, day, day)).rejects.toThrow("FORBIDDEN");
    await db.adminUser.update({ where: { id: owner }, data: { banned: true } });
    try {
      await expect(ownerReport(owner, day, day)).rejects.toThrow("FORBIDDEN");
    } finally {
      await db.adminUser.update({ where: { id: owner }, data: { banned: false } });
    }
  });
  it("counts verified InstaPay on its event day without treating a pending claim as cash", async () => {
    const date = nextDate(day, 6),
      when = new Date(cairoDayStart(date).getTime() + 3600000);
    const o = await db.commerceOrder.create({
      data: {
        ownerKey: "guest:" + id(),
        requestKey: id(),
        requestHash: id(),
        state: "CONFIRMED",
        paymentMethod: "INSTAPAY",
        currency: "EGP",
        totalMinor: 9000,
        initialMinor: 9000,
        paidMinor: 3000,
        snapshot: {},
        locale: "ar",
        expiresAt: new Date(when.getTime() + 86400000),
        createdAt: when,
      },
    });
    const p = await db.commercePayment.create({
      data: {
        orderId: o.id,
        requestKey: id(),
        method: "INSTAPAY",
        purpose: "INITIAL",
        state: "SUCCEEDED",
        amountMinor: 3000,
        currency: "EGP",
        providerReference: id(),
      },
    });
    await db.commercePayment.create({
      data: {
        orderId: o.id,
        requestKey: id(),
        method: "INSTAPAY",
        purpose: "BALANCE",
        state: "CLAIMED",
        amountMinor: 6000,
        currency: "EGP",
        providerReference: id(),
        evidenceRequired: true,
      },
    });
    await db.commerceEvent.create({
      data: {
        orderId: o.id,
        actorKey: "staff:" + owner,
        kind: "payment.verified",
        operationKey: "fixture:" + id(),
        data: { paymentId: p.id, amount: "3000", currency: "EGP" },
        createdAt: when,
      },
    });
    const result = await ownerReport(owner, date, date);
    expect(result.currencies[0]).toMatchObject({
      collected: "3000",
      instapay: "3000",
      instapayCount: "1",
      outstanding: "6000",
    });
    expect(result.pendingPayments[0]).toMatchObject({ method: "INSTAPAY", pendingMinor: "6000" });
  });
  it("distinguishes unpaid COD from separately reconciled COD", async () => {
    const date = nextDate(day, 2),
      when = new Date(cairoDayStart(date).getTime() + 3600000);
    for (const [paid, total] of [
      [0, 10000],
      [8000, 8000],
    ] as const) {
      const o = await db.commerceOrder.create({
        data: {
          ownerKey: "guest:" + id(),
          requestKey: id(),
          requestHash: id(),
          state: paid ? "DELIVERED" : "CONFIRMED",
          paymentMethod: "COD",
          currency: "EGP",
          totalMinor: total,
          initialMinor: total,
          paidMinor: paid,
          snapshot: {},
          locale: "ar",
          expiresAt: new Date(when.getTime() + 86400000),
          createdAt: when,
        },
      });
      if (paid) {
        await db.commerceShipment.create({
          data: { orderId: o.id, state: "DELIVERED", collectionState: "RECONCILED" },
        });
        await db.commerceEvent.create({
          data: {
            orderId: o.id,
            actorKey: "staff:" + owner,
            kind: "fulfillment.cod_reconciled",
            operationKey: `fulfill:${o.id}:cod_reconciled`,
            data: { reference: null },
            createdAt: when,
          },
        });
      }
    }
    const report = await ownerReport(owner, date, date);
    expect(report.totalOrders).toBe(2);
    expect(report.unpaidOrders).toBe(1);
    expect(report.currencies[0]).toMatchObject({
      collected: "8000",
      cod: "8000",
      codCount: "1",
      codPending: "10000",
      outstanding: "10000",
    });
  });
  it("tracks partial verified payments, pending claims and reconciled refunds exactly once", async () => {
    const date = nextDate(day, 4),
      when = new Date(cairoDayStart(date).getTime() + 3600000),
      product = await fixtureProduct(db, "report-made-" + id(), "MADE_TO_ORDER", 0);
    const o = await db.commerceOrder.create({
      data: {
        ownerKey: "guest:" + id(),
        requestKey: id(),
        requestHash: id(),
        state: "IN_PRODUCTION",
        paymentMethod: "WALLET",
        currency: "EGP",
        totalMinor: 10000,
        initialMinor: 5000,
        paidMinor: 6000,
        refundedMinor: 2000,
        creditedMinor: 2000,
        snapshot: {},
        locale: "ar",
        expiresAt: new Date(when.getTime() + 86400000),
        createdAt: when,
      },
    });
    await db.commerceOrderItem.create({
      data: {
        orderId: o.id,
        variantId: product.variantId,
        quantity: 1,
        type: "MADE_TO_ORDER",
        snapshot: { titleAr: "تصنيع اختباري", gross: "10000" },
      },
    });
    const paymentIds: string[] = [];
    for (const [amount, purpose] of [
      [5000, "INITIAL"],
      [1000, "BALANCE"],
    ] as const) {
      const p = await db.commercePayment.create({
        data: {
          orderId: o.id,
          requestKey: id(),
          method: "WALLET",
          purpose,
          state: "SUCCEEDED",
          amountMinor: amount,
          currency: "EGP",
          providerReference: id(),
        },
      });
      paymentIds.push(p.id);
      await db.commerceEvent.create({
        data: {
          orderId: o.id,
          actorKey: "staff:" + owner,
          kind: "payment.verified",
          operationKey: "fixture:" + id(),
          data: { paymentId: p.id, amount: String(amount), currency: "EGP" },
          createdAt: when,
        },
      });
    }
    await db.commercePayment.create({
      data: {
        orderId: o.id,
        requestKey: id(),
        method: "WALLET",
        purpose: "BALANCE",
        state: "CLAIMED",
        amountMinor: 4000,
        currency: "EGP",
        providerReference: id(),
        evidenceRequired: true,
      },
    });
    const f = await db.commerceFinanceRequest.create({
      data: {
        orderId: o.id,
        kind: "REFUND",
        amountMinor: 2000,
        state: "RECONCILED",
        requestKey: id(),
        requestedBy: owner,
        approvedBy: manager,
        executedBy: manager,
        reconciledBy: owner,
        reason: "Synthetic reconciled refund",
      },
    });
    await db.commerceEvent.create({
      data: {
        orderId: o.id,
        actorKey: "staff:" + owner,
        kind: "finance.reconcile",
        operationKey: "finance:" + f.id + ":reconcile",
        data: { requestId: f.id, kind: "REFUND", amount: "2000" },
        createdAt: when,
      },
    });
    const before = await db.commerceEvent.count();
    const r = await ownerReport(owner, date, date);
    expect(await db.commerceEvent.count()).toBe(before);
    expect(r.currencies[0]).toMatchObject({
      collected: "6000",
      wallet: "6000",
      walletCount: "2",
      deposits: "5000",
      refunded: "2000",
      netCollected: "4000",
      outstanding: "4000",
    });
    expect(r.pendingPayments[0]).toMatchObject({ method: "WALLET", pendingMinor: "4000" });
    expect(r.productTypes[0]).toMatchObject({
      type: "MADE_TO_ORDER",
      units: 1,
      valueMinor: "10000",
    });
    const duplicate = await db.commerceEvent.create({
      data: {
        orderId: o.id,
        actorKey: "staff:" + owner,
        kind: "payment.verified",
        operationKey: "duplicate:" + id(),
        data: { paymentId: paymentIds[0], amount: "5000", currency: "EGP" },
        createdAt: when,
      },
    });
    try {
      await expect(ownerReport(owner, date, date)).rejects.toThrow(
        "REPORT_DUPLICATE_FINANCIAL_FACT",
      );
    } finally {
      await db.commerceEvent.delete({ where: { id: duplicate.id } });
    }
  });
});
