import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/storefront-ui";
import { getCopy, isLocale } from "@/lib/i18n";
import { site } from "@/lib/site-config";
import { getStoreContactSettings } from "@/lib/server/store-settings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: locale === "ar" ? "اتصل بنا | سبرتاية وكنكة" : "Contact | Sprtaya & Kanaka",
    alternates: {
      canonical: site.siteUrl + "/" + locale + "/contact",
      languages: { ar: site.siteUrl + "/ar/contact", en: site.siteUrl + "/en/contact" },
    },
  };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: value } = await params;
  if (!isLocale(value)) notFound();
  const ar = value === "ar";
  const contacts = await getStoreContactSettings();
  return (
    <>
      <PageIntro
        locale={value}
        eyebrow={ar ? "تواصل مباشر" : "Direct contact"}
        title={getCopy(value, "navContact")}
        description={
          ar
            ? "للتواصل مع مصنع سبرتاية وكنكة، اختر الاتصال الهاتفي أو واتساب."
            : "Contact the Sprtaya & Kanaka factory by phone or WhatsApp."
        }
      />
      <div className="page-content editorial-layout">
        <aside className="editorial-aside">
          <strong>{ar ? "تواصل عبر واتساب" : "Contact via WhatsApp"}</strong>
          <span>
            {ar
              ? "صفحة التواصل في الموقع الحالي تشير إلى واتساب."
              : "The current website’s contact page directs customers to WhatsApp."}
          </span>
        </aside>
        <div>
          <h2>{ar ? "تحدث مع المصنع" : "Talk to the factory"}</h2>
          <p>
            {ar
              ? "لطلبات التصنيع الخاص أو الاستفسار عن الكتالوج، تواصل مباشرة مع المصنع."
              : "For custom manufacturing or catalog enquiries, contact the factory directly."}
          </p>
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
