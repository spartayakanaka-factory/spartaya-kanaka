import "server-only";
import { getProductImageUrl } from "@/lib/asset-url";
import { destinationMatches, manualEvidenceEnabled } from "@/lib/commerce/factory-policy";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "../database";
import {
  addressSchema,
  CommerceError,
  demand,
  deposit,
  jsonValue,
  lineMoney,
  minor,
  policySchema,
  type Address,
  type PaymentMethod,
} from "@/lib/commerce/policy";
import { assertCommerceEnvironment, requireFeature } from "@/lib/commerce/runtime";
import { customerOrder } from "./customer-dto";
export type Tx = Prisma.TransactionClient;
export type Shopper = { key: string; userId?: string };
export const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(jsonValue(value)))
    .digest("hex");
export async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  assertCommerceEnvironment();
  for (let attempt = 0; ; attempt++)
    try {
      return await getDatabase().$transaction(work, {
        isolationLevel: "ReadCommitted",
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (error) {
      if (
        attempt < 3 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code)
      )
        continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new CommerceError("CONFLICT", 409);
      throw error;
    }
}
export async function lockOrder(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM commerce_orders WHERE id=${id} FOR UPDATE`;
  const order = await tx.commerceOrder.findUnique({
    where: { id },
    include: {
      items: { include: { reservation: true } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  demand(order, "ORDER_NOT_FOUND", 404);
  return order;
}
export async function event(
  tx: Tx,
  orderId: string,
  actorKey: string,
  kind: string,
  operationKey: string,
  data: unknown = {},
) {
  await tx.commerceEvent.create({
    data: { orderId, actorKey, kind, operationKey, data: jsonValue(data) as Prisma.InputJsonValue },
  });
}
export async function notify(tx: Tx, orderId: string, kind: string, locale: string, key: string) {
  await tx.commerceNotification.create({
    data: { dedupKey: key, kind, locale, payload: { orderId } },
  });
}
export async function stock(
  tx: Tx,
  variantId: string,
  quantityDelta: number,
  reservedDelta: number,
  key: string,
) {
  await tx.$queryRaw`SELECT id FROM inventory_balances WHERE variantId=${variantId} FOR UPDATE`;
  const result =
    await tx.$executeRaw`UPDATE inventory_balances SET quantity=quantity+${quantityDelta},reserved=reserved+${reservedDelta},version=version+1,updatedAt=CURRENT_TIMESTAMP(3) WHERE variantId=${variantId} AND reserved+${reservedDelta}>=0 AND quantity+${quantityDelta}>=reserved+${reservedDelta}`;
  demand(result === 1, "OUT_OF_STOCK");
  const b = await tx.inventoryBalance.findUniqueOrThrow({ where: { variantId } });
  await tx.commerceStockEvent.create({
    data: {
      variantId,
      quantityDelta,
      reservedDelta,
      quantityAfter: b.quantity,
      reservedAfter: b.reserved,
      operationKey: key,
    },
  });
}
export async function getPolicy(tx: Tx) {
  const row = await tx.commercePolicy.findUnique({ where: { id: "local-synthetic" } });
  demand(row?.simulationOnly, "POLICY_REQUIRED");
  const parsed = policySchema.safeParse(row.configuration);
  demand(parsed.success, "POLICY_REQUIRED");
  return { policy: parsed.data, version: row.version };
}
const catalogSelect = {
  id: true,
  slug: true,
  titleAr: true,
  titleEn: true,
  priceMinor: true,
  type: true,
  currency: true,
  availability: true,
  variants: {
    where: { active: true },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      priceMinor: true,
      inventory: { select: { quantity: true, reserved: true } },
    },
  },
  media: {
    select: { media: { select: { provider: true, originalKey: true, publicUrl: true } } },
    orderBy: { position: "asc" },
    take: 1,
  },
} satisfies Prisma.ProductSelect;
function publicProduct(product: Prisma.ProductGetPayload<{ select: typeof catalogSelect }>) {
  return {
    ...product,
    media: product.media.map(({ media }) => ({
      media: {
        originalKey: media.provider === "LEGACY_LOCAL" ? media.originalKey : "",
        publicUrl: media.publicUrl,
      },
    })),
  };
}
export async function catalog() {
  assertCommerceEnvironment();
  return (
    await getDatabase().product.findMany({
      where: { status: "PUBLISHED", detailsReviewedAt: { not: null }, priceMinor: { not: null } },
      select: catalogSelect,
      orderBy: { createdAt: "desc" },
      take: 100,
    })
  ).map(publicProduct);
}
export async function getCart(shopper: Shopper) {
  assertCommerceEnvironment();
  const db = getDatabase();
  const cart = await db.commerceCart.findUnique({
    where: { ownerKey: shopper.key },
    include: { items: true },
  });
  if (!cart) return null;
  const products = await db.product.findMany({
    where: {
      status: "PUBLISHED",
      variants: { some: { id: { in: cart.items.map((i) => i.variantId) } } },
    },
    select: catalogSelect,
  });
  return {
    id: cart.id,
    version: cart.version,
    items: cart.items.map((i) => ({ id: i.id, variantId: i.variantId, quantity: i.quantity })),
    products: products.map(publicProduct),
  };
}
export async function updateCart(shopper: Shopper, variantId: string, quantity: number) {
  demand(Number.isInteger(quantity) && quantity >= 0 && quantity <= 99, "INVALID_QUANTITY", 400);
  return transaction(async (tx) => {
    const cart = await tx.commerceCart.upsert({
      where: { ownerKey: shopper.key },
      create: { ownerKey: shopper.key },
      update: {},
    });
    await tx.$queryRaw`SELECT id FROM commerce_carts WHERE id=${cart.id} FOR UPDATE`;
    if (quantity === 0)
      await tx.commerceCartItem.deleteMany({ where: { cartId: cart.id, variantId } });
    else {
      const v = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: { product: true, inventory: true },
      });
      demand(
        v?.active &&
          v.product.status === "PUBLISHED" &&
          v.product.detailsReviewedAt &&
          v.product.availability === "AVAILABLE" &&
          v.availability === "AVAILABLE" &&
          (v.priceMinor ?? v.product.priceMinor) !== null,
        "PRODUCT_UNAVAILABLE",
      );
      if (v.product.type === "READY_MADE")
        demand(
          v.inventory && v.inventory.quantity - v.inventory.reserved >= quantity,
          "OUT_OF_STOCK",
        );
      demand(v.product.type, "CLASSIFICATION_REQUIRED");
      await tx.commerceCartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
        create: { cartId: cart.id, variantId, quantity },
        update: { quantity },
      });
    }
    return tx.commerceCart.update({
      where: { id: cart.id },
      data: { version: { increment: 1 } },
      include: { items: true },
    });
  });
}
export async function mergeCart(guest: Shopper, customer: Shopper) {
  demand(guest.key.startsWith("guest:") && customer.key.startsWith("customer:"), "FORBIDDEN", 403);
  return transaction(async (tx) => {
    const target = await tx.commerceCart.upsert({
      where: { ownerKey: customer.key },
      create: { ownerKey: customer.key },
      update: {},
    });
    const source = await tx.commerceCart.findUnique({ where: { ownerKey: guest.key } });
    if (!source) return target;
    for (const id of [target.id, source.id].sort())
      await tx.$queryRaw`SELECT id FROM commerce_carts WHERE id=${id} FOR UPDATE`;
    const items = await tx.commerceCartItem.findMany({ where: { cartId: source.id } });
    for (const item of items) {
      const old = await tx.commerceCartItem.findUnique({
        where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } },
      });
      const quantity = item.quantity + (old?.quantity || 0);
      demand(quantity <= 99, "MERGE_REVIEW_REQUIRED");
      const v = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        include: { product: true, inventory: true },
      });
      demand(v?.active && v.product.status === "PUBLISHED", "MERGE_REVIEW_REQUIRED");
      if (v.product.type === "READY_MADE")
        demand(
          v.inventory && v.inventory.quantity - v.inventory.reserved >= quantity,
          "MERGE_REVIEW_REQUIRED",
        );
      await tx.commerceCartItem.upsert({
        where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } },
        create: { cartId: target.id, variantId: item.variantId, quantity },
        update: { quantity },
      });
    }
    await tx.commerceCartItem.deleteMany({ where: { cartId: source.id } });
    await tx.commerceCart.update({ where: { id: source.id }, data: { version: { increment: 1 } } });
    return tx.commerceCart.update({
      where: { id: target.id },
      data: { version: { increment: 1 } },
    });
  });
}
export type CheckoutInput = {
  address: Address;
  rateId: string;
  method: PaymentMethod;
  locale: "ar" | "en";
  quoteHash?: string;
  requestKey?: string;
};
async function prepare(tx: Tx, shopper: Shopper, input: CheckoutInput) {
  const address = addressSchema.parse(input.address);
  demand(address.country === "EG", "INTERNATIONAL_CHECKOUT_DISABLED");
  const { policy, version } = await getPolicy(tx);
  demand(
    shopper.userId || (policy.allowGuest && policy.syntheticGuestContact),
    "GUEST_CONTACT_VERIFICATION_REQUIRED",
  );
  const cart = await tx.commerceCart.findUnique({
    where: { ownerKey: shopper.key },
    include: { items: { orderBy: { variantId: "asc" } } },
  });
  demand(cart?.items.length, "EMPTY_CART");
  const rate = await tx.shippingRate.findUnique({ where: { id: input.rateId } });
  demand(
    rate?.enabled &&
      rate.country === address.country &&
      rate.region === address.region &&
      destinationMatches(rate, address) &&
      rate.currency === policy.currency,
    "SHIPPING_RATE_REQUIRED",
  );
  const lines = [];
  let productTotal = BigInt(0),
    initial = BigInt(0);
  for (const item of cart.items) {
    const v = await tx.productVariant.findUnique({
      where: { id: item.variantId },
      include: {
        inventory: true,
        product: {
          include: {
            manufacturingPolicy: true,
            media: {
              select: { media: { select: { provider: true, originalKey: true, publicUrl: true } } },
              orderBy: { position: "asc" },
              take: 1,
            },
          },
        },
      },
    });
    demand(
      v?.active &&
        v.product.status === "PUBLISHED" &&
        v.product.detailsReviewedAt &&
        v.product.type &&
        v.product.availability === "AVAILABLE" &&
        v.availability === "AVAILABLE",
      "PRODUCT_UNAVAILABLE",
    );
    const price = v.priceMinor ?? v.product.priceMinor;
    demand(
      price !== null && price > 0 && v.product.currency === policy.currency,
      "PRICE_APPROVAL_REQUIRED",
    );
    const money = lineMoney(minor(price), item.quantity, policy);
    let upfront = money.gross;
    let manufacturingSnapshot = null;
    if (v.product.type === "READY_MADE")
      demand(
        v.inventory && v.inventory.quantity - v.inventory.reserved >= item.quantity,
        "OUT_OF_STOCK",
      );
    else {
      const manufacturing = v.product.manufacturingPolicy;
      demand(
        manufacturing?.available &&
          manufacturing.balanceCollection === "BEFORE_DISPATCH" &&
          !manufacturing.codBalanceEligible,
        "MANUFACTURING_TERMS_REQUIRED",
      );
      manufacturingSnapshot = {
        id: manufacturing.id,
        available: manufacturing.available,
        minProductionDays: manufacturing.minProductionDays,
        maxProductionDays: manufacturing.maxProductionDays,
        depositMode: manufacturing.depositMode,
        depositType: manufacturing.depositType,
        depositValue: manufacturing.depositValue,
        balanceCollection: manufacturing.balanceCollection,
        codBalanceEligible: manufacturing.codBalanceEligible,
        reviewedAt: manufacturing.updatedAt.toISOString(),
      };
      upfront = deposit(
        money.gross,
        manufacturing.depositMode,
        manufacturing.depositType,
        manufacturing.depositValue,
      );
    }
    lines.push({
      variantId: v.id,
      productId: v.product.id,
      titleAr: v.product.titleAr,
      titleEn: v.product.titleEn,
      variantAr: v.nameAr,
      variantEn: v.nameEn,
      imageUrl: v.product.media[0]
        ? getProductImageUrl({
            localPath:
              v.product.media[0].media.provider === "LEGACY_LOCAL"
                ? v.product.media[0].media.originalKey.replace(/^legacy:/, "")
                : "",
            publicUrl: v.product.media[0].media.publicUrl || undefined,
          })
        : null,
      type: v.product.type,
      quantity: item.quantity,
      unitMinor: String(price),
      ...jsonValue(money),
      initialMinor: String(upfront),
      manufacturing: manufacturingSnapshot,
    });
    productTotal += money.gross;
    initial += upfront;
  }
  demand(new Set(lines.map((l) => l.type)).size === 1, "SPLIT_CHECKOUT_REQUIRED");
  const cod = input.method === "COD";
  demand(["COD", "MOCK_CARD", "INSTAPAY", "WALLET"].includes(input.method), "METHOD_DISABLED");
  if (input.method === "MOCK_CARD") requireFeature("MOCK_PAYMENTS");
  if (manualEvidenceEnabled() && ["WALLET", "INSTAPAY"].includes(input.method)) {
    const instruction = policy.manualInstructions?.[input.method as "WALLET" | "INSTAPAY"];
    demand(instruction?.enabled, "MANUAL_METHOD_NOT_CONFIGURED");
  }
  if (cod)
    demand(
      lines.every((l) => l.type === "READY_MADE") &&
        rate.codEnabled &&
        rate.codFeeMinor !== null &&
        rate.codMaximumMinor !== null,
      "COD_NOT_ELIGIBLE",
    );
  const ship = lineMoney(rate.feeMinor + (cod ? rate.codFeeMinor! : BigInt(0)), 1, {
    ...policy,
    taxRateBps: policy.shippingTaxable ? policy.taxRateBps : 0,
  });
  const total = productTotal + ship.gross;
  demand(total <= BigInt("900000000000000"), "MONEY_LIMIT");
  if (cod) demand(total <= rate.codMaximumMinor!, "COD_LIMIT");
  initial = cod ? total : initial + ship.gross;
  const snapshot = jsonValue({
    policy,
    policyVersion: version,
    cartId: cart.id,
    cartVersion: cart.version,
    address,
    shipping: {
      id: rate.id,
      version: rate.version,
      carrier: rate.carrier,
      city: rate.city,
      area: rate.area,
      feeMinor: String(rate.feeMinor),
      codFeeMinor: cod ? String(rate.codFeeMinor) : "0",
      currency: rate.currency,
      leadDays: rate.leadDays,
      ...ship,
    },
    lines,
    totalMinor: String(total),
    initialMinor: String(initial),
    balanceMinor: String(total - initial),
    initialDue: cod ? "ON_DELIVERY" : "BEFORE_FULFILLMENT",
    method: input.method,
    currency: policy.currency,
    locale: input.locale,
  });
  return { cart, policy, snapshot, lines, total, initial, quoteHash: digest(snapshot) };
}
export async function quote(shopper: Shopper, input: CheckoutInput) {
  return transaction(async (tx) => {
    const q = await prepare(tx, shopper, input);
    return { snapshot: q.snapshot, quoteHash: q.quoteHash };
  });
}
export async function checkout(shopper: Shopper, input: CheckoutInput) {
  requireFeature("CHECKOUT");
  demand(
    input.requestKey && /^[a-zA-Z0-9_-]{8,64}$/.test(input.requestKey),
    "IDEMPOTENCY_KEY_REQUIRED",
    400,
  );
  demand(input.quoteHash, "QUOTE_REQUIRED", 400);
  const bodyHash = digest(input),
    requestKey = input.requestKey;
  return transaction(async (tx) => {
    const previous = await tx.commerceOrder.findUnique({
      where: { ownerKey_requestKey: { ownerKey: shopper.key, requestKey } },
      include: { items: true, payments: { orderBy: { createdAt: "asc" } } },
    });
    if (previous) {
      demand(previous.requestHash === bodyHash, "IDEMPOTENCY_CONFLICT");
      return previous;
    }
    const cart = await tx.commerceCart.findUnique({ where: { ownerKey: shopper.key } });
    demand(cart, "EMPTY_CART");
    await tx.$queryRaw`SELECT id FROM commerce_carts WHERE id=${cart.id} FOR UPDATE`;
    const committed = await tx.commerceOrder.findUnique({
      where: { ownerKey_requestKey: { ownerKey: shopper.key, requestKey } },
      include: { items: true, payments: { orderBy: { createdAt: "asc" } } },
    });
    if (committed) {
      demand(committed.requestHash === bodyHash, "IDEMPOTENCY_CONFLICT");
      return committed;
    }
    // Checkout locks products/variants as well as balances: a concurrent catalog edit cannot confirm a stale price.
    const items = await tx.commerceCartItem.findMany({
      where: { cartId: cart.id },
      orderBy: { variantId: "asc" },
    });
    const variants = await tx.productVariant.findMany({
      where: { id: { in: items.map((i) => i.variantId) } },
    });
    for (const id of [...new Set(variants.map((v) => v.productId))].sort())
      await tx.$queryRaw`SELECT id FROM products WHERE id=${id} FOR UPDATE`;
    for (const item of items) {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id=${item.variantId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM inventory_balances WHERE variantId=${item.variantId} FOR UPDATE`;
    }
    await tx.$queryRaw`SELECT id FROM commerce_policies WHERE id='local-synthetic' FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM shipping_rates WHERE id=${input.rateId} FOR UPDATE`;
    const q = await prepare(tx, shopper, input);
    demand(q.quoteHash === input.quoteHash, "QUOTE_CHANGED");
    const expiry = new Date(
      Date.now() +
        1000 *
          (input.method === "INSTAPAY" || input.method === "WALLET"
            ? q.policy.manualHoldSeconds
            : q.policy.holdSeconds),
    );
    const order = await tx.commerceOrder.create({
      data: {
        ownerKey: shopper.key,
        requestKey,
        requestHash: bodyHash,
        currency: q.policy.currency,
        totalMinor: q.total,
        initialMinor: q.initial,
        snapshot: q.snapshot,
        state: input.method === "COD" ? "CONFIRMED" : "AWAITING_PAYMENT",
        paymentMethod: input.method,
        locale: input.locale,
        expiresAt: expiry,
      },
    });
    for (const line of q.lines) {
      const item = await tx.commerceOrderItem.create({
        data: {
          orderId: order.id,
          variantId: line.variantId,
          quantity: line.quantity,
          type: line.type,
          snapshot: line,
        },
      });
      if (line.type === "READY_MADE") {
        await stock(tx, line.variantId, 0, line.quantity, "reserve:" + item.id);
        await tx.commerceReservation.create({
          data: {
            itemId: item.id,
            variantId: line.variantId,
            quantity: line.quantity,
            state: input.method === "COD" ? "COMMITTED" : "HELD",
            expiresAt: expiry,
          },
        });
      }
    }
    await tx.commerceCartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.commerceCart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
    await event(tx, order.id, shopper.key, "order.created", "checkout:" + order.id, {
      simulationOnly: true,
    });
    await notify(tx, order.id, "order.created", input.locale, "created:" + order.id);
    return tx.commerceOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, payments: { orderBy: { createdAt: "asc" } } },
    });
  });
}
export async function ownedOrder(shopper: Shopper, id: string) {
  assertCommerceEnvironment();
  const order = await getDatabase().commerceOrder.findFirst({
    where: { id, ownerKey: shopper.key },
    include: { items: true, payments: { orderBy: { createdAt: "asc" } } },
  });
  demand(order, "ORDER_NOT_FOUND", 404);
  return customerOrder(order);
}
export async function cancelOrder(shopper: Shopper, id: string) {
  return transaction(async (tx) => {
    const o = await lockOrder(tx, id);
    demand(o.ownerKey === shopper.key, "ORDER_NOT_FOUND", 404);
    if (o.state === "CANCELLED") return o;
    const { policy } = await getPolicy(tx);
    if (!(
      policy.allowUnpaidCancellation &&
      o.paidMinor === BigInt(0) &&
      ["AWAITING_PAYMENT", "CONFIRMED"].includes(o.state) &&
      o.items.every((i) => i.manufacturingState === "NOT_STARTED")
    )) {
      const prior = await tx.commerceCancellation.findUnique({ where: { orderId: id } });
      if (prior) return { reviewRequired: true, request: prior };
      const request = await tx.commerceCancellation.create({
        data: {
          orderId: id,
          requestedBy: shopper.key,
          reason: "Customer requested cancellation review; no automatic refund or forfeiture.",
        },
      });
      await event(tx, id, shopper.key, "cancellation.requested", "cancellation:" + request.id);
      return { reviewRequired: true, request };
    }
    await release(tx, o, "cancel");
    await event(tx, id, shopper.key, "order.cancelled", "cancel:" + id);
    await notify(tx, id, "order.cancelled", o.locale, "cancel:" + id);
    return tx.commerceOrder.update({
      where: { id },
      data: { state: "CANCELLED", version: { increment: 1 } },
    });
  });
}
export async function release(tx: Tx, o: Awaited<ReturnType<typeof lockOrder>>, reason: string) {
  for (const item of [...o.items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    const r = item.reservation;
    if (r && ["HELD", "COMMITTED"].includes(r.state)) {
      await stock(tx, r.variantId, 0, -r.quantity, reason + ":" + r.id);
      await tx.commerceReservation.update({ where: { id: r.id }, data: { state: "RELEASED" } });
    }
  }
}
export async function expireOrders() {
  assertCommerceEnvironment();
  const ids = await getDatabase().commerceOrder.findMany({
    where: { state: "AWAITING_PAYMENT", expiresAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  let count = 0;
  for (const { id } of ids)
    await transaction(async (tx) => {
      const o = await lockOrder(tx, id);
      if (o.state !== "AWAITING_PAYMENT" || o.paidMinor > BigInt(0) || o.expiresAt > new Date())
        return;
      await release(tx, o, "expire");
      await tx.commerceOrder.update({
        where: { id },
        data: { state: "EXPIRED", version: { increment: 1 } },
      });
      await event(tx, id, "system:expiry", "order.expired", "expire:" + id);
      count++;
    });
  return count;
}
export async function saveAddress(shopper: Shopper, value: unknown, id?: string) {
  assertCommerceEnvironment();
  demand(shopper.userId, "LOGIN_REQUIRED", 401);
  const address = addressSchema.parse(value);
  if (id) {
    const changed = await getDatabase().customerAddress.updateMany({
      where: { id, userId: shopper.userId },
      data: address,
    });
    demand(changed.count, "NOT_FOUND", 404);
    return { id };
  }
  return getDatabase().customerAddress.create({ data: { ...address, userId: shopper.userId } });
}
export async function getAddresses(shopper: Shopper) {
  assertCommerceEnvironment();
  demand(shopper.userId, "LOGIN_REQUIRED", 401);
  const rows = await getDatabase().customerAddress.findMany({
    where: { userId: shopper.userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    ...row,
    postalCode: row.postalCode || undefined,
    area: row.area || undefined,
    deliveryInstructions: row.deliveryInstructions || undefined,
  }));
}
export async function deleteAddress(shopper: Shopper, id: string) {
  assertCommerceEnvironment();
  demand(shopper.userId, "LOGIN_REQUIRED", 401);
  return getDatabase().customerAddress.deleteMany({ where: { id, userId: shopper.userId } });
}
export async function listOrders(shopper: Shopper) {
  assertCommerceEnvironment();
  return getDatabase().commerceOrder.findMany({
    where: { ownerKey: shopper.key },
    select: {
      id: true,
      state: true,
      totalMinor: true,
      paidMinor: true,
      currency: true,
      createdAt: true,
      locale: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
export { CommerceError, randomUUID };
