"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { parsePriceMinor } from "@/lib/admin/price";
import { decimalFromMinor, formatMoneyMinor } from "@/lib/money";
type Row = {
  refundedMinor: string;
  creditedMinor: string;
  reviewPending?: boolean;
  shipment?: { state: string; collectionState: string } | null;
  snapshot?: {
    address: {
      recipient: string;
      phone: string;
      line1: string;
      city: string;
      region: string;
      country: string;
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
    snapshot: { titleAr: string };
  }[];
  payments?: {
    id: string;
    state: string;
    method: string;
    amountMinor: string;
    claimReference?: string | null;
  }[];
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
    [filter, setFilter] = useState("");
  const money = (n: string) => formatMoneyMinor(Number(n), "ar", "EGP");
  const load = useCallback(async () => {
    const r = await fetch(
      "/api/admin/commerce?" +
        (orderId ? "id=" + orderId : "q=" + encodeURIComponent(q) + "&state=" + filter),
      { cache: "no-store" },
    );
    if (!r.ok) throw Error("تعذر تحميل البيانات أو لا توجد صلاحية.");
    const body = await r.json();
    if (orderId) setOrder(body);
    else setData(body);
  }, [orderId, q, filter]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      "/api/admin/commerce?" +
        (orderId ? "id=" + orderId : "q=" + encodeURIComponent(q) + "&state=" + filter),
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
  }, [orderId, q, filter]);
  async function action(body: unknown) {
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
            } as Record<string, string>
          )[result.error] || "العملية غير متاحة في الحالة الحالية. راجع الصلاحيات والمتطلبات.",
        );
      setMessage("تم تسجيل العملية الاختبارية في سجل التدقيق.");
      await load();
    } catch (e) {
      setMessage((e as Error).message);
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
              <p key={i.id}>
                {i.snapshot.titleAr} × {i.quantity} ·{" "}
                {i.manufacturingState === "NOT_STARTED"
                  ? "لم يبدأ التصنيع"
                  : states[i.manufacturingState] || i.manufacturingState}
              </p>
            ))}
            {order.snapshot ? (
              <address>
                <strong>{order.snapshot.address.recipient}</strong>
                <p>
                  <bdi>{order.snapshot.address.phone}</bdi>
                </p>
                <p>
                  {order.snapshot.address.line1} · {order.snapshot.address.city} ·{" "}
                  {order.snapshot.address.region} · {order.snapshot.address.country}
                </p>
              </address>
            ) : null}
            {order.reviewPending ? (
              <p className="admin-notice">
                الطلب متوقف للمراجعة بسبب مراجعة دفعة أو طلب إلغاء أو استرداد. لا يبدأ التصنيع أو الشحن قبل حسم
                المراجعة.
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
              <p key={p.id}>
                {states[p.state] || p.state} · {money(p.amountMinor)} · <bdi>{p.id}</bdi>
                {p.claimReference ? (
                  <>
                    <br />
                    مرجع التحويل: <bdi>{p.claimReference}</bdi>
                  </>
                ) : null}
              </p>
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
                <select name="kind">
                  <option value="REFUND">طلب استرداد اختباري</option>
                  <option value="VERIFY_TRANSFER">مطابقة بلاغ تحويل</option>
                </select>
              </label>
              <label>
                المبلغ بالجنيه المصري
                <input
                  name="amount"
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]{1,2})?"
                  required
                />
              </label>
              <label>
                معرّف الدفعة للتحويل (اختياري للاسترداد)
                <input name="paymentId" />
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
            <h2>سجل الطلب</h2>
            {order.events?.map((e) => (
              <p key={e.id}>
                <bdi>{e.kind}</bdi> · <bdi>{e.actorKey}</bdi> ·{" "}
                {new Date(e.createdAt).toLocaleString("ar-EG")}
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
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="أول أحرف الرقم"
                />
              </label>
              <label>
                الحالة
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
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
            {data.finance.map((f) => (
              <article className="admin-finance-row" key={f.id}>
                <p>
                  <Link href={"/admin/orders/" + f.orderId}>{f.orderId.slice(0, 8)}</Link> ·{" "}
                  {f.kind === "REFUND" ? "استرداد" : "مطابقة تحويل"} · {money(f.amountMinor)} ·{" "}
                  {states[f.state] || f.state}
                </p>
                <p>{f.reason}</p>
                <small>
                  الخطوة المعطلة تتطلب تفويضاً صالحاً، ومراجعاً مختلفاً عن مقدم الطلب، ومسؤول تسوية
                  مختلفاً عن المنفذ.
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
                        onClick={() =>
                          void action({ action: "financeTransition", id: f.id, transition })
                        }
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
      {settings && data ? (
        <>
          <section className="admin-panel">
            <h2>سياسة التشغيل الاصطناعية</h2>
            <p>
              هذه القيم للاختبار فقط، ولا تمثل سياسة مالية معتمدة للمصنع. تغيير السياسة يُبطل عروض
              الأسعار السابقة.
            </p>
            <dl>
              {Object.entries(data.policy?.configuration || {}).map(([k, v]) => (
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
          </section>
          <section className="admin-panel">
            <h2>التفويضات المالية المحددة</h2>
            <p>
              لا يحصل المدير على صلاحيات مالية افتراضياً. كل تفويض محدد بالعملية والسقف والمدة. منع
              اعتماد الطلب ذاتياً وفصل التسوية عن التنفيذ إلزاميان. هذه الحدود اصطناعية محلية.
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
            <h2>مناطق التوصيل</h2>
            {data.rates.map((r) => (
              <p key={r.id}>
                {r.region} · {r.carrier} · {money(r.feeMinor)} ·{" "}
                {r.enabled ? "مفعلة للاختبار" : "معطلة"}
              </p>
            ))}
            {owner ? (
              <form
                className="admin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action({
                    action: "rate",
                    country: "EG",
                    currency: "EGP",
                    region: f.get("region"),
                    carrier: f.get("carrier"),
                    feeMinor: String(formMinor(f.get("feeMinor"))),
                    leadDays: Number(f.get("leadDays")),
                    enabled: true,
                    codEnabled: false,
                    codFeeMinor: null,
                    codMaximumMinor: null,
                  });
                }}
              >
                <label>
                  منطقة اصطناعية
                  <input name="region" required maxLength={96} />
                </label>
                <label>
                  شركة توصيل اصطناعية
                  <input name="carrier" required maxLength={96} />
                </label>
                <label>
                  رسوم التوصيل بالجنيه
                  <input
                    name="feeMinor"
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    required
                  />
                </label>
                <label>
                  أيام التوصيل الاصطناعية
                  <input name="leadDays" type="number" min="1" max="365" required />
                </label>
                <button disabled={busy} className="admin-button">
                  إضافة خدمة اختبار — دون دفع عند الاستلام
                </button>
              </form>
            ) : null}
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
            {data.notifications.map((n) => (
              <p key={n.id}>
                <bdi>{n.kind}</bdi> · {n.locale} · {n.state} · محاولات {n.attempts}
              </p>
            ))}
          </section>
        </>
      ) : null}
    </>
  );
}
