"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
type Queue = {
  states: { state: string; _count: { _all: number } }[];
  review: number;
  notifications: {
    id: string;
    kind: string;
    state: string;
    attempts: number;
    payload: { orderId?: string };
    createdAt: string;
  }[];
};
const labels: Record<string, string> = {
  "order.created": "طلب جديد",
  "payment.evidence_submitted": "إثبات تحويل يحتاج مراجعة",
  "payment.verified": "تم التحقق من دفعة",
  "payment.rejected": "إثبات يحتاج تصحيحاً",
  "fulfillment.start": "بدأ التصنيع",
  "fulfillment.ready": "طلب جاهز للشحن",
  "order.shipped": "تم تسجيل شحنة",
  "fulfillment.delivered": "تم تسجيل التسليم",
  "order.cancelled": "تم إلغاء طلب",
  "refund.reconciled": "تمت تسوية استرداد",
};
export function FactoryWorkQueue({
  select,
  owner,
}: {
  select: (state: string) => void;
  owner: boolean;
}) {
  const [queue, setQueue] = useState<Queue | null>(null),
    [message, setMessage] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const r = await fetch("/api/admin/commerce?resource=workQueue", { cache: "no-store", signal });
    if (!r.ok) throw Error("تعذر تحميل التنبيهات. حاول تحديثها.");
    setQueue(await r.json());
    setMessage("");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      if (!document.hidden)
        refresh(controller.signal).catch((e) => {
          if (e.name !== "AbortError") setMessage(e.message);
        });
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [refresh]);
  const count = (state: string) => queue?.states.find((r) => r.state === state)?._count._all || 0;
  const renderNotification = (n: Queue["notifications"][number]) => (
    <article key={n.id} className="factory-notification">
      <div>
        {n.payload.orderId ? (
          <Link href={"/admin/orders/" + n.payload.orderId}>
            {labels[n.kind] || "تحديث طلب"} · <bdi>{n.payload.orderId.slice(0, 8)}</bdi>
          </Link>
        ) : (
          labels[n.kind] || "تحديث طلب"
        )}
        <p>
          {new Date(n.createdAt).toLocaleString("ar-EG")} ·{" "}
          {n.state === "CAPTURED"
            ? "حُفظ محلياً"
            : n.state === "FAILED"
              ? "تعذرت المعالجة — تحتاج مراجعة"
              : "ينتظر المعالجة المحلية"}
        </p>
      </div>
      {owner && n.state === "FAILED" ? (
        <button
          className="admin-button admin-button-secondary"
          onClick={async () => {
            try {
              const r = await fetch("/api/admin/commerce", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  action: "retryNotification",
                  id: n.id,
                  key: crypto.randomUUID(),
                }),
              });
              if (r.ok) await refresh();
              else setMessage("تعذرت إعادة المحاولة. حدّث القائمة.");
            } catch {
              setMessage("تعذر الاتصال. حاول تحديث التنبيهات.");
            }
          }}
        >
          إعادة محاولة التنبيه
        </button>
      ) : null}
    </article>
  );
  return (
    <section className="admin-panel">
      <div className="factory-section-heading">
        <h2>ما الذي يحتاج متابعة؟</h2>
        <button
          type="button"
          className="admin-button admin-button-secondary"
          onClick={() => refresh().catch((e) => setMessage(e.message))}
        >
          تحديث التنبيهات
        </button>
      </div>
      <p role="status">{message}</p>
      {queue ? (
        <>
          <div className="factory-queue">
            {[
              ["AWAITING_PAYMENT", "بانتظار الدفع", count("AWAITING_PAYMENT")],
              ["PAYMENT_REVIEW", "مراجعة التحويل", queue.review],
              ["CONFIRMED", "مؤكد للبدء", count("CONFIRMED")],
              ["IN_PRODUCTION", "قيد التصنيع", count("IN_PRODUCTION")],
              ["READY", "جاهز للشحن", count("READY")],
              ["SHIPPED", "قيد التسليم", count("SHIPPED")],
            ].map(([state, label, value]) => (
              <button type="button" key={state} onClick={() => select(String(state))}>
                <span>{label}</span>
                <strong>{Number(value).toLocaleString("ar-EG")}</strong>
              </button>
            ))}
          </div>
          <h3>آخر التنبيهات</h3>
          <p className="admin-muted">
            التنبيهات محفوظة محلياً في الاختبار. لا توجد رسائل بريد أو واتساب خارجية مفعلة.
          </p>
          {queue.notifications.length ? (
            queue.notifications.slice(0, 4).map(renderNotification)
          ) : (
            <p>لا توجد تنبيهات حتى الآن.</p>
          )}
          {queue.notifications.length > 4 ? (
            <details>
              <summary>تنبيهات سابقة ({queue.notifications.length - 4})</summary>
              {queue.notifications.slice(4).map(renderNotification)}
            </details>
          ) : null}
        </>
      ) : (
        <p>جارٍ تحميل قائمة المتابعة…</p>
      )}
    </section>
  );
}
