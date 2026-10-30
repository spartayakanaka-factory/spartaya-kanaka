import "server-only";
import { getDatabase } from "../database";
import { assertCommerceEnvironment } from "@/lib/commerce/runtime";
import { demand } from "@/lib/commerce/policy";
import { reportRange } from "@/lib/reports/calendar";
import { aggregateReports } from "@/lib/reports/aggregation";
export async function ownerReport(adminId: string, start: string, end: string) {
  assertCommerceEnvironment();
  demand(process.env.P4_OWNER_REPORTS === "1", "REPORTS_DISABLED", 503);
  const range = reportRange(start, end),
    db = getDatabase();
  return db.$transaction(
    async (tx) => {
      const actor = await tx.adminUser.findUnique({
        where: { id: adminId },
        select: { roleCode: true, banned: true, forcePasswordChange: true },
      });
      demand(
        actor && actor.roleCode === "OWNER" && !actor.banned && !actor.forcePasswordChange,
        "FORBIDDEN",
        403,
      );
      const [orders, events] = await Promise.all([
        tx.commerceOrder.findMany({
          where: { createdAt: { gte: range.start, lt: range.end } },
          take: 5001,
          include: {
            shipment: { select: { collectionState: true } },
            items: {
              select: {
                type: true,
                manufacturingState: true,
                quantity: true,
                snapshot: true,
                variant: { select: { productId: true } },
              },
            },
          },
          orderBy: { id: "asc" },
        }),
        tx.commerceEvent.findMany({
          where: {
            createdAt: { gte: range.start, lt: range.end },
            kind: { in: ["payment.verified", "fulfillment.cod_reconciled", "finance.reconcile"] },
          },
          take: 5001,
          include: {
            order: {
              include: {
                shipment: { select: { collectionState: true } },
                items: {
                  select: {
                    type: true,
                    manufacturingState: true,
                    quantity: true,
                    snapshot: true,
                    variant: { select: { productId: true } },
                  },
                },
              },
            },
          },
          orderBy: { id: "asc" },
        }),
      ]);
      demand(orders.length <= 5000 && events.length <= 5000, "REPORT_RANGE_TOO_LARGE", 400);
      const ids = (kind: string, key: string) =>
        events
          .filter((e) => e.kind === kind)
          .map((e) => (e.data as Record<string, unknown>)?.[key])
          .filter((v): v is string => typeof v === "string");
      const [payments, refunds] = await Promise.all([
        tx.commercePayment.findMany({
          where: { id: { in: ids("payment.verified", "paymentId") } },
          select: {
            id: true,
            orderId: true,
            currency: true,
            amountMinor: true,
            method: true,
            purpose: true,
            state: true,
          },
        }),
        tx.commerceFinanceRequest.findMany({
          where: { id: { in: ids("finance.reconcile", "requestId") } },
          select: { id: true, orderId: true, amountMinor: true, state: true, kind: true },
        }),
      ]);
      const mapOrder = (o: (typeof orders)[number]) => ({
        id: o.id,
        state: o.state,
        currency: o.currency,
        totalMinor: o.totalMinor,
        paidMinor: o.paidMinor,
        refundedMinor: o.refundedMinor,
        creditedMinor: o.creditedMinor,
        paymentMethod: o.paymentMethod,
        isMadeToOrder: o.items.length > 0 && o.items.every((i) => i.type === "MADE_TO_ORDER"),
        codReconciled: o.shipment?.collectionState === "RECONCILED",
      });
      const report = aggregateReports(
        orders.map(mapOrder),
        events.map((e) => ({ ...e, order: e.order ? mapOrder(e.order) : null })),
        payments,
        refunds,
      );
      const manufacturing = { awaitingPayment: 0, pending: 0, inProgress: 0, completed: 0 };
      for (const o of orders) {
        if (["CANCELLED", "EXPIRED", "RETURNED"].includes(o.state)) continue;
        for (const i of o.items) {
          if (i.type !== "MADE_TO_ORDER") continue;
          if (i.manufacturingState === "NOT_STARTED") {
            if (o.state === "AWAITING_PAYMENT") manufacturing.awaitingPayment++;
            else manufacturing.pending++;
          } else if (i.manufacturingState === "IN_PRODUCTION") manufacturing.inProgress++;
          else if (i.manufacturingState === "READY") manufacturing.completed++;
        }
      }
      const rankings = new Map<
        string,
        {
          productId: string;
          titleAr: string;
          titleEn: string | null;
          imageUrl: string | null;
          type: string;
          currency: string;
          units: number;
          value: bigint;
        }
      >();
      for (const order of orders) {
        if (["CANCELLED", "EXPIRED", "RETURNED"].includes(order.state)) continue;
        for (const item of order.items) {
          const snap = item.snapshot as Record<string, unknown>;
          demand(
            typeof snap.titleAr === "string" &&
              typeof snap.gross === "string" &&
              /^\d+$/.test(snap.gross) &&
              item.quantity > 0,
            "REPORT_INVALID_LINE",
          );
          const key = order.currency + ":" + item.type + ":" + item.variant.productId;
          let row = rankings.get(key);
          if (!row) {
            row = {
              productId: item.variant.productId,
              titleAr: snap.titleAr,
              titleEn: typeof snap.titleEn === "string" ? snap.titleEn : null,
              imageUrl: typeof snap.imageUrl === "string" ? snap.imageUrl : null,
              type: item.type,
              currency: order.currency,
              units: 0,
              value: BigInt(0),
            };
            rankings.set(key, row);
          }
          demand(row.type === item.type, "REPORT_INVALID_LINE");
          row.units += item.quantity;
          row.value += BigInt(snap.gross);
        }
      }
      const types = new Map<
        string,
        { currency: string; type: string; units: number; value: bigint }
      >();
      for (const row of rankings.values()) {
        const key = row.currency + ":" + row.type;
        const existing = types.get(key) || {
          currency: row.currency,
          type: row.type,
          units: 0,
          value: BigInt(0),
        };
        existing.units += row.units;
        existing.value += row.value;
        types.set(key, existing);
      }
      const productTypes = [...types.values()].map(({ value, ...row }) => ({
        ...row,
        valueMinor: String(value),
      }));
      const products = [...rankings.values()]
        .sort((a, b) => b.units - a.units || a.productId.localeCompare(b.productId))
        .slice(0, 20)
        .map(({ value, ...row }) => ({ ...row, valueMinor: String(value) }));
      const groups = await tx.commercePayment.groupBy({
        by: ["currency", "method", "state", "evidenceRequired"],
        where: {
          order: {
            createdAt: { gte: range.start, lt: range.end },
            state: { notIn: ["CANCELLED", "EXPIRED", "RETURNED"] },
          },
          state: { in: ["PENDING", "CLAIMED", "FAILED"] },
        },
        _sum: { amountMinor: true },
        _count: { _all: true },
      });
      demand(groups.length <= 5000, "REPORT_RANGE_TOO_LARGE", 400);
      const pending = new Map<
        string,
        { currency: string; method: string; amount: bigint; rejected: number }
      >();
      for (const g of groups) {
        if (!["WALLET", "INSTAPAY"].includes(g.method)) continue;
        const key = g.currency + ":" + g.method;
        const row = pending.get(key) || {
          currency: g.currency,
          method: g.method,
          amount: BigInt(0),
          rejected: 0,
        };
        if (["PENDING", "CLAIMED"].includes(g.state)) row.amount += g._sum.amountMinor || BigInt(0);
        if (g.state === "FAILED" && g.evidenceRequired) row.rejected += g._count._all;
        pending.set(key, row);
      }
      const pendingPayments = [...pending.values()].map(({ amount, ...row }) => ({
        ...row,
        pendingMinor: String(amount),
      }));
      const [unverifiedEvidence, balances] = await Promise.all([
        tx.commercePayment.count({
          where: { state: "CLAIMED", evidenceRequired: true, evidence: { some: {} } },
        }),
        tx.inventoryBalance.findMany({
          where: {
            variant: { active: true },
            product: { type: "READY_MADE", status: { not: "ARCHIVED" } },
          },
          select: { quantity: true, lowStockAt: true },
          take: 5001,
        }),
      ]);
      demand(balances.length <= 5000, "REPORT_RANGE_TOO_LARGE", 400);
      return {
        ...report,
        products,
        productTypes,
        pendingPayments,
        operations: {
          unverifiedEvidence,
          manufacturing,
          outOfStock: balances.filter((b) => b.quantity === 0).length,
          lowStock: balances.filter((b) => b.quantity > 0 && b.quantity <= b.lowStockAt).length,
        },
        start,
        end,
        timezone: "Africa/Cairo",
        generatedAt: new Date().toISOString(),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 20000 },
  );
}
