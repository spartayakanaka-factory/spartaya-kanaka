import "server-only";
import { manualEvidenceEnabled } from "@/lib/commerce/factory-policy";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { demand, minor } from "@/lib/commerce/policy";
import { assertCommerceEnvironment, requireFeature } from "@/lib/commerce/runtime";
import { getDatabase } from "../database";
import {
  digest,
  event,
  getPolicy,
  lockOrder,
  notify,
  transaction,
  type Shopper,
  type Tx,
} from "./store";
const factSchema = z
  .object({
    id: z.string().uuid(),
    paymentId: z.string().uuid(),
    reference: z.string(),
    account: z.literal("local-mock-only"),
    currency: z.literal("EGP"),
    amount: z.string().regex(/^\d+$/),
    status: z.enum(["SUCCEEDED", "FAILED", "UNKNOWN"]),
  })
  .strict();
export type PaymentFact = z.infer<typeof factSchema>;
function signature(body: string) {
  assertCommerceEnvironment();
  requireFeature("MOCK_PAYMENTS");
  const secret = process.env.MOCK_PAYMENT_SECRET;
  demand(secret && secret.length >= 32, "MOCK_SECRET_REQUIRED", 503);
  return createHmac("sha256", secret).update(body).digest("hex");
}
// Adapter never calls a network. The verified event path is identical for first delivery and replay.
export function mockProviderFact(
  payment: { id: string; providerReference: string; currency: string; amountMinor: bigint },
  status: PaymentFact["status"] = "SUCCEEDED",
) {
  const fact = {
    id: randomUUID(),
    paymentId: payment.id,
    reference: payment.providerReference,
    account: "local-mock-only" as const,
    currency: payment.currency,
    amount: String(payment.amountMinor),
    status,
  };
  const body = JSON.stringify(fact);
  return { body, signature: signature(body) };
}
export async function beginPayment(
  shopper: Shopper,
  orderId: string,
  key: string,
  purpose: "INITIAL" | "BALANCE" = "INITIAL",
  claimReference?: string,
) {
  demand(/^[A-Za-z0-9_-]{8,64}$/.test(key), "IDEMPOTENCY_KEY_REQUIRED", 400);
  return transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    demand(o.ownerKey === shopper.key, "ORDER_NOT_FOUND", 404);
    const previous = await tx.commercePayment.findUnique({
      where: { orderId_requestKey: { orderId, requestKey: key } },
    });
    if (previous) {
      demand(
        previous.purpose === purpose && previous.claimReference === (claimReference || null),
        "IDEMPOTENCY_CONFLICT",
      );
      return previous;
    }
    demand(
      ["AWAITING_PAYMENT", "CONFIRMED", "IN_PRODUCTION", "READY"].includes(o.state),
      "ORDER_NOT_PAYABLE",
    );
    demand(o.state !== "AWAITING_PAYMENT" || o.expiresAt > new Date(), "ORDER_EXPIRED");
    demand(o.paymentMethod !== "COD", "COD_NOT_COLLECTED");
    if (o.paymentMethod === "MOCK_CARD") requireFeature("MOCK_PAYMENTS");
    demand(!o.payments.some((p) => p.state === "REVIEW_REQUIRED"), "PAYMENT_REVIEW_REQUIRED");
    const target = purpose === "INITIAL" ? o.initialMinor : o.totalMinor;
    demand(purpose === "INITIAL" || o.paidMinor >= o.initialMinor, "INITIAL_PAYMENT_REQUIRED");
    const inflight = await tx.commercePayment.aggregate({
      where: { orderId, state: { in: ["PENDING", "CLAIMED", "UNKNOWN"] } },
      _sum: { amountMinor: true },
    });
    const amount = target - o.paidMinor - (inflight._sum.amountMinor || BigInt(0));
    demand(amount > BigInt(0), "PAYMENT_ALREADY_PENDING_OR_SATISFIED");
    if (o.paymentMethod !== "MOCK_CARD") requireFeature("MANUAL_TRANSFERS");
    const needsEvidence = o.paymentMethod !== "MOCK_CARD" && manualEvidenceEnabled();
    if (o.paymentMethod !== "MOCK_CARD" && (!needsEvidence || claimReference))
      demand(
        claimReference && /^[A-Za-z0-9_-]{8,96}$/.test(claimReference),
        "TRANSFER_REFERENCE_REQUIRED",
      );
    const instructions = needsEvidence
      ? (await getPolicy(tx)).policy.manualInstructions?.[o.paymentMethod as "WALLET" | "INSTAPAY"]
      : null;
    demand(!needsEvidence || instructions?.enabled, "MANUAL_METHOD_NOT_CONFIGURED");
    const p = await tx.commercePayment.create({
      data: {
        orderId,
        requestKey: key,
        method: o.paymentMethod,
        purpose,
        amountMinor: amount,
        currency: o.currency,
        providerReference: "mock:" + randomUUID(),
        claimReference: claimReference || null,
        evidenceRequired: needsEvidence,
        ...(instructions ? { instructionsSnapshot: instructions } : {}),
        state: o.paymentMethod === "MOCK_CARD" ? "PENDING" : "CLAIMED",
      },
    });
    await event(
      tx,
      orderId,
      shopper.key,
      "payment." + (claimReference ? "claimed" : "initiated"),
      "payment-start:" + p.id,
      { paymentId: p.id, amount: String(amount), method: p.method },
    );
    return p;
  });
}
export async function creditPayment(
  tx: Tx,
  paymentId: string,
  actor: string,
  operationKey: string,
) {
  const p = await tx.commercePayment.findUniqueOrThrow({ where: { id: paymentId } });
  const o = await lockOrder(tx, p.orderId);
  if (p.state === "SUCCEEDED") return o;
  if (p.state === "REVIEW_REQUIRED") return o;
  if (
    p.state === "FAILED" ||
    o.payments.some((other) => other.id !== p.id && other.state === "REVIEW_REQUIRED")
  ) {
    await tx.commercePayment.update({ where: { id: p.id }, data: { state: "REVIEW_REQUIRED" } });
    await event(tx, o.id, actor, "payment.contradictory_fact", operationKey, { paymentId: p.id });
    return o;
  }
  demand(["PENDING", "CLAIMED", "UNKNOWN"].includes(p.state), "PAYMENT_STATE_INVALID");
  if (
    ["CANCELLED", "EXPIRED", "DELIVERED"].includes(o.state) ||
    o.paidMinor + p.amountMinor > o.totalMinor
  ) {
    await tx.commercePayment.update({ where: { id: p.id }, data: { state: "REVIEW_REQUIRED" } });
    await event(tx, o.id, actor, "payment.review_required", operationKey, { paymentId: p.id });
    return o;
  }
  // A late success cannot recreate released stock. Expiry must be checked even if the sweeper has not run.
  if (o.state === "AWAITING_PAYMENT" && o.expiresAt <= new Date()) {
    await tx.commercePayment.update({ where: { id: p.id }, data: { state: "REVIEW_REQUIRED" } });
    await event(tx, o.id, actor, "payment.late", operationKey, { paymentId: p.id });
    return o;
  }
  const paid = o.paidMinor + p.amountMinor;
  await tx.commercePayment.update({ where: { id: p.id }, data: { state: "SUCCEEDED" } });
  if (paid >= o.initialMinor)
    await tx.commerceReservation.updateMany({
      where: { item: { orderId: o.id }, state: "HELD" },
      data: { state: "COMMITTED" },
    });
  const updated = await tx.commerceOrder.update({
    where: { id: o.id },
    data: {
      paidMinor: paid,
      state: o.state === "AWAITING_PAYMENT" && paid >= o.initialMinor ? "CONFIRMED" : o.state,
      version: { increment: 1 },
    },
  });
  await event(tx, o.id, actor, "payment.verified", operationKey, {
    paymentId: p.id,
    amount: String(p.amountMinor),
    currency: p.currency,
  });
  await notify(tx, o.id, "payment.verified", o.locale, operationKey);
  return updated;
}
export async function receiveMockEvent(body: string, supplied: string) {
  assertCommerceEnvironment();
  demand(body.length <= 10000 && /^[a-f0-9]{64}$/.test(supplied), "INVALID_SIGNATURE", 403);
  const expected = signature(body);
  demand(
    timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex")),
    "INVALID_SIGNATURE",
    403,
  );
  const fact = factSchema.parse(JSON.parse(body));
  return transaction(async (tx) => {
    const initial = await tx.commercePayment.findUnique({ where: { id: fact.paymentId } });
    demand(initial, "UNKNOWN_PAYMENT", 404);
    await lockOrder(tx, initial.orderId);
    const prior = await tx.commercePaymentEvent.findUnique({ where: { id: fact.id } });
    if (prior) {
      demand(prior.payloadHash === digest(fact), "EVENT_CONFLICT");
      return { duplicate: true, state: prior.state };
    }
    const p = await tx.commercePayment.findUniqueOrThrow({ where: { id: fact.paymentId } });
    demand(
      p.method === "MOCK_CARD" &&
        p.providerReference === fact.reference &&
        p.currency === fact.currency &&
        p.amountMinor === minor(fact.amount),
      "PAYMENT_FACT_MISMATCH",
      400,
    );
    await tx.commercePaymentEvent.create({
      data: { id: fact.id, paymentId: p.id, payloadHash: digest(fact), state: fact.status },
    });
    if (fact.status === "SUCCEEDED") {
      await creditPayment(tx, p.id, "provider:local-mock", "verified-event:" + fact.id);
    } else if (["PENDING", "UNKNOWN"].includes(p.state)) {
      await tx.commercePayment.update({ where: { id: p.id }, data: { state: fact.status } });
      await event(
        tx,
        p.orderId,
        "provider:local-mock",
        "payment." + fact.status.toLowerCase(),
        "event:" + fact.id,
      );
    }
    return {
      duplicate: false,
      state: (await tx.commercePayment.findUniqueOrThrow({ where: { id: p.id } })).state,
    };
  });
}
export async function payMock(
  shopper: Shopper,
  orderId: string,
  key: string,
  purpose: "INITIAL" | "BALANCE",
) {
  const payment = await beginPayment(shopper, orderId, key, purpose);
  demand(payment.method === "MOCK_CARD", "MANUAL_RECONCILIATION_REQUIRED");
  if (payment.state !== "PENDING") return payment;
  const fact = mockProviderFact(payment);
  await receiveMockEvent(fact.body, fact.signature);
  return getDatabase().commercePayment.findUniqueOrThrow({ where: { id: payment.id } });
}
