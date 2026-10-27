import { CatalogNotice, PageIntro } from "@/components/storefront-ui";
import { CatalogBrowser, type BrowseQuery } from "@/components/catalog-browser";
import { getStoreCategories, getStoreProducts } from "@/lib/server/storefront-catalog";
import { getCopy, isLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { site } from "@/lib/site-config";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<BrowseQuery> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: getCopy(locale, "catalog") + " | Sprtaya & Kanaka",
    description:
      locale === "ar"
        ? "تصفح قطع النحاس والصدف. اختر التصنيف ورتب القطع لتجد ما يناسبك."
        : "Browse copper and shell pieces. Filter by collection and explore the factory catalog.",
    alternates: {
      canonical: site.siteUrl + "/" + locale + "/products",
      languages: { ar: site.siteUrl + "/ar/products", en: site.siteUrl + "/en/products" },
    },
  };
}
export default async function ProductsPage({ params, searchParams }: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const [products, categories] = await Promise.all([getStoreProducts(), getStoreCategories()]);
  return (
    <>
      <PageIntro
        locale={locale}
        title={getCopy(locale, "catalog")}
        description={
          locale === "ar"
            ? "نحاس وصدف، لكل يوم وللمناسبات. اختر التصنيف واكتشف قطعتك."
            : "Copper and shell for everyday rituals and special occasions. Find your piece."
        }
      />
      <div className="page-content">
        <CatalogNotice locale={locale} />
        <CatalogBrowser
          products={products}
          categories={categories}
          locale={locale}
          basePath={"/" + locale + "/products"}
          query={query}
        />
      </div>
    </>
  );
}
