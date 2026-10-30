"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { nextDate } from "@/lib/reports/calendar";
type Money = {
  codCount: string;
  walletCount: string;
  instapayCount: string;
  codPending: string;
  currency: string;
  orderValue: string;
  outstanding: string;
  collected: string;
  refunded: string;
  cod: string;
  wallet: string;
  instapay: string;
  deposits: string;
  netCollected: string;
};
type Product = {
  productId: string;
  titleAr: string;
  titleEn: string | null;
  imageUrl: string | null;
  type: string;
  currency: string;
  units: number;
  valueMinor: string;
};
type Report = {
  daily: { date: string; orders: number; currencies: Money[] }[];
  pendingPayments: { currency: string; method: string; pendingMinor: string; rejected: number }[];
  unpaidOrders: number;
  awaitingFulfillment: number;
  products: Product[];
  productTypes: { currency: string; type: string; units: number; valueMinor: string }[];
  operations: {
    unverifiedEvidence: number;
    lowStock: number;
    outOfStock: number;
    manufacturing: {
      awaitingPayment: number;
      pending: number;
      inProgress: number;
      completed: number;
    };
  };
  totalOrders: number;
  states: Record<string, number>;
  currencies: Money[];
  start: string;
  end: string;
  timezone: string;
};
function imageUrl(src: string | null) {
  if (!src) return null;
  if (src.startsWith("/assets/") && !src.startsWith("//")) return src;
  try {
    const u = new URL(src);
    return (u.protocol === "https:" && !u.username && !u.password) ||
      (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))
      ? src
      : null;
  } catch {
    return null;
  }
}
function money(value: string, code: string, locale: string) {
  const n = BigInt(value),
    abs = n < BigInt(0) ? -n : n,
    parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(n < BigInt(0) ? -1 : 0),
    whole = new Intl.NumberFormat(locale).format(abs / BigInt(100)),
    fraction = new Intl.NumberFormat(locale, {
      minimumIntegerDigits: 2,
      useGrouping: false,
    }).format(Number(abs % BigInt(100)));
  return parts
    .map((p) => (p.type === "integer" ? whole : p.type === "fraction" ? fraction : p.value))
    .join("");
}
const status: Record<string, [string, string]> = {
  AWAITING_PAYMENT: ["بانتظار الدفع", "Awaiting payment"],
  CONFIRMED: ["مؤكد", "Confirmed"],
  IN_PRODUCTION: ["قيد التصنيع", "In production"],
  READY: ["جاهز للشحن", "Ready"],
  SHIPPED: ["تم الشحن", "Shipped"],
  DELIVERED: ["تم التسليم", "Delivered"],
  CANCELLED: ["ملغي", "Cancelled"],
  EXPIRED: ["منتهي", "Expired"],
  RETURNED: ["مرتجع", "Returned"],
};
export function ReportsPanel({ today }: { today: string }) {
  const [start, setStart] = useState(today),
    [end, setEnd] = useState(today),
    [query, setQuery] = useState({ start: today, end: today }),
    [data, setData] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [english, setEnglish] = useState(false);
  const t = (ar: string, en: string) => (english ? en : ar);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/admin/reports?start=${encodeURIComponent(query.start)}&end=${encodeURIComponent(query.end)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw Error(r.status === 400 ? "range" : "load");
        return (await r.json()) as Report;
      })
      .then((result) => {
        setData(result);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setData(null);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [query]);
  function apply(a: string, b: string) {
    setStart(a);
    setEnd(b);
    setLoading(true);
    setError("");
    setQuery({ start: a, end: b });
  }
  const first = today.slice(0, 8) + "01",
    prevEnd = nextDate(first, -1),
    prevStart = prevEnd.slice(0, 8) + "01";
  const presets: [[string, string], string, string][] = [
    [["اليوم", "Today"], today, today],
    [["أمس", "Yesterday"], nextDate(today, -1), nextDate(today, -1)],
    [["آخر ٧ أيام", "Last 7 days"], nextDate(today, -6), today],
    [["آخر ٣٠ يوماً", "Last 30 days"], nextDate(today, -29), today],
    [["هذا الشهر", "This month"], first, today],
    [["الشهر الماضي", "Previous month"], prevStart, prevEnd],
  ];
  return (
    <div lang={english ? "en" : "ar"} dir={english ? "ltr" : "rtl"}>
      <button
        className="admin-button admin-button-secondary"
        type="button"
        onClick={() => setEnglish(!english)}
      >
        {english ? "العربية" : "English"}
      </button>
      <section className="admin-panel">
        <h2>{t("الفترة", "Period")}</h2>
        <p>
          {t(
            "حسب توقيت القاهرة؛ يشمل التقرير اليومين المحددين.",
            "Cairo time; both selected dates are included.",
          )}
        </p>
        <div className="report-presets">
          {presets.map(([label, a, b]) => (
            <button
              key={label[1]}
              type="button"
              className="admin-button admin-button-secondary"
              onClick={() => apply(a, b)}
            >
              {t(...label)}
            </button>
          ))}
        </div>
        <form
          className="report-filters"
          onSubmit={(e) => {
            e.preventDefault();
            apply(start, end);
          }}
        >
          <label>
            {t("من", "From")}
            <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            {t("إلى", "To")}
            <input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button className="admin-button">{t("عرض التقرير", "Show report")}</button>
        </form>
      </section>
      <p role="status">
        {loading
          ? t("جارٍ إعداد التقرير…", "Loading report…")
          : error
            ? t(
                error === "range"
                  ? "اختر فترة صحيحة لا تتجاوز ٣١ يوماً."
                  : "تعذر إعداد التقرير. حاول مرة أخرى.",
                error === "range"
                  ? "Choose a valid period of at most 31 days."
                  : "Unable to load the report. Please try again.",
              )
            : ""}
      </p>
      {!loading && data ? (
        <>
          <section className="admin-panel">
            <h2>{t("ملخص الطلبات", "Order overview")}</h2>
            <p>
              {t("الطلبات المسجلة خلال الفترة", "Orders recorded during the period")}:{" "}
              <strong>{data.totalOrders.toLocaleString(english ? "en" : "ar-EG")}</strong>
            </p>
            <p>
              {t("طلبات غير مدفوعة ولها رصيد حالي", "Unpaid orders with an outstanding balance")}:{" "}
              <strong>{data.unpaidOrders}</strong>
            </p>
            <p>
              {t("بانتظار التجهيز أو الشحن", "Awaiting preparation or dispatch")}:{" "}
              <strong>{data.awaitingFulfillment}</strong>
            </p>
            {data.totalOrders ? (
              <ul>
                {Object.entries(data.states).map(([key, count]) => (
                  <li key={key}>
                    {status[key]?.[english ? 1 : 0] || key}:{" "}
                    {count.toLocaleString(english ? "en" : "ar-EG")}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("لا توجد طلبات في هذه الفترة.", "No orders in this period.")}</p>
            )}
          </section>
          {data.currencies.map((c) => (
            <section className="admin-panel" key={c.currency}>
              <h2>
                {t("حركة الأموال", "Payment activity")} · {c.currency}
              </h2>
              <p>
                {t(
                  "التحصيل حسب تاريخ التحقق، والاسترداد حسب تاريخ التسوية. الصافي ليس ربحاً محاسبياً.",
                  "Collections use verification dates and refunds use reconciliation dates. Net collections are not accounting profit.",
                )}
              </p>
              <dl className="report-grid">
                {[
                  ["orderValue", "قيمة الطلبات النشطة", "Active order value"],
                  [
                    "outstanding",
                    "الرصيد الحالي لطلبات الفترة",
                    "Current outstanding on period orders",
                  ],
                  ["collected", "التحصيل المتحقق", "Verified collections"],
                  ["refunded", "الاسترداد المطابق", "Reconciled refunds"],
                  ["netCollected", "الصافي بعد الاسترداد", "Net after refunds"],
                  ["cod", "الاستلام المطابق", "Reconciled COD"],
                  ["codPending", "رصيد COD غير مسوّى", "COD balance not reconciled"],
                  ["wallet", "المحافظ المتحققة", "Verified wallets"],
                  ["instapay", "InstaPay المتحقق", "Verified InstaPay"],
                  ["deposits", "الدفعات الأولى للتصنيع", "Manufacturing advances"],
                ].map(([key, ar, en]) => (
                  <div key={key}>
                    <dt>{t(ar, en)}</dt>
                    <dd>
                      <bdi>
                        {money(c[key as keyof Money], c.currency, english ? "en" : "ar-EG")}
                      </bdi>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <section className="admin-panel">
            <h2>{t("الطلبات والتحصيل اليومي", "Daily orders and collections")}</h2>
            <p>
              {t(
                "الطلبات حسب تاريخ إنشائها وتشمل الملغاة؛ التحصيل الإجمالي حسب تاريخ التحقق ولا يشمل الاسترداد.",
                "Orders use creation dates and include cancellations; gross collections use verification dates and exclude refunds.",
              )}
            </p>
            <div
              className="report-chart"
              role="region"
              aria-label={t("الطلبات والتحصيل لكل يوم", "Orders and collections by day")}
              tabIndex={0}
            >
              <table className="admin-table">
                <caption>{t("تفاصيل الأيام بتوقيت القاهرة", "Daily detail, Cairo time")}</caption>
                <thead>
                  <tr>
                    <th>{t("اليوم", "Date")}</th>
                    <th>{t("الطلبات", "Orders")}</th>
                    <th>{t("التحصيل الإجمالي", "Gross collections")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((day) => (
                    <tr key={day.date}>
                      <td>
                        <bdi>{day.date}</bdi>
                      </td>
                      <td>
                        <span
                          className="report-bar"
                          style={{
                            width: `${Math.min(100, (day.orders * 100) / Math.max(1, ...data.daily.map((d) => d.orders)))}%`,
                          }}
                          aria-hidden="true"
                        />
                        {day.orders}
                      </td>
                      <td>
                        {day.currencies.length
                          ? day.currencies.map((c) => (
                              <span key={c.currency}>
                                <span
                                  className="report-bar"
                                  aria-hidden="true"
                                  style={{
                                    width: `${(() => {
                                      const peak = data.daily.reduce((highest, row) => {
                                        const amount = BigInt(
                                          row.currencies.find(
                                            (item) => item.currency === c.currency,
                                          )?.collected ?? "0",
                                        );
                                        return amount > highest ? amount : highest;
                                      }, BigInt(0));
                                      return peak > BigInt(0)
                                        ? Number((BigInt(c.collected) * BigInt(100)) / peak)
                                        : 0;
                                    })()}%`,
                                  }}
                                />
                                <bdi>
                                  {money(c.collected, c.currency, english ? "en" : "ar-EG")}
                                </bdi>{" "}
                              </span>
                            ))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="admin-panel">
            <h2>{t("التحصيل حسب وسيلة الدفع", "Collections by payment method")}</h2>
            <p>
              {t(
                "مبالغ متحققة فقط؛ الدفعات الأولى ضمن الإجمالي وليست مبلغاً إضافياً.",
                "Verified amounts only; advances are included once in collections.",
              )}
            </p>
            {data.currencies.length ? (
              data.currencies.map((c) => (
                <div key={c.currency}>
                  <h3>{c.currency}</h3>
                  <ul className="report-breakdown">
                    {(
                      [
                        ["COD", c.cod],
                        [t("محفظة", "Wallet"), c.wallet],
                        ["InstaPay", c.instapay],
                        [
                          t("وسائل أخرى", "Other methods"),
                          String(
                            BigInt(c.collected) -
                              BigInt(c.cod) -
                              BigInt(c.wallet) -
                              BigInt(c.instapay),
                          ),
                        ],
                      ] as [string, string][]
                    ).map(([label, value]) => (
                      <li key={label}>
                        <span>{label}</span>
                        <span
                          className="report-bar"
                          style={{
                            width: `${BigInt(c.collected) > BigInt(0) ? Number((BigInt(value) * BigInt(100)) / BigInt(c.collected)) : 0}%`,
                          }}
                          aria-hidden="true"
                        />
                        <bdi>{money(value, c.currency, english ? "en" : "ar-EG")}</bdi>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p>{t("لا يوجد تحصيل في الفترة.", "No collections in this period.")}</p>
            )}
          </section>
          <section className="admin-panel">
            <h2>{t("القطع الجاهزة والتصنيع", "Ready-made and made-to-order")}</h2>
            <p>
              {t(
                "حسب عدد القطع المطلوبة في الطلبات النشطة، وليس المبالغ المحصّلة.",
                "Units ordered on active orders, not amounts collected.",
              )}
            </p>
            {data.productTypes.length ? (
              <ul className="report-breakdown">
                {data.productTypes.map((p) => (
                  <li key={p.currency + ":" + p.type}>
                    <span>
                      {p.type === "MADE_TO_ORDER"
                        ? t("تصنيع حسب الطلب", "Made to order")
                        : t("جاهز", "Ready made")}{" "}
                      · {p.currency}
                    </span>
                    <span
                      className="report-bar"
                      aria-hidden="true"
                      style={{
                        width: `${Math.min(100, (p.units * 100) / Math.max(1, ...data.productTypes.filter((x) => x.currency === p.currency).map((x) => x.units)))}%`,
                      }}
                    />
                    <strong>{p.units}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("لا توجد قطع مطلوبة.", "No units ordered.")}</p>
            )}
          </section>
          <section className="admin-panel">
            <h2>{t("عدد الدفعات المتحققة", "Verified payment counts")}</h2>
            {data.currencies.map((c) => (
              <p key={c.currency}>
                {c.currency} · COD: {c.codCount} · {t("محفظة", "Wallet")}: {c.walletCount} ·
                InstaPay: {c.instapayCount}
              </p>
            ))}
          </section>
          <section className="admin-panel">
            <h2>{t("تحويلات معلقة لطلبات الفترة", "Pending transfers for period orders")}</h2>
            <p>
              {t(
                "هذه مطالبات غير متحققة ولا تدخل في التحصيل.",
                "These claims are unverified and are excluded from collections.",
              )}
            </p>
            {data.pendingPayments.length ? (
              data.pendingPayments.map((p) => (
                <p key={p.currency + ":" + p.method}>
                  {p.method === "WALLET" ? t("محفظة", "Wallet") : "InstaPay"} ·{" "}
                  <bdi>{money(p.pendingMinor, p.currency, english ? "en" : "ar-EG")}</bdi> ·{" "}
                  {t("رفض حالي", "Currently rejected")}: {p.rejected}
                </p>
              ))
            ) : (
              <p>{t("لا توجد مطالبات معلقة.", "No pending claims.")}</p>
            )}
          </section>
          <section className="admin-panel">
            <h2>{t("متابعة العمليات", "Operations")}</h2>
            <p>
              {t("إثباتات التحويل التي تحتاج مراجعة الآن", "Transfer evidence awaiting review now")}
              : {data.operations.unverifiedEvidence}
            </p>
            <p>
              {t("متغيرات منخفضة المخزون الآن", "Variants currently low in stock")}:{" "}
              {data.operations.lowStock}
            </p>
            <p>
              {t("متغيرات نفد مخزونها الآن", "Variants currently out of stock")}:{" "}
              {data.operations.outOfStock}
            </p>
            <h3>{t("بنود التصنيع لطلبات الفترة", "Manufacturing items on period orders")}</h3>
            <p>
              {t("بانتظار الدفع", "Awaiting payment")}:{" "}
              {data.operations.manufacturing.awaitingPayment} ·{" "}
              {t("بانتظار التصنيع", "Awaiting production")}: {data.operations.manufacturing.pending}{" "}
              · {t("قيد التصنيع", "In production")}: {data.operations.manufacturing.inProgress} ·{" "}
              {t("اكتمل التصنيع", "Production complete")}: {data.operations.manufacturing.completed}
            </p>
            <p>
              {t(
                "حالات الطلبات أعلاه هي الحالة الحالية للطلبات التي أُنشئت في الفترة.",
                "The order statuses above are current states for orders created in the selected period.",
              )}
            </p>
          </section>
          <section className="admin-panel">
            <h2>{t("القطع الأكثر طلباً", "Most ordered products")}</h2>
            <p>
              {t(
                "الترتيب حسب عدد القطع للطلبات النشطة، والقيمة قبل رسوم التوصيل؛ لا يعني ذلك أن المبلغ محصّل.",
                "Ranked by units on active orders. Values exclude delivery and do not imply payment.",
              )}
            </p>
            {data.products.length ? (
              <div
                className="admin-table-wrap"
                tabIndex={0}
                role="region"
                aria-label={t("جدول المنتجات", "Product table")}
              >
                <table className="admin-table">
                  <caption>{t("أول ٢٠ منتجاً حسب الكمية", "Top 20 products by units")}</caption>
                  <thead>
                    <tr>
                      <th>{t("المنتج", "Product")}</th>
                      <th>{t("النوع", "Type")}</th>
                      <th>{t("القطع", "Units")}</th>
                      <th>{t("قيمة الطلب", "Ordered value")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p.currency + ":" + p.type + ":" + p.productId}>
                        <td>
                          {imageUrl(p.imageUrl) ? (
                            <Image
                              src={imageUrl(p.imageUrl)!}
                              width={48}
                              height={56}
                              alt=""
                              unoptimized
                              className="report-image"
                            />
                          ) : null}
                          {english ? p.titleEn || p.titleAr : p.titleAr}
                        </td>
                        <td>
                          {p.type === "MADE_TO_ORDER"
                            ? t("تصنيع", "Made to order")
                            : t("جاهز", "Ready made")}
                        </td>
                        <td>
                          <span
                            className="report-bar"
                            aria-hidden="true"
                            style={{
                              width: `${Math.min(100, (p.units * 100) / Math.max(1, ...data.products.map((x) => x.units)))}%`,
                            }}
                          />
                          {p.units}
                        </td>
                        <td>
                          <bdi>{money(p.valueMinor, p.currency, english ? "en" : "ar-EG")}</bdi>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                {t("لا توجد منتجات مطلوبة في هذه الفترة.", "No products ordered in this period.")}
              </p>
            )}
            <h3>{t("حسب نوع المنتج", "By product type")}</h3>
            {data.productTypes.map((p) => (
              <p key={p.currency + ":" + p.type}>
                {p.type === "MADE_TO_ORDER"
                  ? t("تصنيع حسب الطلب", "Made to order")
                  : t("قطع جاهزة", "Ready made")}{" "}
                · {p.units} {t("قطعة", "units")} ·{" "}
                <bdi>{money(p.valueMinor, p.currency, english ? "en" : "ar-EG")}</bdi>
              </p>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
