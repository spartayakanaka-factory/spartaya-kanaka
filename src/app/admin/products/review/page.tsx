import Image from "next/image";
import Link from "next/link";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { saveBulkProductReview } from "@/app/admin/actions";
import { hasPermission } from "@/lib/admin/permissions";
import { productPublicationBlockers } from "@/lib/admin/product-publication";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getDatabase } from "@/lib/server/database";

export const dynamic = "force-dynamic";
const pageSize = 25;
const blockerLabels: Record<string, string> = {
  title: "اسم المنتج يحتاج مراجعة",
  "details-review": "التفاصيل غير معتمدة",
  price: "السعر التشغيلي غير معتمد",
  media: "لا توجد صورة",
  category: "لا يوجد تصنيف ظاهر ومراجع",
  variants: "أضف متغيراً فعلياً",
  inventory: "سجّل رصيداً لكل متغير جاهز",
  "manufacturing-policy": "راجع سياسة التصنيع",
  type: "حدد نوع المنتج",
};

type ReviewQuery = { q?: string; category?: string; incomplete?: string; page?: string; error?: string; saved?: string };

function sourcePrice(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const data = payload as Record<string, unknown>;
  const raw = data.price;
  if ((typeof raw !== "string" && typeof raw !== "number") || String(raw).trim() === "") return null;
  const currency = typeof data.currency === "string" && data.currency.trim() ? data.currency.trim() : "";
  return [String(raw), currency].filter(Boolean).join(" ");
}

function localAssetUrl(originalKey: string) {
  const path = originalKey.replace(/^legacy:/, "");
  return "/assets/" + path.split("/").map(encodeURIComponent).join("/");
}

function messageForError(error: string | undefined) {
  const messages: Record<string, string> = {
    invalid: "تعذر حفظ المراجعة. راجع الحقول المطلوبة والسعر.",
    missing: "لم يعد أحد المنتجات موجوداً. أعد تحميل الصفحة.",
    permission: "لا تملك صلاحية تعديل منتج منشور.",
    stock: "صفّر المخزون قبل تغيير المنتج إلى تصنيع حسب الطلب.",
    category: "اختر تصنيفاً ظاهراً ومراجعاً.",
    variant: "لإضافة متغير جاهز، أدخل اسمه والكمية صراحةً، وتأكد من عدم وجود متغيرات حالية.",
    select: "حدد منتجاً واحداً على الأقل للنشر.",
    publish: "تعذر النشر: أكمل المتطلبات الظاهرة لكل منتج محدد.",
  };
  return error ? messages[error] ?? null : null;
}

