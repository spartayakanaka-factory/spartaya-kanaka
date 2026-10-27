import rawCategories from "../../sprtaya-kanaka-assets/بيانات/categories.json";
import rawProducts from "../../sprtaya-kanaka-assets/بيانات/products.json";
import type { CatalogCategory, CatalogImage, CatalogProduct } from "@/lib/types";
import { site } from "@/lib/site-config";
import { displayCategoryName } from "@/lib/i18n";
export { getProductImageUrl } from "@/lib/asset-url";

type RawImage = {
  source_url?: string;
  local_path?: string;
  width?: number | null;
  height?: number | null;
  status?: string;
};

type RawProduct = {
  id: string;
  url: string;
  name_ar: string;
  description?: string;
  category_names?: string[];
  category_urls?: string[];
  category_review_required?: boolean;
  price?: string | number | null;
  currency?: string | null;
  images?: RawImage[];
};

type RawCategory = {
  id: string;
  name_ar: string;
  url: string;
  product_urls?: string[];
  review_required?: boolean;
  status?: string;
};

const productRows = rawProducts as RawProduct[];
const categoryRows = (rawCategories as { categories: RawCategory[] }).categories;

function toProduct(row: RawProduct): CatalogProduct {
  const images: CatalogImage[] = (row.images ?? [])
    .filter((image) => image.local_path && image.status !== "failed")
    .map((image) => ({
      localPath: image.local_path as string,
      sourceUrl: image.source_url ?? "",
      width: image.width ?? null,
      height: image.height ?? null,
      alt: row.name_ar,
    }));

  return {
    id: row.id,
    slug: row.url.replace(/\/+$/, "").split("/").pop() ?? row.id,
    originalUrl: row.url,
    nameAr: row.name_ar,
    descriptionAr: row.description ?? "",
    categoryNamesAr: row.category_names ?? [],
    categoryNamesEn: (row.category_urls ?? []).map((url) => {
      const category = categoryRows.find((item) => item.url === url);
      return category ? displayCategoryName(category.id, category.name_ar, "en") : "";
    }),
    categoryUrls: row.category_urls ?? [],
    categoryIds: (row.category_urls ?? []).map((url) => categoryRows.find((item) => item.url === url)?.id ?? "").filter(Boolean),
    categoryNeedsReview: Boolean(row.category_review_required),
    sourcePrice: row.price === undefined || row.price === null ? null : String(row.price),
    sourceCurrency: row.currency ?? null,
    images,
    purchasable: false,
  };
}

const allProducts = productRows.map(toProduct);
const productsBySlug = new Map(allProducts.map((product) => [product.slug, product]));
const productsById = new Map(allProducts.map((product) => [product.id, product]));

const allCategories: CatalogCategory[] = categoryRows
  .filter(
    (category) =>
      !category.review_required &&
      category.status !== "inaccessible" &&
      (category.product_urls?.length ?? 0) > 0,
  )
  .map((category) => ({
    id: category.id,
    nameAr: category.name_ar,
    originalUrl: category.url,
    productUrls: category.product_urls ?? [],
    productCount: allProducts.filter((product) => product.categoryUrls.includes(category.url))
      .length,
  }))
  .filter((category) => category.productCount > 0);

export function getAllProducts(): CatalogProduct[] {
  return allProducts;
}

export function getProductBySlug(slug: string): CatalogProduct | undefined {
  return productsBySlug.get(slug);
}

export function getProductById(id: string): CatalogProduct | undefined {
  return productsById.get(id);
}

export function getVerifiedCategories(): CatalogCategory[] {
  return allCategories;
}

export function getCategoryById(id: string): CatalogCategory | undefined {
  return allCategories.find((category) => category.id === id);
}

export function getProductsInCategory(id: string): CatalogProduct[] {
  const category = getCategoryById(id);
  if (!category) return [];
  return allProducts.filter((product) => product.categoryUrls.includes(category.originalUrl));
}

export function searchProducts(query: string): CatalogProduct[] {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  const terms = normalized.split(" ");
  return allProducts.filter((product) => {
    const categories = allCategories.filter((category) =>
      product.categoryUrls.includes(category.originalUrl),
    );
    const searchable = normalizeSearch(
      [
        product.nameAr,
        product.descriptionAr,
        ...categories.map((category) => displayCategoryName(category.id, category.nameAr, "en")),
      ].join(" "),
    );
    return terms.every((term) => searchable.includes(term));
  });
}

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export function getFeaturedProducts(): CatalogProduct[] {
  return site.featuredProductIds
    .map((id) => productsById.get(id))
    .filter((product): product is CatalogProduct => Boolean(product));
}

export function sortProducts(products: CatalogProduct[], sort?: string): CatalogProduct[] {
  if (sort === "name-asc" || sort === "name-desc") {
    return [...products].sort(
      (a, b) => (sort === "name-desc" ? -1 : 1) * a.nameAr.localeCompare(b.nameAr, "ar"),
    );
  }
  return products;
}

export function getRelatedProducts(product: CatalogProduct, limit = 4): CatalogProduct[] {
  return allProducts
    .filter(
      (candidate) =>
        candidate.id !== product.id &&
        product.categoryUrls.some((url) => candidate.categoryUrls.includes(url)),
    )
    .slice(0, limit);
}

export function getCatalogStats() {
  return {
    products: allProducts.length,
    categories: allCategories.length,
    unassignedProducts: allProducts.filter((product) => product.categoryNeedsReview).length,
  };
}
