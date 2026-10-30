import Link from "next/link";
import { saveProduct, saveManufacturingPolicy, reorderProductMedia } from "@/app/admin/actions";
import { MediaPicker } from "@/app/admin/products/media-picker";
import { decimalFromMinor } from "@/lib/money";
import { VariantEditor, type VariantDraft } from "@/app/admin/products/variant-editor";
import { hasPermission } from "@/lib/admin/permissions";
import type { AdminActor } from "@/lib/server/admin-session";

type CategoryOption = { id: string; nameAr: string; parentId?: string | null };
type ProductRecord = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string | null;
  descriptionAr: string;
  descriptionEn: string | null;
  type: "READY_MADE" | "MADE_TO_ORDER" | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  featured: boolean;
  priceMinor: number | null;
  detailsReviewedAt: Date | null;
  categories: { categoryId: string }[];
  variants: { id: string; nameAr: string; nameEn: string | null; sku: string | null; options: unknown; priceMinor: number | null; widthMm: number | null; heightMm: number | null; depthMm: number | null; weightGrams: number | null; inventory: { quantity: number } | null }[];
  media: { mediaId: string; position: number; media: { altAr: string | null; publicUrl: string | null; originalKey: string; provider: string } }[];
  manufacturingPolicy: {
    available: boolean;
    minProductionDays: number;
    maxProductionDays: number;
    depositMode: "FULL_ADVANCE" | "DEPOSIT";
    depositType: "FIXED_MINOR" | "PERCENT";
    depositValue: number;
    balanceCollection: "BEFORE_DISPATCH" | "CASH_ON_DELIVERY";
    codBalanceEligible: boolean;
  } | null;
};

