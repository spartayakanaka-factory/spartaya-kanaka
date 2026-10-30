"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoneyMinor } from "@/lib/money";
import Image from "next/image";
import { getProductImageUrl } from "@/lib/asset-url";
import Link from "next/link";
import type { Address } from "@/lib/commerce/policy";
import { destinationMatches, egyptianMobile } from "@/lib/commerce/factory-policy";
import { ManualPaymentCard, type ManualPayment } from "@/components/manual-payment";

type Product = {
  media?: { media: { originalKey: string; publicUrl: string | null } }[];
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string | null;
  priceMinor: number;
  type: string;
  variants: {
    id: string;
    nameAr: string;
    priceMinor?: number | null;
    inventory: { quantity: number; reserved: number } | null;
  }[];
};
type Cart = {
  products?: Product[];
  version: number;
  items: { id: string; variantId: string; quantity: number }[];
};
type Order = {
  id: string;
  state: string;
  currency: string;
  totalMinor: string;
  initialMinor: string;
  paidMinor: string;
  refundedMinor: string;
  creditedMinor: string;
  paymentMethod: string;
  items: {
    id: string;
    type: string;
    manufacturingState: string;
    quantity: number;
    snapshot: {
      titleAr: string;
      titleEn: string | null;
      gross: string;
      variantAr?: string;
      variantEn?: string;
      imageUrl?: string;
      manufacturing?: { minProductionDays?: number; maxProductionDays?: number };
    };
  }[];
  payments: (ManualPayment & { purpose: string })[];
  snapshot?: {
    shipping?: { gross?: string; carrier?: string; leadDays?: number };
    address?: Address;
  };
  events?: { id: string; kind: string }[];
};
type Rate = {
  id: string;
  region: string;
  carrier: string;
  feeMinor: string;
  leadDays: number;
  codEnabled: boolean;
  city?: string;
  area?: string;
};
const labels: Record<string, [string, string]> = {
  AWAITING_PAYMENT: ["بانتظار دفعة الاختبار", "Awaiting test payment"],
  CONFIRMED: ["مؤكد", "Confirmed"],
  IN_PRODUCTION: ["قيد التصنيع", "In production"],
  READY: ["جاهز للشحن", "Ready to dispatch"],
  SHIPPED: ["تم الشحن", "Shipped"],
  DELIVERED: ["تم التسليم", "Delivered"],
  CANCELLED: ["ملغي", "Cancelled"],
  EXPIRED: ["انتهت المهلة", "Expired"],
  RETURNED: ["مرتجع", "Returned"],
  SUCCEEDED: ["مطابق", "Verified"],
  CLAIMED: ["بلاغ تحويل بانتظار المطابقة", "Transfer claim awaiting reconciliation"],
  PENDING: ["قيد الانتظار", "Pending"],
  REVIEW_REQUIRED: ["يحتاج مراجعة", "Needs review"],
  FAILED: ["لم تنجح", "Failed"],
  UNKNOWN: ["غير محسوم", "Unresolved"],
};
const errors: Record<string, [string, string]> = {
  OUT_OF_STOCK: [
    "الكمية غير متاحة. حدّث حقيبة التسوق.",
    "This quantity is no longer available. Review your bag.",
  ],
  SPLIT_CHECKOUT_REQUIRED: [
    "لا يمكن جمع القطع الجاهزة والتصنيع في طلب واحد حالياً. أزل إحدى المجموعتين للمتابعة.",
    "Ready-to-ship and made-to-order items cannot share this checkout. Remove one group to continue.",
  ],
  POLICY_REQUIRED: [
    "شروط الضريبة والدفع غير مكتملة. الطلب غير متاح.",
    "Tax and payment terms are incomplete. Checkout is disabled.",
  ],
  SHIPPING_RATE_REQUIRED: [
    "لا توجد تكلفة توصيل معتمدة لهذه المنطقة.",
    "No configured delivery rate for this destination.",
  ],
  QUOTE_CHANGED: [
    "تغيّرت التفاصيل. راجع الإجمالي مرة أخرى.",
    "Details changed. Review the quote again.",
  ],
  COD_NOT_ELIGIBLE: [
    "الدفع عند الاستلام غير متاح لهذا الطلب.",
    "COD is not eligible for this order.",
  ],
  GUEST_CONTACT_VERIFICATION_REQUIRED: [
    "يجب إكمال إعداد التحقق من بيانات الضيف.",
    "Guest contact verification is not configured.",
  ],
  INTERNATIONAL_CHECKOUT_DISABLED: [
    "الطلب الدولي غير مفعّل. تواصل مع المصنع لتأكيد الشروط.",
    "International checkout is disabled. Contact the factory to confirm terms.",
  ],
  ORDER_NOT_FOUND: ["الطلب غير متاح لهذا الحساب.", "This order is not available to this account."],
  MANUAL_METHOD_NOT_CONFIGURED: [
    "تعليمات هذه الطريقة غير مفعلة. اختر طريقة متاحة أو تواصل مع المصنع.",
    "Instructions for this method are disabled. Choose an available method or contact the factory.",
  ],
  COD_LIMIT: [
    "قيمة الطلب تتجاوز الحد المعتمد للدفع عند الاستلام لهذه الوجهة.",
    "The order exceeds this destination's configured COD limit.",
  ],
  CANCELLATION_REVIEW_REQUIRED: [
    "يحتاج الإلغاء مراجعة المصنع.",
    "Cancellation requires factory review.",
  ],
  PAYMENT_ALREADY_PENDING_OR_SATISFIED: [
    "توجد دفعة معلقة أو مكتملة. راجع سجل الدفعات.",
    "A payment is already pending or completed. Review payment history.",
  ],
  RECOVERY_INVALID: [
    "رابط الاستعادة غير صالح أو مستخدم.",
    "Recovery link is invalid or already used.",
  ],
};
export const stateLabel = (state: string, ar: boolean) => labels[state]?.[ar ? 0 : 1] || state;
export async function commerceApi<T>(resource: string, data?: unknown): Promise<T> {
  const r = await fetch(
    "/api/commerce" + (data ? "" : "?" + resource),
    data
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        }
      : { cache: "no-store" },
  );
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "REQUEST_FAILED");
  return result;
}
export function SimulationNote({ ar }: { ar: boolean }) {
  return (
    <p className="commerce-notice" role="note">
      {ar
        ? "بيئة اختبار محلية — منتجات وأسعار اختبار فقط. لا توجد مدفوعات أو شحنات حقيقية."
        : "Local simulation — test products and prices only. No real payments or shipments."}
    </p>
  );
}
export function AddToCart({
  variants,
  locale,
}: {
  variants: { id: string; nameAr: string }[];
  locale: string;
}) {
  const ar = locale === "ar",
    [variant, setVariant] = useState(variants[0]?.id || ""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="commerce-add">
      <SimulationNote ar={ar} />
      {variants.length > 1 ? (
        <label>
          {ar ? "المتغير" : "Variation"}
          <select value={variant} onChange={(e) => setVariant(e.target.value)}>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nameAr}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        className="button"
        disabled={busy || !variant}
        onClick={async () => {
          setBusy(true);
          try {
            const cart = await commerceApi<Cart>("resource=cart").catch(() => null);
            const old = cart?.items.find((i) => i.variantId === variant)?.quantity || 0;
            await commerceApi("", { action: "cart", variantId: variant, quantity: old + 1 });
            setMessage(ar ? "أضيفت للحقيبة" : "Added to your bag");
          } catch (e) {
            setMessage(
              errors[(e as Error).message]?.[ar ? 0 : 1] ||
                (ar ? "تعذر الإضافة" : "Unable to add item"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (ar ? "جارٍ الإضافة…" : "Adding…") : ar ? "أضف لحقيبة الاختبار" : "Add to test bag"}
      </button>
      <p role="status">{message}</p>
      <Link href={`/${locale}/cart`}>{ar ? "عرض الحقيبة" : "View bag"}</Link>
    </div>
  );
}
const blank: Address = {
  label: "Home",
  recipient: "",
  phone: "",
  country: "EG",
  region: "",
  city: "",
  line1: "",
};
function AddressFields({
  value,
  onChange,
  ar,
  rates,
}: {
  value: Address;
  onChange: (a: Address) => void;
  ar: boolean;
  rates?: Rate[];
}) {
  const field = (key: keyof Address, label: string, type = "text", autoComplete?: string) => (
    <label key={key}>
      {label}
      <input
        name={key}
        type={type}
        autoComplete={autoComplete}
        value={value[key] || ""}
        required={!["postalCode", "area", "deliveryInstructions"].includes(key)}
        maxLength={key === "line1" ? 240 : key === "deliveryInstructions" ? 500 : 120}
        inputMode={key === "phone" ? "tel" : undefined}
        dir={key === "phone" ? "ltr" : undefined}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="commerce-form-grid">
      {field("recipient", ar ? "اسم المستلم" : "Recipient", "text", "name")}
      {field("phone", ar ? "الهاتف" : "Phone", "tel", "tel")}
      <label>
        {ar ? "الدولة" : "Country"}
        <select
          aria-label={ar ? "الدولة" : "Country"}
          value={value.country}
          onChange={(e) => onChange({ ...value, country: e.target.value })}
        >
          <option value="EG">{ar ? "مصر" : "Egypt"}</option>
          <option value="US" disabled>
            {ar ? "دولي — غير متاح" : "International — unavailable"}
          </option>
        </select>
      </label>
      {rates ? (
        <label>
          {ar ? "المحافظة" : "Governorate"}
          <select
            required
            aria-label={ar ? "المحافظة" : "Governorate"}
            value={value.region}
            onChange={(e) => onChange({ ...value, region: e.target.value })}
          >
            <option value="">{ar ? "اختر المنطقة" : "Select area"}</option>
            {[...new Set(rates.map((r) => r.region))].map((region) => (
              <option key={region}>{region}</option>
            ))}
          </select>
        </label>
      ) : (
        field(
          "region",
          ar ? "المحافظة / المنطقة" : "Governorate / region",
          "text",
          "address-level1",
        )
      )}
      {field("city", ar ? "المدينة" : "City", "text", "address-level2")}
      {field(
        "area",
        ar ? "الحي / منطقة التسليم (اختياري)" : "District / delivery area (optional)",
        "text",
        "address-level3",
      )}
      {field("line1", ar ? "العنوان بالتفصيل" : "Street address", "text", "street-address")}
      {field(
        "deliveryInstructions",
        ar ? "تعليمات التسليم (اختياري)" : "Delivery instructions (optional)",
        "text",
        "off",
      )}
      {field(
        "postalCode",
        ar ? "الرمز البريدي (اختياري)" : "Postal code (optional)",
        "text",
        "postal-code",
      )}
    </div>
  );
}
export function CommercePage({
  locale,
  view,
  orderId,
}: {
  locale: string;
  view: "cart" | "checkout" | "account" | "order";
  orderId?: string;
}) {
  const router = useRouter();
  const submission = useRef<{ hash: string; key: string } | null>(null);
  const ar = locale === "ar",
    t = (a: string, e: string) => (ar ? a : e),
    base = "/" + locale;
  const [products, setProducts] = useState<Product[]>([]),
    [cart, setCart] = useState<Cart | null>(null),
    [rates, setRates] = useState<Rate[]>([]),
    [order, setOrder] = useState<Order | null>(null),
    [orders, setOrders] = useState<Order[]>([]),
    [addresses, setAddresses] = useState<(Address & { id: string })[]>([]),
    [profile, setProfile] = useState<{ name: string; email: string; phone: string | null } | null>(
      null,
    ),
    [address, setAddress] = useState<Address>(blank),
    [rateId, setRateId] = useState(""),
    [method, setMethod] = useState("COD"),
    [paymentOptions, setPaymentOptions] = useState<Record<string, boolean>>({
      COD: true,
      MOCK_CARD: false,
      WALLET: false,
      INSTAPAY: false,
    }),
    [quote, setQuote] = useState<{
      quoteHash: string;
      snapshot: { totalMinor: string; initialMinor: string; balanceMinor: string };
    } | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [authMode, setAuthMode] = useState("login"),
    [reference, setReference] = useState("");
  const outstandingMinor = order
    ? BigInt(order.totalMinor) -
      BigInt(order.creditedMinor) -
      BigInt(order.paidMinor) +
      BigInt(order.refundedMinor)
    : BigInt(0);
  const paymentUnderReview = order?.payments.some((payment) =>
    ["PENDING", "CLAIMED", "UNKNOWN", "REVIEW_REQUIRED"].includes(payment.state),
  );
  const readyOnly =
    Boolean(cart?.items.length) &&
    cart!.items.every(
      (item) =>
        products.find((p) => p.variants.some((v) => v.id === item.variantId))?.type ===
        "READY_MADE",
    );
  const selectedRate = rates.find(
    (rate) =>
      rate.id === rateId && rate.region === address.region && destinationMatches(rate, address),
  );
  const availableMethods = ["COD", "WALLET", "INSTAPAY", "MOCK_CARD"].filter(
    (value) =>
      paymentOptions[value] &&
      (value !== "COD" || (readyOnly && selectedRate?.codEnabled !== false)),
  );
  const effectiveMethod = availableMethods.includes(method) ? method : availableMethods[0] || "";
  const money = (v: string | number) => formatMoneyMinor(Number(v), ar ? "ar" : "en", "EGP");
  const fail = (e: unknown) =>
    setMessage(
      errors[(e as Error).message]?.[ar ? 0 : 1] ||
        t(
          "تعذر إكمال العملية. راجع البيانات وحاول مرة أخرى.",
          "Unable to complete this action. Review the details and retry.",
        ),
    );
  async function refresh() {
    if (view === "order" && orderId) {
      setOrder(await commerceApi<Order>("resource=order&id=" + orderId));
      return;
    }
    if (view === "account") {
      const p = await commerceApi<typeof profile>("resource=profile").catch(() => null);
      setProfile(p);
      if (p) {
        const [a, o] = await Promise.all([
          commerceApi<typeof addresses>("resource=addresses"),
          commerceApi<Order[]>("resource=orders"),
        ]);
        setAddresses(a);
        setOrders(o);
      } else setOrders(await commerceApi<Order[]>("resource=orders").catch(() => []));
      return;
    }
    const [p, c, r, options] = await Promise.all([
      commerceApi<Product[]>("resource=catalog"),
      commerceApi<Cart>("resource=cart").catch(() => null),
      commerceApi<Rate[]>("resource=rates"),
      view === "checkout"
        ? commerceApi<Record<string, boolean>>("resource=paymentOptions")
        : Promise.resolve(null),
    ]);
    setProducts([
      ...new Map([...p, ...(c?.products || [])].map((product) => [product.id, product])).values(),
    ]);
    setCart(c);
    setRates(r);
    if (options) setPaymentOptions(options);
    if (view === "checkout")
      setAddresses(await commerceApi<typeof addresses>("resource=addresses").catch(() => []));
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await refresh();
        if (view === "account" && new URLSearchParams(location.search).get("token"))
          setAuthMode("reset");
      } catch (e) {
        if (active) fail(e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    }; /* view/locale select a new page instance; mutations call refresh. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, orderId, locale]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const title =
    view === "cart"
      ? t("حقيبة التسوق", "Shopping bag")
      : view === "checkout"
        ? t("مراجعة طلب الاختبار", "Review your test order")
        : view === "account"
          ? t("حسابي", "My account")
          : t("تفاصيل الطلب", "Order details");
  return (
    <section className="commerce-page">
      <div className="commerce-heading">
        <p className="eyebrow">{t("سبرتاية وكنكة", "Sprtaya & Kanaka")}</p>
        <h1>{title}</h1>
        <nav aria-label={t("روابط الحساب", "Account navigation")}>
          <Link href={base + "/products"}>{t("المنتجات", "Products")}</Link>
          <Link href={base + "/cart"}>{t("الحقيبة", "Bag")}</Link>
          <Link href={base + "/account"}>{t("الحساب", "Account")}</Link>
        </nav>
      </div>
      <SimulationNote ar={ar} />
      <p className="commerce-feedback" role="status">
        {message}
      </p>
      {loading ? <p role="status">{t("جارٍ التحميل…", "Loading…")}</p> : null}
      {!loading && (view === "cart" || view === "checkout") ? (
        <div className="commerce-columns">
          <div className="commerce-panel">
            <h2>{t("قطعك المختارة", "Your pieces")}</h2>
            {cart?.items.length ? (
              cart.items.map((item) => {
                const p = products.find((p) => p.variants.some((v) => v.id === item.variantId));
                return (
                  <article className="commerce-line" key={item.id}>
                    <div>
                      {p?.media?.[0] ? (
                        <Image
                          className="commerce-thumb"
                          src={getProductImageUrl({
                            localPath: p.media[0].media.originalKey.replace(/^legacy:/, ""),
                            publicUrl: p.media[0].media.publicUrl || undefined,
                          })}
                          alt={ar ? p.titleAr : p.titleEn || p.titleAr}
                          width={64}
                          height={76}
                          unoptimized
                        />
                      ) : null}
                      <div className="commerce-item-copy">
                        <h3>
                          {p ? (
                            <Link href={`${base}/products/${p.slug}`}>
                              {ar ? p.titleAr : p.titleEn || p.titleAr}
                            </Link>
                          ) : (
                            t("قطعة غير متاحة", "Unavailable piece")
                          )}
                        </h3>
                        <p>
                          {p?.type === "MADE_TO_ORDER"
                            ? t("تصنيع حسب الطلب", "Made to order")
                            : t("جاهز للشحن", "Ready to ship")}
                        </p>
                        {p ? (
                          <span>
                            {money(
                              p.variants.find((v) => v.id === item.variantId)?.priceMinor ??
                                p.priceMinor,
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <label>
                      {t("الكمية", "Quantity")}
                      <input
                        aria-label={t("كمية ", "Quantity for ") + (p?.titleAr || item.id)}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="99"
                        value={item.quantity}
                        disabled={busy}
                        onChange={(e) => {
                          const quantity = Number(e.target.value);
                          if (quantity >= 1 && quantity <= 99)
                            void run(async () => {
                              await commerceApi("", {
                                action: "cart",
                                variantId: item.variantId,
                                quantity,
                              });
                              setQuote(null);
                              await refresh();
                            });
                        }}
                      />
                    </label>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await commerceApi("", {
                            action: "cart",
                            variantId: item.variantId,
                            quantity: 0,
                          });
                          setQuote(null);
                          await refresh();
                        })
                      }
                    >
                      {t("إزالة", "Remove")}
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="commerce-empty">
                <h3>{t("حقيبتك تنتظر قطعة مميزة", "Your bag is waiting for something special")}</h3>
                <p>{t("استكشف قطع النحاس الأصلية.", "Explore our original copper pieces.")}</p>
                <Link className="button" href={base + "/products"}>
                  {t("تصفح القطع", "Explore pieces")}
                </Link>
              </div>
            )}
            {view === "cart" && cart?.items.length ? (
              <>
                <p>
                  {t(
                    "راجع الضريبة والتوصيل قبل التأكيد. الجمع بين القطع الجاهزة والتصنيع غير متاح حالياً.",
                    "Review tax and delivery before confirmation. Ready-made and made-to-order items cannot share this checkout.",
                  )}
                </p>
                <Link className="button" href={base + "/checkout"}>
                  {t("مراجعة الطلب", "Review checkout")}
                </Link>
              </>
            ) : null}
          </div>
          {view === "checkout" && cart?.items.length ? (
            <form
              className="commerce-panel"
              onSubmit={(e) => {
                e.preventDefault();
                if (!egyptianMobile(address.phone)) {
                  setMessage(
                    t(
                      "أدخل رقم موبايل مصري صحيحاً يبدأ بـ 010 أو 011 أو 012 أو 015.",
                      "Enter a valid Egyptian mobile number starting 010, 011, 012 or 015.",
                    ),
                  );
                  (e.currentTarget.elements.namedItem("phone") as HTMLInputElement)?.focus();
                  return;
                }
                void run(async () => {
                  const result = await commerceApi<typeof quote>("", {
                    action: "quote",
                    address,
                    rateId,
                    method: effectiveMethod,
                    locale,
                  });
                  setQuote(result);
                });
              }}
            >
              <h2>{t("التوصيل والدفع", "Delivery and payment")}</h2>
              {addresses.length ? (
                <label>
                  {t("استخدم عنواناً محفوظاً", "Use a saved address")}
                  <select
                    aria-label={t("عنوان محفوظ", "Saved address")}
                    defaultValue=""
                    onChange={(e) => {
                      const found = addresses.find((a) => a.id === e.target.value);
                      if (found) {
                        const { id: ignored, ...value } = found;
                        void ignored;
                        setAddress(value);
                        setQuote(null);
                      }
                    }}
                  >
                    <option value="">{t("عنوان جديد", "New address")}</option>
                    {addresses.map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.recipient} · {a.city} · {a.line1}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <AddressFields
                value={address}
                onChange={(v) => {
                  if (
                    v.region !== address.region ||
                    v.city !== address.city ||
                    v.area !== address.area
                  )
                    setRateId("");
                  setAddress(v);
                  setQuote(null);
                }}
                ar={ar}
                rates={rates}
              />
              <label>
                {t("خدمة التوصيل", "Delivery service")}
                <select
                  required
                  aria-label={t("خدمة التوصيل", "Delivery service")}
                  value={rateId}
                  onChange={(e) => {
                    setRateId(e.target.value);
                    setQuote(null);
                  }}
                >
                  <option value="">{t("اختر الخدمة", "Select service")}</option>
                  {rates
                    .filter((r) => r.region === address.region && destinationMatches(r, address))
                    .map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.carrier} · {money(r.feeMinor)} · {r.leadDays}{" "}
                        {t("أيام اختبار", "test days")}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {t("طريقة دفع الاختبار", "Test payment method")}
                <select
                  aria-label={t("طريقة دفع الاختبار", "Test payment method")}
                  value={effectiveMethod}
                  required
                  onChange={(e) => {
                    setMethod(e.target.value);
                    setQuote(null);
                  }}
                >
                  {!availableMethods.length ? (
                    <option value="">
                      {t("لا توجد طريقة دفع مهيأة", "No configured payment method")}
                    </option>
                  ) : null}
                  {availableMethods.map((value) => (
                    <option value={value} key={value}>
                      {value === "COD"
                        ? t(
                            "الدفع عند الاستلام — للجاهز فقط",
                            "Cash on delivery — ready-to-ship only",
                          )
                        : value === "WALLET"
                          ? t("تحويل إلى محفظة — مراجعة يدوية", "Mobile wallet — manual review")
                          : value === "INSTAPAY"
                            ? "InstaPay — " + t("مراجعة يدوية", "manual review")
                            : t("بطاقة وهمية محلية", "Local mock card")}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {t(
                  "لا تُرسل أي أموال. كل الأرقام هنا إعدادات اصطناعية للاختبار.",
                  "Do not send funds. All amounts here are synthetic test settings.",
                )}
              </p>
              <button className="button button-light" disabled={busy}>
                {t("احسب الإجمالي", "Calculate total")}
              </button>
              {quote ? (
                <div className="commerce-summary">
                  <dl>
                    <div>
                      <dt>
                        {t("الإجمالي شامل التوصيل والضريبة", "Total including delivery and tax")}
                      </dt>
                      <dd>{money(quote.snapshot.totalMinor)}</dd>
                    </div>
                    <div>
                      <dt>
                        {effectiveMethod === "COD"
                          ? t("المطلوب عند التسليم", "Due on delivery")
                          : t("الدفعة الأولى", "Initial payment")}
                      </dt>
                      <dd>{money(quote.snapshot.initialMinor)}</dd>
                    </div>
                    {effectiveMethod !== "COD" ? (
                      <div>
                        <dt>{t("الرصيد قبل الشحن", "Balance before dispatch")}</dt>
                        <dd>{money(quote.snapshot.balanceMinor)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const o = await commerceApi<Order>("", {
                          action: "checkout",
                          address,
                          rateId,
                          method: effectiveMethod,
                          locale,
                          quoteHash: quote.quoteHash,
                          requestKey: (() => {
                            if (submission.current?.hash !== quote.quoteHash)
                              submission.current = {
                                hash: quote.quoteHash,
                                key: crypto.randomUUID(),
                              };
                            return submission.current.key;
                          })(),
                        });
                        router.push(base + "/orders/" + o.id);
                      })
                    }
                  >
                    {t("إنشاء طلب اختباري", "Place test order")}
                  </button>
                </div>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}
      {!loading && view === "account" && !profile && orders.length ? (
        <section className="commerce-panel">
          <h2>{t("طلبات الضيف على هذا الجهاز", "Guest orders on this device")}</h2>
          <p>
            {t(
              "الوصول مرتبط بملف الجلسة الخاص بهذا المتصفح. إنشاء حساب لا ينقل ملكية هذه الطلبات تلقائياً.",
              "Access depends on this browser’s private session. Creating an account does not automatically transfer these orders.",
            )}
          </p>
          {orders.map((o) => (
            <p key={o.id}>
              <Link href={base + "/orders/" + o.id}>
                <bdi>{o.id.slice(0, 8)}</bdi> · {stateLabel(o.state, ar)} · {money(o.totalMinor)}
              </Link>
            </p>
          ))}
        </section>
      ) : null}
      {!loading && view === "account" ? (
        <div className="commerce-columns">
          {!profile ? (
            <form
              className="commerce-panel commerce-auth"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const path =
                    authMode === "register"
                      ? "sign-up/email"
                      : authMode === "forgot"
                        ? "request-password-reset"
                        : authMode === "reset"
                          ? "reset-password"
                          : "sign-in/email";
                  const body =
                    authMode === "reset"
                      ? {
                          newPassword: f.get("password"),
                          token: new URLSearchParams(location.search).get("token"),
                        }
                      : {
                          email: f.get("email"),
                          password: f.get("password"),
                          ...(authMode === "register"
                            ? {
                                name: f.get("name"),
                                callbackURL: location.origin + base + "/account",
                              }
                            : {}),
                          ...(authMode === "forgot"
                            ? { redirectTo: location.origin + base + "/account" }
                            : {}),
                        };
                  const r = await fetch("/api/customer-auth/" + path, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  if (!r.ok) {
                    setMessage(
                      t(
                        "تعذر المتابعة. تحقق من البيانات وتأكيد البريد، أو انتظر قبل المحاولة التالية.",
                        "Unable to continue. Check your details and email verification, or wait before retrying.",
                      ),
                    );
                    return;
                  }
                  if (authMode === "login") {
                    await commerceApi("", { action: "merge" }).catch(() => undefined);
                    await refresh();
                  } else
                    setMessage(
                      t(
                        "تمت المتابعة. راجع الالتقاط المحلي الخاص لرسالة التأكيد أو الاستعادة.",
                        "Request accepted. Check the private local capture for verification or recovery.",
                      ),
                    );
                });
              }}
            >
              <h2>
                {authMode === "register"
                  ? t("حساب جديد", "Create account")
                  : authMode === "forgot" || authMode === "reset"
                    ? t("استعادة الحساب", "Account recovery")
                    : t("تسجيل الدخول", "Sign in")}
              </h2>
              {authMode === "register" ? (
                <label>
                  {t("الاسم", "Name")}
                  <input name="name" autoComplete="name" required maxLength={120} />
                </label>
              ) : null}
              {authMode !== "reset" ? (
                <label>
                  {t("البريد الإلكتروني الاصطناعي (.invalid)", "Synthetic email (.invalid)")}
                  <input name="email" type="email" autoComplete="email" dir="ltr" required />
                </label>
              ) : null}
              {authMode !== "forgot" ? (
                <label>
                  {t("كلمة المرور (12 حرفاً على الأقل)", "Password (at least 12 characters)")}
                  <input
                    name="password"
                    type="password"
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </label>
              ) : null}
              <button className="button" disabled={busy}>
                {busy ? t("جارٍ المتابعة…", "Continuing…") : t("متابعة", "Continue")}
              </button>
              <div className="commerce-inline">
                {["login", "register", "forgot"]
                  .filter((m) => m !== authMode)
                  .map((m) => (
                    <button
                      type="button"
                      className="text-link"
                      key={m}
                      onClick={() => {
                        setAuthMode(m);
                        setMessage("");
                      }}
                    >
                      {m === "login"
                        ? t("دخول", "Sign in")
                        : m === "register"
                          ? t("إنشاء حساب", "Register")
                          : t("نسيت كلمة المرور", "Forgot password")}
                    </button>
                  ))}
              </div>
            </form>
          ) : (
            <>
              <div className="commerce-panel">
                <h2>{t("بيانات الحساب", "Profile")}</h2>
                <p dir="ltr">{profile.email}</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      await commerceApi("", {
                        action: "profile",
                        name: f.get("name"),
                        phone: f.get("phone"),
                        locale,
                      });
                      await refresh();
                      setMessage(t("تم الحفظ", "Saved"));
                    });
                  }}
                >
                  <label>
                    {t("الاسم", "Name")}
                    <input name="name" defaultValue={profile.name} autoComplete="name" required />
                  </label>
                  <label>
                    {t("الهاتف", "Phone")}
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={profile.phone || ""}
                      autoComplete="tel"
                      required
                    />
                  </label>
                  <button disabled={busy} className="button">
                    {t("حفظ البيانات", "Save profile")}
                  </button>
                </form>
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await fetch("/api/customer-auth/sign-out", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: "{}",
                      });
                      await refresh();
                    })
                  }
                >
                  {t("تسجيل الخروج", "Sign out")}
                </button>
                <h2>{t("طلباتي", "My orders")}</h2>
                {orders.length ? (
                  orders.map((o) => (
                    <p key={o.id}>
                      <Link href={base + "/orders/" + o.id}>
                        <bdi>{o.id.slice(0, 8)}</bdi> · {stateLabel(o.state, ar)} ·{" "}
                        {money(o.totalMinor)}
                      </Link>
                    </p>
                  ))
                ) : (
                  <p>{t("لا توجد طلبات بعد", "No orders yet")}</p>
                )}
              </div>
              <div className="commerce-panel">
                <h2>{t("العناوين المحفوظة", "Saved addresses")}</h2>
                {addresses.map((a) => (
                  <article className="commerce-line" key={a.id}>
                    <div>
                      <strong>{a.recipient}</strong>
                      <p>
                        {a.line1} · {a.city}
                      </p>
                    </div>
                    <button className="text-link" onClick={() => setAddress(a)}>
                      {t("تعديل", "Edit")}
                    </button>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await commerceApi("", { action: "deleteAddress", id: a.id });
                          await refresh();
                        })
                      }
                    >
                      {t("حذف", "Delete")}
                    </button>
                  </article>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await commerceApi("", {
                        action: "address",
                        address,
                        id: (address as Address & { id?: string }).id,
                      });
                      setAddress(blank);
                      await refresh();
                      setMessage(t("تم حفظ العنوان", "Address saved"));
                    });
                  }}
                >
                  <AddressFields value={address} onChange={setAddress} ar={ar} />
                  <button disabled={busy} className="button">
                    {t("حفظ العنوان", "Save address")}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      ) : null}
      {!loading && view === "order" && order ? (
        <div className="commerce-columns">
          <div className="commerce-panel">
            <p className="eyebrow">{stateLabel(order.state, ar)}</p>
            <h2>
              <bdi>{order.id.slice(0, 8)}</bdi>
            </h2>
            {order.items.map((i) => (
              <article className="commerce-line" key={i.id}>
                <div>
                  {i.snapshot.imageUrl ? (
                    <Image
                      src={i.snapshot.imageUrl}
                      alt=""
                      width={64}
                      height={76}
                      className="commerce-thumb"
                      unoptimized
                    />
                  ) : null}
                  <div className="commerce-item-copy">
                    <h3>{ar ? i.snapshot.titleAr : i.snapshot.titleEn || i.snapshot.titleAr}</h3>
                    {i.snapshot.variantAr ? (
                      <p>
                        {ar ? i.snapshot.variantAr : i.snapshot.variantEn || i.snapshot.variantAr}
                      </p>
                    ) : null}
                    {i.snapshot.manufacturing?.minProductionDays &&
                    i.snapshot.manufacturing.maxProductionDays ? (
                      <p>
                        {t("مدة التصنيع المسجلة:", "Configured manufacturing estimate:")}{" "}
                        {i.snapshot.manufacturing.minProductionDays}–
                        {i.snapshot.manufacturing.maxProductionDays} {t("يوم", "days")}
                      </p>
                    ) : null}
                  </div>
                </div>
                <span>× {i.quantity}</span>
                <strong>{money(i.snapshot.gross)}</strong>
              </article>
            ))}
            {order.snapshot?.shipping ? (
              <p>
                {t("التوصيل", "Delivery")}: {order.snapshot.shipping.carrier} ·{" "}
                {money(order.snapshot.shipping.gross || "0")}
              </p>
            ) : null}
            <dl className="commerce-totals">
              <div>
                <dt>
                  {order.paymentMethod === "COD"
                    ? t("المبلغ المطلوب عند التسليم", "Amount due on delivery")
                    : t("الدفعة الأولى المطلوبة", "Required advance")}
                </dt>
                <dd>{money(order.initialMinor)}</dd>
              </div>
              <div>
                <dt>{t("الإجمالي", "Total")}</dt>
                <dd>{money(order.totalMinor)}</dd>
              </div>
              <div>
                <dt>{t("المدفوع المتحقق", "Verified payments")}</dt>
                <dd>{money(order.paidMinor)}</dd>
              </div>
              <div>
                <dt>{t("المسترد", "Refunded")}</dt>
                <dd>{money(order.refundedMinor)}</dd>
              </div>
              <div>
                <dt>{t("الرصيد المستحق", "Outstanding balance")}</dt>
                <dd>
                  {money(
                    String(
                      BigInt(order.totalMinor) -
                        BigInt(order.creditedMinor) -
                        BigInt(order.paidMinor) +
                        BigInt(order.refundedMinor),
                    ),
                  )}
                </dd>
              </div>
            </dl>
            <button
              className="button button-light"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await commerceApi<{ reviewRequired?: boolean }>("", {
                    action: "cancel",
                    id: order.id,
                  });
                  if (result.reviewRequired)
                    setMessage(
                      t(
                        "تم تسجيل طلب الإلغاء للمراجعة دون استرداد أو خصم تلقائي.",
                        "Cancellation review recorded. No automatic refund or forfeiture.",
                      ),
                    );
                  await refresh();
                })
              }
            >
              {t("طلب الإلغاء", "Request cancellation")}
            </button>
          </div>
          <div className="commerce-panel">
            <h2>{t("الدفعات", "Payments")}</h2>
            {order.payments.map((p) => (
              <article key={p.id}>
                <p>
                  {stateLabel(p.state, ar)} · {money(p.amountMinor)}
                </p>
                {p.evidenceRequired ? (
                  <ManualPaymentCard payment={p} ar={ar} onChanged={refresh} />
                ) : null}
              </article>
            ))}
            {outstandingMinor > BigInt(0) &&
            !paymentUnderReview &&
            ["AWAITING_PAYMENT", "CONFIRMED", "IN_PRODUCTION", "READY"].includes(order.state) &&
            order.paymentMethod !== "COD" ? (
              <>
                {order.paymentMethod !== "MOCK_CARD" ? (
                  <label>
                    {t(
                      "مرجع التحويل (اختياري عند توفره)",
                      "Transfer reference (optional if available)",
                    )}
                    <input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      minLength={8}
                      maxLength={96}
                    />
                  </label>
                ) : null}
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await commerceApi("", {
                        action: order.paymentMethod === "MOCK_CARD" ? "pay" : "claim",
                        id: order.id,
                        requestKey: crypto.randomUUID(),
                        purpose:
                          BigInt(order.paidMinor) >= BigInt(order.initialMinor)
                            ? "BALANCE"
                            : "INITIAL",
                        ...(order.paymentMethod !== "MOCK_CARD" ? { reference } : {}),
                      });
                      await refresh();
                    })
                  }
                >
                  {order.paymentMethod === "MOCK_CARD"
                    ? t("محاكاة دفع محلي", "Simulate local payment")
                    : t("عرض تعليمات التحويل", "View transfer instructions")}
                </button>
                <p>
                  {t(
                    "بلاغ التحويل لا يعني الدفع. يلزم تحقق منفصل من مسؤول مخوّل.",
                    "A transfer claim is not payment. A separately authorized administrator must reconcile it.",
                  )}
                </p>
              </>
            ) : (
              <p>
                {outstandingMinor <= BigInt(0)
                  ? t("لا يوجد رصيد مستحق.", "No outstanding balance.")
                  : order.paymentMethod === "COD"
                    ? t(
                        "لا تُثبت دفعة الدفع عند الاستلام إلا بعد مطابقة التحصيل وتسويته.",
                        "COD is credited only after collection is verified and reconciled.",
                      )
                    : paymentUnderReview
                      ? t(
                          "الدفعة قيد التحقق. لن يُطلب دفع جديد قبل حسم حالتها.",
                          "Payment is being verified. No new payment is requested until its status is resolved.",
                        )
                      : t("لا توجد دفعة متاحة حالياً.", "No payment action is available now.")}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
