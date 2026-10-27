import {
  CatalogNotice,
  CatalogPagination,
  PageIntro,
  ProductGrid,
  SearchForm,
} from "@/components/storefront-ui";
import { searchStoreProducts } from "@/lib/server/storefront-catalog";
import { getCopy, isLocale } from "@/lib/i18n";
import { site } from "@/lib/site-config";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return { robots: { index: false, follow: true } };
  return {
    title:
      getCopy(locale, "search") + (locale === "ar" ? " | سبرتاية وكنكة" : " | Sprtaya & Kanaka"),
    robots: { index: false, follow: true },
    alternates: { canonical: site.siteUrl + "/" + locale + "/search" },
  };
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; page?: string }>;
};

export default async function SearchPage({ params, searchParams }: Props) {
  const [{ locale: value }, queryParams] = await Promise.all([params, searchParams]);
  if (!isLocale(value)) notFound();
  const query = Array.isArray(queryParams.q) ? (queryParams.q[0] ?? "") : (queryParams.q ?? "");
  const allResults = await searchStoreProducts(query, value);
  const pageSize = 24;
  const parsedPage = Number.parseInt(queryParams.page ?? "1", 10);
  const page = Number.isFinite(parsedPage)
    ? Math.max(1, Math.min(Math.ceil(allResults.length / pageSize), parsedPage))
    : 1;
  const products = allResults.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      <PageIntro
        locale={value}
        eyebrow={value === "ar" ? "بحث محلي" : "Local search"}
        title={getCopy(value, "search")}
      />
      <div className="page-content">
        <CatalogNotice locale={value} />
        <SearchForm locale={value} initialQuery={query} />
        {query ? (
          <>
            <div className="catalog-toolbar">
              <span>
                {getCopy(value, "resultFor")} <bdi>{query}</bdi>
              </span>
              <strong>{new Intl.NumberFormat(value).format(allResults.length)}</strong>
            </div>
            <ProductGrid products={products} locale={value} headingLevel={2} />
            <CatalogPagination
              locale={value}
              basePath={"/" + value + "/search"}
              currentPage={page}
              totalItems={allResults.length}
              pageSize={pageSize}
              query={query}
            />
          </>
        ) : (
          <div className="empty-state">
            <p>{getCopy(value, "noQuery")}</p>
          </div>
        )}
      </div>
    </>
  );
}
