import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { getDatabase } from "../database";
import {
  fixturePolicy,
  fixtureProduct,
  fixtureRate,
  syntheticPolicy,
} from "@/lib/commerce/fixtures";
import {
  checkout,
  quote,
  updateCart,
  getCart,
  ownedOrder,
  cancelOrder,
  expireOrders,
  saveAddress,
  getAddresses,
  deleteAddress,
  mergeCart,
  type Shopper,
  type CheckoutInput,
} from "./store";
import { beginPayment, payMock, mockProviderFact, receiveMockEvent } from "./payments";
import { requestFinance, financeTransition, fulfill, reviewCancellation } from "./admin";
import { drainNotifications } from "./notifications";
import { getCustomerAuth } from "./customer-auth";
import { exchangeRecovery, recoveryOrder } from "./identity";
import { digest } from "./store";
import { POST as apiPost, GET as apiGet } from "@/app/api/commerce/route";
import { POST as adminPost } from "@/app/api/admin/commerce/route";
const enabled = process.env.PHASE3_DB_INTEGRATION === "1";
let db: ReturnType<typeof getDatabase>;
const suffix = randomUUID();
let rate: Awaited<ReturnType<typeof fixtureRate>>,
  ready: Awaited<ReturnType<typeof fixtureProduct>>,
  made: Awaited<ReturnType<typeof fixtureProduct>>;
const address = {
  label: "Synthetic",
  recipient: "Synthetic Recipient",
  phone: "01000000000",
  country: "EG",
  region: "TEST-CAIRO",
  city: "Synthetic City",
  line1: "Synthetic test address",
};
const guest = (): Shopper => ({ key: "guest:" + randomUUID() });
const key = () => randomUUID();
async function place(
  s = guest(),
  variant = ready.variantId,
  method: CheckoutInput["method"] = "MOCK_CARD",
  quantity = 1,
) {
  await updateCart(s, variant, quantity);
  const input = { address, rateId: rate.id, method, locale: "ar" as const };
  const q = await quote(s, input);
  return {
    s,
    input: { ...input, quoteHash: q.quoteHash, requestKey: key() },
    order: await checkout(s, { ...input, quoteHash: q.quoteHash, requestKey: key() }),
  };
}
const admins: { id: string; roleCode: string }[] = [];
let customerCookie = "",
  customerId = "";
const customerEmail = "customer-" + suffix + "@phase3.invalid",
  password = "Synthetic-Pass-" + suffix;
