import "server-only";
import { connection } from "next/server";
import { getAllProducts, getCategoryById, getProductById, getProductBySlug, getProductsInCategory, getVerifiedCategories, normalizeSearch, searchProducts as searchLocal, sortProducts } from "@/lib/catalog";
import { displayCategoryName } from "@/lib/i18n";
import { getDatabase } from "@/lib/server/database";
import type { CatalogCategory, CatalogImage, CatalogProduct, Locale } from "@/lib/types";
import type { Prisma } from "@/generated/prisma/client";

export function databaseCatalogEnabled() {
  return process.env.CATALOG_SOURCE === "mysql";
}

const publicInclude = {
  categories: {
    where: { category: { visible: true, reviewRequired: false } },
    include: { category: true },
    orderBy: { position: "asc" as const },
  },
  media: { include: { media: true }, orderBy: { position: "asc" as const } },
  variants: { where: { active: true }, orderBy: { position: "asc" as const } },
  legacyMapping: true,
} satisfies Prisma.ProductInclude;
const publicCategoryInclude = {
  image: true,
  products: {
    where: { product: { status: "PUBLISHED" as const } },
    orderBy: { position: "asc" as const },
    include: {
      product: {
        include: {
          media: {
            include: { media: true },
            orderBy: { position: "asc" as const },
          },
        },
      },
    },
  },
} satisfies Prisma.CategoryInclude;

function imageFromMedia(media: {
  provider: "LEGACY_LOCAL" | "S3_COMPATIBLE";
  originalKey: string;
  displayKey: string | null;
  publicUrl: string | null;
  width: number | null;
  height: number | null;
  altAr: string | null;
  altEn: string | null;
}): CatalogImage {
  const localPath = media.provider === "LEGACY_LOCAL" ? media.originalKey.replace(/^legacy:/, "") : "";
  return {
    localPath,
    ...(media.provider === "S3_COMPATIBLE" && media.publicUrl ? { publicUrl: media.publicUrl } : {}),
    sourceUrl: "",
    width: media.width,
    height: media.height,
    alt: media.altAr ?? media.altEn ?? "",
  };
}

type PublicProductRow = Prisma.ProductGetPayload<{ include: typeof publicInclude }>;
type PublicCategoryRow = Prisma.CategoryGetPayload<{ include: typeof publicCategoryInclude }>;

function mapProduct(row: PublicProductRow): CatalogProduct {
  const categories = row.categories.map(({ category }) => category).filter((category) => category.visible);
  const images = row.media.map(({ media }) => imageFromMedia(media));
  return {
    id: row.legacyMapping?.sourceProductId ?? row.id,
    slug: row.slug,
    originalUrl: row.legacyMapping?.sourceUrl ?? "",
    nameAr: row.titleAr,
    descriptionAr: row.descriptionAr,
    categoryNamesAr: categories.map((category) => category.nameAr),
    categoryNamesEn: categories.map((category) => category.nameEn ?? ""),
    categoryIds: categories.map((category) => category.sourceId ?? category.slug),
    categoryUrls: categories.map((category) => category.sourceUrl ?? "/collections/" + category.slug),
    categoryNeedsReview: categories.some((category) => category.reviewRequired),
    sourcePrice: null,
    sourceCurrency: row.currency,
    priceMinor: row.priceMinor,
    status: row.status,
    productType: row.type,
    availability: row.availability,
    featured: row.featured,
    variants: row.variants.map((variant) => ({
      id: variant.id,
      nameAr: variant.nameAr,
      nameEn: variant.nameEn,
      sku: variant.sku,
      options: variant.options && typeof variant.options === "object" && !Array.isArray(variant.options) ? variant.options as Record<string, string> : {},
      priceMinor: variant.priceMinor,
    })),
    images,
    purchasable: false,
  };
}

function mapCategory(row: PublicCategoryRow): CatalogCategory {
  return {
    id: row.sourceId ?? row.slug,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    originalUrl: row.sourceUrl ?? "/collections/" + row.slug,
    productUrls: [],
    productCount: row.products.length,
    featured: row.featured,
    image: row.image ? imageFromMedia(row.image) : row.products[0]?.product.media[0]?.media ? imageFromMedia(row.products[0].product.media[0].media) : null,
  };
}

