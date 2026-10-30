"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ManualPaymentCard } from "@/components/manual-payment";
import { FactoryPaymentSettings, FactoryShippingSettings } from "./factory-settings";
import { FactoryWorkQueue } from "./factory-work-queue";
import { parsePriceMinor } from "@/lib/admin/price";
import { decimalFromMinor, formatMoneyMinor } from "@/lib/money";
type Row = {
  refundedMinor: string;
  creditedMinor: string;
  reviewPending?: boolean;
  shipment?: { state: string; collectionState: string } | null;
  snapshot?: {
    shipping?: { gross?: string; feeMinor?: string; carrier?: string };
    address: {
      recipient: string;
      phone: string;
      line1: string;
      city: string;
      region: string;
      country: string;
      area?: string;
      deliveryInstructions?: string;
    };
  };
  id: string;
  state: string;
  totalMinor: string;
  paidMinor: string;
  currency: string;
  createdAt: string;
  paymentMethod: string;
  items?: {
    id: string;
    quantity: number;
    type: string;
    manufacturingState: string;
    snapshot: {
      titleAr: string;
      variantAr?: string;
      imageUrl?: string;
      manufacturing?: { minProductionDays?: number; maxProductionDays?: number };
    };
  }[];
  payments?: {
    id: string;
    state: string;
    method: string;
    amountMinor: string;
    claimReference?: string | null;
    evidenceRequired?: boolean;
  }[];
  notes?: { id: string; kind: string; text: string; createdAt: string; author: { name: string } }[];
  events?: { id: string; kind: string; actorKey: string; createdAt: string }[];
};
type Finance = {
  id: string;
  orderId: string;
  kind: string;
  amountMinor: string;
  state: string;
  requestedBy: string;
  executedBy?: string | null;
  approvedBy?: string | null;
  reason: string;
};
type Policy = { version: number; configuration: Record<string, unknown> };
type Data = {
  viewerId: string;
  financeGrants: {
    id: string;
    adminId: string;
    operation: string;
    limitMinor: string;
    expiresAt: string;
    revoked: boolean;
  }[];
  staff: { id: string; name: string; roleCode: string }[];

  cancellations: { id: string; orderId: string; state: string; reason: string }[];
  orders: Row[];
  totalOrders: number;
  page: number;
  finance: Finance[];
  policy: Policy;
  rates: { id: string; region: string; carrier: string; feeMinor: string; enabled: boolean }[];
  notifications: { id: string; kind: string; locale: string; state: string; attempts: number }[];
};
const states: Record<string, string> = {
  AWAITING_PAYMENT: "بانتظار الدفع",
  CONFIRMED: "مؤكد",
  IN_PRODUCTION: "قيد التصنيع",
  READY: "جاهز",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
  EXPIRED: "منتهي",
  RETURNED: "مرتجع",
  REQUESTED: "بانتظار الموافقة",
  APPROVED: "معتمد",
  EXECUTED: "منفذ — ينتظر التسوية",
  RECONCILED: "تمت التسوية",
  REJECTED: "مرفوض",
  CLAIMED: "بلاغ تحويل غير متحقق",
  SUCCEEDED: "دفعة مطابقة",
};
function formMinor(value: FormDataEntryValue | null) {
  try {
    return parsePriceMinor(String(value));
  } catch {
    return null;
  }
}
const financialLabels: Record<string, string> = {
  PAYMENT_VERIFY: "مطابقة الدفعات",
  REFUND_REQUEST: "طلب استرداد",
  REFUND_APPROVE: "اعتماد الاسترداد",
  REFUND_EXECUTE: "تنفيذ استرداد وهمي",
  RECONCILE: "التسوية المالية",
};
const policyLabels: Record<string, string> = {
  currency: "العملة",
  taxMode: "معالجة الضريبة",
  taxRateBps: "نسبة الضريبة (%)",
  taxRounding: "تقريب الضريبة",
  discountMode: "الخصومات",
  depositRounding: "تقريب العربون",
  shippingTaxable: "خضوع التوصيل للضريبة",
  shippingCollection: "تحصيل توصيل الدفع المسبق",
  codShippingCollection: "تحصيل توصيل الدفع عند الاستلام",
  fixedDepositBasis: "أساس العربون الثابت",
  mixedCart: "القطع الجاهزة والتصنيع معاً",
  balanceDue: "تحصيل الرصيد",
  holdSeconds: "مهلة حجز البطاقة (ثانية)",
  manualHoldSeconds: "مهلة التحويل (ثانية)",
  allowGuest: "طلب الضيف",
  syntheticGuestContact: "بيانات ضيف اصطناعية فقط",
  allowUnpaidCancellation: "إلغاء الطلب غير المدفوع",
  allowMockRefunds: "استرداد وهمي محلي",
  financeSelfApproval: "اعتماد الطلب المالي ذاتياً",
  distinctReconciler: "فصل التنفيذ عن التسوية",
  international: "الطلب الدولي",
  externalNotifications: "رسائل خارجية",
};
const policyValues: Record<string, string> = {
  EGP: "الجنيه المصري",
  INCLUSIVE: "شاملة",
  EXCLUSIVE: "غير شاملة",
  HALF_UP_LINE: "لأقرب قرش لكل بند",
  DISABLED: "معطلة",
  CEILING_LINE: "لأعلى لكل بند",
  UPFRONT: "مقدماً",
  AT_DELIVERY: "عند التسليم",
  PER_LINE: "لكل بند",
  SPLIT_REQUIRED: "طلبان منفصلان",
  BEFORE_DISPATCH: "قبل الشحن",
};
export function AdminCommercePanel({
  orderId,
  settings = false,
  owner = false,
}: {
  orderId?: string;
  settings?: boolean;
  owner?: boolean;
}) {
  const [data, setData] = useState<Data | null>(null),
    [order, setOrder] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(0),
    [financeKind, setFinanceKind] = useState("VERIFY_TRANSFER");
  const money = (n: string) => formatMoneyMinor(Number(n), "ar", "EGP");
  const load = useCallback(async () => {
    const r = await fetch(
      "/api/admin/commerce?" +
        (orderId
          ? "id=" + orderId
          : "q=" + encodeURIComponent(q) + "&state=" + filter + "&page=" + page),
      { cache: "no-store" },
    );
    if (!r.ok) throw Error("تعذر تحميل البيانات أو لا توجد صلاحية.");
    const body = await r.json();
    if (orderId) setOrder(body);
    else setData(body);
  }, [orderId, q, filter, page]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      "/api/admin/commerce?" +
        (orderId
          ? "id=" + orderId
          : "q=" + encodeURIComponent(q) + "&state=" + filter + "&page=" + page),
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw Error("تعذر تحميل البيانات أو لا توجد صلاحية.");
        return r.json();
      })
      .then((body) => {
        if (orderId) setOrder(body);
        else setData(body);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setMessage(e.message);
      });
    return () => controller.abort();
  }, [orderId, q, filter, page]);
  async function action(body: unknown) {
    const intent = body as { action?: string; transition?: string; approve?: boolean };
    if (
      (intent.action === "financeTransition" ||
        (intent.action === "cancellation" && intent.approve) ||
        (intent.action === "fulfill" &&
          ["cod_collected", "cod_reconciled", "returned", "failed", "delivered"].includes(
            intent.transition || "",
          ))) &&
      !window.confirm("تأكيد تسجيل هذه العملية للطلب؟ ستُحفظ في سجل المتابعة والمراجعة.")
    )
      return false;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/commerce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok)
        throw Error(
          (
            {
              FINANCIAL_PERMISSION_REQUIRED:
                "تحتاج هذه العملية تفويضاً مالياً صريحاً وحداً للمبلغ.",
              SELF_APPROVAL_OR_STATE_INVALID: "لا يمكن اعتماد طلبك بنفسك، أو أن الحالة تغيرت.",
              SEPARATE_RECONCILER_REQUIRED: "التسوية تحتاج مسؤولاً مختلفاً عن المنفذ.",
              BALANCE_REQUIRED: "يجب سداد الرصيد قبل الشحن.",
              PRODUCTION_PAYMENT_REQUIRED: "التصنيع يتطلب دفعة أولى متحققة.",
              APPROVAL_REQUIRED: "الموافقة مطلوبة أولاً.",
              PAYMENT_EVIDENCE_REQUIRED: "يلزم رفع صورة التحويل قبل طلب المطابقة.",
              CUSTOMER_EXPLANATION_REQUIRED: "اكتب سبباً واضحاً للعميل عند رفض الإثبات.",
              SETTINGS_CONFLICT: "تغيرت الإعدادات. حدّث الصفحة وراجعها قبل الحفظ.",
              COD_CONFIGURATION_REQUIRED:
                "أدخل رسوم التحصيل وسقف الطلب قبل إتاحة الدفع عند الاستلام.",
              INVALID_INPUT: "راجع الحقول المطلوبة والمبالغ وتعليمات التحويل قبل الحفظ.",
            } as Record<string, string>
          )[result.error] || "العملية غير متاحة في الحالة الحالية. راجع الصلاحيات والمتطلبات.",
        );
      setMessage("تم تسجيل العملية الاختبارية في سجل التدقيق.");
      await load();
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="admin-notice">
        محاكاة محلية فقط. لا يوجد تحصيل حقيقي أو شحن فعلي. صلاحية الدخول وحدها لا تمنح صلاحيات
        مالية.
      </p>
      <p role="status">{message}</p>
      <button
        type="button"
        className="admin-button admin-button-secondary"
        onClick={() => load().catch((e) => setMessage(e.message))}
      >
        تحديث البيانات
      </button>
      {!data && !order && !message ? <p role="status">جارٍ تحميل البيانات…</p> : null}
      {!orderId && !settings ? (
        <FactoryWorkQueue
          select={(value) => {
            setFilter(value);
            setPage(0);
          }}
          owner={owner}
        />
      ) : null}
      {orderId && order ? (
        <>
          <section className="admin-panel">
            <h2>
              طلب <bdi>{order.id.slice(0, 8)}</bdi> · {states[order.state] || order.state}
            </h2>
            <p>
              الإجمالي {money(order.totalMinor)} · الدفعات المتحققة {money(order.paidMinor)} ·
              المسترد {money(order.refundedMinor)} · الرصيد{" "}
              {money(
                String(
                  BigInt(order.totalMinor) -
                    BigInt(order.creditedMinor) -
                    BigInt(order.paidMinor) +
                    BigInt(order.refundedMinor),
                ),
              )}{" "}
              · {order.paymentMethod}
            </p>
            {order.items?.map((i) => (
              <article key={i.id} className="factory-item">
                {i.snapshot.imageUrl ? (
                  <Image src={i.snapshot.imageUrl} alt="" width={64} height={76} unoptimized />
                ) : null}
                <div>
                  <h3>
                    {i.snapshot.titleAr} × {i.quantity}
                  </h3>
                  {i.snapshot.variantAr ? <p>الخيار: {i.snapshot.variantAr}</p> : null}
                  <p>
                    {i.type === "MADE_TO_ORDER"
                      ? i.manufacturingState === "NOT_STARTED"
                        ? "لم يبدأ التصنيع"
                        : i.manufacturingState === "IN_PROGRESS"
                          ? "التصنيع جارٍ"
                          : "اكتمل التصنيع"
                      : "قطعة جاهزة"}
                  </p>
                  {i.snapshot.manufacturing?.minProductionDays &&
                  i.snapshot.manufacturing.maxProductionDays ? (
                    <p>
                      مدة التصنيع المسجلة: {i.snapshot.manufacturing.minProductionDays}–
                      {i.snapshot.manufacturing.maxProductionDays} يوم
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
            {order.snapshot?.shipping ? (
              <p>
                خدمة التوصيل: {order.snapshot.shipping.carrier} · الرسوم:{" "}
                {money(order.snapshot.shipping.gross || order.snapshot.shipping.feeMinor || "0")}
              </p>
            ) : null}
            {order.snapshot ? (
              <address>
                <strong>{order.snapshot.address.recipient}</strong>
                <p>
                  <bdi>{order.snapshot.address.phone}</bdi>
                </p>
                <p>
                  {order.snapshot.address.line1} · {order.snapshot.address.city} ·{" "}
                  {order.snapshot.address.region} · {order.snapshot.address.area} ·{" "}
                  {order.snapshot.address.country}
                </p>
                {order.snapshot.address.deliveryInstructions ? (
                  <p>تعليمات العميل: {order.snapshot.address.deliveryInstructions}</p>
                ) : null}
                <a
                  href={"tel:" + order.snapshot.address.phone}
                  className="admin-button admin-button-secondary"
                >
                  الاتصال بالعميل
                </a>
              </address>
            ) : null}
            {order.reviewPending ? (
              <p className="admin-notice">
                الطلب متوقف للمراجعة بسبب مراجعة دفعة أو طلب إلغاء أو استرداد. لا يبدأ التصنيع أو
                الشحن قبل حسم المراجعة.
              </p>
            ) : null}
            <div className="admin-shortcuts">
              {(
                [
                  ["start", "بدء التصنيع"],
                  ["ready", "جاهز للشحن"],
                  ["delivered", "تأكيد التسليم"],
                  ["failed", "فشل التسليم"],
                  ["returned", "فحص وإعادة المخزون"],
                  ["cod_collected", "تسجيل تحصيل المندوب"],
                  ["cod_reconciled", "تسوية تحصيل المندوب"],
                ] as const
              )
                .filter(() => !order.reviewPending)
                .filter(([transition]) =>
                  transition === "start"
                    ? order.state === "CONFIRMED" &&
                      order.items?.every((i) => i.type === "MADE_TO_ORDER")
                    : transition === "ready"
                      ? ["CONFIRMED", "IN_PRODUCTION"].includes(order.state)
                      : transition === "delivered" || transition === "failed"
                        ? order.shipment?.state === "DISPATCHED"
                        : transition === "returned"
                          ? order.shipment?.state === "FAILED"
                          : order.paymentMethod === "COD" &&
                            order.shipment?.state === "DELIVERED" &&
                            (transition === "cod_collected"
                              ? order.shipment.collectionState === "NOT_COLLECTED"
                              : order.shipment.collectionState === "COLLECTED"),
                )
                .map(([transition, label]) => (
                  <button
                    disabled={busy}
                    className="admin-button admin-button-secondary"
                    key={transition}
                    onClick={() => void action({ action: "fulfill", orderId, transition })}
                  >
                    {label}
                  </button>
                ))}
            </div>
            {order.state === "READY" && !order.reviewPending ? (
              <>
                <form
                  className="admin-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action({
                      action: "fulfill",
                      orderId,
                      transition: "dispatch",
                      reference: f.get("reference"),
                    });
                  }}
                >
                  <label>
                    مرجع الشحن الاصطناعي
                    <input name="reference" minLength={4} required maxLength={191} />
                  </label>
                  <button disabled={busy} className="admin-button">
                    تسجيل الشحن
                  </button>
                </form>
              </>
            ) : null}
          </section>
          <section className="admin-panel">
            <h2>الدفعات والمراجعة المالية</h2>
            {order.payments?.map((p) => (
              <article key={p.id}>
                <p>
                  {states[p.state] || p.state} · {money(p.amountMinor)} · <bdi>{p.id}</bdi>
                  {p.claimReference ? (
                    <>
                      <br />
                      مرجع التحويل: <bdi>{p.claimReference}</bdi>
                    </>
                  ) : null}
                </p>
                {p.evidenceRequired ? <ManualPaymentCard payment={p} ar staff /> : null}
              </article>
            ))}
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action({
                  action: "financeRequest",
                  orderId,
                  kind: f.get("kind"),
                  amount: String(formMinor(f.get("amount"))),
                  ...(f.get("paymentId") ? { paymentId: f.get("paymentId") } : {}),
                  reason: f.get("reason"),
                  key: crypto.randomUUID(),
                });
              }}
            >
              <label>
                العملية
                <select
                  name="kind"
                  aria-label="العملية"
                  value={financeKind}
                  onChange={(e) => setFinanceKind(e.target.value)}
                >
                  <option value="VERIFY_TRANSFER">مطابقة تحويل يدوي</option>
                  <option value="REFUND">طلب استرداد اختباري</option>
                </select>
              </label>
              <label>
                المبلغ بالجنيه المصري
                <input
                  name="amount"
                  readOnly={financeKind === "VERIFY_TRANSFER"}
                  defaultValue={
                    order.payments?.find((p) => p.state === "CLAIMED")
                      ? decimalFromMinor(
                          Number(order.payments.find((p) => p.state === "CLAIMED")!.amountMinor),
                        )
                      : ""
                  }
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]{1,2})?"
                  required
                />
              </label>
              <label>
                دفعة التحويل (اختيارية للاسترداد)
                <select
                  name="paymentId"
                  defaultValue={order.payments?.find((p) => p.state === "CLAIMED")?.id || ""}
                  required={financeKind === "VERIFY_TRANSFER"}
                  onChange={(e) => {
                    const payment = order.payments?.find((p) => p.id === e.target.value);
                    const amount = e.target.form?.elements.namedItem(
                      "amount",
                    ) as HTMLInputElement | null;
                    if (payment && amount && financeKind === "VERIFY_TRANSFER")
                      amount.value = decimalFromMinor(Number(payment.amountMinor));
                  }}
                >
                  <option value="">اختر دفعة</option>
                  {order.payments
                    ?.filter((p) => p.state === "CLAIMED")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.method === "WALLET" ? "محفظة" : "InstaPay"} · {money(p.amountMinor)} ·{" "}
                        {p.claimReference || p.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                سبب موثق
                <textarea name="reason" minLength={8} maxLength={500} required />
              </label>
              <button disabled={busy} className="admin-button">
                إنشاء طلب مراجعة
              </button>
            </form>
            <Link href="/admin/orders">متابعة الاعتماد والتنفيذ والتسوية</Link>
          </section>
          <section className="admin-panel">
            <h2>ملاحظات فريق المصنع</h2>
            <p>هذه الملاحظات داخلية ولا تظهر للعميل.</p>
            {order.notes?.map((note) => (
              <article key={note.id} className="factory-note">
                <strong>
                  {note.kind === "MANUFACTURING" ? "التصنيع" : "متابعة الطلب"} · {note.author.name}
                </strong>
                <p>{note.text}</p>
                <small>{new Date(note.createdAt).toLocaleString("ar-EG")}</small>
              </article>
            ))}
            <form
              className="admin-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                if (
                  await action({
                    action: "note",
                    orderId,
                    kind: f.get("kind"),
                    text: f.get("text"),
                    key: crypto.randomUUID(),
                  })
                )
                  form.reset();
              }}
            >
              <label>
                نوع الملاحظة
                <select name="kind">
                  <option value="INTERNAL">متابعة داخلية</option>
                  <option value="MANUFACTURING">ملاحظة تصنيع</option>
                </select>
              </label>
              <label>
                الملاحظة
                <textarea name="text" required minLength={2} maxLength={1500} />
              </label>
              <button className="admin-button" disabled={busy}>
                إضافة ملاحظة داخلية
              </button>
            </form>
            <h2>سجل الطلب</h2>
            {order.events?.map((e) => (
              <p key={e.id}>
                {(
                  {
                    "order.created": "تسجيل الطلب",
                    "payment.initiated": "بدء دفعة",
                    "payment.evidence_submitted": "رفع إثبات تحويل",
                    "payment.verified": "مطابقة دفعة",
                    "payment.rejected": "رفض إثبات مع توضيح",
                    "order.shipped": "تسجيل شحنة",
                    "order.note_added": "إضافة ملاحظة داخلية",
                    "order.cancelled": "إلغاء الطلب",
                    "finance.requested": "طلب مراجعة مالية",
                    "finance.approve": "اعتماد المراجعة",
                    "finance.execute": "تنفيذ قرار المراجعة",
                    "finance.reconcile": "تسوية المراجعة",
                    "fulfillment.start": "بدء التصنيع",
                    "fulfillment.ready": "تجهيز للشحن",
                    "fulfillment.delivered": "تسجيل التسليم",
                    "fulfillment.cod_collected": "تسجيل تحصيل المندوب",
                    "fulfillment.cod_reconciled": "تسوية تحصيل المندوب",
                  } as Record<string, string>
                )[e.kind] || "تحديث موثق"}{" "}
                ·{" "}
                {e.actorKey.startsWith("staff:")
                  ? "فريق المصنع"
                  : e.actorKey.startsWith("guest:") || e.actorKey.startsWith("customer:")
                    ? "العميل"
                    : "النظام"}{" "}
                · {new Date(e.createdAt).toLocaleString("ar-EG")}
              </p>
            ))}
          </section>
        </>
      ) : null}
      {!orderId && !settings && data ? (
        <>
          <section className="admin-panel">
            <div className="admin-filter-grid">
              <label>
                بحث برقم الطلب
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(0);
                  }}
                  placeholder="أول أحرف الرقم"
                />
              </label>
              <label>
                الحالة
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="PAYMENT_REVIEW">مراجعة التحويلات</option>
                  <option value="">كل الحالات</option>
                  {Object.entries(states)
                    .slice(0, 9)
                    .map(([s, l]) => (
                      <option key={s} value={s}>
                        {l}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <p>
              عرض {data.orders.length ? data.page * 30 + 1 : 0}–
              {data.page * 30 + data.orders.length} من {data.totalOrders} طلباً
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption>طلبات الاختبار المحلية</caption>
                <thead>
                  <tr>
                    <th>الطلب</th>
                    <th>الحالة</th>
                    <th>الإجمالي</th>
                    <th>المطابق</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={"/admin/orders/" + o.id}>
                          <bdi>{o.id.slice(0, 8)}</bdi>
                        </Link>
                      </td>
                      <td>{states[o.state] || o.state}</td>
                      <td>{money(o.totalMinor)}</td>
                      <td>{money(o.paidMinor)}</td>
                      <td>{new Date(o.createdAt).toLocaleDateString("ar-EG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.orders.length ? <p>لا توجد طلبات مطابقة.</p> : null}
              <div className="admin-shortcuts">
                <button
                  type="button"
                  className="admin-button admin-button-secondary"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  السابق
                </button>
                <button
                  type="button"
                  className="admin-button admin-button-secondary"
                  disabled={(page + 1) * 30 >= data.totalOrders}
                  onClick={() => setPage(page + 1)}
                >
                  التالي
                </button>
              </div>
            </div>
          </section>
          <section className="admin-panel">
            <h2>طلبات الإلغاء</h2>
            {data.cancellations.map((c) => (
              <article key={c.id} className="admin-finance-row">
                <Link href={"/admin/orders/" + c.orderId}>{c.orderId.slice(0, 8)}</Link>
                <p>{states[c.state] || c.state}</p>
                {c.state === "REQUESTED" ? (
                  <div className="admin-shortcuts">
                    <button
                      className="admin-button"
                      disabled={busy}
                      onClick={() =>
                        void action({ action: "cancellation", id: c.id, approve: true })
                      }
                    >
                      مراجعة واعتماد الإلغاء دون استرداد تلقائي
                    </button>
                    <button
                      className="admin-button admin-button-secondary"
                      disabled={busy}
                      onClick={() =>
                        void action({ action: "cancellation", id: c.id, approve: false })
                      }
                    >
                      رفض الإلغاء
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
            <h2>مراجعات مالية</h2>
            <p>
              طلب ← موافقة من مسؤول مختلف ← تنفيذ وهمي ← تسوية من مسؤول مختلف عن المنفذ. كل خطوة
              تتطلب تفويضاً صريحاً.
            </p>
            {data.finance
              .filter((f) => !["RECONCILED", "REJECTED"].includes(f.state))
              .map((f) => (
                <article className="admin-finance-row" key={f.id}>
                  <p>
                    <Link href={"/admin/orders/" + f.orderId}>{f.orderId.slice(0, 8)}</Link> ·{" "}
                    {f.kind === "REFUND" ? "استرداد" : "مطابقة تحويل"} · {money(f.amountMinor)} ·{" "}
                    {states[f.state] || f.state}
                  </p>
                  <p>{f.reason}</p>
                  <small>
                    الخطوة المعطلة تتطلب تفويضاً صالحاً، ومراجعاً مختلفاً عن مقدم الطلب، ومسؤول
                    تسوية مختلفاً عن المنفذ.
                  </small>
                  <div className="admin-shortcuts">
                    {(
                      [
                        ["approve", "اعتماد"],
                        ["reject", "رفض"],
                        ["execute", "تنفيذ وهمي"],
                        ["reconcile", "تسوية"],
                      ] as const
                    )
                      .filter(([transition]) =>
                        transition === "approve" || transition === "reject"
                          ? f.state === "REQUESTED"
                          : transition === "execute"
                            ? f.state === "APPROVED"
                            : f.state === "EXECUTED",
                      )
                      .map(([transition, label]) => (
                        <button
                          disabled={
                            busy ||
                            ((transition === "approve" || transition === "reject") &&
                              f.requestedBy === data.viewerId) ||
                            (transition === "reconcile" && f.executedBy === data.viewerId) ||
                            !data.financeGrants.some(
                              (g) =>
                                g.adminId === data.viewerId &&
                                !g.revoked &&
                                new Date(g.expiresAt) > new Date() &&
                                BigInt(g.limitMinor) >= BigInt(f.amountMinor) &&
                                g.operation ===
                                  (f.kind === "VERIFY_TRANSFER"
                                    ? transition === "reconcile"
                                      ? "RECONCILE"
                                      : "PAYMENT_VERIFY"
                                    : transition === "approve" || transition === "reject"
                                      ? "REFUND_APPROVE"
                                      : transition === "execute"
                                        ? "REFUND_EXECUTE"
                                        : "RECONCILE"),
                            )
                          }
                          key={transition}
                          className="admin-button admin-button-secondary"
                          onClick={() => {
                            const explanation =
                              transition === "reject" && f.kind === "VERIFY_TRANSFER"
                                ? window.prompt("سبب رفض الإثبات المرسل للعميل (8 أحرف على الأقل)")
                                : undefined;
                            if (explanation === null) return;
                            void action({
                              action: "financeTransition",
                              id: f.id,
                              transition,
                              ...(explanation ? { customerExplanation: explanation } : {}),
                            });
                          }}
                        >
                          {label}
                        </button>
                      ))}
                  </div>
                </article>
              ))}
          </section>
        </>
      ) : null}
      {!orderId && !settings && data ? (
        <section className="admin-panel">
          <details>
            <summary>المراجعات المالية المكتملة</summary>
            {data.finance
              .filter((f) => ["RECONCILED", "REJECTED"].includes(f.state))
              .map((f) => (
                <p key={f.id}>
                  <Link href={"/admin/orders/" + f.orderId}>
                    <bdi>{f.orderId.slice(0, 8)}</bdi>
                  </Link>{" "}
                  · {f.kind === "REFUND" ? "استرداد" : "مطابقة تحويل"} · {money(f.amountMinor)} ·{" "}
                  {states[f.state]}
                </p>
              ))}
          </details>
        </section>
      ) : null}
      {settings && data ? (
        <>
          <FactoryPaymentSettings
            configuration={data.policy?.configuration || {}}
            version={data.policy?.version || 1}
            submit={action}
            busy={busy}
            owner={owner}
          />
          <FactoryShippingSettings rates={data.rates} submit={action} busy={busy} owner={owner} />
          <section className="admin-panel">
            <details>
              <summary>سياسة الاختبار — إعدادات متقدمة</summary>
              <h2>سياسة التشغيل الاصطناعية</h2>
              <p>
                هذه القيم للاختبار فقط، ولا تمثل سياسة مالية معتمدة للمصنع. تغيير السياسة يُبطل عروض
                الأسعار السابقة.
              </p>
              <dl>
                {Object.entries(data.policy?.configuration || {})
                  .filter(([k]) => k !== "manualInstructions")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{policyLabels[k] || k}</dt>
                      <dd>
                        {k === "taxRateBps"
                          ? decimalFromMinor(Number(v))
                          : typeof v === "boolean"
                            ? v
                              ? "نعم"
                              : "لا"
                            : policyValues[String(v)] || String(v)}
                      </dd>
                    </div>
                  ))}
              </dl>
              {owner ? (
                <form
                  className="admin-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action({
                      action: "policy",
                      version: data.policy.version,
                      configuration: {
                        ...data.policy.configuration,
                        taxMode: f.get("taxMode"),
                        taxRateBps: formMinor(f.get("taxRateBps")),
                        holdSeconds: Number(f.get("holdSeconds")),
                      },
                    });
                  }}
                >
                  <label>
                    طريقة الضريبة
                    <select name="taxMode" defaultValue={String(data.policy.configuration.taxMode)}>
                      <option value="INCLUSIVE">شاملة</option>
                      <option value="EXCLUSIVE">غير شاملة</option>
                    </select>
                  </label>
                  <label>
                    نسبة ضريبة اصطناعية (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      name="taxRateBps"
                      defaultValue={decimalFromMinor(Number(data.policy.configuration.taxRateBps))}
                      required
                    />
                  </label>
                  <label>
                    مهلة الحجز بالثواني
                    <input
                      type="number"
                      min="30"
                      max="86400"
                      name="holdSeconds"
                      defaultValue={Number(data.policy.configuration.holdSeconds)}
                      required
                    />
                  </label>
                  <button className="admin-button" disabled={busy}>
                    حفظ سياسة الاختبار
                  </button>
                </form>
              ) : null}
            </details>
          </section>
          <section className="admin-panel">
            <details>
              <summary>تفويض المسؤولين الماليين ومراجعة الحدود</summary>
              <h2>التفويضات المالية المحددة</h2>
              <p>
                لا يحصل المدير على صلاحيات مالية افتراضياً. كل تفويض محدد بالعملية والسقف والمدة.
                منع اعتماد الطلب ذاتياً وفصل التسوية عن التنفيذ إلزاميان. هذه الحدود اصطناعية محلية.
              </p>
              {data.financeGrants.map((g) => (
                <p key={g.id}>
                  <bdi>{data.staff.find((s) => s.id === g.adminId)?.name || g.adminId}</bdi> ·{" "}
                  {financialLabels[g.operation] || g.operation} · {money(g.limitMinor)} ·{" "}
                  {g.revoked ? "ملغي" : "محدد المدة"}
                </p>
              ))}
              {owner ? (
                <form
                  className="admin-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action({
                      action: "grant",
                      adminId: f.get("adminId"),
                      operation: f.get("operation"),
                      limitMinor: String(formMinor(f.get("limitMinor"))),
                      days: Number(f.get("days")),
                      revoked: f.get("revoked") === "on",
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <label>
                    المسؤول المفوض
                    <select name="adminId" required>
                      {data.staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.roleCode === "OWNER" ? "مالك" : "مدير"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    الصلاحية
                    <select name="operation" required>
                      {[
                        "PAYMENT_VERIFY",
                        "REFUND_REQUEST",
                        "REFUND_APPROVE",
                        "REFUND_EXECUTE",
                        "RECONCILE",
                      ].map((o) => (
                        <option value={o} key={o}>
                          {financialLabels[o]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    سقف العملية بالجنيه (حتى 10000 للاختبار)
                    <input
                      name="limitMinor"
                      inputMode="decimal"
                      pattern="[0-9]+([.][0-9]{1,2})?"
                      required
                    />
                  </label>
                  <label>
                    المدة بالأيام (حتى 30)
                    <input name="days" type="number" min="1" max="30" required />
                  </label>
                  <label>
                    سبب التفويض أو الإلغاء
                    <textarea name="reason" minLength={8} maxLength={500} required />
                  </label>
                  <label>
                    <input name="revoked" type="checkbox" /> إلغاء التفويض
                  </label>
                  <button className="admin-button" disabled={busy}>
                    حفظ التفويض الصريح
                  </button>
                </form>
              ) : null}
            </details>
          </section>
          <section className="admin-panel">
            <h2>التنبيهات المحلية ومهام الاستعادة</h2>
            <button
              className="admin-button"
              disabled={busy}
              onClick={() => void action({ action: "jobs" })}
            >
              تحرير الحجوزات المنتهية والتقاط التنبيهات
            </button>
            <p>لا يُرسل بريد أو رسائل خارجية. الالتقاط في ملفات محلية خاصة.</p>
            <details>
              <summary>سجل التنبيهات المحلية</summary>
              {data.notifications.map((n) => (
                <p key={n.id}>
                  <bdi>{n.kind}</bdi> · {n.locale} · {n.state} · محاولات {n.attempts}
                </p>
              ))}
            </details>
          </section>
        </>
      ) : null}
    </>
  );
}
