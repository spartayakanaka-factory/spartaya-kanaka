import { commerceEnabled } from "@/lib/commerce/runtime";
import Link from "next/link";
import { HeaderControls } from "@/components/header-controls";
import { getCopy, displayCategoryName, displayShortCategoryName } from "@/lib/i18n";
import { getStoreCategories } from "@/lib/server/storefront-catalog";
import { site } from "@/lib/site-config";
import { getStoreContactSettings } from "@/lib/server/store-settings";
import type { Locale } from "@/lib/types";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const base = "/" + locale;
  const [allCategories, contacts] = await Promise.all([getStoreCategories(), getStoreContactSettings()]);
  const categoryIds = new Set(site.featuredCategoryIds);
  const categories = allCategories.filter((category) => category.featured || categoryIds.has(category.id));
  const links = [
    { href: base + "/products", label: getCopy(locale, "catalog") },
    ...categories.map((category) => ({
      href: base + "/collections/" + category.id,
      label: displayCategoryName(category.id, category.nameAr, locale, category.nameEn),
    })),
    { href: base + "/collections", label: getCopy(locale, "browseCategories") },
    { href: base + "/about", label: getCopy(locale, "navAbout") },
    { href: base + "/wholesale", label: getCopy(locale, "navWholesale") },
    { href: base + "/custom-orders", label: getCopy(locale, "navCustom") },
    { href: base + "/contact", label: getCopy(locale, "navContact") },
  ];
  return (
    <>
      <a className="skip-link" href="#main">
        {ar ? "تجاوز إلى المحتوى" : "Skip to content"}
      </a>
      <header className="site-masthead">
        <div className="topline">
          <p>{ar ? "نحاس وصدف من قلب القاهرة" : "Copper & shell, from the heart of Cairo"}</p>
          <a href={"tel:" + contacts.phone}>
            {ar ? "للجملة والتصنيع الخاص، تحدث معنا" : "Wholesale & custom work? Let’s talk"}
          </a>
        </div>
        <div className="site-header">
          <Link className="brand" href={base} translate="no">
            <span className="brand-ar" lang="ar" dir="rtl">
              سبرتاية وكنكة
            </span>
            <span className="brand-en" dir="ltr">
              Sprtaya &amp; Kanaka
            </span>
          </Link>
          <nav className="desktop-nav" aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
            <Link href={base + "/products"}>{ar ? "تسوق القطع" : "Shop all"}</Link>
            <Link href={base + "/collections"}>{getCopy(locale, "categories")}</Link>
            <Link href={base + "/about"}>{getCopy(locale, "navAbout")}</Link>
            <Link href={base + "/wholesale"}>{getCopy(locale, "navWholesale")}</Link>
            <Link href={base + "/contact"}>{getCopy(locale, "navContact")}</Link>
          </nav>
          <HeaderControls commerce={commerceEnabled()} factoryPhone={contacts.phone} locale={locale} links={links} />
        </div>
      </header>
      <nav className="category-nav" aria-label={ar ? "تسوق حسب التصنيف" : "Shop by category"}>
        {categories.map((category) => (
          <Link key={category.id} href={base + "/collections/" + category.id}>
            {displayShortCategoryName(category.id, category.nameAr, locale, category.nameEn)}
          </Link>
        ))}
      </nav>
    </>
  );
}
