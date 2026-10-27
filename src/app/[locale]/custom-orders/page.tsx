import type { Metadata } from "next";
import { PageIntro } from "@/components/storefront-ui";
import { getCopy, isLocale } from "@/lib/i18n";
import { site } from "@/lib/site-config";
import { getStoreContactSettings } from "@/lib/server/store-settings";
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
      locale === "ar" ? "التصنيع الخاص | سبرتاية وكنكة" : "Custom manufacturing | Sprtaya & Kanaka",
    alternates: {
      canonical: site.siteUrl + "/" + locale + "/custom-orders",
      languages: { ar: site.siteUrl + "/ar/custom-orders", en: site.siteUrl + "/en/custom-orders" },
    },
  };
}

export default async function CustomOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: value } = await params;
  if (!isLocale(value)) notFound();
  const ar = value === "ar";
  const contacts = await getStoreContactSettings();
  return (
    <>
      <PageIntro
        locale={value}
        eyebrow={ar ? "طلب خاص" : "Made to order"}
        title={ar ? "التصنيع الخاص" : "Custom manufacturing"}
        description={getCopy(value, "customIntro")}
      />
      <div className="page-content editorial-layout">
        <aside className="editorial-aside">
          <strong>{ar ? "التواصل هاتفياً" : "Telephone contact"}</strong>
          <span>
            {ar
              ? "التصنيع المخصص يُناقش مباشرة مع المصنع؛ لا يوجد نموذج طلب أو تسعير إلكتروني."
              : "Custom manufacturing is discussed directly with the factory. There is no online quote or order form."}
          </span>
        </aside>
        <div>
          <h2>{ar ? "كل طلب يبدأ بمكالمة" : "Every custom request starts with a call"}</h2>
          <p>{getCopy(value, "customIntro")}</p>
          <a className="button" href={"tel:" + contacts.phone}>
            {getCopy(value, "callFactory")} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </>
  );
}
