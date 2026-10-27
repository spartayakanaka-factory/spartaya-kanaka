import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { resolve, sep } from "node:path";

export type LegacyImage = {
  source_url?: string;
  local_path?: string;
  width?: number | null;
  height?: number | null;
  bytes?: number;
  sha256?: string;
  mime_type?: string;
  status?: string;
  primary?: boolean;
};

export type LegacyProduct = {
  id: string;
  url: string;
  name_ar: string;
  description?: string;
  category_urls?: string[];
  price?: string | number | null;
  currency?: string | null;
  images?: LegacyImage[];
  [key: string]: unknown;
};

export type LegacyCategory = {
  id: string;
  name_ar: string;
  url: string;
  product_urls?: string[];
  review_required?: boolean;
};

export const isImportableLegacyImage = (image: LegacyImage) =>
  Boolean(image.local_path && image.status !== "failed");

export function uniqueProductImagePaths(products: LegacyProduct[]) {
  return [
    ...new Set(
      products.flatMap((product) =>
        (product.images ?? [])
          .filter(isImportableLegacyImage)
          .map((image) => image.local_path as string),
      ),
    ),
  ];
}

export function resolveLegacyAssetPath(assetRoot: string, localPath: string) {
  const resolvedRoot = resolve(assetRoot);
  const safePath = resolve(resolvedRoot, localPath);
  if (safePath !== resolvedRoot && !safePath.startsWith(resolvedRoot + sep)) {
    throw new Error("Image path is outside the preserved asset archive.");
  }
  return safePath;
}

export function legacyProductSlug(row: LegacyProduct) {
  const tail = new URL(row.url).pathname.split("/").filter(Boolean).pop();
  const normalized = (tail ?? row.id)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
  return normalized || "legacy-" + row.id;
}

export function buildLegacyProductDraft(
  row: LegacyProduct,
  categoryIds: ReadonlyMap<string, string>,
  mediaIds: ReadonlyMap<string, string>,
): Prisma.ProductCreateInput {
  const linkedCategories = [
    ...new Set(
      (row.category_urls ?? [])
        .map((url) => categoryIds.get(url))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const seenPaths = new Set<string>();
  const images = (row.images ?? []).filter((image) => {
    if (!isImportableLegacyImage(image) || !image.local_path || !mediaIds.has(image.local_path)) {
      return false;
    }
    if (seenPaths.has(image.local_path)) return false;
    seenPaths.add(image.local_path);
    return true;
  });

  return {
    slug: legacyProductSlug(row),
    titleAr: String(row.name_ar || "منتج يحتاج مراجعة").slice(0, 191),
    descriptionAr: String(row.description ?? ""),
    type: null,
    status: "DRAFT",
    availability: "UNAVAILABLE",
    priceMinor: null,
    currency: String(row.currency ?? "EGP").slice(0, 3) || "EGP",
    categories: {
      create: linkedCategories.map((categoryId, position) => ({ categoryId, position })),
    },
    media: {
      create: images.map((image, position) => ({
        mediaId: mediaIds.get(image.local_path as string) as string,
        position,
      })),
    },
  };
}

export async function createLegacyProductIfUnmapped(
  db: PrismaClient,
  row: LegacyProduct,
  data: Prisma.ProductCreateInput,
): Promise<"imported" | "skipped"> {
  const existing = await db.legacyProductMapping.findFirst({
    where: { sourceProductId: row.id },
    select: { id: true },
  });
  if (existing) return "skipped";

  await db.$transaction(async (tx) => {
    const product = await tx.product.create({ data });
    await tx.legacyProductMapping.create({
      data: {
        sourceProductId: row.id,
        sourceUrl: row.url.slice(0, 512),
        productId: product.id,
        payload: row as object,
      },
    });
  });
  return "imported";
}

export function summarizeLegacyCatalog(
  products: LegacyProduct[],
  categories: LegacyCategory[],
  missingPaths: ReadonlySet<string>,
) {
  const paths = uniqueProductImagePaths(products);
  const categoryUrls = new Set(categories.map((category) => category.url));
  return {
    sourceProducts: products.length,
    sourceCategories: categories.length,
    sourceVerifiedCategories: categories.filter(
      (category) => !category.review_required && (category.product_urls ?? []).length > 0,
    ).length,
    uniqueArchivedImages: paths.length,
    missingArchivedImageFiles: paths.filter((path) => missingPaths.has(path)).length,
    galleryReferences: products.reduce(
      (count, product) => count + (product.images ?? []).filter(isImportableLegacyImage).length,
      0,
    ),
    productsWithDownloadedImages: products.filter((product) =>
      (product.images ?? []).some(isImportableLegacyImage),
    ).length,
    productsWithoutDownloadedImages: products.filter(
      (product) => !(product.images ?? []).some(isImportableLegacyImage),
    ).length,
    sourceRowsWithPriceEvidence: products.filter(
      (product) =>
        product.price !== undefined &&
        product.price !== null &&
        String(product.price).trim() !== "",
    ).length,
    operationalPricesImported: 0,
    productsToCreateAsDrafts: products.length,
    unmappedCategoryReferences: products.reduce(
      (count, product) =>
        count + (product.category_urls ?? []).filter((url) => !categoryUrls.has(url)).length,
      0,
    ),
  };
}
