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
      locale === "ar" ? "الجملة والتصدير | سبرتاية وكنكة" : "Wholesale & export | Sprtaya & Kanaka",
    alternates: {
      canonical: site.siteUrl + "/" + locale + "/wholesale",
      languages: { ar: site.siteUrl + "/ar/wholesale", en: site.siteUrl + "/en/wholesale" },
    },
  };
}

export default async function WholesalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: value } = await params;
  if (!isLocale(value)) notFound();
  const ar = value === "ar";
  const contacts = await getStoreContactSettings();
  return (
    <>
      <PageIntro
        locale={value}
        eyebrow={ar ? "للتجار" : "For trade"}
        title={ar ? "الجملة والتصدير" : "Wholesale & export"}
        description={getCopy(value, "wholesaleIntro")}
      />
      <div className="page-content editorial-layout">
        <aside className="editorial-aside">
          <strong>{ar ? "تواصل مباشر" : "Direct contact"}</strong>
          <span>
            {ar
              ? "تُناقش الكميات والتفاصيل مع المصنع هاتفياً أو عبر واتساب."
              : "Discuss quantities and details directly with the factory by phone or WhatsApp."}
          </span>
        </aside>
        <div>
          <h2>{ar ? "ابدأ بمكالمة" : "Start with a conversation"}</h2>
          <p>{getCopy(value, "wholesaleIntro")}</p>
          <div className="contact-panel">
            <a className="button" href={"tel:" + contacts.phone}>
              {getCopy(value, "callFactory")} <span aria-hidden="true">↗</span>
            </a>
            <a
              className="button button-light"
              href={"https://wa.me/" + contacts.whatsapp.replace(/\D/g, "")}
              target="_blank"
              rel="noreferrer"
            >
              {getCopy(value, "whatsapp")} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
