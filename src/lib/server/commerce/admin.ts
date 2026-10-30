import "server-only";
import { demand } from "@/lib/commerce/policy";
import { assertCommerceEnvironment, requireFeature } from "@/lib/commerce/runtime";
import { getDatabase } from "../database";
import { creditPayment } from "./payments";
import { event, getPolicy, lockOrder, notify, release, stock, transaction, type Tx } from "./store";
export async function staff(adminId: string, tx?: Tx) {
  const source = tx || getDatabase();
  if (tx) await tx.$queryRaw`SELECT id FROM admin_users WHERE id=${adminId} FOR UPDATE`;
  assertCommerceEnvironment();
  const a = await source.adminUser.findUnique({ where: { id: adminId } });
  demand(
    a && !a.banned && !a.forcePasswordChange && ["OWNER", "MANAGER"].includes(a.roleCode),
    "FORBIDDEN",
    403,
  );
  return a;
}
async function grant(tx: Tx, adminId: string, operation: string, amount: bigint, currency: string) {
  await staff(adminId, tx);
  await tx.$queryRaw`SELECT id FROM commerce_finance_grants WHERE adminId=${adminId} AND operation=${operation} AND currency=${currency} FOR UPDATE`;
  const g = await tx.commerceFinanceGrant.findUnique({
    where: { adminId_operation_currency: { adminId, operation, currency } },
  });
  demand(
    g && !g.revoked && g.expiresAt > new Date() && g.limitMinor >= amount,
    "FINANCIAL_PERMISSION_REQUIRED",
    403,
  );
}
export async function requestFinance(
  adminId: string,
  input: {
    orderId: string;
    kind: "REFUND" | "VERIFY_TRANSFER" | "ADJUSTMENT";
    amount: string;
    paymentId?: string;
    key: string;
    reason: string;
  },
) {
  await staff(adminId);
  demand(["REFUND", "VERIFY_TRANSFER"].includes(input.kind), "ADJUSTMENTS_DISABLED");
  demand(
    /^\d+$/.test(input.amount) &&
      BigInt(input.amount) > BigInt(0) &&
      input.reason.trim().length >= 8 &&
      input.reason.length <= 500 &&
      /^[A-Za-z0-9_-]{8,64}$/.test(input.key),
    "INVALID_FINANCE_REQUEST",
    400,
  );
  return transaction(async (tx) => {
    const o = await lockOrder(tx, input.orderId),
      amount = BigInt(input.amount);
    await grant(
      tx,
      adminId,
      input.kind === "REFUND" ? "REFUND_REQUEST" : "PAYMENT_VERIFY",
      amount,
      o.currency,
    );
    const previous = await tx.commerceFinanceRequest.findUnique({
      where: { requestKey: input.key },
    });
    if (previous) {
      demand(
        previous.requestedBy === adminId &&
          previous.orderId === o.id &&
          previous.kind === input.kind &&
          previous.amountMinor === amount &&
          previous.paymentId === (input.paymentId || null),
        "IDEMPOTENCY_CONFLICT",
      );
      return previous;
    }
    const { policy } = await getPolicy(tx);
    if (input.kind === "REFUND") {
      requireFeature("REFUNDS");
      demand(policy.allowMockRefunds, "REFUNDS_DISABLED");
      const held = await tx.commerceFinanceRequest.aggregate({
        where: {
          orderId: o.id,
          kind: "REFUND",
          state: { in: ["REQUESTED", "APPROVED", "EXECUTED", "UNKNOWN"] },
        },
        _sum: { amountMinor: true },
      });
      demand(
        amount <= o.paidMinor - o.refundedMinor - (held._sum.amountMinor || BigInt(0)),
        "REFUND_EXCEEDS_RECEIPTS",
      );
    } else {
      const p = await tx.commercePayment.findUnique({ where: { id: input.paymentId || "" } });
      demand(
        p?.orderId === o.id && p.state === "CLAIMED" && p.amountMinor === amount,
        "TRANSFER_NOT_RECONCILABLE",
      );
      const active = await tx.commerceFinanceRequest.count({
        where: {
          paymentId: p.id,
          state: { in: ["REQUESTED", "APPROVED", "EXECUTED", "RECONCILED"] },
        },
      });
      demand(!active, "TRANSFER_ALREADY_PENDING");
    }
    const r = await tx.commerceFinanceRequest.create({
      data: {
        orderId: o.id,
        paymentId: input.paymentId || null,
        kind: input.kind,
        amountMinor: amount,
        requestKey: input.key,
        requestedBy: adminId,
        reason: input.reason,
      },
    });
    await event(tx, o.id, "staff:" + adminId, "finance.requested", "finance-request:" + r.id, {
      requestId: r.id,
      kind: r.kind,
      amount: String(amount),
      reason: r.reason,
    });
    return r;
  });
}
export async function financeTransition(
  adminId: string,
  id: string,
  action: "approve" | "execute" | "reconcile" | "reject",
) {
  await staff(adminId);
  return transaction(async (tx) => {
    const pre = await tx.commerceFinanceRequest.findUniqueOrThrow({ where: { id } });
    const o = await lockOrder(tx, pre.orderId);
    await staff(adminId, tx);
    await tx.$queryRaw`SELECT id FROM commerce_finance_requests WHERE id=${id} FOR UPDATE`;
    const r = await tx.commerceFinanceRequest.findUniqueOrThrow({ where: { id } });
    if (r.kind === "REFUND") requireFeature("REFUNDS");
    const required =
      action === "approve" || action === "reject"
        ? "REFUND_APPROVE"
        : action === "execute"
          ? "REFUND_EXECUTE"
          : "RECONCILE";
    await grant(
      tx,
      adminId,
      r.kind === "VERIFY_TRANSFER"
        ? action === "reconcile"
          ? "RECONCILE"
          : "PAYMENT_VERIFY"
        : required,
      r.amountMinor,
      o.currency,
    );
    const target =
      action === "approve"
        ? "APPROVED"
        : action === "execute"
          ? "EXECUTED"
          : action === "reject"
            ? "REJECTED"
            : "RECONCILED";
    if (r.state === target) return r;
    if (action === "approve" || action === "reject") {
      demand(
        r.state === "REQUESTED" && r.requestedBy !== adminId,
        "SELF_APPROVAL_OR_STATE_INVALID",
        403,
      );
      await tx.commerceFinanceRequest.update({
        where: { id },
        data: { state: target, approvedBy: adminId },
      });
      if (action === "reject" && r.kind === "VERIFY_TRANSFER" && r.paymentId) {
        const changed = await tx.commercePayment.updateMany({
          where: { id: r.paymentId, state: "CLAIMED" },
          data: { state: "FAILED" },
        });
        demand(changed.count === 1, "TRANSFER_STATE_CHANGED");
      }
    } else if (action === "execute") {
      demand(r.state === "APPROVED", "APPROVAL_REQUIRED");
      const { policy } = await getPolicy(tx);
      demand(r.kind !== "REFUND" || policy.allowMockRefunds, "REFUNDS_DISABLED");
      await tx.commerceFinanceRequest.update({
        where: { id },
        data: { state: target, executedBy: adminId },
      });
    } else {
      demand(
        r.state === "EXECUTED" && r.executedBy !== adminId,
        "SEPARATE_RECONCILER_REQUIRED",
        403,
      );
      if (r.kind === "VERIFY_TRANSFER") {
        demand(r.paymentId, "PAYMENT_REQUIRED");
        await creditPayment(tx, r.paymentId, "staff:" + adminId, "manual-verify:" + r.id);
        const credited = await tx.commercePayment.findUniqueOrThrow({ where: { id: r.paymentId } });
        if (credited.state !== "SUCCEEDED") {
          await tx.commerceFinanceRequest.update({
            where: { id },
            data: { state: "REVIEW_REQUIRED", reconciledBy: adminId },
          });
          await event(
            tx,
            o.id,
            "staff:" + adminId,
            "finance.review_required",
            "finance-review:" + id,
          );
          return tx.commerceFinanceRequest.findUniqueOrThrow({ where: { id } });
        }
      } else {
        demand(o.refundedMinor + r.amountMinor <= o.paidMinor, "REFUND_EXCEEDS_RECEIPTS");
        await tx.commerceOrder.update({
          where: { id: o.id },
          data: {
            refundedMinor: { increment: r.amountMinor },
            creditedMinor: { increment: r.amountMinor },
            version: { increment: 1 },
          },
        });
        await notify(tx, o.id, "refund.reconciled", o.locale, "refund:" + id);
      }
      await tx.commerceFinanceRequest.update({
        where: { id },
        data: { state: target, reconciledBy: adminId },
      });
    }
    await event(tx, o.id, "staff:" + adminId, "finance." + action, "finance:" + id + ":" + action, {
      requestId: id,
      kind: r.kind,
      amount: String(r.amountMinor),
      simulationOnly: true,
    });
    return tx.commerceFinanceRequest.findUniqueOrThrow({ where: { id } });
  });
}
export async function fulfill(
  adminId: string,
  orderId: string,
  action:
    | "start"
    | "ready"
    | "dispatch"
    | "delivered"
    | "failed"
    | "returned"
    | "cod_collected"
    | "cod_reconciled",
  reference?: string,
) {
  await staff(adminId);
  return transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    await staff(adminId, tx);
    const shipment = await tx.commerceShipment.findUnique({ where: { orderId } });
    if (["start", "ready", "dispatch"].includes(action)) {
      demand(!o.payments.some((p) => p.state === "REVIEW_REQUIRED"), "PAYMENT_REVIEW_REQUIRED");
      demand(o.refundedMinor === BigInt(0), "REFUNDED_ORDER_REVIEW_REQUIRED");
      demand(
        (await tx.commerceCancellation.count({ where: { orderId, state: "REQUESTED" } })) === 0,
        "CANCELLATION_REVIEW_REQUIRED",
      );
      demand(
        (await tx.commerceFinanceRequest.count({
          where: {
            orderId,
            kind: "REFUND",
            state: { in: ["REQUESTED", "APPROVED", "EXECUTED", "UNKNOWN"] },
          },
        })) === 0,
        "REFUND_REVIEW_REQUIRED",
      );
    }

    if (action === "start") {
      if (o.state === "IN_PRODUCTION") return o;
      demand(
        o.state === "CONFIRMED" &&
          o.paidMinor - o.refundedMinor >= o.initialMinor &&
          o.items.every((i) => i.type === "MADE_TO_ORDER"),
        "PRODUCTION_PAYMENT_REQUIRED",
      );
      await tx.commerceOrderItem.updateMany({
        where: { orderId },
        data: { manufacturingState: "IN_PRODUCTION" },
      });
      await tx.commerceOrder.update({
        where: { id: orderId },
        data: { state: "IN_PRODUCTION", version: { increment: 1 } },
      });
    } else if (action === "ready") {
      if (o.state === "READY") return o;
      demand(
        o.items.every((i) => i.type === "READY_MADE")
          ? o.state === "CONFIRMED"
          : o.state === "IN_PRODUCTION",
        "INVALID_FULFILLMENT_STATE",
      );
      await tx.commerceOrderItem.updateMany({
        where: { orderId, type: "MADE_TO_ORDER" },
        data: { manufacturingState: "READY" },
      });
      await tx.commerceOrder.update({
        where: { id: orderId },
        data: { state: "READY", version: { increment: 1 } },
      });
    } else if (action === "dispatch") {
      if (o.state === "SHIPPED") return o;
      demand(
        o.state === "READY" &&
          (o.paymentMethod === "COD" ||
            o.paidMinor - o.refundedMinor >= o.totalMinor - o.creditedMinor),
        "BALANCE_REQUIRED",
      );
      demand(
        reference && reference.length >= 4 && reference.length <= 191,
        "CARRIER_REFERENCE_REQUIRED",
      );
      for (const i of [...o.items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        if (i.reservation) {
          demand(i.reservation.state === "COMMITTED", "RESERVATION_REQUIRED");
          await stock(tx, i.variantId, -i.quantity, -i.quantity, "consume:" + i.id);
          await tx.commerceReservation.update({
            where: { id: i.reservation.id },
            data: { state: "CONSUMED" },
          });
        }
      }
      await tx.commerceShipment.create({
        data: { orderId, state: "DISPATCHED", carrierReference: reference },
      });
      await tx.commerceOrder.update({
        where: { id: orderId },
        data: { state: "SHIPPED", version: { increment: 1 } },
      });
      await notify(tx, orderId, "order.shipped", o.locale, "shipped:" + orderId);
    } else if (action === "delivered" || action === "failed") {
      const state = action === "delivered" ? "DELIVERED" : "FAILED";
      if (shipment?.state === state) return o;
      demand(o.state === "SHIPPED" && shipment?.state === "DISPATCHED", "SHIPMENT_STATE_INVALID");
      await tx.commerceShipment.update({ where: { orderId }, data: { state } });
      if (action === "delivered")
        await tx.commerceOrder.update({
          where: { id: orderId },
          data: { state: "DELIVERED", version: { increment: 1 } },
        });
    } else if (action === "returned") {
      if (shipment?.state === "RETURNED") return o;
      demand(shipment?.state === "FAILED", "RETURN_INSPECTION_REQUIRED");
      for (const i of [...o.items].sort((a, b) => a.variantId.localeCompare(b.variantId)))
        if (i.type === "READY_MADE") await stock(tx, i.variantId, i.quantity, 0, "return:" + i.id);
      await tx.commerceShipment.update({ where: { orderId }, data: { state: "RETURNED" } });
      await tx.commerceOrder.update({
        where: { id: orderId },
        data: { state: "RETURNED", version: { increment: 1 } },
      });
    } else {
      demand(o.paymentMethod === "COD" && shipment?.state === "DELIVERED", "COD_DELIVERY_REQUIRED");
      await grant(
        tx,
        adminId,
        action === "cod_collected" ? "PAYMENT_VERIFY" : "RECONCILE",
        o.totalMinor,
        o.currency,
      );
      const target = action === "cod_collected" ? "COLLECTED" : "RECONCILED";
      if (shipment.collectionState === target) return o;
      if (action === "cod_collected")
        demand(shipment.collectionState === "NOT_COLLECTED", "COD_STATE_INVALID");
      else {
        demand(shipment.collectionState === "COLLECTED", "COD_COLLECTION_REQUIRED");
        const collected = await tx.commerceEvent.findUnique({
          where: { operationKey: "fulfill:" + orderId + ":cod_collected" },
        });
        demand(collected?.actorKey !== "staff:" + adminId, "SEPARATE_RECONCILER_REQUIRED", 403);
        await tx.commerceOrder.update({
          where: { id: orderId },
          data: { paidMinor: o.totalMinor, version: { increment: 1 } },
        });
      }
      await tx.commerceShipment.update({ where: { orderId }, data: { collectionState: target } });
    }
    await event(
      tx,
      orderId,
      "staff:" + adminId,
      "fulfillment." + action,
      "fulfill:" + orderId + ":" + action,
      { reference: reference || null },
    );
    return tx.commerceOrder.findUniqueOrThrow({ where: { id: orderId } });
  });
}

