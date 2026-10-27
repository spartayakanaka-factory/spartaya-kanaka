import Link from "next/link";
import { getDatabase } from "@/lib/server/database";
import { requireAdminPage } from "@/lib/server/admin-page";
import { hasPermission } from "@/lib/admin/permissions";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { archiveProduct, duplicateProduct, publishProduct } from "@/app/admin/actions";
import { formatMoneyMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const actor = await requireAdminPage("PRODUCTS_READ");
  const query = await searchParams;
  const status = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(query.status ?? "") ? query.status as "DRAFT" | "PUBLISHED" | "ARCHIVED" : undefined;
  const rows = await getDatabase().product.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(query.q ? { OR: [{ titleAr: { contains: query.q } }, { titleEn: { contains: query.q } }, { slug: { contains: query.q } }] } : {}),
    },
    include: { categories: { include: { category: true } }, variants: { include: { inventory: true } }, media: true },
    orderBy: [{ updatedAt: "desc" }, { titleAr: "asc" }],
    take: 200,
  });
  const canWrite = hasPermission(actor.roleCode, "PRODUCTS_WRITE");
  const canPublish = hasPermission(actor.roleCode, "PRODUCTS_PUBLISH");
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader title="المنتجات" description="راجع المنتجات قبل نشرها في واجهة المتجر." action={canWrite ? <div className="admin-row-actions"><Link className="admin-button" href="/admin/products/review">مراجعة الكتالوج</Link><Link className="admin-button admin-button-primary" href="/admin/products/new">إضافة منتج</Link></div> : undefined} />
      <form action="/admin/products" className="admin-toolbar">
        <div className="admin-filter">
          <label>بحث عن منتج<input defaultValue={query.q} name="q" placeholder="الاسم أو الرابط" /></label>
          <label>الحالة<select defaultValue={status ?? ""} name="status"><option value="">كل الحالات</option><option value="DRAFT">مسودة</option><option value="PUBLISHED">منشور</option><option value="ARCHIVED">مؤرشف</option></select></label>
          <button className="admin-button" type="submit">بحث</button>
        </div>
        <span className="admin-muted">{new Intl.NumberFormat("ar-EG").format(rows.length)} منتج</span>
      </form>
      <div className="admin-table-wrap">
        {rows.length ? <table className="admin-table"><thead><tr><th>المنتج</th><th>التصنيف</th><th>السعر</th><th>الحالة</th><th>آخر تحديث</th><th>إجراءات</th></tr></thead><tbody>
          {rows.map((product) => <tr key={product.id}>
            <td><Link href={canWrite ? "/admin/products/" + product.id : "/admin/products"}>{product.titleAr}</Link><small className="admin-table-sub">{product.slug}</small></td>
            <td>{product.categories.map(({ category }) => category.nameAr).join("، ") || "—"}</td>
            <td>{product.priceMinor === null ? "غير محدد" : formatMoneyMinor(product.priceMinor, "ar", product.currency)}</td>
            <td><span className={"admin-badge " + (product.status === "PUBLISHED" ? "admin-badge-success" : product.status === "DRAFT" ? "admin-badge-warning" : "")}>{product.status === "PUBLISHED" ? "منشور" : product.status === "DRAFT" ? "مسودة" : "مؤرشف"}</span></td>
            <td>{new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(product.updatedAt)}</td>
            <td><div className="admin-row-actions">
              {canWrite ? <Link href={"/admin/products/" + product.id}>تعديل</Link> : null}
              {canWrite ? <form action={duplicateProduct.bind(null, product.id)}><button className="admin-text-button" type="submit">نسخ</button></form> : null}
              {canPublish && product.status !== "ARCHIVED" ? <form action={publishProduct.bind(null, product.id, product.status !== "PUBLISHED")}><button className="admin-text-button" type="submit">{product.status === "PUBLISHED" ? "إلغاء النشر" : "نشر"}</button></form> : null}
              {canWrite && product.status !== "ARCHIVED" ? <form action={archiveProduct.bind(null, product.id)}><button className="admin-text-button admin-text-danger" type="submit">أرشفة</button></form> : null}
            </div></td>
          </tr>)}
        </tbody></table> : <p className="admin-empty">لا توجد منتجات بهذه المواصفات.</p>}
      </div>
    </AdminFrame>
  );
}
