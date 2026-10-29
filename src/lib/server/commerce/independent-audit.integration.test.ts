import { randomUUID, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { getDatabase } from "../database";
import { fixturePolicy, fixtureProduct, fixtureRate } from "@/lib/commerce/fixtures";
import { updateCart, quote, checkout, ownedOrder, expireOrders, getCart, transaction, type Tx } from "./store";
import { beginPayment, mockProviderFact, receiveMockEvent, payMock } from "./payments";
import { requestFinance, financeTransition } from "./admin";
import { POST as customerPost } from "@/app/api/commerce/route";
let db: ReturnType<typeof getDatabase>;
const key = () => randomUUID(),
  guest = () => ({ key: "guest:" + key() });
const address = {
  label: "Audit",
  recipient: "Synthetic audit",
  phone: "01000000000",
  country: "EG",
  region: "AUDIT-REGION",
  city: "Audit city",
  line1: "Synthetic audit address",
};
let rate: Awaited<ReturnType<typeof fixtureRate>>,
  product: Awaited<ReturnType<typeof fixtureProduct>>,
  made: Awaited<ReturnType<typeof fixtureProduct>>;
const admins: string[] = [];
async function place(
  variant = product.variantId,
  method: "MOCK_CARD" | "INSTAPAY" | "COD" = "MOCK_CARD",
  s = guest(),
) {
  await updateCart(s, variant, 1);
  const input = { address, rateId: rate.id, method, locale: "en" as const };
  const q = await quote(s, input);
  return {
    s,
    input: { ...input, quoteHash: q.quoteHash, requestKey: key() },
    order: await checkout(s, { ...input, quoteHash: q.quoteHash, requestKey: key() }),
  };
}
describe.skipIf(process.env.PHASE3_DB_INTEGRATION !== "1")(
  "Independent adversarial Phase 3 acceptance",
  () => {
    beforeAll(async () => {
      db = getDatabase();
      expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/sprtaya_phase3_disposable_test");
      await fixturePolicy(db);
      rate = await fixtureRate(db, address.region);
      product = await fixtureProduct(db, "audit-" + key(), "READY_MADE", 100);
      made = await fixtureProduct(db, "audit-made-" + key(), "MADE_TO_ORDER");
      for (let i = 0; i < 3; i++) {
        const a = await db.adminUser.create({
          data: {
            name: "Audit synthetic manager",
            email: key() + "@audit.invalid",
            roleCode: i === 0 ? "OWNER" : "MANAGER",
            forcePasswordChange: false,
          },
        });
        admins.push(a.id);
        for (const op of [
          "PAYMENT_VERIFY",
          "REFUND_REQUEST",
          "REFUND_APPROVE",
          "REFUND_EXECUTE",
          "RECONCILE",
        ])
          await db.commerceFinanceGrant.create({
            data: {
              adminId: a.id,
              operation: op,
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
    it("records a failed-attempt late success for review while a replacement is pending", async () => {
      const { s, order } = await place();
      const first = await beginPayment(s, order.id, key());
      const failed = mockProviderFact(first, "FAILED");
      await receiveMockEvent(failed.body, failed.signature);
      await beginPayment(s, order.id, key());
      const late = mockProviderFact(first);
      await expect(receiveMockEvent(late.body, late.signature)).resolves.toMatchObject({
        state: "REVIEW_REQUIRED",
      });
      expect(
        (await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor,
      ).toBe(BigInt(0));
      expect(await db.commercePaymentEvent.count({ where: { paymentId: first.id } })).toBe(2);
    });
    it("requires a RECONCILE grant even for a manager allowed to verify transfer proof", async () => {
      const { s, order } = await place(product.variantId, "INSTAPAY");
      const p = await beginPayment(s, order.id, key(), "INITIAL", "AUDIT-" + key());
      const r = await requestFinance(admins[0], {
        orderId: order.id,
        paymentId: p.id,
        kind: "VERIFY_TRANSFER",
        amount: String(p.amountMinor),
        key: key(),
        reason: "Synthetic statement verification",
      });
      await financeTransition(admins[1], r.id, "approve");
      await financeTransition(admins[1], r.id, "execute");
      await db.commerceFinanceGrant.update({
        where: {
          adminId_operation_currency: {
            adminId: admins[2],
            operation: "RECONCILE",
            currency: "EGP",
          },
        },
        data: { revoked: true },
      });
      await expect(financeTransition(admins[2], r.id, "reconcile")).rejects.toThrow(
        "FINANCIAL_PERMISSION_REQUIRED",
      );
      expect(
        (await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor,
      ).toBe(BigInt(0));
      await db.commerceFinanceGrant.update({
        where: {
          adminId_operation_currency: {
            adminId: admins[2],
            operation: "RECONCILE",
            currency: "EGP",
          },
        },
        data: { revoked: false },
      });
    });
    it("does not expose internal financial audit notes, staff identities or request digests to customers", async () => {
      const { s, order } = await place();
      await payMock(s, order.id, key(), "INITIAL");
      await requestFinance(admins[0], {
        orderId: order.id,
        kind: "REFUND",
        amount: "1",
        key: key(),
        reason: "PRIVATE-OPERATIONS-AUDIT-NOTE",
      });
      const data = JSON.stringify(await ownedOrder(s, order.id), (_, v) =>
        typeof v === "bigint" ? String(v) : v,
      );
      expect(data).not.toContain("PRIVATE-OPERATIONS-AUDIT-NOTE");
      expect(data).not.toContain(admins[0]);
      expect(data).not.toContain("requestHash");
      expect(data).not.toContain("ownerKey");
    });
    it("uses the same 404 for nonexistent and foreign order mutations", async () => {
      const token = randomBytes(32).toString("hex");
      const request = (id: string) =>
        new Request(process.env.CUSTOMER_AUTH_URL + "/api/commerce", {
          method: "POST",
          headers: {
            origin: process.env.CUSTOMER_AUTH_URL!,
            cookie: "sprtaya-guest=" + token,
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "cancel", id }),
        });
      const { order } = await place();
      expect((await customerPost(request(order.id))).status).toBe(404);
      expect((await customerPost(request(key()))).status).toBe(404);
    });
    it("rejects malformed JSON with 400, not a runtime 500", async () => {
      const r = await customerPost(
        new Request(process.env.CUSTOMER_AUTH_URL + "/api/commerce", {
          method: "POST",
          headers: { origin: process.env.CUSTOMER_AUTH_URL!, "content-type": "application/json" },
          body: "{",
        }),
      );
      expect(r.status).toBe(400);
    });
    it("does not create payment attempts after reservation expiry even before the sweeper", async () => {
      const { s, order } = await place();
      await db.commerceOrder.update({
        where: { id: order.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(beginPayment(s, order.id, key())).rejects.toThrow("ORDER_EXPIRED");
      expect(await db.commercePayment.count({ where: { orderId: order.id } })).toBe(0);
    });
    it("snapshots product-specific manufacturing terms and shipping components", async () => {
      const { order } = await place(made.variantId);
      const snapshot = order.snapshot as {
        lines: { manufacturing?: { depositMode: string; depositValue: number } }[];
        shipping: { feeMinor?: string };
      };
      expect(snapshot.lines[0].manufacturing).toMatchObject({
        depositMode: "DEPOSIT",
        depositValue: 50,
      });
      expect(snapshot.shipping.feeMinor).toBe("2500");
    });
    it("rolls back a real transaction after stock and cart mutation, then retries the original checkout", async () => {
      const s = guest();
      await updateCart(s, product.variantId, 2);
      const input = {
        address,
        rateId: rate.id,
        method: "MOCK_CARD" as const,
        locale: "ar" as const,
      };
      const q = await quote(s, input),
        submit = { ...input, quoteHash: q.quoteHash, requestKey: key() };
      const before = await db.inventoryBalance.findUniqueOrThrow({
        where: { variantId: product.variantId },
      });
      const original = db.$transaction.bind(db);
      const injected = (async (
        work: (tx: Tx) => Promise<unknown>,
        options: Parameters<typeof db.$transaction>[1],
      ) =>
        original(
          async (tx) =>
            work(
              new Proxy(tx, {
                get(target, property) {
                  if (property === "commerceNotification")
                    return new Proxy(target.commerceNotification, {
                      get(delegate, operation) {
                        if (operation === "create")
                          return async () => {
                            throw Error("AUDIT_INJECTED_CRASH_AFTER_STOCK");
                          };
                        return Reflect.get(delegate, operation);
                      },
                    });
                  return Reflect.get(target, property);
                },
              }),
            ),
          options,
        )) as typeof db.$transaction;
      const spy = vi.spyOn(db, "$transaction").mockImplementation(injected);
      try {
        await expect(checkout(s, submit)).rejects.toThrow("AUDIT_INJECTED_CRASH_AFTER_STOCK");
      } finally {
        spy.mockRestore();
      }
      expect(await db.commerceOrder.count({ where: { ownerKey: s.key } })).toBe(0);
      expect(
        await db.inventoryBalance.findUniqueOrThrow({ where: { variantId: product.variantId } }),
      ).toMatchObject({
        quantity: before.quantity,
        reserved: before.reserved,
        version: before.version,
      });
      expect((await getCart(s))?.items[0].quantity).toBe(2);
      const order = await checkout(s, submit);
      expect(order.totalMinor > BigInt(0)).toBe(true);
    });
    it("rolls back payment ledger credit if the transactional notification insert fails", async () => {
      const { s, order } = await place();
      const p = await beginPayment(s, order.id, key());
      const fact = mockProviderFact(p);
      const original = db.$transaction.bind(db);
      const injected = (async (
        work: (tx: Tx) => Promise<unknown>,
        options: Parameters<typeof db.$transaction>[1],
      ) =>
        original(
          async (tx) =>
            work(
              new Proxy(tx, {
                get(target, property) {
                  if (property === "commerceNotification")
                    return new Proxy(target.commerceNotification, {
                      get(delegate, operation) {
                        if (operation === "create")
                          return async () => {
                            throw Error("AUDIT_PAYMENT_CRASH");
                          };
                        return Reflect.get(delegate, operation);
                      },
                    });
                  return Reflect.get(target, property);
                },
              }),
            ),
          options,
        )) as typeof db.$transaction;
      const spy = vi.spyOn(db, "$transaction").mockImplementation(injected);
      try {
        await expect(receiveMockEvent(fact.body, fact.signature)).rejects.toThrow(
          "AUDIT_PAYMENT_CRASH",
        );
      } finally {
        spy.mockRestore();
      }
      expect(
        (await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor,
      ).toBe(BigInt(0));
      expect(
        await db.commercePaymentEvent.findUnique({ where: { id: JSON.parse(fact.body).id } }),
      ).toBeNull();
      await receiveMockEvent(fact.body, fact.signature);
      expect(
        (await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor,
      ).toBe(order.totalMinor);
    });
    it("allows only one of five simultaneous checkouts to reserve the last item", async () => {
      const p = await fixtureProduct(db, "audit-last-" + key(), "READY_MADE", 1);
      const shoppers = Array.from({ length: 5 }, () => guest());
      for (const s of shoppers) await updateCart(s, p.variantId, 1);
      const input = {
        address,
        rateId: rate.id,
        method: "MOCK_CARD" as const,
        locale: "ar" as const,
      };
      const quotes = await Promise.all(shoppers.map((s) => quote(s, input)));
      const outcomes = await Promise.allSettled(
        shoppers.map((s, i) =>
          checkout(s, { ...input, quoteHash: quotes[i].quoteHash, requestKey: key() }),
        ),
      );
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      expect(
        await db.inventoryBalance.findUniqueOrThrow({ where: { variantId: p.variantId } }),
      ).toMatchObject({ quantity: 1, reserved: 1 });
    });
    it("credits once across twenty concurrent identical provider callbacks", async () => {
      const { s, order } = await place();
      const p = await beginPayment(s, order.id, key()),
        fact = mockProviderFact(p);
      const results = await Promise.all(
        Array.from({ length: 20 }, () => receiveMockEvent(fact.body, fact.signature)),
      );
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      expect(
        (await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor,
      ).toBe(order.totalMinor);
    });
    it("preserves exactly one full-refund capacity across eight competing requests", async () => {
      const { s, order } = await place();
      await payMock(s, order.id, key(), "INITIAL");
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          requestFinance(admins[0], {
            orderId: order.id,
            kind: "REFUND",
            amount: String(order.totalMinor),
            key: key(),
            reason: "Synthetic adversarial refund review",
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.commerceFinanceRequest.count({ where: { orderId: order.id } })).toBe(1);
    });
    it("races expiry against a late provider callback without recreating stock", async () => {
      const { s, order } = await place();
      const p = await beginPayment(s, order.id, key()),
        fact = mockProviderFact(p);
      await db.commerceOrder.update({
        where: { id: order.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await Promise.all([expireOrders(), receiveMockEvent(fact.body, fact.signature)]);
      expect(
        (await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor,
      ).toBe(BigInt(0));
      expect((await db.commercePayment.findUniqueOrThrow({ where: { id: p.id } })).state).toBe(
        "REVIEW_REQUIRED",
      );
      expect(
        (await db.commerceReservation.findFirstOrThrow({ where: { item: { orderId: order.id } } }))
          .state,
      ).toBe("RELEASED");
    });
    it("resolves a cart's older product outside the public catalog's first 100 entries", async () => {
      const old = await fixtureProduct(db, "audit-old-" + key(), "READY_MADE", 5);
      await db.product.update({
        where: { id: old.id },
        data: { createdAt: new Date("2020-01-01") },
      });
      const s = guest();
      await updateCart(s, old.variantId, 1);
      const cart = await getCart(s);
      expect(cart?.products.some((p) => p.id === old.id)).toBe(true);
      expect(JSON.stringify(cart)).not.toContain("ownerKey");
    });
    it("checks registered customer ownership independently of valid account identifiers", async () => {
      const customerA = { key: "customer:" + key(), userId: key() },
        customerB = { key: "customer:" + key(), userId: key() };
      const { order } = await place(product.variantId, "MOCK_CARD", customerA);
      await expect(ownedOrder(customerB, order.id)).rejects.toThrow("ORDER_NOT_FOUND");
      expect((await ownedOrder(customerA, order.id)).id).toBe(order.id);
    });
    it("freezes replacement payment credit and new attempts when a contradictory receipt requires review", async () => {
      const { s, order } = await place();
      const a = await beginPayment(s, order.id, key());
      const failed = mockProviderFact(a, "FAILED");
      await receiveMockEvent(failed.body, failed.signature);
      const b = await beginPayment(s, order.id, key());
      const contradictory = mockProviderFact(a);
      await receiveMockEvent(contradictory.body, contradictory.signature);
      const replacement = mockProviderFact(b);
      await receiveMockEvent(replacement.body, replacement.signature);
      expect(
        (await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor,
      ).toBe(BigInt(0));
      expect((await db.commercePayment.findUniqueOrThrow({ where: { id: b.id } })).state).toBe(
        "REVIEW_REQUIRED",
      );
      await expect(beginPayment(s, order.id, key())).rejects.toThrow("PAYMENT_REVIEW_REQUIRED");
    });
    it("does not manufacture a success when replaying a failed mock-payment request key", async () => {
      const { s, order } = await place();
      const requestKey = key(),
        p = await beginPayment(s, order.id, requestKey);
      const failed = mockProviderFact(p, "FAILED");
      await receiveMockEvent(failed.body, failed.signature);
      expect((await payMock(s, order.id, requestKey, "INITIAL")).state).toBe("FAILED");
      expect(await db.commercePaymentEvent.count({ where: { paymentId: p.id } })).toBe(1);
    });

    it("allows a corrected transfer claim after an authorized rejection without crediting either proof", async () => {
      const { s, order } = await place(product.variantId, "INSTAPAY");
      const first = await beginPayment(s, order.id, key(), "INITIAL", "WRONG-" + key());
      const review = await requestFinance(admins[0], {
        orderId: order.id,
        paymentId: first.id,
        kind: "VERIFY_TRANSFER",
        amount: String(first.amountMinor),
        key: key(),
        reason: "Synthetic unmatched transfer reference",
      });
      await financeTransition(admins[1], review.id, "reject");
      expect((await db.commercePayment.findUniqueOrThrow({ where: { id: first.id } })).state).toBe(
        "FAILED",
      );
      const corrected = await beginPayment(s, order.id, key(), "INITIAL", "CORRECTED-" + key());
      expect(corrected.state).toBe("CLAIMED");
      expect(
        (await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor,
      ).toBe(BigInt(0));
    });
    it("actually uses read-committed isolation rather than retaining a stale snapshot", async () => {
      const p = await fixtureProduct(db, "audit-isolation-" + key(), "READY_MADE", 10);
      await transaction(async (tx) => {
        expect(
          (await tx.inventoryBalance.findUniqueOrThrow({ where: { variantId: p.variantId } }))
            .quantity,
        ).toBe(10);
        await db.inventoryBalance.update({
          where: { variantId: p.variantId },
          data: { quantity: 11 },
        });
        expect(
          (await tx.inventoryBalance.findUniqueOrThrow({ where: { variantId: p.variantId } }))
            .quantity,
        ).toBe(11);
      });
    });
  },
);
