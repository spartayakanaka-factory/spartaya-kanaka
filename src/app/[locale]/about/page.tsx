import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/storefront-ui";
import { getCopy, isLocale } from "@/lib/i18n";
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
    title: locale === "ar" ? "عن المصنع | سبرتاية وكنكة" : "Our story | Sprtaya & Kanaka",
    alternates: {
      canonical: site.siteUrl + "/" + locale + "/about",
      languages: { ar: site.siteUrl + "/ar/about", en: site.siteUrl + "/en/about" },
    },
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: value } = await params;
  if (!isLocale(value)) notFound();
  return (
    <>
      <PageIntro
        locale={value}
        eyebrow={value === "ar" ? "من القاهرة" : "From Cairo"}
        title={value === "ar" ? "عن المصنع" : "Our story"}
        description={getCopy(value, "aboutLead")}
      />
      <div className="page-content editorial-layout">
        <aside className="editorial-aside">
          <strong>{value === "ar" ? "معلومة منشورة" : "Published information"}</strong>
          <span>{getCopy(value, "aboutStory")}</span>
          <p>{getCopy(value, "aboutSource")}</p>
        </aside>
        <div>
          <h2>{value === "ar" ? "النحاس والصدف" : "Copper and shell"}</h2>
          <p>{getCopy(value, "aboutLead")}</p>
          <p>
            {value === "ar"
              ? "تظهر منتجات المصنع في كتالوجه الحالي بأسماء وصور عربية. يعرض هذا الموقع المواد الأصلية كما جُمعت، من دون ترجمة تلقائية لأسماء القطع أو تفاصيلها."
              : "The factory’s current catalog presents pieces with Arabic names and photography. This preview keeps that source information intact and does not publish machine-translated product details."}
          </p>
          <Link className="text-link" href={"/" + value + "/products"}>
            {getCopy(value, "browse")} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </>
  );
}
