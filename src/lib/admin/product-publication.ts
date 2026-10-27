export type PublishableProduct = {
  titleAr: string;
  detailsReviewedAt: Date | null;
  priceMinor: number | null;
  type: "READY_MADE" | "MADE_TO_ORDER" | null;
  media: unknown[];
  categories: { category: { visible: boolean; reviewRequired: boolean } }[];
  variants: { inventory: unknown | null }[];
  manufacturingPolicy: { available: boolean } | null;
};

export function productPublicationBlockers(product: PublishableProduct): string[] {
  const blockers: string[] = [];
  if (product.titleAr.trim().length < 2) blockers.push("title");
  if (!product.detailsReviewedAt) blockers.push("details-review");
  if (product.priceMinor === null || !Number.isSafeInteger(product.priceMinor) || product.priceMinor < 0) blockers.push("price");
  if (!product.media.length) blockers.push("media");
  if (!product.categories.some(({ category }) => category.visible && !category.reviewRequired)) blockers.push("category");
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
