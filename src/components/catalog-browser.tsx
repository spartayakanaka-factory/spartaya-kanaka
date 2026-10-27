import Link from "next/link";
import { CatalogPagination, ProductGrid } from "@/components/storefront-ui";
import { sortProducts } from "@/lib/catalog";
import { displayCategoryName } from "@/lib/i18n";
import type { CatalogProduct, Locale } from "@/lib/types";

export type BrowseQuery = { category?: string; sort?: string; page?: string };

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
  const category = query.category ? categories.find((item) => item.id === query.category) : undefined;
  const filtered =
    category && !fixedCategory
      ? products.filter((product) => product.categoryIds?.includes(category.id) || product.categoryUrls.includes(category.originalUrl))
      : products;
  const sorted = sortProducts(filtered, query.sort);
  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.max(1, Math.min(totalPages, Number.parseInt(query.page ?? "1", 10) || 1));
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);
  const format = new Intl.NumberFormat(locale);
  const filters = {
    ...(category && !fixedCategory ? { category: category.id } : {}),
    ...(query.sort ? { sort: query.sort } : {}),
  };
  return (
    <>
      <div className="catalog-toolbar">
        <p role="status">
          {format.format(sorted.length)} {ar ? "قطعة للاستكشاف" : "pieces to explore"}
        </p>
        <form action={basePath} className="filter-form">
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
            <select id="sort-filter" name="sort" defaultValue={query.sort ?? "featured"}>
              <option value="featured">{ar ? "ترتيب المجموعة" : "Collection order"}</option>
              <option value="name-asc">{ar ? "الاسم: أ إلى ي" : "Name: A to Z (Arabic)"}</option>
              <option value="name-desc">{ar ? "الاسم: ي إلى أ" : "Name: Z to A (Arabic)"}</option>
            </select>
          </div>
          <button className="button filter-submit" type="submit">
            {ar ? "تطبيق" : "Apply"}
          </button>
          {category || (query.sort && query.sort !== "featured") ? (
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
