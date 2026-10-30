import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { assertCommerceEnvironment, requireFeature } from "@/lib/commerce/runtime";
import { getDatabase } from "../database";
export const notificationText = (kind: string, locale: string) => {
  const ar: Record<string, string> = {
    "order.created": "تم تسجيل طلب الاختبار. لا توجد عملية دفع حقيقية.",
    "payment.verified": "تمت مطابقة دفعة الاختبار.",
    "order.cancelled": "تم إلغاء طلب الاختبار.",
    "order.shipped": "تم تسجيل شحن طلب الاختبار.",
    "refund.reconciled": "تمت مطابقة استرداد الاختبار.",
    "payment.evidence_submitted": "وصل إثبات تحويل جديد للمراجعة. لم تُثبت دفعة بعد.",
    "payment.rejected": "تحتاج صورة التحويل إلى تصحيح. راجع سبب الرفض في الطلب.",
    "fulfillment.start": "بدأ تصنيع طلب الاختبار.",
    "fulfillment.ready": "طلب الاختبار جاهز للتسليم لشركة الشحن.",
    "fulfillment.delivered": "تم تسجيل تسليم طلب الاختبار.",
  };
  const en: Record<string, string> = {
    "order.created": "Test order recorded. No real payment was collected.",
    "payment.verified": "Test payment reconciled.",
    "order.cancelled": "Test order cancelled.",
    "order.shipped": "Test shipment recorded.",
    "refund.reconciled": "Test refund reconciled.",
    "payment.evidence_submitted":
      "New transfer evidence needs review. No payment has been credited.",
    "payment.rejected": "Transfer evidence needs correction. Review the reason on your order.",
    "fulfillment.start": "Test order manufacturing started.",
    "fulfillment.ready": "Test order is ready for the carrier.",
    "fulfillment.delivered": "Test order delivery recorded.",
  };
  return (
    (locale === "ar" ? ar : en)[kind] ||
    (locale === "ar" ? "تحديث طلب اختباري" : "Test order update")
  );
};
export async function capturePrivate(kind: string, recipient: string, payload: unknown) {
  assertCommerceEnvironment();
  requireFeature("NOTIFICATIONS");
  const directory = path.join(process.env.P3_STATE_DIR!, "notification-capture");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const id = randomUUID();
  await writeFile(
    path.join(directory, id + ".json"),
    JSON.stringify({ id, kind, recipient, payload, capturedAt: new Date().toISOString() }),
    { mode: 0o600 },
  );
  return id;
}
// Durable outbox leasing; captures use a stable filename so crash/retry cannot duplicate delivery.
export async function drainNotifications() {
  assertCommerceEnvironment();
  requireFeature("NOTIFICATIONS");
  const db = getDatabase();
  const jobs = await db.commerceNotification.findMany({
    where: {
      OR: [
        { state: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        { state: "PROCESSING", leaseUntil: { lt: new Date() } },
      ],
    },
    take: 20,
    orderBy: { createdAt: "asc" },
  });
  let count = 0;
  for (const job of jobs) {
    const leaseUntil = new Date(Date.now() + 30000);
    const claimed = await db.commerceNotification.updateMany({
      where: { id: job.id, state: job.state, leaseUntil: job.leaseUntil },
      data: {
        state: "PROCESSING",
        attempts: { increment: 1 },
        leaseUntil,
      },
    });
    if (!claimed.count) continue;
    try {
      const directory = path.join(process.env.P3_STATE_DIR!, "notification-capture");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(directory, job.id + ".json"),
        JSON.stringify({
          id: job.id,
          kind: job.kind,
          locale: job.locale,
          text: notificationText(job.kind, job.locale),
          payload: job.payload,
        }),
        { mode: 0o600 },
      );
      await db.commerceNotification.updateMany({
        where: { id: job.id, state: "PROCESSING", leaseUntil },
        data: { state: "CAPTURED", leaseUntil: null, nextAttemptAt: null, lastErrorCode: null },
      });
      count++;
    } catch {
      await db.commerceNotification.updateMany({
        where: { id: job.id, state: "PROCESSING", leaseUntil },
        data: {
          state: job.attempts + 1 >= 8 ? "FAILED" : "PENDING",
          leaseUntil: null,
          nextAttemptAt:
            job.attempts + 1 >= 8
              ? null
              : new Date(Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts)),
          lastErrorCode: "LOCAL_CAPTURE_UNAVAILABLE",
        },
      });
    }
  }
  return count;
}
