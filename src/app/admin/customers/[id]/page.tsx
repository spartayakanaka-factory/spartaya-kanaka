import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getDatabase } from "@/lib/server/database";
import { commerceEnabled } from "@/lib/commerce/runtime";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { orderStateLabels, numberAr } from "@/lib/admin/order-presentation";
import { formatMoneyMinor } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  if (!commerceEnabled()) notFound();
  const actor = await requireAdminPage();
  if (actor.roleCode !== "OWNER") redirect("/admin?error=permission");
  const { id } = await params,
    query = await searchParams;
  if (!/^[a-z\d_-]{1,191}$/i.test(id)) notFound();
  const db = getDatabase(),
    customer = await db.customerUser.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, banned: true },
    });
  if (!customer) notFound();
  const where = { ownerKey: "customer:" + id },
    count = await db.commerceOrder.count({ where }),
    totalPages = Math.max(1, Math.ceil(count / 30)),
    value = Number(query.page ?? 1),
    page = Math.min(Number.isSafeInteger(value) && value > 0 ? value : 1, totalPages);
  const orders = await db.commerceOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 30,
    skip: (page - 1) * 30,
    select: {
      id: true,
      state: true,
      createdAt: true,
      totalMinor: true,
      paidMinor: true,
      currency: true,
    },
  });
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader
        title={customer.name}
        description="سجل الطلبات المرتبطة بالحساب المسجل؛ طلبات الضيوف لا تُربط تلقائياً برقم الهاتف."
        action={
          <Link className="admin-button" href="/admin/customers">
            العودة للعملاء
          </Link>
        }
      />
      <section className="admin-panel">
        <h2>بيانات التواصل</h2>
        <p>
          <bdi>{customer.email}</bdi>
        </p>
        {customer.phone ? (
          <a href={"tel:" + customer.phone}>
            <bdi>{customer.phone}</bdi>
          </a>
        ) : (
          <p className="admin-muted">لم يُسجل رقم هاتف.</p>
        )}
        <p className="admin-badge">{customer.banned ? "الحساب موقوف" : "الحساب متاح"}</p>
      </section>
      <section className="admin-panel">
        <h2>الطلبات ({numberAr(count)})</h2>
        <div className="admin-table-wrap" tabIndex={0} role="region" aria-label="طلبات العميل">
          <table className="admin-table">
            <thead>
              <tr>
                <th>الطلب</th>
                <th>الحالة</th>
                <th>القيمة</th>
                <th>المدفوع المتحقق</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={"/admin/orders/" + o.id}>
                      <bdi>{o.id.slice(0, 8)}</bdi>
                    </Link>
                  </td>
                  <td>{orderStateLabels[o.state] ?? o.state}</td>
                  <td>{formatMoneyMinor(o.totalMinor, "ar", o.currency)}</td>
                  <td>{formatMoneyMinor(o.paidMinor, "ar", o.currency)}</td>
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
          {!orders.length ? <p className="admin-empty">لا توجد طلبات مرتبطة بهذا الحساب.</p> : null}
        </div>
        {totalPages > 1 ? (
          <nav aria-label="صفحات طلبات العميل" className="admin-shortcuts">
            {page > 1 ? <Link href={"?page=" + (page - 1)}>السابق</Link> : null}
            {page < totalPages ? <Link href={"?page=" + (page + 1)}>التالي</Link> : null}
          </nav>
        ) : null}
      </section>
    </AdminFrame>
  );
}