export async function reviewCancellation(adminId: string, id: string, approve: boolean) {
  await staff(adminId);
  return transaction(async (tx) => {
    const pre = await tx.commerceCancellation.findUniqueOrThrow({ where: { id } });
    const o = await lockOrder(tx, pre.orderId);
    await staff(adminId, tx);
    const r = await tx.commerceCancellation.findUniqueOrThrow({ where: { id } });
    const target = approve ? "APPROVED" : "REJECTED";
    if (r.state === target) return r;
    demand(r.state === "REQUESTED", "CANCELLATION_STATE_INVALID");
    if (approve) {
      demand(
        ["AWAITING_PAYMENT", "CONFIRMED", "READY"].includes(o.state) &&
          o.items.every((i) => i.manufacturingState === "NOT_STARTED"),
        "OPERATIONAL_POLICY_REVIEW_REQUIRED",
      );
      if (o.paidMinor > BigInt(0))
        await grant(tx, adminId, "REFUND_APPROVE", o.paidMinor, o.currency);
      await release(tx, o, "cancel-review");
      await tx.commerceOrder.update({
        where: { id: o.id },
        data: { state: "CANCELLED", version: { increment: 1 } },
      });
    }
    await event(
      tx,
      o.id,
      "staff:" + adminId,
      "cancellation." + target.toLowerCase(),
      "cancellation-review:" + id,
      { refundAutomatic: false, forfeiture: false },
    );
    return tx.commerceCancellation.update({
      where: { id },
      data: { state: target, reviewedBy: adminId },
    });
  });
}
