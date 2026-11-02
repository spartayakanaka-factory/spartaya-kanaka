import Link from "next/link";
import { getDatabase } from "@/lib/server/database";
import { requireAdminPage } from "@/lib/server/admin-page";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { commerceEnabled } from "@/lib/commerce/runtime";
import { hasPermission } from "@/lib/admin/permissions";
import { cairoDate, cairoDayStart, nextDate } from "@/lib/reports/calendar";
import { ownerReport } from "@/lib/server/commerce/reports";
import { numberAr, orderStateLabels } from "@/lib/admin/order-presentation";
import { formatMoneyMinor } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function AdminDashboard() {
  const actor = await requireAdminPage(),
    db = getDatabase();
  const catalog = hasPermission(actor.roleCode, "PRODUCTS_READ"),
    inventory = hasPermission(actor.roleCode, "INVENTORY_READ");
  const operations = commerceEnabled() && ["OWNER", "MANAGER"].includes(actor.roleCode);
  const today = cairoDate(new Date()),
    start = cairoDayStart(today),
    end = cairoDayStart(nextDate(today, 1));
  const [published, drafts, balances, orderStates, ordersToday, latest, report, recentCustomers] =
    await Promise.all([
      catalog ? db.product.count({ where: { status: "PUBLISHED" } }) : null,
      catalog ? db.product.count({ where: { status: "DRAFT" } }) : null,
      inventory
        ? db.inventoryBalance.findMany({
            where: {
              variant: { active: true },
              product: { type: "READY_MADE", status: { not: "ARCHIVED" } },
            },
            select: { quantity: true, reserved: true, lowStockAt: true },
          })
        : [],
      operations ? db.commerceOrder.groupBy({ by: ["state"], _count: { _all: true } }) : [],
      operations ? db.commerceOrder.count({ where: { createdAt: { gte: start, lt: end } } }) : null,
      operations
        ? db.commerceOrder.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, state: true, createdAt: true, currency: true, totalMinor: true },
          })
        : [],
      operations && actor.roleCode === "OWNER" && process.env.P4_OWNER_REPORTS === "1"
        ? ownerReport(actor.id, today, today).catch(() => null)
        : null,
      operations && actor.roleCode === "OWNER"
        ? db.customerUser.findMany({
            orderBy: { createdAt: "desc" },
            take: 3,
            select: { id: true, name: true, createdAt: true },
          })
        : [],
    ]);
  const low = balances.filter((b) => b.quantity - b.reserved <= b.lowStockAt).length;
  const count = (state: string) => orderStates.find((r) => r.state === state)?._count._all ?? 0;
  const metrics = [
    ...(operations
      ? [
          {
            label: "طلبات اليوم",
            value: ordersToday!,
            note: "حسب توقيت القاهرة",
            href: "/admin/orders",
          },
        ]
      : []),
    ...(catalog
      ? [
          {
            label: "منتجات منشورة",
            value: published!,
            note: "متاحة في واجهة المتجر",
            href: "/admin/products?status=PUBLISHED",
          },
          {
            label: "مسودات للمراجعة",
            value: drafts!,
            note: "لا تظهر للعملاء قبل النشر",
            href: "/admin/products?status=DRAFT",
          },
        ]
      : []),
    ...(inventory
      ? [
          {
            label: "أرصدة تحتاج متابعة",
            value: low,
            note: "المتاح بعد خصم حجوزات الطلبات",
            href: "/admin/inventory?low=1",
          },
        ]
      : []),
  ];
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader
        title="متابعة اليوم"
        description={new Intl.DateTimeFormat("ar-EG", {
          dateStyle: "full",
          timeZone: "Africa/Cairo",
        }).format(new Date())}
        action={
          hasPermission(actor.roleCode, "PRODUCTS_WRITE") ? (
            <Link className="admin-button admin-button-primary" href="/admin/products/new">
              إضافة منتج
            </Link>
          ) : undefined
        }
      />
      <section className="admin-metric-strip" data-count={metrics.length} aria-label="ملخص العمل">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href}>
            <span>{m.label}</span>
            <strong>{numberAr(m.value)}</strong>
            <small>{m.note}</small>
          </Link>
        ))}
      </section>
      <div className="admin-overview-grid">
        {operations ? (
          <section className="admin-panel">
            <div className="admin-section-heading">
              <h2>ما الذي يحتاج متابعة؟</h2>
              <Link href="/admin/orders">كل الطلبات</Link>
            </div>
            <div className="admin-attention-list">
              {[
                ["AWAITING_PAYMENT", "انتظار الدفعة الأولى", "راجع المبلغ المطلوب قبل بدء العمل"],
                ["CONFIRMED", "طلبات مؤكدة للتجهيز", "ابدأ تجهيز القطع أو التصنيع المسموح"],
                ["IN_PRODUCTION", "قيد التصنيع", "تابع القطع حتى اكتمالها"],
                ["READY", "جاهز للشحن", "تحقق من الرصيد قبل الإرسال"],
              ].map(([state, label, note]) => (
                <Link href={"/admin/orders?state=" + state} key={state}>
                  <div>
                    <span>{label}</span>
                    <small>{note}</small>
                  </div>
                  <strong>{numberAr(count(state))}</strong>
                </Link>
              ))}
              <Link href="/admin/orders?state=PAYMENT_REVIEW">
                <div>
                  <span>مطابقة التحويلات</span>
                  <small>الإثبات وحده لا يعني استلام المال</small>
                </div>
                <span>مراجعة ←</span>
              </Link>
            </div>
          </section>
        ) : (
          <section className="admin-panel">
            <h2>إدارة الكتالوج والمخزون</h2>
            <p className="admin-muted">
              اختر من المهام المتاحة لحسابك. صلاحيات الطلبات والمبالغ تظل مستقلة.
            </p>
          </section>
        )}
        <section className="admin-panel">
          <div className="admin-section-heading">
            <h2>التحصيل وأرصدة اليوم</h2>
            {report ? <Link href="/admin/reports">تفاصيل التقارير</Link> : null}
          </div>
          {report ? (
            report.currencies.length ? (
              report.currencies.map((c) => (
                <div key={c.currency}>
                  <dl className="admin-order-money">
                    <div>
                      <dt>تحصيل متحقق اليوم</dt>
                      <dd>{formatMoneyMinor(c.collected, "ar", c.currency)}</dd>
                    </div>
                    <div>
                      <dt>أرصدة طلبات اليوم</dt>
                      <dd>{formatMoneyMinor(c.outstanding, "ar", c.currency)}</dd>
                    </div>
                  </dl>
                  <p className="admin-muted">
                    التحصيل مرتبط بوقت التسوية، والأرصدة تخص الطلبات التي أُنشئت اليوم. ليس هذا حساب
                    الربح.
                  </p>
                </div>
              ))
            ) : (
              <p className="admin-empty">لم تُسجل حركة مالية اليوم.</p>
            )
          ) : (
            <p className="admin-muted">
              {actor.roleCode !== "OWNER"
                ? "التقارير المالية متاحة للمالك فقط."
                : "التقرير المالي غير متاح الآن. لا نعرض تقديرات بدلاً من البيانات المتحققة."}
            </p>
          )}
          {actor.roleCode === "OWNER" && operations ? (
            <div className="admin-recent-customers">
              <h3>حسابات أُضيفت مؤخراً</h3>
              {recentCustomers.length ? (
                recentCustomers.map((customer) => (
                  <Link href={"/admin/customers/" + customer.id} key={customer.id}>
                    <span>{customer.name}</span>
                    <time dateTime={customer.createdAt.toISOString()}>
                      {new Intl.DateTimeFormat("ar-EG", {
                        dateStyle: "short",
                        timeZone: "Africa/Cairo",
                      }).format(customer.createdAt)}
                    </time>
                  </Link>
                ))
              ) : (
                <p className="admin-muted">
                  لا توجد حسابات مسجلة بعد. طلبات الضيوف متاحة في الطلبات.
                </p>
              )}
            </div>
          ) : null}
        </section>
      </div>
      {operations ? (
        <section className="admin-panel">
          <div className="admin-section-heading">
            <h2>أحدث الطلبات</h2>
            <Link href="/admin/orders">عرض كل الطلبات</Link>
          </div>
          {latest.length ? (
            <div className="admin-table-wrap" role="region" aria-label="أحدث الطلبات" tabIndex={0}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>الطلب</th>
                    <th>الحالة</th>
                    <th>قيمة الطلب</th>
                    <th>تاريخ الإنشاء</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={"/admin/orders/" + o.id}>
                          <bdi>{o.id.slice(0, 8)}</bdi>
                        </Link>
                      </td>
                      <td>
                        <span className="admin-badge">{orderStateLabels[o.state] ?? o.state}</span>
                      </td>
                      <td>{formatMoneyMinor(o.totalMinor, "ar", o.currency)}</td>
                      <td>
                        {new Intl.DateTimeFormat("ar-EG", {
                          dateStyle: "medium",
                          timeZone: "Africa/Cairo",
                        }).format(o.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-empty">لا توجد طلبات بعد. ستظهر هنا بمجرد تسجيل أول طلب.</p>
          )}
        </section>
      ) : null}
      <section className="admin-panel">
        <h2>مهام سريعة</h2>
        <nav className="admin-shortcuts" aria-label="إجراءات سريعة">
          {catalog ? <Link href="/admin/products/review">استكمال الأسعار والمراجعة</Link> : null}
          {inventory ? <Link href="/admin/inventory">مراجعة المخزون والحجوزات</Link> : null}
          {hasPermission(actor.roleCode, "CATEGORIES_READ") ? (
            <Link href="/admin/categories">ترتيب التصنيفات</Link>
          ) : null}
          {actor.roleCode === "OWNER" && operations ? (
            <Link href="/admin/customers">متابعة العملاء</Link>
          ) : null}
        </nav>
      </section>
    </AdminFrame>
  );
}
