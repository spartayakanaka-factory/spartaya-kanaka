import { effectiveProductPrice, isPositiveProductPrice } from "@/lib/money";

export type PublishableProduct = {
  titleAr: string;
  detailsReviewedAt: Date | null;
  priceMinor: number | null;
  type: "READY_MADE" | "MADE_TO_ORDER" | null;
  media: unknown[];
  categories: { category: { visible: boolean; reviewRequired: boolean } }[];
  variants: { inventory: unknown | null; priceMinor?: number | null }[];
  manufacturingPolicy: { available: boolean } | null;
};

export function productPublicationBlockers(product: PublishableProduct): string[] {
  const blockers: string[] = [];
  if (product.titleAr.trim().length < 2) blockers.push("title");
  if (!product.detailsReviewedAt) blockers.push("details-review");
  if (!isPositiveProductPrice(product.priceMinor)) blockers.push("price");
  if (
    product.variants.some(
      (variant) =>
        !isPositiveProductPrice(effectiveProductPrice(product.priceMinor, variant.priceMinor)),
    )
  )
    blockers.push("variant-price");
  if (!product.media.length) blockers.push("media");
  if (!product.categories.some(({ category }) => category.visible && !category.reviewRequired))
    blockers.push("category");
  if (product.type === "READY_MADE") {
    if (!product.variants.length) blockers.push("variants");
    else if (product.variants.some((variant) => !variant.inventory)) blockers.push("inventory");
  } else if (product.type === "MADE_TO_ORDER") {
    if (!product.manufacturingPolicy?.available) blockers.push("manufacturing-policy");
  } else {
    blockers.push("type");
  }
  return blockers;
}

export const publicationBlockerLabels: Record<string, string> = {
  title: "اسم المنتج يحتاج مراجعة",
  "details-review": "التفاصيل غير معتمدة",
  price: "أدخل سعراً تشغيلياً أكبر من صفر",
  "variant-price": "راجع أسعار المتغيرات؛ السعر الفعلي يجب أن يكون أكبر من صفر",
  media: "لا توجد صورة",
  category: "لا يوجد تصنيف ظاهر ومراجع",
  variants: "أضف متغيراً فعلياً",
  inventory: "سجّل رصيداً لكل متغير جاهز",
  "manufacturing-policy": "راجع سياسة التصنيع",
  type: "حدد نوع المنتج",
};
