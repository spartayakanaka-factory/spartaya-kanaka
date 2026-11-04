import { publishProduct } from "@/app/admin/actions";
import { hasPermission } from "@/lib/admin/permissions";
import {
  productPublicationBlockers,
  publicationBlockerLabels,
} from "@/lib/admin/product-publication";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getDatabase } from "@/lib/server/database";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { ProductForm } from "@/app/admin/products/product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const actor = await requireAdminPage("PRODUCTS_READ");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const db = getDatabase();
  const [product, categories, assets] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        legacyMapping: true,
        categories: { include: { category: { select: { visible: true, reviewRequired: true } } } },
        variants: {
          where: { active: true },
          include: { inventory: { select: { quantity: true } } },
          orderBy: { position: "asc" },
        },
        media: { include: { media: true }, orderBy: { position: "asc" } },
        manufacturingPolicy: true,
      },
    }),
    db.category.findMany({
      select: { id: true, nameAr: true, parentId: true },
      orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }],
    }),
    db.mediaAsset.findMany({
      select: { id: true, altAr: true, originalKey: true, publicUrl: true },
      orderBy: { createdAt: "desc" },
      take: 36,
    }),
  ]);
  if (!product) notFound();
  const blockers = productPublicationBlockers(product);
  const canPublish = hasPermission(actor.roleCode, "PRODUCTS_PUBLISH");
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader title="تعديل المنتج" description={product.titleAr} />
      <div className="admin-product-meta">
        <span className="admin-badge">
          {product.status === "PUBLISHED"
            ? "منشور"
            : product.status === "ARCHIVED"
              ? "مؤرشف"
              : "مسودة"}
        </span>
        <span className="admin-muted">
          {product.legacyMapping
            ? "مرجع المصنع: " + product.legacyMapping.sourceProductId
            : "منتج جديد"}
        </span>
      </div>
      {query.saved ? (
        <p className="admin-notice" role="status">
          تم حفظ التغييرات.
        </p>
      ) : null}
      <section className="admin-panel publication-summary" aria-labelledby="publication-title">
        <h2 id="publication-title">جاهزية النشر</h2>
        {product.status === "ARCHIVED" ? (
          <p>المنتج مؤرشف.</p>
        ) : (
          <>
            {blockers.length ? (
              <ul className="publication-checklist">
                {blockers.map((blocker) => (
                  <li key={blocker}>{publicationBlockerLabels[blocker]}</li>
                ))}
              </ul>
            ) : (
              <p>
                {product.status === "PUBLISHED"
                  ? "المنتج ظاهر في المتجر."
                  : "النسخة المحفوظة جاهزة للنشر."}
              </p>
            )}
            {canPublish && product.status === "DRAFT" && !blockers.length ? (
              <form action={publishProduct.bind(null, product.id, true)}>
                <button className="admin-button" type="submit">
                  نشر النسخة المحفوظة
                </button>
              </form>
            ) : null}
            {product.status === "DRAFT" ? (
              <p className="admin-muted">احفظ تعديلاتك لتحديث حالة الجاهزية.</p>
            ) : null}
          </>
        )}
      </section>
      <ProductForm
        actor={actor}
        assets={assets}
        categories={categories}
        error={query.error}
        product={product}
      />
    </AdminFrame>
  );
}
