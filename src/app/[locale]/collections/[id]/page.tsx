import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogNotice, PageIntro } from "@/components/storefront-ui";
import { CatalogBrowser, type BrowseQuery } from "@/components/catalog-browser";
import { getStoreCategoryById, getStoreCategories, getStoreProductsInCategory } from "@/lib/server/storefront-catalog";
import { displayCategoryName, isLocale } from "@/lib/i18n";
import { site } from "@/lib/site-config";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<BrowseQuery>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const category = await getStoreCategoryById(id);
  if (!category) return {};
  return {
    title: displayCategoryName(category.id, category.nameAr, locale, category.nameEn) + " | Sprtaya & Kanaka",
    alternates: {
      canonical: site.siteUrl + "/" + locale + "/collections/" + id,
      languages: {
        ar: site.siteUrl + "/ar/collections/" + id,
        en: site.siteUrl + "/en/collections/" + id,
      },
    },
  };
}
export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const [category, products, categories] = await Promise.all([getStoreCategoryById(id), getStoreProductsInCategory(id), getStoreCategories()]);
  if (!category) notFound();
  return (
    <>
      <PageIntro
        locale={locale}
        title={displayCategoryName(category.id, category.nameAr, locale, category.nameEn)}
        description={
          locale === "ar"
            ? "اكتشف تفاصيل المجموعة، وتواصل معنا لاختيار قطعتك."
            : "Explore the details of the collection. Speak with us to find your piece."
        }
      />
      <div className="page-content">
        <CatalogNotice locale={locale} />
        <CatalogBrowser
          products={products}
          categories={categories}
          locale={locale}
          basePath={"/" + locale + "/collections/" + id}
          query={query}
          fixedCategory
        />
      </div>
    </>
  );
}
