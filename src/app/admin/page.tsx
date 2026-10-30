import Link from "next/link";
import { getDatabase } from "@/lib/server/database";
import { requireAdminPage } from "@/lib/server/admin-page";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const actor = await requireAdminPage();
  const db = getDatabase();
  const [published, drafts, outOfStock, balances, madeToOrder] = await Promise.all([
    db.product.count({ where: { status: "PUBLISHED" } }),
    db.product.count({ where: { status: "DRAFT" } }),
    db.inventoryBalance.count({ where: { quantity: 0, variant: { active: true }, product: { type: "READY_MADE", status: { not: "ARCHIVED" } } } }),
    db.inventoryBalance.findMany({ where: { variant: { active: true }, product: { type: "READY_MADE", status: { not: "ARCHIVED" } } }, select: { quantity: true, lowStockAt: true } }),
    db.product.count({ where: { type: "MADE_TO_ORDER" } }),
  ]);
  const lowStock = balances.filter((balance) => balance.quantity > 0 && balance.quantity <= balance.lowStockAt).length;
  const stats = [
    ["منتجات منشورة", published, "ظهرت في واجهة المتجر"],
    ["مسودات", drafts, "تحتاج إلى مراجعة أو استكمال"],
    ["نفد المخزون", outOfStock, "منتجات جاهزة بكمية صفر"],
    ["مخزون منخفض", lowStock, "حسب حد التنبيه لكل متغير"],
    ["تصنيع حسب الطلب", madeToOrder, "إعدادات التصنيع"],
  ] as const;
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader title={"أهلاً " + actor.name} description="نظرة سريعة على الكتالوج والمخزون." />
      <section className="admin-stats" aria-label="ملخص المتجر">
        {stats.map(([label, value, note]) => <article className="admin-stat" key={label}><span>{label}</span><strong>{new Intl.NumberFormat("ar-EG").format(value)}</strong><small>{note}</small></article>)}
      </section>
      <section className="admin-panel">
        <h2>ابدأ من هنا</h2>
        <nav className="admin-shortcuts" aria-label="إجراءات سريعة">
          <Link href="/admin/products/new">إضافة منتج</Link>
          <Link href="/admin/products">إدارة المنتجات</Link>
          <Link href="/admin/inventory">تعديل المخزون</Link>
          <Link href="/admin/categories">إدارة التصنيفات</Link>
        </nav>
      </section>
      <section className="admin-panel">
        <h2>ملاحظة الكتالوج</h2>
        <p className="admin-muted">المنتجات المستوردة من الملفات القديمة تبدأ كمسودات. راجع النوع والتصنيف والصور والسعر قبل النشر.</p>
      </section>
    </AdminFrame>
  );
}
