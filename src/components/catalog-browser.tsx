import Link from "next/link";
import { CatalogPagination, ProductGrid } from "@/components/storefront-ui";
import { normalizeSearch, sortProducts } from "@/lib/catalog";
import { displayCategoryName } from "@/lib/i18n";
import type { CatalogProduct, Locale } from "@/lib/types";

export type BrowseQuery = {
  [key in "category" | "sort" | "page" | "q" | "type"]?: string | string[];
};

export function CatalogBrowser({
  products,
  locale,
  basePath,
  query,
  fixedCategory = false,
  categories,
}: {
  products: CatalogProduct[];
  locale: Locale;
  basePath: string;
  query: BrowseQuery;
  fixedCategory?: boolean;
  categories: import("@/lib/types").CatalogCategory[];
}) {
  const ar = locale === "ar";
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const terms = normalizeSearch(search).split(" ").filter(Boolean);
  const type = query.type === "READY_MADE" || query.type === "MADE_TO_ORDER" ? query.type : "";
  const sort = typeof query.sort === "string" ? query.sort : "featured";
  const category = query.category
    ? categories.find((item) => item.id === query.category)
    : undefined;
  const filtered =
    category && !fixedCategory
      ? products.filter(
          (product) =>
            product.categoryIds?.includes(category.id) ||
            product.categoryUrls.includes(category.originalUrl),
        )
      : products;
  const matching = filtered.filter((product) => {
    if (type && product.productType !== type) return false;
    if (!terms.length) return true;
    const searchable = normalizeSearch(
      [
        product.nameAr,
        product.nameEn,
        product.descriptionAr,
        product.descriptionEn,
        ...product.categoryNamesAr,
        ...(product.categoryNamesEn ?? []),
      ].join(" "),
    );
    return terms.every((term) => searchable.includes(term));
  });
  const sorted = sortProducts(matching, sort);
  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.max(
    1,
    Math.min(
      totalPages,
      Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1,
    ),
  );
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);
  const format = new Intl.NumberFormat(locale);
  const filters = {
    ...(category && !fixedCategory ? { category: category.id } : {}),
    ...(sort !== "featured" ? { sort } : {}),
    ...(search ? { q: search } : {}),
    ...(type ? { type } : {}),
  };
  return (
    <>
      <div className="catalog-toolbar">
        <p role="status">
          {format.format(sorted.length)} {ar ? "قطعة للاستكشاف" : "pieces to explore"}
        </p>
        <form
          action={basePath}
          className="filter-form"
          aria-label={ar ? "تصفية المنتجات" : "Filter products"}
        >
          <div className="filter-field">
            <label htmlFor="catalog-query">
              {ar ? "ابحث في هذه الصفحة" : "Search this collection"}
            </label>
            <input
              id="catalog-query"
              name="q"
              type="search"
              maxLength={100}
              defaultValue={search}
            />
          </div>
          {type || products.some((product) => product.productType) ? (
            <div className="filter-field">
              <label htmlFor="type-filter">{ar ? "طريقة التجهيز" : "Fulfillment"}</label>
              <select id="type-filter" name="type" defaultValue={type}>
                <option value="">{ar ? "كل الأنواع" : "All types"}</option>
                <option value="READY_MADE">{ar ? "منتج جاهز" : "Ready-made"}</option>
                <option value="MADE_TO_ORDER">{ar ? "تصنيع حسب الطلب" : "Made to order"}</option>
              </select>
            </div>
          ) : null}
          {!fixedCategory ? (
            <div className="filter-field">
              <label htmlFor="category-filter">{ar ? "التصنيف" : "Category"}</label>
              <select id="category-filter" name="category" defaultValue={category?.id ?? ""}>
                <option value="">{ar ? "كل التصنيفات" : "All categories"}</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {displayCategoryName(item.id, item.nameAr, locale, item.nameEn)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="filter-field">
            <label htmlFor="sort-filter">{ar ? "الترتيب" : "Sort by"}</label>
            <select id="sort-filter" name="sort" defaultValue={sort}>
              <option value="featured">{ar ? "ترتيب المجموعة" : "Collection order"}</option>
              <option value="name-asc">{ar ? "الاسم: أ إلى ي" : "Name: A to Z (Arabic)"}</option>
              <option value="name-desc">{ar ? "الاسم: ي إلى أ" : "Name: Z to A (Arabic)"}</option>
            </select>
          </div>
          <button className="button filter-submit" type="submit">
            {ar ? "تطبيق" : "Apply"}
          </button>
          {search || type || (category && !fixedCategory) || sort !== "featured" ? (
            <Link className="filter-reset" href={basePath}>
              {ar ? "إعادة الضبط" : "Reset"}
            </Link>
          ) : null}
        </form>
      </div>
      <ProductGrid products={visible} locale={locale} headingLevel={2} />
      <CatalogPagination
        locale={locale}
        basePath={basePath}
        currentPage={page}
        totalItems={sorted.length}
        pageSize={pageSize}
        filters={filters}
      />
    </>
  );
}
