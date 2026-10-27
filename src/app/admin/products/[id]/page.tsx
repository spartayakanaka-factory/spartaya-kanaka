import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getDatabase } from "@/lib/server/database";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { ProductForm } from "@/app/admin/products/product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requireAdminPage("PRODUCTS_READ");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const db = getDatabase();
  const [product, categories, assets] = await Promise.all([
    db.product.findUnique({ where: { id }, include: { legacyMapping: true, categories: { select: { categoryId: true } }, variants: { where: { active: true }, include: { inventory: { select: { quantity: true } } }, orderBy: { position: "asc" } }, media: { include: { media: true }, orderBy: { position: "asc" } }, manufacturingPolicy: true } }),
    db.category.findMany({ select: { id: true, nameAr: true, parentId: true }, orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }] }),
    db.mediaAsset.findMany({ select: { id: true, altAr: true, originalKey: true, publicUrl: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  if (!product) notFound();
  return <AdminFrame actor={actor}><AdminPageHeader title="تعديل المنتج" description={product.titleAr} /><div className="admin-product-meta"><span className="admin-badge">{product.status === "PUBLISHED" ? "منشور" : product.status === "ARCHIVED" ? "مؤرشف" : "مسودة"}</span><span className="admin-muted">{product.legacyMapping ? "مرجع المصنع: " + product.legacyMapping.sourceProductId : "منتج جديد"}</span></div>{query.saved ? <p className="admin-notice" role="status">تم حفظ التغييرات.</p> : null}<ProductForm actor={actor} assets={assets} categories={categories} error={query.error} product={product} /></AdminFrame>;
}
