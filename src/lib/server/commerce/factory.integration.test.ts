import { randomUUID, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { drainNotifications } from "./notifications";
import { readBytes } from "./http";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { getDatabase } from "../database";
import { getMediaStorage } from "../media-storage";
import {
  fixturePolicy,
  fixtureProduct,
  fixtureRate,
  syntheticPolicy,
} from "@/lib/commerce/fixtures";
import { checkout, quote, updateCart, ownedOrder, type Shopper } from "./store";
import { beginPayment } from "./payments";
import { requestFinance, financeTransition, fulfill } from "./admin";
import { evidenceList, evidenceBytes, uploadEvidence } from "./evidence";
import { addOrderNote, setCustomerAccess } from "./factory";
import { getCustomerAuth, customerIdentity } from "./customer-auth";
import { POST as evidencePost } from "@/app/api/commerce/payment-evidence/route";
const enabled = process.env.PHASE3_DB_INTEGRATION === "1",
  key = () => randomUUID();
const address = {
  label: "Factory test",
  recipient: "Synthetic recipient",
  phone: "01000000000",
  country: "EG",
  region: "PHASE35-TEST-" + key(),
  city: "Test city",
  area: "Test area",
  line1: "Private synthetic address",
  deliveryInstructions: "Synthetic delivery note",
};
const instructions = {
  enabled: true,
  identifier: "LOCAL-TEST-NOT-PAYABLE",
  recipient: "Synthetic recipient — no real transfers",
  instructionsAr: "اختبار فقط. لا ترسل أموالاً حقيقية.",
  instructionsEn: "Local test only. Do not transfer real funds.",
};
let db: ReturnType<typeof getDatabase>,
  product: Awaited<ReturnType<typeof fixtureProduct>>,
  made: typeof product,
  rate: Awaited<ReturnType<typeof fixtureRate>>;
const admins: string[] = [];
const image = () =>
  sharp(randomBytes(32 * 32 * 3), { raw: { width: 32, height: 32, channels: 3 } })
    .png()
    .toBuffer();
async function place(
  method: "WALLET" | "INSTAPAY" | "COD" = "WALLET",
  variant?: string,
  s: Shopper = { key: "guest:" + key() },
) {
  await updateCart(s, variant || product.variantId, 1);
  const input = { address, rateId: rate.id, method, locale: "ar" as const };
  const q = await quote(s, input);
  const order = await checkout(s, { ...input, quoteHash: q.quoteHash, requestKey: key() });
  return { s, order };
}
async function claim() {
  const { s, order } = await place();
  return { s, order, payment: await beginPayment(s, order.id, key()) };
}
async function reconcile(paymentId: string, orderId: string) {
  const p = await db.commercePayment.findUniqueOrThrow({ where: { id: paymentId } });
  const r = await requestFinance(admins[0], {
    orderId,
    paymentId,
    kind: "VERIFY_TRANSFER",
    amount: String(p.amountMinor),
    key: key(),
    reason: "Synthetic receiving account reconciliation",
  });
  await financeTransition(admins[1], r.id, "approve");
  await financeTransition(admins[1], r.id, "execute");
  await financeTransition(admins[2], r.id, "reconcile");
  return r;
}
describe.skipIf(!enabled)("Phase 3.5 factory acceptance — real MariaDB and private S3", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL!);
    expect(u.hostname).toBe("127.0.0.1");
    expect(u.port).toBe("33078");
    expect(["/sprtaya_phase3_disposable_test", "/sprtaya_phase35_disposable_test"]).toContain(
      u.pathname,
    );
    vi.stubEnv("P35_PAYMENT_EVIDENCE", "1");
    db = getDatabase();
    await fixturePolicy(db);
    await db.commercePolicy.update({
      where: { id: "local-synthetic" },
      data: {
        configuration: {
          ...syntheticPolicy,
          manualInstructions: { WALLET: instructions, INSTAPAY: instructions },
        },
      },
    });
    rate = await fixtureRate(db, address.region);
    await db.shippingRate.update({
      where: { id: rate.id },
      data: { city: address.city, area: address.area },
    });
    product = await fixtureProduct(db, "factory-" + key(), "READY_MADE", 200);
    made = await fixtureProduct(db, "factory-made-" + key(), "MADE_TO_ORDER");
    for (let i = 0; i < 4; i++) {
      const a = await db.adminUser.create({
        data: {
          name: "Synthetic factory reviewer",
          email: key() + "@factory.invalid",
          roleCode: i === 0 ? "OWNER" : "MANAGER",
          forcePasswordChange: false,
        },
      });
      admins.push(a.id);
      if (i < 3)
        for (const operation of ["PAYMENT_VERIFY", "RECONCILE"])
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
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db?.$disconnect();
  });
  it("keeps COD unpaid through delivery and collection, credits once after separate reconciliation", async () => {
    const { order } = await place("COD");
    await fulfill(admins[0], order.id, "ready");
    await fulfill(admins[0], order.id, "dispatch", "SYNTHETIC-SHIPMENT");
    await fulfill(admins[0], order.id, "delivered");
    await fulfill(admins[0], order.id, "cod_collected");
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      BigInt(0),
    );
    await expect(fulfill(admins[0], order.id, "cod_reconciled")).rejects.toThrow(
      "SEPARATE_RECONCILER_REQUIRED",
    );
    await Promise.all([
      fulfill(admins[2], order.id, "cod_reconciled"),
      fulfill(admins[2], order.id, "cod_reconciled"),
    ]);
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      order.totalMinor,
    );
  });
  it("rejects made-to-order COD and destinations outside a configured city/area", async () => {
    const s = { key: "guest:" + key() };
    await updateCart(s, made.variantId, 1);
    await expect(
      quote(s, { address, rateId: rate.id, method: "COD", locale: "ar" }),
    ).rejects.toThrow("COD_NOT_ELIGIBLE");
    await updateCart(s, made.variantId, 0);
    await updateCart(s, product.variantId, 1);
    await expect(
      quote(s, {
        address: { ...address, area: "Not served" },
        rateId: rate.id,
        method: "COD",
        locale: "ar",
      }),
    ).rejects.toThrow("SHIPPING_RATE_REQUIRED");
  });
  it("requires configured instructions and preserves snapshots when settings change", async () => {
    const { s, payment } = await claim();
    expect(payment.instructionsSnapshot).toMatchObject({ identifier: instructions.identifier });
    await db.commercePolicy.update({
      where: { id: "local-synthetic" },
      data: {
        configuration: {
          ...syntheticPolicy,
          manualInstructions: {
            WALLET: { ...instructions, enabled: false },
            INSTAPAY: instructions,
          },
        },
      },
    });
    await expect(place()).rejects.toThrow("MANUAL_METHOD_NOT_CONFIGURED");
    expect(
      (await db.commercePayment.findUniqueOrThrow({ where: { id: payment.id } }))
        .instructionsSnapshot,
    ).toEqual(payment.instructionsSnapshot);
    await db.commercePolicy.update({
      where: { id: "local-synthetic" },
      data: {
        configuration: {
          ...syntheticPolicy,
          manualInstructions: { WALLET: instructions, INSTAPAY: instructions },
        },
      },
    });
    expect((await ownedOrder(s, payment.orderId)).paidMinor).toBe(BigInt(0));
  });
  it("stores re-encoded images privately, supplies viewer-bound expiring reads and never credits money", async () => {
    const { s, payment, order } = await claim();
    const bytes = await image();
    const proof = await uploadEvidence(s, payment.id, key(), bytes, "image/png");
    const row = await db.commercePaymentEvidence.findUniqueOrThrow({ where: { id: proof.id } });
    expect(row.mime).toBe("image/webp");
    const storage = getMediaStorage();
    try {
      expect(
        (
          await fetch(
            process.env.MEDIA_S3_ENDPOINT + "/" + storage.originalsBucket + "/" + row.storageKey,
          )
        ).status,
      ).toBe(403);
    } finally {
      storage.client.destroy();
    }
    expect(await db.mediaAsset.count({ where: { originalKey: row.storageKey } })).toBe(0);
    const list = await evidenceList(s, payment.id),
      url = new URL(list.evidence[0].previewUrl, "http://localhost");
    expect(
      await evidenceBytes(
        s,
        proof.id,
        url.searchParams.get("expires")!,
        url.searchParams.get("signature")!,
      ),
    ).toHaveLength(row.byteSize);
    await expect(
      evidenceBytes(
        { key: "guest:" + key() },
        proof.id,
        url.searchParams.get("expires")!,
        url.searchParams.get("signature")!,
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      evidenceBytes(
        s,
        proof.id,
        String(Math.floor(Date.now() / 1000) - 1),
        url.searchParams.get("signature")!,
      ),
    ).rejects.toThrow("EVIDENCE_LINK_EXPIRED");
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      BigInt(0),
    );
  });
  it("serializes duplicate concurrent uploads into one immutable revision and one notification", async () => {
    const { s, payment } = await claim(),
      bytes = await image(),
      request = key();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => uploadEvidence(s, payment.id, request, bytes, "image/png")),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await db.commercePaymentEvidence.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(
      await db.commerceNotification.count({ where: { dedupKey: "evidence:" + results[0].id } }),
    ).toBe(1);
    await expect(
      uploadEvidence(s, payment.id, request, await image(), "image/png"),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("blocks cross-order image and transfer-reference reuse without deleting the accepted evidence", async () => {
    const first = await claim(),
      second = await claim(),
      bytes = await image(),
      reference = "TEST-" + key();
    const proof = await uploadEvidence(
      first.s,
      first.payment.id,
      key(),
      bytes,
      "image/png",
      reference,
    );
    await expect(
      uploadEvidence(second.s, second.payment.id, key(), bytes, "image/png"),
    ).rejects.toThrow("EVIDENCE_ALREADY_USED");
    await expect(
      uploadEvidence(second.s, second.payment.id, key(), await image(), "image/png", reference),
    ).rejects.toThrow("TRANSFER_REFERENCE_ALREADY_USED");
    expect(await db.commercePaymentEvidence.findUnique({ where: { id: proof.id } })).not.toBeNull();
  });
  it("rejects spoofed MIME, invalid bytes, oversized images and unowned evidence access", async () => {
    const { s, payment } = await claim();
    await expect(
      uploadEvidence(s, payment.id, key(), Buffer.from("<svg/>"), "image/svg+xml"),
    ).rejects.toThrow("EVIDENCE_IMAGE_REQUIRED");
    await expect(
      uploadEvidence(s, payment.id, key(), Buffer.from("<script/>"), "image/jpeg"),
    ).rejects.toThrow("EVIDENCE_IMAGE_REQUIRED");
    await expect(
      uploadEvidence(s, payment.id, key(), Buffer.alloc(5242881), "image/png"),
    ).rejects.toThrow("EVIDENCE_SIZE_LIMIT");
    await expect(evidenceList({ key: "guest:" + key() }, payment.id)).rejects.toThrow(
      "PAYMENT_NOT_FOUND",
    );
    await expect(
      evidenceList({ key: "staff:" + admins[3], adminId: admins[3] }, payment.id),
    ).rejects.toThrow("FINANCIAL_PERMISSION_REQUIRED");
  });
  it("enforces CSRF in the real route without writing evidence", async () => {
    expect(
      (
        await evidencePost(
          new Request("http://localhost:3005/api/commerce/payment-evidence?paymentId=" + key(), {
            method: "POST",
            headers: { origin: "https://untrusted.invalid" },
            body: "bad",
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("requires evidence and explicit grants before reconciliation, and locks evidence during/after review", async () => {
    const { s, payment, order } = await claim();
    const request = {
      orderId: order.id,
      paymentId: payment.id,
      kind: "VERIFY_TRANSFER" as const,
      amount: String(payment.amountMinor),
      key: key(),
      reason: "Synthetic bank-account verification",
    };
    await expect(requestFinance(admins[0], request)).rejects.toThrow("PAYMENT_EVIDENCE_REQUIRED");
    await expect(requestFinance(admins[3], request)).rejects.toThrow(
      "FINANCIAL_PERMISSION_REQUIRED",
    );
    await uploadEvidence(s, payment.id, key(), await image(), "image/png");
    const r = await requestFinance(admins[0], request);
    await expect(uploadEvidence(s, payment.id, key(), await image(), "image/png")).rejects.toThrow(
      "EVIDENCE_REVIEW_LOCKED",
    );
    await financeTransition(admins[1], r.id, "approve");
    await financeTransition(admins[1], r.id, "execute");
    await Promise.all([
      financeTransition(admins[2], r.id, "reconcile"),
      financeTransition(admins[2], r.id, "reconcile"),
    ]);
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      payment.amountMinor,
    );
    await expect(uploadEvidence(s, payment.id, key(), await image(), "image/png")).rejects.toThrow(
      "EVIDENCE_REVIEW_LOCKED",
    );
  });
  it("preserves rejected revisions, requires a customer explanation and permits audited correction", async () => {
    const { s, payment, order } = await claim();
    const proof = await uploadEvidence(s, payment.id, key(), await image(), "image/png");
    const r = await requestFinance(admins[0], {
      orderId: order.id,
      paymentId: payment.id,
      kind: "VERIFY_TRANSFER",
      amount: String(payment.amountMinor),
      key: key(),
      reason: "Synthetic account review request",
    });
    await expect(financeTransition(admins[1], r.id, "reject")).rejects.toThrow(
      "CUSTOMER_EXPLANATION_REQUIRED",
    );
    await financeTransition(
      admins[1],
      r.id,
      "reject",
      "صورة الاختبار غير واضحة. أعد رفع صورة أوضح.",
    );
    expect((await evidenceList(s, payment.id)).explanation).toContain("غير واضحة");
    const replacement = await uploadEvidence(s, payment.id, key(), await image(), "image/png");
    expect(replacement.revision).toBe(2);
    expect(await db.commercePaymentEvidence.findUnique({ where: { id: proof.id } })).not.toBeNull();
    await reconcile(payment.id, order.id);
    expect((await db.commercePayment.findUniqueOrThrow({ where: { id: payment.id } })).state).toBe(
      "SUCCEEDED",
    );
  });
  it("recovers the exact private object after deletion and fails closed while it is missing", async () => {
    const { s, payment } = await claim(),
      proof = await uploadEvidence(s, payment.id, key(), await image(), "image/png");
    const row = await db.commercePaymentEvidence.findUniqueOrThrow({ where: { id: proof.id } }),
      storage = getMediaStorage();
    const url = new URL(
      (await evidenceList(s, payment.id)).evidence[0].previewUrl,
      "http://localhost",
    );
    try {
      const original = await storage.client.send(
        new GetObjectCommand({ Bucket: storage.originalsBucket, Key: row.storageKey }),
      );
      const backup = await original.Body!.transformToByteArray();
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.originalsBucket, Key: row.storageKey }),
      );
      await expect(
        evidenceBytes(
          s,
          row.id,
          url.searchParams.get("expires")!,
          url.searchParams.get("signature")!,
        ),
      ).rejects.toThrow();
      await storage.client.send(
        new PutObjectCommand({
          Bucket: storage.originalsBucket,
          Key: row.storageKey,
          Body: backup,
          ContentType: row.mime,
          IfNoneMatch: "*",
        }),
      );
      expect(
        await evidenceBytes(
          s,
          row.id,
          url.searchParams.get("expires")!,
          url.searchParams.get("signature")!,
        ),
      ).toEqual(backup);
    } finally {
      storage.client.destroy();
    }
  });
  it("keeps internal manufacturing notes private from the shopper and idempotent in the audit trail", async () => {
    const { s, order } = await place(),
      request = key(),
      text = "Private synthetic manufacturing note <script>alert(1)</script>";
    const first = await addOrderNote(admins[0], order.id, "MANUFACTURING", text, request);
    expect((await addOrderNote(admins[0], order.id, "MANUFACTURING", text, request)).id).toBe(
      first.id,
    );
    expect(
      JSON.stringify(await ownedOrder(s, order.id), (_, v) =>
        typeof v === "bigint" ? String(v) : v,
      ),
    ).not.toContain(text);
    expect(await db.commerceEvent.count({ where: { operationKey: "note:" + first.id } })).toBe(1);
  });
  it("blocks manufacturing without verified advance and dispatch without the remaining balance", async () => {
    const { s, order } = await place("INSTAPAY", made.variantId);
    const p = await beginPayment(s, order.id, key());
    await expect(fulfill(admins[0], order.id, "start")).rejects.toThrow(
      "PRODUCTION_PAYMENT_REQUIRED",
    );
    await uploadEvidence(s, p.id, key(), await image(), "image/png");
    await reconcile(p.id, order.id);
    await fulfill(admins[0], order.id, "start");
    await fulfill(admins[0], order.id, "ready");
    await expect(fulfill(admins[0], order.id, "dispatch", "SYNTHETIC-SHIP")).rejects.toThrow(
      "BALANCE_REQUIRED",
    );
    const balance = await beginPayment(s, order.id, key(), "BALANCE");
    await uploadEvidence(s, balance.id, key(), await image(), "image/png");
    await reconcile(balance.id, order.id);
    await fulfill(admins[0], order.id, "dispatch", "SYNTHETIC-SHIP");
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      order.totalMinor,
    );
  });
  it("revokes banned customer sessions, rejects fresh login and denies manager access changes", async () => {
    const auth = getCustomerAuth(),
      email = key() + "@factory.invalid",
      password = "Synthetic-only-" + key();
    const user = await auth.api.signUpEmail({
      body: { email, password, name: "Synthetic access customer" },
    });
    await db.customerUser.update({ where: { id: user.user.id }, data: { emailVerified: true } });
    const testIp = "192.0.2." + (1 + Math.floor(Math.random() * 250));
    const request = () =>
      auth.handler(
        new Request(process.env.CUSTOMER_AUTH_URL + "/api/customer-auth/sign-in/email", {
          method: "POST",
          headers: {
            origin: process.env.CUSTOMER_AUTH_URL!,
            "content-type": "application/json",
            "x-forwarded-for": testIp,
          },
          body: JSON.stringify({ email, password }),
        }),
      );
    const login = await request();
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    expect(await customerIdentity(new Headers({ cookie }))).not.toBeNull();
    await expect(
      setCustomerAccess(admins[1], user.user.id, true, "Synthetic access investigation", key()),
    ).rejects.toThrow("OWNER_REQUIRED");
    await setCustomerAccess(admins[0], user.user.id, true, "Synthetic access investigation", key());
    expect(await db.customerSession.count({ where: { userId: user.user.id } })).toBe(0);
    expect(await customerIdentity(new Headers({ cookie }))).toBeNull();
    expect((await request()).status).not.toBe(200);
    await setCustomerAccess(
      admins[0],
      user.user.id,
      false,
      "Synthetic reviewed restoration",
      key(),
    );
    expect((await request()).status).toBe(200);
  });
  it("bounds chunked request bodies even with missing or dishonest length headers", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(9));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost", {
      method: "POST",
      body,
      duplex: "half",
      headers: { "content-length": "1" },
    } as RequestInit);
    await expect(readBytes(request, 16)).rejects.toThrow("INPUT_TOO_LARGE");
    expect(cancelled).toBe(true);
    await expect(
      readBytes(
        new Request("http://localhost", {
          method: "POST",
          body: "abc",
          headers: { "content-length": "999" },
        }),
        16,
      ),
    ).rejects.toThrow("INPUT_TOO_LARGE");
  });
  it("rate limits proof attempts without accepting forged bytes or creating evidence", async () => {
    const { s, payment } = await claim();
    for (let i = 0; i < 12; i++)
      await expect(
        uploadEvidence(s, payment.id, key(), Buffer.from("not-an-image"), "image/png"),
      ).rejects.toThrow("EVIDENCE_IMAGE_REQUIRED");
    await expect(uploadEvidence(s, payment.id, key(), await image(), "image/png")).rejects.toThrow(
      "EVIDENCE_RATE_LIMIT",
    );
    expect(await db.commercePaymentEvidence.count({ where: { paymentId: payment.id } })).toBe(0);
  });
  it("does not resurrect rejected evidence while another payment claim is pending", async () => {
    const { s, payment, order } = await claim();
    await uploadEvidence(s, payment.id, key(), await image(), "image/png");
    const r = await requestFinance(admins[0], {
      orderId: order.id,
      paymentId: payment.id,
      kind: "VERIFY_TRANSFER",
      amount: String(payment.amountMinor),
      key: key(),
      reason: "Synthetic overlap rejection review",
    });
    await financeTransition(
      admins[1],
      r.id,
      "reject",
      "Synthetic evidence rejected for correction",
    );
    await beginPayment(s, order.id, key());
    await expect(uploadEvidence(s, payment.id, key(), await image(), "image/png")).rejects.toThrow(
      "PAYMENT_ALREADY_PENDING_OR_SATISFIED",
    );
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } })).paidMinor).toBe(
      BigInt(0),
    );
  });
  it("retries failed captures, bounds attempts, recovers expired leases and writes one private capture", async () => {
    for (let i = 0; i < 100; i++) {
      const due = await db.commerceNotification.count({
        where: {
          state: "PENDING",
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
        },
      });
      if (!due) break;
      await drainNotifications();
    }
    const directory = await mkdtemp(path.join(tmpdir(), "sprtaya-notifications-")),
      blocked = path.join(directory, "blocked"),
      previous = process.env.P3_STATE_DIR!;
    await writeFile(blocked, "not a directory");
    const job = await db.commerceNotification.create({
      data: { dedupKey: key(), kind: "order.created", locale: "ar", payload: { orderId: key() } },
    });
    try {
      vi.stubEnv("P3_STATE_DIR", blocked);
      await drainNotifications();
      let saved = await db.commerceNotification.findUniqueOrThrow({ where: { id: job.id } });
      expect(saved.state).toBe("PENDING");
      expect(saved.attempts).toBe(1);
      expect(saved.lastErrorCode).toBe("LOCAL_CAPTURE_UNAVAILABLE");
      expect(saved.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
      await drainNotifications();
      expect(
        (await db.commerceNotification.findUniqueOrThrow({ where: { id: job.id } })).attempts,
      ).toBe(1);
      await db.commerceNotification.update({
        where: { id: job.id },
        data: { attempts: 7, nextAttemptAt: new Date(0) },
      });
      await drainNotifications();
      expect(
        (await db.commerceNotification.findUniqueOrThrow({ where: { id: job.id } })).state,
      ).toBe("FAILED");
      vi.stubEnv("P3_STATE_DIR", directory);
      await db.commerceNotification.update({
        where: { id: job.id },
        data: { state: "PROCESSING", leaseUntil: new Date(0) },
      });
      await drainNotifications();
      saved = await db.commerceNotification.findUniqueOrThrow({ where: { id: job.id } });
      expect(saved.state).toBe("CAPTURED");
      const capture = await readFile(
        path.join(directory, "notification-capture", job.id + ".json"),
        "utf8",
      );
      await drainNotifications();
      expect(
        await readFile(path.join(directory, "notification-capture", job.id + ".json"), "utf8"),
      ).toBe(capture);
      expect(capture).not.toContain("payment-evidence/");
    } finally {
      vi.stubEnv("P3_STATE_DIR", previous);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