export function ProductForm({ actor, categories, assets, product, error }: { actor: AdminActor; categories: CategoryOption[]; assets: { id: string; altAr: string | null; originalKey: string; publicUrl: string | null }[]; product?: ProductRecord; error?: string }) {
  const canWrite = hasPermission(actor.roleCode, "PRODUCTS_WRITE");
  const mediaLibrary = new Map(assets.map((asset) => [asset.id, asset]));
  for (const entry of product?.media ?? []) {
    mediaLibrary.set(entry.mediaId, { id: entry.mediaId, ...entry.media });
  }
  const selected = new Set(product?.categories.map((item) => item.categoryId) ?? []);
  const stock = product?.variants.reduce((total, item) => total + (item.inventory?.quantity ?? 0), 0) ?? 0;
  const variantDrafts: VariantDraft[] = product?.variants.map((variant) => {
    const options = variant.options && typeof variant.options === "object" && !Array.isArray(variant.options) ? Object.entries(variant.options as Record<string, unknown>).map(([key, value]) => `${key}=${String(value)}`).join("؛ ") : "";
    return { id: variant.id, nameAr: variant.nameAr, nameEn: variant.nameEn ?? "", sku: variant.sku ?? "", price: variant.priceMinor === null ? "" : decimalFromMinor(variant.priceMinor), optionsText: options, widthMm: variant.widthMm?.toString() ?? "", heightMm: variant.heightMm?.toString() ?? "", depthMm: variant.depthMm?.toString() ?? "", weightGrams: variant.weightGrams?.toString() ?? "", quantity: variant.inventory ? variant.inventory.quantity.toString() : "" };
  }) ?? [];
  const errorMessages: Record<string, string> = {
    invalid: "راجع الحقول المطلوبة وتأكد من تنسيق السعر والكمية.",
    slug: "رابط المنتج مستخدم بالفعل. اختر رابطاً آخر.",
    category: "تعذر العثور على أحد التصنيفات المختارة.",
    stock: "لا يمكن تحويل المنتج إلى تصنيع حسب الطلب قبل تصفير المخزون.",
    publish: "أكمل مراجعة الاسم والسعر والصورة والتصنيف والمخزون أو سياسة التصنيع قبل النشر.",
    inventory: "أدخل كمية مؤكدة لكل متغير جاهز لا يملك رصيداً مسجلاً.",
    policy: "راجع إعدادات التصنيع والدفعة؛ القيمة أو المدة غير صالحة.",
    media: "تعذر حفظ ترتيب الصور أو إحدى الصور المختارة.",
    "variant-stock": "لا يمكن إزالة متغير له رصيد متاح. صفّر رصيده أولاً من صفحة المخزون.",
    sku: "رقم SKU مستخدم في متغير آخر. اختر رقماً فريداً.",
  };
  return (
    <>
      {errorMessages[error ?? ""] ? <p className="admin-error" role="alert">{errorMessages[error ?? ""]}</p> : null}
      <form action={saveProduct} className="admin-panel admin-form">
        {product ? <input name="productId" type="hidden" value={product.id} /> : null}
        <div className="admin-form-grid">
          <label>اسم المنتج بالعربية *<input autoComplete="off" defaultValue={product?.titleAr} maxLength={191} name="titleAr" required /></label>
          <label>التصنيف *<select defaultValue={[...selected]} multiple name="categoryIds" required size={Math.min(Math.max(categories.length, 3), 7)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.nameAr}</option>)}</select><small className="admin-muted">على الكمبيوتر استخدم Ctrl أو ⌘ لاختيار أكثر من تصنيف.</small></label>
          <label>السعر التشغيلي بالجنيه<input defaultValue={product?.priceMinor === null || !product ? "" : decimalFromMinor(product.priceMinor)} inputMode="decimal" name="price" placeholder="أدخل السعر بعد التحقق" type="text" /><small className="admin-muted">لا يُستخدم سعر المصدر إلا بعد التحقق منه.</small></label>
          <label>نوع المنتج *<select defaultValue={product?.type ?? ""} name="type" required><option disabled value="">اختر النوع بعد المراجعة</option><option value="READY_MADE">جاهز ومتوفر بالمخزون</option><option value="MADE_TO_ORDER">يصنع بعد الطلب</option></select></label>
          <label className="admin-check"><input defaultChecked={Boolean(product?.detailsReviewedAt)} name="detailsReviewed" type="checkbox" />راجعت الاسم والتفاصيل</label>
          <label className="admin-check"><input defaultChecked={product?.featured ?? false} name="featured" type="checkbox" />إظهار ضمن مختارات الصفحة الرئيسية</label>
          {product ? <label>الكمية الحالية<input disabled value={stock} /><small className="admin-muted">تُدار الكمية لكل متغير من صفحة المخزون.</small></label> : null}
          <label className="wide">الوصف بالعربية<textarea defaultValue={product?.descriptionAr} maxLength={10000} name="descriptionAr" rows={5} /></label>
          <MediaPicker assets={[...mediaLibrary.values()].map((asset) => ({ id: asset.id, label: asset.altAr || asset.originalKey.split("/").pop() || "صورة", url: asset.publicUrl ?? "/assets/" + asset.originalKey.replace(/^legacy:/, "").split("/").map(encodeURIComponent).join("/") }))} selected={product?.media.map((entry) => entry.mediaId) ?? []} />
          <VariantEditor existingProduct={Boolean(product)} initial={variantDrafts} />
          <details className="wide admin-advanced"><summary>خيارات إضافية</summary><div className="admin-form-grid admin-advanced-grid">
            <label>اسم المنتج بالإنجليزية<input defaultValue={product?.titleEn ?? ""} maxLength={191} name="titleEn" /></label>
            <label>رابط المنتج<input defaultValue={product?.slug ?? "product-" + crypto.randomUUID().slice(0, 8)} maxLength={191} name="slug" required /></label>
            <label className="wide">الوصف بالإنجليزية<textarea defaultValue={product?.descriptionEn ?? ""} maxLength={10000} name="descriptionEn" rows={4} /></label>
          </div></details>
        </div>
        {canWrite ? <div className="admin-form-actions"><button className="admin-button admin-button-primary" type="submit">{product?.status === "PUBLISHED" ? "حفظ التغييرات" : "حفظ كمسودة"}</button><Link className="admin-button" href="/admin/products">إلغاء</Link></div> : null}
      </form>
      {product?.type === "MADE_TO_ORDER" && canWrite ? <ManufacturingForm product={product} /> : null}
      {product ? <GalleryOrderForm product={product} /> : null}
    </>
  );
}

