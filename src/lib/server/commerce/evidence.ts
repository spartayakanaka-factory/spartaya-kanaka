import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { demand } from "@/lib/commerce/policy";
import { manualEvidenceEnabled } from "@/lib/commerce/factory-policy";
import { assertCommerceEnvironment, requireFeature } from "@/lib/commerce/runtime";
import { getDatabase } from "../database";
import { getMediaStorage } from "../media-storage";
import { grant, staff } from "./admin";
import { event, lockOrder, notify, transaction, type Shopper } from "./store";

export type EvidenceViewer = { key: string; adminId?: string };
function enabled() {
  assertCommerceEnvironment();
  requireFeature("MANUAL_TRANSFERS");
  demand(manualEvidenceEnabled(), "EVIDENCE_DISABLED", 503);
}
function signature(id: string, key: string, expires: string) {
  const secret = process.env.CUSTOMER_AUTH_SECRET;
  demand(secret && secret.length >= 32, "EVIDENCE_UNAVAILABLE", 503);
  return createHmac("sha256", secret)
    .update("phase35-evidence\0" + id + "\0" + key + "\0" + expires)
    .digest("hex");
}
async function paymentFor(viewer: EvidenceViewer, paymentId: string) {
  enabled();
  const payment = await getDatabase().commercePayment.findUnique({
    where: { id: paymentId },
    include: { order: true },
  });
  demand(payment, "PAYMENT_NOT_FOUND", 404);
  if (viewer.adminId) {
    const actor = await staff(viewer.adminId);
    if (actor.roleCode !== "OWNER")
      await transaction((tx) =>
        grant(tx, actor.id, "PAYMENT_VERIFY", payment.amountMinor, payment.currency),
      );
  } else demand(payment.order.ownerKey === viewer.key, "PAYMENT_NOT_FOUND", 404);
  demand(
    payment.evidenceRequired && ["WALLET", "INSTAPAY"].includes(payment.method),
    "EVIDENCE_NOT_APPLICABLE",
    409,
  );
  return payment;
}
async function editable(paymentId: string, state: string) {
  if (!["CLAIMED", "FAILED"].includes(state)) return false;
  return !(await getDatabase().commerceFinanceRequest.count({
    where: { paymentId, state: { not: "REJECTED" } },
  }));
}
export async function evidenceList(viewer: EvidenceViewer, paymentId: string) {
  const p = await paymentFor(viewer, paymentId);
  const rows = await getDatabase().commercePaymentEvidence.findMany({
    where: { paymentId },
    orderBy: { revision: "desc" },
    take: 20,
  });
  const expires = String(Math.floor(Date.now() / 1000) + 60);
  return {
    editable: !viewer.adminId && (await editable(p.id, p.state)),
    paymentState: p.state,
    reference: p.claimReference,
    explanation: p.customerExplanation,
    evidence: rows.map((r) => ({
      id: r.id,
      revision: r.revision,
      createdAt: r.createdAt,
      width: r.width,
      height: r.height,
      previewUrl:
        "/api/commerce/payment-evidence?file=" +
        r.id +
        "&expires=" +
        expires +
        "&signature=" +
        signature(r.id, viewer.key, expires) +
        (viewer.adminId ? "&audience=staff" : ""),
    })),
  };
}
export async function evidenceBytes(
  viewer: EvidenceViewer,
  id: string,
  expires: string,
  supplied: string,
) {
  enabled();
  const now = Math.floor(Date.now() / 1000);
  demand(
    /^\d{10}$/.test(expires) &&
      Number(expires) >= now &&
      Number(expires) <= now + 60 &&
      /^[a-f0-9]{64}$/.test(supplied),
    "EVIDENCE_LINK_EXPIRED",
    403,
  );
  demand(
    timingSafeEqual(
      Buffer.from(supplied, "hex"),
      Buffer.from(signature(id, viewer.key, expires), "hex"),
    ),
    "FORBIDDEN",
    403,
  );
  const proof = await getDatabase().commercePaymentEvidence.findUnique({ where: { id } });
  demand(proof, "PAYMENT_NOT_FOUND", 404);
  await paymentFor(viewer, proof.paymentId);
  const storage = getMediaStorage();
  try {
    const object = await storage.client.send(
      new GetObjectCommand({ Bucket: storage.originalsBucket, Key: proof.storageKey }),
    );
    demand(
      object.Body && object.ContentType === proof.mime && object.ContentLength === proof.byteSize,
      "EVIDENCE_UNAVAILABLE",
      503,
    );
    const bytes = await object.Body.transformToByteArray();
    demand(
      createHash("sha256").update(bytes).digest("hex") === proof.sha256,
      "EVIDENCE_UNAVAILABLE",
      503,
    );
    return bytes;
  } finally {
    storage.client.destroy();
  }
}
export async function uploadEvidence(
  shopper: Shopper,
  paymentId: string,
  key: string,
  input: Buffer,
  contentType: string,
  reference?: string,
) {
  const p = await paymentFor(shopper, paymentId);
  demand(/^[A-Za-z0-9_-]{8,64}$/.test(key), "IDEMPOTENCY_KEY_REQUIRED", 400);
  demand(input.length > 0 && input.length <= 5 * 1024 * 1024, "EVIDENCE_SIZE_LIMIT", 413);
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  demand(formats[contentType], "EVIDENCE_IMAGE_REQUIRED", 400);
  const normalizedReference = reference?.trim().toUpperCase() || undefined;
  demand(
    !normalizedReference || /^[A-Z0-9_-]{8,96}$/.test(normalizedReference),
    "TRANSFER_REFERENCE_INVALID",
    400,
  );
  // Bounded, per-viewer upload attempts. Better Auth's rate keys use another namespace.
  const minute = Math.floor(Date.now() / 60000),
    rateKey =
      "proof:" +
      createHash("sha256")
        .update(shopper.key + ":" + minute)
        .digest("hex");
  const now = BigInt(Date.now());
  await getDatabase()
    .$executeRaw`INSERT INTO customer_rate_limits (id,\`key\`,count,lastRequest) VALUES (${rateKey},${rateKey},1,${now}) ON DUPLICATE KEY UPDATE count=count+1,lastRequest=${now}`;
  const rate = await getDatabase().customerRateLimit.findUniqueOrThrow({ where: { key: rateKey } });
  demand(rate.count <= 12, "EVIDENCE_RATE_LIMIT", 429);
  let bytes: Buffer, info: { width: number; height: number };
  try {
    const image = sharp(input, { limitInputPixels: 20000000, animated: false }),
      meta = await image.metadata();
    demand(
      meta.format === formats[contentType] && (!meta.pages || meta.pages === 1),
      "EVIDENCE_IMAGE_REQUIRED",
      400,
    );
    const result = await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    bytes = result.data;
    info = result.info;
  } catch {
    demand(false, "EVIDENCE_IMAGE_REQUIRED", 400);
  }
  demand(bytes.length <= 5 * 1024 * 1024, "EVIDENCE_SIZE_LIMIT", 413);
  const sha256 = createHash("sha256").update(bytes).digest("hex"),
    db = getDatabase();
  const previous = await db.commercePaymentEvidence.findUnique({
    where: { paymentId_requestKey: { paymentId, requestKey: key } },
  });
  if (previous) {
    demand(
      previous.sha256 === sha256 &&
        (!normalizedReference || p.claimReference?.toUpperCase() === normalizedReference),
      "IDEMPOTENCY_CONFLICT",
    );
    return { id: previous.id, revision: previous.revision };
  }
  demand(await editable(paymentId, p.state), "EVIDENCE_REVIEW_LOCKED");
  const storage = getMediaStorage(),
    storageKey = "payment-evidence/" + randomUUID() + ".webp";
  let retained = false;
  try {
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.originalsBucket,
        Key: storageKey,
        Body: bytes,
        ContentType: "image/webp",
        ContentLength: bytes.length,
        IfNoneMatch: "*",
        Metadata: { purpose: "payment-evidence" },
        CacheControl: "private, no-store",
      }),
    );
    const result = await transaction(async (tx) => {
      const order = await lockOrder(tx, p.orderId);
      demand(order.ownerKey === shopper.key, "PAYMENT_NOT_FOUND", 404);
      const current = await tx.commercePayment.findUniqueOrThrow({ where: { id: paymentId } });
      const replay = await tx.commercePaymentEvidence.findUnique({
        where: { paymentId_requestKey: { paymentId, requestKey: key } },
      });
      if (replay) {
        demand(
          replay.sha256 === sha256 &&
            (!normalizedReference || current.claimReference?.toUpperCase() === normalizedReference),
          "IDEMPOTENCY_CONFLICT",
        );
        return replay;
      }
      demand(
        ["CLAIMED", "FAILED"].includes(current.state) &&
          current.evidenceRequired &&
          ["AWAITING_PAYMENT", "CONFIRMED", "IN_PRODUCTION", "READY"].includes(order.state),
        "EVIDENCE_REVIEW_LOCKED",
      );
      demand(order.state !== "AWAITING_PAYMENT" || order.expiresAt > new Date(), "ORDER_EXPIRED");
      demand(
        !(await tx.commerceFinanceRequest.count({
          where: { paymentId, state: { not: "REJECTED" } },
        })),
        "EVIDENCE_REVIEW_LOCKED",
      );
      if (current.state === "FAILED") {
        const other = await tx.commercePayment.count({
          where: {
            orderId: order.id,
            id: { not: paymentId },
            state: { in: ["PENDING", "CLAIMED", "UNKNOWN", "REVIEW_REQUIRED"] },
          },
        });
        const target = current.purpose === "INITIAL" ? order.initialMinor : order.totalMinor;
        demand(
          !other && current.amountMinor === target - order.paidMinor,
          "PAYMENT_ALREADY_PENDING_OR_SATISFIED",
        );
      }
      demand(
        !normalizedReference ||
          !current.claimReference ||
          normalizedReference === current.claimReference.toUpperCase(),
        "TRANSFER_REFERENCE_LOCKED",
      );
      demand(
        !(await tx.commercePaymentEvidence.findUnique({ where: { sha256 } })),
        "EVIDENCE_ALREADY_USED",
      );
      if (normalizedReference && !current.claimReference) {
        const used = await tx.commercePayment.findUnique({
          where: { claimReference: normalizedReference },
        });
        demand(!used || used.id === paymentId, "TRANSFER_REFERENCE_ALREADY_USED");
      }
      const latest = await tx.commercePaymentEvidence.findFirst({
        where: { paymentId },
        orderBy: { revision: "desc" },
      });
      const proof = await tx.commercePaymentEvidence.create({
        data: {
          paymentId,
          requestKey: key,
          revision: (latest?.revision || 0) + 1,
          ownerKey: shopper.key,
          storageKey,
          sha256,
          mime: "image/webp",
          byteSize: bytes.length,
          width: info.width,
          height: info.height,
        },
      });
      await tx.commercePayment.update({
        where: { id: paymentId },
        data: {
          state: "CLAIMED",
          customerExplanation: null,
          ...(normalizedReference && !current.claimReference
            ? { claimReference: normalizedReference }
            : {}),
        },
      });
      await event(tx, order.id, shopper.key, "payment.evidence_submitted", "evidence:" + proof.id, {
        paymentId,
        evidenceId: proof.id,
        revision: proof.revision,
      });
      await notify(
        tx,
        order.id,
        "payment.evidence_submitted",
        order.locale,
        "evidence:" + proof.id,
      );
      return proof;
    });
    retained = result.storageKey === storageKey;
    return { id: result.id, revision: result.revision };
  } finally {
    if (!retained)
      try {
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.originalsBucket, Key: storageKey }),
        );
      } catch {
        /* Unreferenced private objects require a reviewed orphan-retention job; never delete another request's object. */
      }
    storage.client.destroy();
  }
}