export default async function ProductReviewPage({ searchParams }: { searchParams: Promise<ReviewQuery> }) {
  const actor = await requireAdminPage("PRODUCTS_READ");
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 100);
  const categoryId = query.category ?? "";
  const incompleteOnly = query.incomplete === "1";
  const parsedPage = Number(query.page ?? 1);
  const requestedPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [categories, rawRows] = await Promise.all([
    getDatabase().category.findMany({ orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }], select: { id: true, nameAr: true, visible: true, reviewRequired: true } }),
    getDatabase().product.findMany({
      where: {
        status: { not: "ARCHIVED" },
        ...(q ? { OR: [{ titleAr: { contains: q } }, { titleEn: { contains: q } }, { slug: { contains: q } }] } : {}),
        ...(categoryId ? { categories: { some: { categoryId } } } : {}),
      },
      include: {
        categories: { include: { category: true } },
        media: { include: { media: true }, orderBy: { position: "asc" } },
        variants: { where: { active: true }, include: { inventory: true }, orderBy: { position: "asc" } },
        manufacturingPolicy: true,
        legacyMapping: true,
      },
      orderBy: [{ updatedAt: "desc" }, { titleAr: "asc" }],
      take: 1000,
    }),
  ]);
  const filteredRows = incompleteOnly ? rawRows.filter((product) => productPublicationBlockers(product).length > 0) : rawRows;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const canWrite = hasPermission(actor.roleCode, "PRODUCTS_WRITE");
  const canPublish = hasPermission(actor.roleCode, "PRODUCTS_PUBLISH");
  const eligibleCategories = categories.filter((category) => category.visible && !category.reviewRequired);
  const errorMessage = messageForError(query.error);
  const queryHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (categoryId) params.set("category", categoryId);
    if (incompleteOnly) params.set("incomplete", "1");
    if (nextPage > 1) params.set("page", String(nextPage));
    return "/admin/products/review" + (params.size ? "?" + params.toString() : "");
  };

  return <AdminFrame actor={actor}>
    <AdminPageHeader title="مراجعة الكتالوج" description="راجع بيانات المصدر يدوياً، ثم أدخل السعر التشغيلي والنوع والمخزون الحقيقي قبل النشر." action={<Link className="admin-button" href="/admin/products">كل المنتجات</Link>} />
    {query.saved ? <p className="admin-notice" role="status">{query.saved === "published" ? "حُفظت المراجعات ونُشرت المنتجات المحددة." : "حُفظت مراجعات المنتجات."}</p> : null}
    {errorMessage ? <p className="admin-error" role="alert">{errorMessage}</p> : null}
    <form action="/admin/products/review" className="admin-panel review-filters">
      <label>بحث عن منتج<input defaultValue={q} maxLength={100} name="q" placeholder="اسم المنتج أو الرابط" /></label>
      <label>التصنيف<select defaultValue={categoryId} name="category"><option value="">كل التصنيفات</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nameAr}{category.visible && !category.reviewRequired ? "" : " · يحتاج مراجعة"}</option>)}</select></label>
      <label className="admin-check"><input defaultChecked={incompleteOnly} name="incomplete" type="checkbox" value="1" />غير المكتمل فقط</label>
      <button className="admin-button" type="submit">تطبيق</button>
      <span className="admin-muted">{new Intl.NumberFormat("ar-EG").format(filteredRows.length)} منتج · صفحة {page} من {totalPages}</span>
    </form>
    {rows.length ? <form action={saveBulkProductReview} className="review-bulk-form">
      {canWrite ? rows.map((product) => {
        const blockers = productPublicationBlockers(product);
        const hero = product.media[0]?.media;
        const imageSrc = hero?.publicUrl ?? (hero?.provider === "LEGACY_LOCAL" ? localAssetUrl(hero.originalKey) : null);
        const evidence = sourcePrice(product.legacyMapping?.payload);
        const currentCategories = product.categories.map(({ category }) => category.nameAr);
        return <article className="review-card" key={product.id}>
          <input name="productIds" type="hidden" value={product.id} />
          <header className="review-card-head">
            <label className="review-select"><input aria-label={"اختيار " + product.titleAr + " للنشر"} name="selectedIds" type="checkbox" value={product.id} />اختيار للنشر</label>
            <Link href={"/admin/products/" + product.id}>فتح التفاصيل ↗</Link>
          </header>
          <div className="review-card-body">
            <div className="review-product-media">{imageSrc ? <Image alt={hero?.altAr || product.titleAr} height={104} src={imageSrc} unoptimized width={104} /> : <span aria-label="لا توجد صورة" role="img">—</span>}</div>
            <div className="review-product-main">
              <strong>{product.titleAr}</strong><small dir="ltr">{product.slug}</small>
              <div className="review-metadata"><span>التصنيفات الحالية: {currentCategories.join("، ") || "لا يوجد"}</span><span>الحالة: {product.status === "PUBLISHED" ? "منشور" : product.status === "ARCHIVED" ? "مؤرشف" : "مسودة"}</span></div>
              {evidence ? <p className="review-source-price"><strong>سعر المصدر للمراجعة فقط:</strong> <bdi>{evidence}</bdi></p> : <p className="review-source-price">لا يوجد سعر مصدر مسجل</p>}
              <ul className="review-blockers" aria-label="متطلبات النشر">{blockers.length ? blockers.map((blocker) => <li key={blocker}>{blockerLabels[blocker] ?? blocker}</li>) : <li className="review-ready">مستوفٍ لمتطلبات النشر</li>}</ul>
            </div>
          </div>
          <div className="review-fields">
            <label htmlFor={"title-" + product.id}>الاسم العربي<input defaultValue={product.titleAr} id={"title-" + product.id} maxLength={191} name={"titleAr_" + product.id} required /></label>
            <label htmlFor={"price-" + product.id}>السعر التشغيلي (ج.م.)<input defaultValue={product.priceMinor === null ? "" : (product.priceMinor / 100).toFixed(2)} id={"price-" + product.id} inputMode="decimal" min="0" name={"price_" + product.id} placeholder="أدخل السعر بعد التحقق" step="0.01" type="number" /></label>
            <label htmlFor={"type-" + product.id}>نوع المنتج<select defaultValue={product.type ?? ""} id={"type-" + product.id} name={"type_" + product.id}><option value="">لم يحدد</option><option value="READY_MADE">جاهز مع مخزون</option><option value="MADE_TO_ORDER">تصنيع حسب الطلب</option></select></label>
            <label htmlFor={"category-" + product.id}>إضافة تصنيف موثّق<select defaultValue="" id={"category-" + product.id} name={"categoryId_" + product.id}><option value="">احتفظ بالتصنيفات الحالية</option>{eligibleCategories.map((category) => <option key={category.id} value={category.id}>{category.nameAr}</option>)}</select></label>
            {product.variants.length ? <div className="review-existing-variants"><strong>المتغيرات والمخزون المسجل</strong>{product.variants.map((variant) => <span key={variant.id}>{variant.nameAr} · {variant.inventory ? new Intl.NumberFormat("ar-EG").format(variant.inventory.quantity) : "لا يوجد رصيد"}</span>)}<Link href={"/admin/products/" + product.id}>إدارة المتغيرات في التفاصيل</Link></div> : <>
              <label htmlFor={"variant-" + product.id}>اسم المتغير الجاهز<input id={"variant-" + product.id} maxLength={191} name={"newVariantNameAr_" + product.id} placeholder="أدخل الاسم الفعلي" /></label>
              <label htmlFor={"quantity-" + product.id}>الرصيد الافتتاحي<input id={"quantity-" + product.id} inputMode="numeric" min="0" name={"initialQuantity_" + product.id} placeholder="أدخل الكمية بعد الجرد" type="number" /></label>
            </>}
            <label className="admin-check review-confirm"><input defaultChecked={Boolean(product.detailsReviewedAt)} name={"detailsReviewed_" + product.id} type="checkbox" />راجعت الاسم والتفاصيل</label>
          </div>
        </article>;
      }) : null}
      <div className="review-actions">
        {canWrite ? <button className="admin-button" name="intent" type="submit" value="save">حفظ مراجعات الصفحة</button> : null}
        {canPublish ? <button className="admin-button admin-button-primary" name="intent" type="submit" value="publish">حفظ ونشر المحدد</button> : null}
        <span className="admin-muted">النشر يتحقق من كل المتطلبات داخل الخادم وبعملية واحدة.</span>
      </div>
    </form> : <p className="admin-empty">لا توجد منتجات بهذه المواصفات.</p>}
    {totalPages > 1 ? <nav aria-label="صفحات نتائج مراجعة المنتجات" className="review-pagination"><span>عرض {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filteredRows.length)} من {filteredRows.length}</span><div>{page > 1 ? <Link className="admin-button" href={queryHref(page - 1)}>السابق</Link> : null}{page < totalPages ? <Link className="admin-button" href={queryHref(page + 1)}>التالي</Link> : null}</div></nav> : null}
  </AdminFrame>;
}