const authRequest = (endpoint: string, body?: unknown, cookie = "") =>
  getCustomerAuth().handler(
    new Request(process.env.CUSTOMER_AUTH_URL + "/api/customer-auth/" + endpoint, {
      method: body ? "POST" : "GET",
      headers: {
        origin: process.env.CUSTOMER_AUTH_URL!,
        "content-type": "application/json",
        cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
describe.skipIf(!enabled)("Phase 3 isolated real MariaDB integration", () => {
  beforeAll(async () => {
    db = getDatabase();
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe(
      process.env.P35_WORKSTREAM === "1"
        ? "/sprtaya_phase35_disposable_test"
        : "/sprtaya_phase3_disposable_test",
    );
    await db.customerRateLimit.deleteMany();
    await fixturePolicy(db);
    rate = await fixtureRate(db);
    ready = await fixtureProduct(db, suffix, "READY_MADE", 200);
    made = await fixtureProduct(db, suffix + "-made", "MADE_TO_ORDER");
    for (const [i, roleCode] of [
      "OWNER",
      "MANAGER",
      "MANAGER",
      "MANAGER",
      "CATALOG_EDITOR",
    ].entries()) {
      const a = await db.adminUser.create({
        data: {
          name: "Synthetic Finance " + i,
          email: `finance-${i}-${suffix}@phase3.invalid`,
          roleCode,
          forcePasswordChange: false,
        },
      });
      admins.push(a);
      if (i < 3)
        for (const operation of [
          "PAYMENT_VERIFY",
          "REFUND_REQUEST",
          "REFUND_APPROVE",
          "REFUND_EXECUTE",
          "RECONCILE",
        ])
          await db.commerceFinanceGrant.create({
            data: {
              adminId: a.id,
              operation,
              currency: "EGP",
              limitMinor: BigInt(1000000),
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
    }
  }, 30000);
  afterAll(async () => {
    await db.$disconnect();
  });
  it("registers customer separately, blocks unverified login and captures verification privately", async () => {
    const r = await authRequest("sign-up/email", {
      name: "Synthetic Customer",
      email: customerEmail,
      password,
    });
    expect(r.status).toBe(200);
    customerId = (await db.customerUser.findUniqueOrThrow({ where: { email: customerEmail } })).id;
    expect(await db.adminUser.findUnique({ where: { email: customerEmail } })).toBeNull();
    expect((await authRequest("sign-in/email", { email: customerEmail, password })).status).toBe(
      403,
    );
    const dir = path.join(process.env.P3_STATE_DIR!, "notification-capture");
    let url = "";
    for (const f of await readdir(dir)) {
      const c = JSON.parse(await readFile(path.join(dir, f), "utf8"));
      if (c.kind === "verify-email" && c.recipient === customerEmail) url = c.payload.url;
    }
    expect(url).toContain("verify-email");
    const verified = await getCustomerAuth().handler(
      new Request(url, { headers: { origin: process.env.CUSTOMER_AUTH_URL! } }),
    );
    expect([200, 302]).toContain(verified.status);
    const signed = await authRequest("sign-in/email", { email: customerEmail, password });
    expect(signed.status).toBe(200);
    customerCookie = signed.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join("; ");
    expect(customerCookie).toContain("sprtaya-customer");
    expect(
      (await getCustomerAuth().api.getSession({ headers: new Headers({ cookie: customerCookie }) }))
        ?.user.id,
    ).toBe(customerId);
  });
  it("persists profiles and addresses with ownership checks", async () => {
    const s = { key: "customer:" + customerId, userId: customerId };
    const a = await saveAddress(s, address);
    expect((await getAddresses(s)).some((x) => x.id === a.id)).toBe(true);
    await expect(
      saveAddress({ key: "customer:other", userId: "other" }, address, a.id),
    ).rejects.toThrow("NOT_FOUND");
    await deleteAddress({ key: "customer:other", userId: "other" }, a.id);
    expect(await db.customerAddress.findUnique({ where: { id: a.id } })).not.toBeNull();
    await deleteAddress(s, a.id);
    expect(await db.customerAddress.findUnique({ where: { id: a.id } })).toBeNull();
  });
  it("rejects customer cookies at administrative endpoints and rejects cross-origin mutation", async () => {
    const origin = process.env.CUSTOMER_AUTH_URL!;
    const r = await adminPost(
      new Request(origin + "/api/admin/commerce", {
        method: "POST",
        headers: { origin, cookie: customerCookie, "content-type": "application/json" },
        body: JSON.stringify({ action: "jobs" }),
      }),
    );
    expect(r.status).toBe(403);
    expect(
      (
        await apiPost(
          new Request(origin + "/api/commerce", {
            method: "POST",
            headers: { origin: "https://evil.invalid" },
            body: JSON.stringify({ action: "cart", variantId: ready.variantId, quantity: 1 }),
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("persists cart changes and performs retry-safe guest merge", async () => {
    const g = guest(),
      c = { key: "customer:" + customerId, userId: customerId };
    await updateCart(g, ready.variantId, 2);
    await mergeCart(g, c);
    await mergeCart(g, c);
    expect((await getCart(c))?.items[0].quantity).toBe(2);
    expect((await getCart(g))?.items).toHaveLength(0);
    await updateCart(c, ready.variantId, 0);
    expect((await getCart(c))?.items).toHaveLength(0);
  });
  it("requires configured tax and shipping; does not silently use zero", async () => {
    const s = guest();
    await updateCart(s, ready.variantId, 1);
    await db.commercePolicy.update({
      where: { id: "local-synthetic" },
      data: { configuration: { currency: "EGP" } },
    });
    await expect(
      quote(s, { address, rateId: rate.id, method: "MOCK_CARD", locale: "en" }),
    ).rejects.toThrow("POLICY_REQUIRED");
    await fixturePolicy(db);
    await expect(
      quote(s, {
        address: { ...address, region: "UNKNOWN" },
        rateId: rate.id,
        method: "MOCK_CARD",
        locale: "en",
      }),
    ).rejects.toThrow("SHIPPING_RATE_REQUIRED");
  });
  it("rejects international, mixed schedules, and manufacturing COD", async () => {
    const s = guest();
    await updateCart(s, ready.variantId, 1);
    await expect(
      quote(s, {
        address: { ...address, country: "US" },
        rateId: rate.id,
        method: "MOCK_CARD",
        locale: "en",
      }),
    ).rejects.toThrow("INTERNATIONAL_CHECKOUT_DISABLED");
    await updateCart(s, made.variantId, 1);
    await expect(
      quote(s, { address, rateId: rate.id, method: "MOCK_CARD", locale: "en" }),
    ).rejects.toThrow("SPLIT_CHECKOUT_REQUIRED");
    await updateCart(s, ready.variantId, 0);
    await expect(
      quote(s, { address, rateId: rate.id, method: "COD", locale: "en" }),
    ).rejects.toThrow("COD_NOT_ELIGIBLE");
  });
  it("rejects stale quotes and snapshots tax/shipping/rounding atomically", async () => {
    const s = guest();
    await updateCart(s, ready.variantId, 1);
    const input = { address, rateId: rate.id, method: "MOCK_CARD" as const, locale: "en" as const };
    const q = await quote(s, input);
    await updateCart(s, ready.variantId, 2);
    await expect(
      checkout(s, { ...input, quoteHash: q.quoteHash, requestKey: key() }),
    ).rejects.toThrow("QUOTE_CHANGED");
    const fresh = await quote(s, input);
    const o = await checkout(s, { ...input, quoteHash: fresh.quoteHash, requestKey: key() });
    expect(o.totalMinor).toBe(BigInt(25302));
    expect((o.snapshot as { policy: unknown }).policy).toEqual(syntheticPolicy);
  });
  it("makes checkout idempotent and rejects conflicting key payloads", async () => {
    const s = guest();
    await updateCart(s, ready.variantId, 1);
    const v = { address, rateId: rate.id, method: "MOCK_CARD" as const, locale: "ar" as const };
    const q = await quote(s, v),
      input = { ...v, quoteHash: q.quoteHash, requestKey: key() };
    const [a, b] = await Promise.all([checkout(s, input), checkout(s, input)]);
    expect(a.id).toBe(b.id);
    expect(await db.commerceOrder.count({ where: { ownerKey: s.key } })).toBe(1);
    await expect(checkout(s, { ...input, locale: "en" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("prevents overselling across simultaneous independent checkouts", async () => {
    const p = await fixtureProduct(db, key(), "READY_MADE", 1);
    const s1 = guest(),
      s2 = guest();
    await updateCart(s1, p.variantId, 1);
    await updateCart(s2, p.variantId, 1);
    const v = { address, rateId: rate.id, method: "MOCK_CARD" as const, locale: "ar" as const };
    const [a, b] = await Promise.all([quote(s1, v), quote(s2, v)]);
    const results = await Promise.allSettled([
      checkout(s1, { ...v, quoteHash: a.quoteHash, requestKey: key() }),
      checkout(s2, { ...v, quoteHash: b.quoteHash, requestKey: key() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const balance = await db.inventoryBalance.findUniqueOrThrow({
      where: { variantId: p.variantId },
    });
    expect(balance).toMatchObject({ quantity: 1, reserved: 1 });
  });
  it("enforces reservation constraints even through direct SQL", async () => {
    await expect(
      db.$executeRaw`UPDATE inventory_balances SET reserved=quantity+1 WHERE variantId=${ready.variantId}`,
    ).rejects.toThrow();
  });
  it("releases cancellation holds once and denies a different guest", async () => {
    const { s, order } = await place();
    const before = await db.inventoryBalance.findUniqueOrThrow({
      where: { variantId: ready.variantId },
    });
    await expect(ownedOrder(guest(), order.id)).rejects.toThrow("ORDER_NOT_FOUND");
    await expect(cancelOrder(guest(), order.id)).rejects.toThrow("ORDER_NOT_FOUND");
    await cancelOrder(s, order.id);
    await cancelOrder(s, order.id);
    const after = await db.inventoryBalance.findUniqueOrThrow({
      where: { variantId: ready.variantId },
    });
    expect(after.reserved).toBe(before.reserved - 1);
  });
  it("expires reservations and refuses late success without reclaiming stock", async () => {
    const { s, order } = await place();
    const p = await beginPayment(s, order.id, key());
    await db.commerceOrder.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expireOrders();
    const signed = mockProviderFact(p);
    await receiveMockEvent(signed.body, signed.signature);
    expect((await db.commercePayment.findUniqueOrThrow({ where: { id: p.id } })).state).toBe(
      "REVIEW_REQUIRED",
    );
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      BigInt(0),
    );
  });
  it("verifies signed mock events once; rejects tampering and wrong amount", async () => {
    const { s, order } = await place();
    const p = await beginPayment(s, order.id, key());
    const signed = mockProviderFact(p);
    await expect(receiveMockEvent(signed.body, "0".repeat(64))).rejects.toThrow(
      "INVALID_SIGNATURE",
    );
    const [a, b] = await Promise.all([
      receiveMockEvent(signed.body, signed.signature),
      receiveMockEvent(signed.body, signed.signature),
    ]);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    const different = mockProviderFact({ ...p, amountMinor: p.amountMinor + BigInt(1) });
    await expect(receiveMockEvent(different.body, different.signature)).rejects.toThrow(
      "PAYMENT_FACT_MISMATCH",
    );
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      order.totalMinor,
    );
  });
  it("tracks unknown/failure safely and permits a deliberate retry after failure", async () => {
    const { s, order } = await place();
    const p = await beginPayment(s, order.id, key());
    const unknown = mockProviderFact(p, "UNKNOWN");
    await receiveMockEvent(unknown.body, unknown.signature);
    await expect(beginPayment(s, order.id, key())).rejects.toThrow(
      "PAYMENT_ALREADY_PENDING_OR_SATISFIED",
    );
    const failed = mockProviderFact(p, "FAILED");
    await receiveMockEvent(failed.body, failed.signature);
    const paid = await payMock(s, order.id, key(), "INITIAL");
    expect(paid.state).toBe("SUCCEEDED");
  });
  it("rounds a new 50% deposit, keeps balance separate, and blocks premature production/dispatch", async () => {
    const { s, order } = await place(guest(), made.variantId);
    expect(order.totalMinor).toBe(BigInt(13901));
    expect(order.initialMinor).toBe(BigInt(8201));
    await expect(fulfill(admins[0].id, order.id, "start")).rejects.toThrow(
      "PRODUCTION_PAYMENT_REQUIRED",
    );
    await payMock(s, order.id, key(), "INITIAL");
    await fulfill(admins[0].id, order.id, "start");
    await fulfill(admins[0].id, order.id, "ready");
    await expect(fulfill(admins[0].id, order.id, "dispatch", "TEST-REF")).rejects.toThrow(
      "BALANCE_REQUIRED",
    );
    await payMock(s, order.id, key(), "BALANCE");
    await fulfill(admins[0].id, order.id, "dispatch", "TEST-REF");
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).state).toBe(
      "SHIPPED",
    );
  });
  it("never converts an existing FULL_ADVANCE policy", async () => {
    const p = await fixtureProduct(db, key(), "MADE_TO_ORDER");
    await db.manufacturingPolicy.update({
      where: { productId: p.id },
      data: { depositMode: "FULL_ADVANCE", depositType: "FIXED_MINOR", depositValue: 0 },
    });
    const { order } = await place(guest(), p.variantId);
    expect(order.initialMinor).toBe(order.totalMinor);
    expect(
      (await db.manufacturingPolicy.findUniqueOrThrow({ where: { productId: p.id } })).depositMode,
    ).toBe("FULL_ADVANCE");
  });
  it("manual transfer claims require separate granted request, approval, execution and reconciliation", async () => {
    const { s, order } = await place(guest(), ready.variantId, "INSTAPAY");
    const p = await beginPayment(s, order.id, key(), "INITIAL", "SYNTHETIC-" + key());
    expect(p.state).toBe("CLAIMED");
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      BigInt(0),
    );
    const r = await requestFinance(admins[0].id, {
      orderId: order.id,
      kind: "VERIFY_TRANSFER",
      amount: String(p.amountMinor),
      paymentId: p.id,
      key: key(),
      reason: "Synthetic verified statement match",
    });
    await expect(financeTransition(admins[0].id, r.id, "approve")).rejects.toThrow(
      "SELF_APPROVAL_OR_STATE_INVALID",
    );
    await financeTransition(admins[1].id, r.id, "approve");
    await financeTransition(admins[1].id, r.id, "execute");
    await expect(financeTransition(admins[1].id, r.id, "reconcile")).rejects.toThrow(
      "SEPARATE_RECONCILER_REQUIRED",
    );
    await financeTransition(admins[2].id, r.id, "reconcile");
    await financeTransition(admins[2].id, r.id, "reconcile");
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      order.totalMinor,
    );
  });
  it("denies ungranted managers, editors, banned staff, and limits", async () => {
    const { s, order } = await place();
    await payMock(s, order.id, key(), "INITIAL");
    const input = {
      orderId: order.id,
      kind: "REFUND" as const,
      amount: "100",
      key: key(),
      reason: "Synthetic refund request",
    };
    await expect(requestFinance(admins[3].id, input)).rejects.toThrow(
      "FINANCIAL_PERMISSION_REQUIRED",
    );
    await expect(requestFinance(admins[4].id, input)).rejects.toThrow("FORBIDDEN");
    await db.adminUser.update({ where: { id: admins[3].id }, data: { banned: true } });
    await expect(fulfill(admins[3].id, order.id, "ready")).rejects.toThrow("FORBIDDEN");
    await db.commerceFinanceGrant.update({
      where: {
        adminId_operation_currency: {
          adminId: admins[0].id,
          operation: "REFUND_REQUEST",
          currency: "EGP",
        },
      },
      data: { limitMinor: BigInt(50) },
    });
    await expect(requestFinance(admins[0].id, input)).rejects.toThrow(
      "FINANCIAL_PERMISSION_REQUIRED",
    );
    await db.commerceFinanceGrant.update({
      where: {
        adminId_operation_currency: {
          adminId: admins[0].id,
          operation: "REFUND_REQUEST",
          currency: "EGP",
        },
      },
      data: { limitMinor: BigInt(1000000) },
    });
    const grantWhere = {
      adminId_operation_currency: {
        adminId: admins[0].id,
        operation: "REFUND_REQUEST",
        currency: "EGP",
      },
    };
    await db.commerceFinanceGrant.update({
      where: grantWhere,
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(requestFinance(admins[0].id, input)).rejects.toThrow(
      "FINANCIAL_PERMISSION_REQUIRED",
    );
    await db.commerceFinanceGrant.update({
      where: grantWhere,
      data: { expiresAt: new Date(Date.now() + 86400000), revoked: true },
    });
    await expect(requestFinance(admins[0].id, input)).rejects.toThrow(
      "FINANCIAL_PERMISSION_REQUIRED",
    );
    await db.commerceFinanceGrant.update({ where: grantWhere, data: { revoked: false } });
  });
  it("reserves refund capacity across concurrent requests and reconciles exactly once", async () => {
    const { s, order } = await place();
    await payMock(s, order.id, key(), "INITIAL");
    const input = {
      orderId: order.id,
      kind: "REFUND" as const,
      amount: String(order.totalMinor),
      key: key(),
      reason: "Synthetic full refund review",
    };
    const result = await Promise.allSettled([
      requestFinance(admins[0].id, input),
      requestFinance(admins[0].id, { ...input, key: key() }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const r = await db.commerceFinanceRequest.findFirstOrThrow({ where: { orderId: order.id } });
    await financeTransition(admins[1].id, r.id, "approve");
    await financeTransition(admins[1].id, r.id, "execute");
    await Promise.all([
      financeTransition(admins[2].id, r.id, "reconcile"),
      financeTransition(admins[2].id, r.id, "reconcile"),
    ]);
    const o = await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.refundedMinor).toBe(order.totalMinor);
    expect(o.creditedMinor).toBe(order.totalMinor);
    await expect(fulfill(admins[0].id, order.id, "ready")).rejects.toThrow(
      "REFUNDED_ORDER_REVIEW_REQUIRED",
    );
  });
  it("COD records collection separately from remittance; dispatch consumes stock once", async () => {
    const { order } = await place(guest(), ready.variantId, "COD");
    expect(order.paidMinor).toBe(BigInt(0));
    await fulfill(admins[0].id, order.id, "ready");
    const before = await db.inventoryBalance.findUniqueOrThrow({
      where: { variantId: ready.variantId },
    });
    await fulfill(admins[0].id, order.id, "dispatch", "TEST-COD");
    await fulfill(admins[0].id, order.id, "dispatch", "TEST-COD");
    expect(
      (await db.inventoryBalance.findUniqueOrThrow({ where: { variantId: ready.variantId } }))
        .quantity,
    ).toBe(before.quantity - 1);
    await fulfill(admins[0].id, order.id, "delivered");
    await fulfill(admins[0].id, order.id, "cod_collected");
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      BigInt(0),
    );
    await expect(fulfill(admins[0].id, order.id, "cod_reconciled")).rejects.toThrow(
      "SEPARATE_RECONCILER_REQUIRED",
    );
    await fulfill(admins[2].id, order.id, "cod_reconciled");
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      order.totalMinor,
    );
  });
  it("failed COD delivery requires inspected return before restoring stock exactly once", async () => {
    const { order } = await place(guest(), ready.variantId, "COD");
    await fulfill(admins[0].id, order.id, "ready");
    await fulfill(admins[0].id, order.id, "dispatch", "TEST-RETURN");
    await fulfill(admins[0].id, order.id, "failed");
    const before = await db.inventoryBalance.findUniqueOrThrow({
      where: { variantId: ready.variantId },
    });
    await fulfill(admins[0].id, order.id, "returned");
    await fulfill(admins[0].id, order.id, "returned");
    expect(
      (await db.inventoryBalance.findUniqueOrThrow({ where: { variantId: ready.variantId } }))
        .quantity,
    ).toBe(before.quantity + 1);
  });
  it("captures bilingual outbox records without external delivery or duplicate files", async () => {
    await place();
    const count = await drainNotifications();
    expect(count).toBeGreaterThan(0);
    while ((await drainNotifications()) > 0) {
      /* drain bounded batches */
    }
    expect(await drainNotifications()).toBe(0);
    expect(await db.commerceNotification.count({ where: { state: "CAPTURED" } })).toBeGreaterThan(
      0,
    );
  });
  it("binds recovery sessions to one order and consumes tokens only once", async () => {
    const { order } = await place();
    const { order: other } = await place();
    const token = digest(key());
    await db.commerceRecovery.create({
      data: {
        tokenHash: digest(token),
        orderId: order.id,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const cookie = await exchangeRecovery(token);
    await expect(exchangeRecovery(token)).rejects.toThrow("RECOVERY_INVALID");
    expect(await recoveryOrder(new Headers({ cookie }), other.id)).toBeNull();
    expect(await recoveryOrder(new Headers({ cookie }), order.id)).toEqual({ key: order.ownerKey });
  });
  it("customer session logout invalidates the persisted session", async () => {
    const result = await authRequest("sign-out", {}, customerCookie);
    expect(result.status).toBe(200);
    expect(
      await getCustomerAuth().api.getSession({ headers: new Headers({ cookie: customerCookie }) }),
    ).toBeNull();
  });
  it("anonymous order IDs do not disclose private order data", async () => {
    const { order } = await place();
    const r = await apiGet(
      new Request(process.env.CUSTOMER_AUTH_URL + "/api/commerce?resource=order&id=" + order.id),
    );
    expect(r.status).toBe(401);
    expect(await r.text()).not.toContain(address.line1);
  });
  it("persists paid cancellation review without automatic refunds or forfeiture", async () => {
    const { s, order } = await place();
    await payMock(s, order.id, key(), "INITIAL");
    const result = await cancelOrder(s, order.id);
    expect(result).toMatchObject({ reviewRequired: true });
    const request = await db.commerceCancellation.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    await cancelOrder(s, order.id);
    expect(await db.commerceCancellation.count({ where: { orderId: order.id } })).toBe(1);
    await reviewCancellation(admins[1].id, request.id, true);
    const updated = await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.state).toBe("CANCELLED");
    expect(updated.refundedMinor).toBe(BigInt(0));
    expect(updated.paidMinor).toBe(order.totalMinor);
  });
  it("feature flags stop checkout and payment initiation before writes", async () => {
    const { s, order } = await place();
    vi.stubEnv("P3_MOCK_PAYMENTS", "0");
    try {
      await expect(beginPayment(s, order.id, key())).rejects.toThrow("MOCK_PAYMENTS_DISABLED");
      expect(await db.commercePayment.count({ where: { orderId: order.id } })).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
    vi.stubEnv("P3_CHECKOUT", "0");
    try {
      await expect(
        checkout(guest(), {
          address,
          rateId: rate.id,
          method: "MOCK_CARD",
          locale: "ar",
          requestKey: key(),
          quoteHash: "0".repeat(64),
        }),
      ).rejects.toThrow("CHECKOUT_DISABLED");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("customer recovery captures a private token, rotates the password, rejects replay and revokes sessions", async () => {
    await db.customerRateLimit.deleteMany();
    const before = await authRequest("sign-in/email", { email: customerEmail, password });
    expect(before.status).toBe(200);
    const oldCookie = before.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(
      (
        await authRequest("request-password-reset", {
          email: customerEmail,
          redirectTo: process.env.CUSTOMER_AUTH_URL + "/en/account",
        })
      ).status,
    ).toBe(200);
    let url = "";
    const directory = path.join(process.env.P3_STATE_DIR!, "notification-capture");
    for (const f of await readdir(directory)) {
      const c = JSON.parse(await readFile(path.join(directory, f), "utf8"));
      if (c.kind === "password-reset" && c.recipient === customerEmail) url = c.payload.url;
    }
    expect(url).toContain("reset-password");
    const token = new URL(url).pathname.split("/").at(-1),
      next = "Rotated-" + key();
    expect((await authRequest("reset-password", { token, newPassword: next })).status).toBe(200);
    expect(
      await getCustomerAuth().api.getSession({ headers: new Headers({ cookie: oldCookie }) }),
    ).toBeNull();
    expect((await authRequest("reset-password", { token, newPassword: next })).status).toBe(400);
    expect((await authRequest("sign-in/email", { email: customerEmail, password })).status).toBe(
      401,
    );
    expect(
      (await authRequest("sign-in/email", { email: customerEmail, password: next })).status,
    ).toBe(200);
  });
  it("persists customer login throttling and rejects brute-force retries", async () => {
    await db.customerRateLimit.deleteMany();
    const statuses = [];
    for (let i = 0; i < 7; i++)
      statuses.push(
        (
          await authRequest("sign-in/email", {
            email: "unknown-" + suffix + "@phase3.invalid",
            password: "Invalid-synthetic-password",
          })
        ).status,
      );
    expect(statuses).toContain(401);
    expect(statuses.at(-1)).toBe(429);
    expect(await db.customerRateLimit.count()).toBeGreaterThan(0);
  });

  it("rejects client monetary/status/owner injection before creating a cart", async () => {
    const response = await apiPost(
      new Request(process.env.CUSTOMER_AUTH_URL + "/api/commerce", {
        method: "POST",
        headers: { origin: process.env.CUSTOMER_AUTH_URL!, "content-type": "application/json" },
        body: JSON.stringify({
          action: "cart",
          variantId: ready.variantId,
          quantity: 1,
          paidMinor: "999999",
          state: "PAID",
          ownerKey: "customer:other",
        }),
      }),
    );
    expect(response.status).toBe(400);
  });
  it("a distinct success event cannot double-credit a successful payment", async () => {
    const { s, order } = await place();
    const p = await beginPayment(s, order.id, key());
    for (let i = 0; i < 2; i++) {
      const signed = mockProviderFact(p);
      await receiveMockEvent(signed.body, signed.signature);
    }
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      order.totalMinor,
    );
    expect(
      await db.commerceEvent.count({ where: { orderId: order.id, kind: "payment.verified" } }),
    ).toBe(1);
  });
});
