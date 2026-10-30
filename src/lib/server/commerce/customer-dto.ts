import "server-only";
import type { Prisma } from "@/generated/prisma/client";
function pick(value: Prisma.JsonValue, keys: string[]) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, source[k]]));
}
/** Never send internal audit notes, staff identities or idempotency material to a shopper. */
export function customerOrder(
  order: Prisma.CommerceOrderGetPayload<{ include: { items: true; payments: true } }>,
) {
  const snapshot = order.snapshot as Prisma.JsonObject;
  return {
    id: order.id,
    state: order.state,
    currency: order.currency,
    totalMinor: order.totalMinor,
    initialMinor: order.initialMinor,
    paidMinor: order.paidMinor,
    refundedMinor: order.refundedMinor,
    creditedMinor: order.creditedMinor,
    paymentMethod: order.paymentMethod,
    locale: order.locale,
    expiresAt: order.expiresAt,
    createdAt: order.createdAt,
    snapshot: {
      address: snapshot.address,
      shipping: pick(snapshot.shipping || {}, [
        "carrier",
        "leadDays",
        "feeMinor",
        "codFeeMinor",
        "currency",
        "net",
        "tax",
        "gross",
      ]),
      initialDue: snapshot.initialDue,
    },
    items: order.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      type: i.type,
      manufacturingState: i.manufacturingState,
      snapshot: pick(i.snapshot, [
        "titleAr",
        "titleEn",
        "variantAr",
        "quantity",
        "unitMinor",
        "net",
        "tax",
        "gross",
        "initialMinor",
        "manufacturing",
      ]),
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      state: p.state,
      method: p.method,
      amountMinor: p.amountMinor,
      currency: p.currency,
      purpose: p.purpose,
      createdAt: p.createdAt,
    })),
  };
}
