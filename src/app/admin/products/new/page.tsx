import { requireAdminPage } from "@/lib/server/admin-page";
import { getDatabase } from "@/lib/server/database";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { ProductForm } from "@/app/admin/products/product-form";
import { hasPermission } from "@/lib/admin/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireAdminPage("PRODUCTS_WRITE");
  if (!hasPermission(actor.roleCode, "PRODUCTS_WRITE")) redirect("/admin");
  const [categories, assets, query] = await Promise.all([
    getDatabase().category.findMany({ where: { reviewRequired: false }, select: { id: true, nameAr: true, parentId: true }, orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }] }),
    getDatabase().mediaAsset.findMany({ select: { id: true, altAr: true, originalKey: true, publicUrl: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    searchParams,
  ]);
  return <AdminFrame actor={actor}><AdminPageHeader title="إضافة منتج" description="أدخل المعلومات التي تأكدت منها، واترك السعر فارغاً إن لم يُراجع بعد." /><ProductForm actor={actor} assets={assets} categories={categories} error={query.error} /></AdminFrame>;
}
