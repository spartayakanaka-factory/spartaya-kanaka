import { CategoryGrid, PageIntro } from "@/components/storefront-ui";
import { getStoreCategories } from "@/lib/server/storefront-catalog";
import { getCopy, isLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { site } from "@/lib/site-config";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title:
      getCopy(locale, "categories") +
      (locale === "ar" ? " | سبرتاية وكنكة" : " | Sprtaya & Kanaka"),
    alternates: {
      canonical: site.siteUrl + "/" + locale + "/collections",
      languages: { ar: site.siteUrl + "/ar/collections", en: site.siteUrl + "/en/collections" },
    },
  };
}

export default async function CollectionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: value } = await params;
  if (!isLocale(value)) notFound();
  const locale = value;
  const categories = await getStoreCategories();
  return (
    <>
      <PageIntro
        locale={locale}
        eyebrow={locale === "ar" ? "اكتشف حسب التصنيف" : "Explore by category"}
        title={getCopy(locale, "categories")}
      />
      <div className="page-content category-list">
        <CategoryGrid categories={categories} locale={locale} headingLevel={2} />
      </div>
    </>
  );
}