async function publishedRows(): Promise<PublicProductRow[]> {
  if (!databaseCatalogEnabled()) return [];
  await connection();
  return getDatabase().product.findMany({
    where: { status: "PUBLISHED", categories: { some: { category: { visible: true, reviewRequired: false } } } },
    include: publicInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
}

export async function getStoreProducts(): Promise<CatalogProduct[]> {
  if (!databaseCatalogEnabled()) return getAllProducts();
  return (await publishedRows()).map(mapProduct);
}

export async function getStoreProductBySlug(slug: string): Promise<CatalogProduct | undefined> {
  if (!databaseCatalogEnabled()) return getProductBySlug(slug);
  await connection();
  const row = await getDatabase().product.findFirst({
    where: { slug, status: "PUBLISHED", categories: { some: { category: { visible: true, reviewRequired: false } } } },
    include: publicInclude,
  });
  return row ? mapProduct(row) : undefined;
}

export async function getStoreProductById(id: string): Promise<CatalogProduct | undefined> {
  if (!databaseCatalogEnabled()) return getProductById(id);
  await connection();
  const row = await getDatabase().product.findFirst({
    where: {
      status: "PUBLISHED",
      categories: { some: { category: { visible: true, reviewRequired: false } } },
      OR: [{ id }, { legacyMapping: { sourceProductId: id } }],
    },
    include: publicInclude,
  });
  return row ? mapProduct(row) : undefined;
}

export async function getStoreCategories(): Promise<CatalogCategory[]> {
  if (!databaseCatalogEnabled()) return getVerifiedCategories();
  await connection();
  const rows = await getDatabase().category.findMany({
    where: { visible: true, reviewRequired: false, products: { some: { product: { status: "PUBLISHED" } } } },
    include: publicCategoryInclude,
    orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }],
  });
  return rows.map(mapCategory);
}

export async function getStoreCategoryById(id: string): Promise<CatalogCategory | undefined> {
  if (!databaseCatalogEnabled()) return getCategoryById(id);
  await connection();
  const row = await getDatabase().category.findFirst({
    where: { visible: true, reviewRequired: false, OR: [{ sourceId: id }, { slug: id }], products: { some: { product: { status: "PUBLISHED" } } } },
    include: publicCategoryInclude,
  });
  return row ? mapCategory(row) : undefined;
}

export async function getStoreProductsInCategory(id: string): Promise<CatalogProduct[]> {
  if (!databaseCatalogEnabled()) return getProductsInCategory(id);
  await connection();
  const rows = await getDatabase().product.findMany({
    where: {
      status: "PUBLISHED",
      categories: { some: { category: { visible: true, reviewRequired: false, OR: [{ sourceId: id }, { slug: id }] } } },
    },
    include: publicInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return rows.map(mapProduct);
}

export async function searchStoreProducts(query: string, locale: Locale): Promise<CatalogProduct[]> {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  if (!databaseCatalogEnabled()) return searchLocal(query);
  const terms = normalized.split(" ");
  const rows = await publishedRows();
  return rows.map(mapProduct).filter((product) => {
    const labels = product.categoryIds?.map((id, index) => displayCategoryName(id, product.categoryNamesAr[index] ?? "", locale)) ?? [];
    const searchable = normalizeSearch([product.nameAr, product.descriptionAr, ...labels].join(" "));
    return terms.every((term) => searchable.includes(term));
  });
}

export async function getStoreFeaturedProducts(limit = 4): Promise<CatalogProduct[]> {
  if (!databaseCatalogEnabled()) {
    const { getFeaturedProducts } = await import("@/lib/catalog");
    return getFeaturedProducts();
  }
  await connection();
  const rows = await getDatabase().product.findMany({ where: { status: "PUBLISHED", featured: true, categories: { some: { category: { visible: true, reviewRequired: false } } } }, include: publicInclude, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: limit });
  return rows.map(mapProduct);
}

export async function getStoreRelatedProducts(product: CatalogProduct, limit = 4): Promise<CatalogProduct[]> {
  if (!databaseCatalogEnabled()) {
    const { getRelatedProducts } = await import("@/lib/catalog");
    return getRelatedProducts(product, limit);
  }
  const products = await getStoreProducts();
  const categoryIds = new Set(product.categoryIds ?? []);
  return products.filter((candidate) => candidate.id !== product.id && candidate.categoryIds?.some((id) => categoryIds.has(id))).slice(0, limit);
}

export { sortProducts };
