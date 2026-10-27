import Link from "next/link";
import { site } from "@/lib/site-config";
import { getStoreContactSettings } from "@/lib/server/store-settings";
import { getCopy, displayShortCategoryName } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/header-controls";
import { getStoreCategories } from "@/lib/server/storefront-catalog";
import type { Locale } from "@/lib/types";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const ar = locale === "ar",
    base = "/" + locale;
  const [allCategories, contacts] = await Promise.all([getStoreCategories(), getStoreContactSettings()]);
  const categoryIds = new Set(site.featuredCategoryIds);
  const categories = allCategories.filter((category) => category.featured || categoryIds.has(category.id));
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Link className="brand" href={base} translate="no">
            <span className="brand-ar" lang="ar" dir="rtl">
              سبرتاية وكنكة
            </span>
            <span className="brand-en" dir="ltr">
              Sprtaya &amp; Kanaka
            </span>
          </Link>
          <p>
            {ar
              ? "قطع النحاس والصدف من قلب القاهرة."
              : "Copper & shell pieces from the heart of Cairo."}
          </p>
        </div>
        <nav className="footer-links" aria-label={ar ? "تسوق المجموعات" : "Shop collections"}>
          <h2>{ar ? "تسوق المجموعات" : "Shop collections"}</h2>
          <Link href={base + "/products"}>{getCopy(locale, "catalog")}</Link>
          {categories.map((category) => (
            <Link key={category.id} href={base + "/collections/" + category.id}>
              {displayShortCategoryName(category.id, category.nameAr, locale, category.nameEn)}
            </Link>
          ))}
        </nav>
        <nav
          className="footer-links"
          aria-label={ar ? "عن سبرتاية وكنكة" : "About Sprtaya & Kanaka"}
        >
          <h2>{ar ? "تعرف علينا" : "Get to know us"}</h2>
          <Link href={base + "/about"}>{getCopy(locale, "navAbout")}</Link>
          <Link href={base + "/wholesale"}>{getCopy(locale, "navWholesale")}</Link>
          <Link href={base + "/custom-orders"}>{getCopy(locale, "navCustom")}</Link>
          <Link href={base + "/contact"}>{getCopy(locale, "navContact")}</Link>
          <Link href={base + "/policies"}>
            {ar ? "معلومات الطلب والسياسات" : "Ordering & policies"}
          </Link>
        </nav>
        <div className="footer-contact">
          <h2>{ar ? "تواصل مع المصنع" : "Call the factory"}</h2>
          <a className="phone-number" href={"tel:" + contacts.phone} dir="ltr">
            {contacts.phone}
          </a>
          {contacts.email ? <a href={"mailto:" + contacts.email}>{contacts.email}</a> : null}
          <p>{ar ? "للجملة والتصنيع الخاص." : "Wholesale & custom work."}</p>
          <LanguageSwitch locale={locale} />
        </div>
      </div>
      <div className="footer-bottom">
        <p>
          ©{" "}
          {new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "Africa/Cairo" }).format(
            new Date(),
          )}{" "}
          {ar ? "سبرتاية وكنكة. جميع الحقوق محفوظة." : "Sprtaya & Kanaka. All rights reserved."}
        </p>
        <p>
          {ar
            ? "الطلب والدفع الإلكتروني غير متاحين حالياً."
            : "Online ordering & payment are not available yet."}
        </p>
      </div>
    </footer>
  );
}