function ManufacturingForm({ product }: { product: ProductRecord }) {
  const policy = product.manufacturingPolicy;
  return <form action={saveManufacturingPolicy} className="admin-panel admin-form">
    <h2>إعدادات التصنيع</h2>
    <input name="productId" type="hidden" value={product.id} />
    <div className="admin-form-grid">
      <label>أقل مدة (أيام)<input defaultValue={policy?.minProductionDays ?? 7} min="1" max="365" name="minDays" type="number" required /></label>
      <label>أقصى مدة (أيام)<input defaultValue={policy?.maxProductionDays ?? 14} min="1" max="365" name="maxDays" type="number" required /></label>
      <label>طريقة الدفعة<select defaultValue={policy?.depositMode ?? "FULL_ADVANCE"} name="depositMode"><option value="FULL_ADVANCE">دفع كامل مقدماً (إعداد فقط)</option><option value="DEPOSIT">عربون</option></select></label>
      <label>قيمة العربون<select defaultValue={policy?.depositType ?? "PERCENT"} name="depositType"><option value="PERCENT">نسبة مئوية</option><option value="FIXED_MINOR">مبلغ بالجنيه</option></select></label>
      <label>قيمة العربون<input defaultValue={policy ? policy.depositType === "FIXED_MINOR" ? decimalFromMinor(policy.depositValue) : policy.depositValue : 100} inputMode={policy?.depositType === "FIXED_MINOR" ? "decimal" : "numeric"} min="0" name="depositValue" step={policy?.depositType === "FIXED_MINOR" ? "0.01" : "1"} type="number" /></label>
      <label>تحصيل المتبقي<select defaultValue={policy?.balanceCollection ?? "BEFORE_DISPATCH"} name="balanceCollection"><option value="BEFORE_DISPATCH">قبل الإرسال</option><option value="CASH_ON_DELIVERY">عند الاستلام (إعداد مستقبلي فقط)</option></select></label>
      <label className="admin-check"><input defaultChecked={policy?.available ?? false} name="available" type="checkbox" />إتاحة التصنيع لهذا المنتج</label>
      <label className="admin-check"><input defaultChecked={policy?.codBalanceEligible ?? false} name="codBalanceEligible" type="checkbox" />السماح بتحصيل المتبقي عند الاستلام (إعداد فقط)</label>
    </div>
    <div className="admin-form-actions"><button className="admin-button" type="submit">حفظ إعدادات التصنيع</button><small className="admin-muted">لا يتم تحصيل أي مدفوعات في هذه المرحلة.</small></div>
  </form>;
}

function GalleryOrderForm({ product }: { product: ProductRecord }) {
  return <section className="admin-panel admin-subsection"><h2>صور المنتج وترتيب المعرض</h2>
    {product.media.length ? <form action={reorderProductMedia} className="admin-gallery-order">
      <input name="productId" type="hidden" value={product.id} />
      {product.media.map((entry) => <label className="admin-gallery-row" key={entry.mediaId}>
        <span>{entry.media.altAr ?? entry.media.originalKey.split("/").pop() ?? "صورة"}{entry.position === 0 ? <b>الصورة الرئيسية</b> : null}</span>
        <input aria-label="ترتيب الصورة" defaultValue={entry.position} min="0" name={"position_" + entry.mediaId} type="number" />
      </label>)}
      <button className="admin-button" type="submit">حفظ ترتيب الصور</button>
    </form> : <p className="admin-muted">لا توجد صور مرتبطة بعد. أضف الصور من مساحة إدارة الوسائط عند إعداد التخزين.</p>}
  </section>;
}
