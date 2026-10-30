import { commerceEnabled } from "@/lib/commerce/runtime";
import { AddToCart } from "@/components/commerce-client";
import { getDatabase } from "@/lib/server/database";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, ProductGrid } from "@/components/storefront-ui";
import { ProductGallery } from "@/components/product-gallery";
import { Icon } from "@/components/icon";
import { getStoreProductBySlug, getStoreCategories, getStoreRelatedProducts } from "@/lib/server/storefront-catalog";
import { getProductImageUrl } from "@/lib/asset-url";
import { getCopy, isLocale, displayCategoryName } from "@/lib/i18n";
import { site } from "@/lib/site-config";
import { getStoreContactSettings } from "@/lib/server/store-settings";
import { formatMoneyMinor } from "@/lib/money";

type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const product = await getStoreProductBySlug(slug);
  if (!product) return {};
  const image = product.images[0];
  return {
    title: product.nameAr + " | Sprtaya & Kanaka",
    description: product.descriptionAr.slice(0, 155) || product.nameAr,
    alternates: {
      canonical: site.siteUrl + "/" + locale + "/products/" + slug,
      languages: {
        ar: site.siteUrl + "/ar/products/" + slug,
        en: site.siteUrl + "/en/products/" + slug,
      },
    },
    openGraph: {
      title: product.nameAr,
      description: product.descriptionAr.slice(0, 155),
      images: image ? [{ url: getProductImageUrl(image), alt: product.nameAr }] : [],
    },
  };
}
export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const [product, categories, contacts] = await Promise.all([getStoreProductBySlug(slug), getStoreCategories(), getStoreContactSettings()]);
  if (!product) notFound();
  const buying = commerceEnabled() ? await getDatabase().product.findUnique({where:{slug},include:{variants:{where:{active:true}}}}) : null;
  const canTestOrder = buying?.status === "PUBLISHED" && buying.priceMinor !== null;
  const ar = locale === "ar",
    base = "/" + locale;
  const category = categories.find((item) => product.categoryIds?.includes(item.id));
  const related = await getStoreRelatedProducts(product);
  return (
    <>
      <div className="detail-breadcrumbs">
        <Breadcrumbs
          locale={locale}
          items={[
            { label: getCopy(locale, "catalog"), href: base + "/products" },
            ...(category
              ? [
                  {
                    label: displayCategoryName(category.id, category.nameAr, locale, category.nameEn),
                    href: base + "/collections/" + category.id,
                  },
                ]
              : []),
          ]}
        />
      </div>
      <article className="product-detail">
        <ProductGallery
          images={product.images}
          name={product.nameAr}
          locale={locale}
        />
        <div className="product-info">
          {category ? (
            <Link className="product-category" href={base + "/collections/" + category.id}>
              {displayCategoryName(category.id, category.nameAr, locale, category.nameEn)}
            </Link>
          ) : null}
          <h1 lang="ar" dir="rtl">
            {product.nameAr}
          </h1>
          {!ar ? <p className="product-source-note">{getCopy(locale, "inArabic")}</p> : null}
          <p className="detail-price">{product.priceMinor !== null && product.priceMinor !== undefined ? formatMoneyMinor(product.priceMinor, locale, product.sourceCurrency ?? "EGP") : ar ? "السعر عند الاستفسار" : "Price on enquiry"}</p>
          <p className="availability-copy">
            {canTestOrder
              ? ar ? "تُراجع الكمية وشروط الدفع والتوصيل عند إتمام طلب الاختبار." : "Quantity, payment and delivery terms are checked at test checkout."
              : ar ? "تواصل مع المصنع لتأكيد السعر والتوافر وخيارات القطعة ومدة التجهيز." : "Contact the factory to confirm price, availability, options and preparation time."}
          </p>
          {product.variants && product.variants.length > 1 ? <section className="variant-details" aria-labelledby="variant-title"><h2 id="variant-title">{ar ? "المتغيرات" : "Available variations"}</h2><ul>{product.variants.map((variant) => <li key={variant.id}><span lang="ar" dir="rtl">{variant.nameAr}</span>{Object.entries(variant.options).length ? <small>{Object.entries(variant.options).map(([key, value]) => `${key}: ${value}`).join(" · ")}</small> : null}{variant.priceMinor !== null ? <strong>{formatMoneyMinor(variant.priceMinor, locale, product.sourceCurrency ?? "EGP")}</strong> : null}</li>)}</ul></section> : null}
          {canTestOrder && buying ? <AddToCart locale={locale} variants={buying.variants.map(v=>({id:v.id,nameAr:v.nameAr}))}/> : null}
          <div className="product-actions">
            <a className="button" href={"tel:" + contacts.phone}>
              <Icon name="phone" />
              {ar ? "استفسر عن القطعة" : "Enquire about this piece"}
            </a>
            <p className="availability-copy">
              {canTestOrder
                ? ar ? "تجربة طلب محلية فقط؛ لا يوجد تحصيل أو شحن فعلي." : "Local order simulation only; no real collection or shipping."
                : ar ? "الطلب والدفع الإلكتروني غير متاحين حالياً." : "Online ordering and payment are not available yet."}
            </p>
          </div>
          <details className="product-accordion" open>
            <summary>{ar ? "عن القطعة" : "About the piece"}</summary>
            <div className="product-description" lang="ar" dir="rtl">
              {product.descriptionAr ||
                (ar
                  ? "تواصل معنا لمعرفة تفاصيل هذه القطعة."
                  : "Contact us for details about this piece.")}
            </div>
          </details>
          <details className="product-accordion">
            <summary>{ar ? "الخيارات والتجهيز" : "Options & preparation"}</summary>
            <p>
              {canTestOrder
                ? ar ? "راجع المتغيرات المعروضة وشروط القطعة والمبلغ والتوصيل في طلب الاختبار." : "Review the listed variants, item terms, amount and delivery at test checkout."
                : ar ? "لا تتوفر خيارات أو مدة تجهيز مؤكدة لهذه القطعة في الموقع. لتحديد المقاس أو الشكل والتأكد من جاهزية القطعة أو إمكانية تصنيعها، اتصل بالمصنع." : "Confirmed variants and lead times are not listed for this piece. Call the factory to discuss sizes, finishes, whether it is ready-made or can be made to order."}
            </p>
          </details>
          <details className="product-accordion">
            <summary>{ar ? "التوصيل والعناية" : "Delivery & care"}</summary>
            <p>
              {ar
                ? "أكد تكلفة الشحن وموعد التسليم وسياسة الاستبدال والعناية بالقطعة مع المصنع قبل الشراء. لا نعرض وعود توصيل أو تعليمات عناية غير مؤكدة."
                : "Confirm delivery cost, timing, returns and care instructions with the factory before purchasing."}
            </p>
          </details>
          <details className="product-accordion">
            <summary>{ar ? "تبحث عن تصنيع خاص؟" : "Looking for custom work?"}</summary>
            <p>
              {ar
                ? "للطلبات الخاصة، تواصل مباشرة مع المصنع لمناقشة التفاصيل."
                : "For custom requests, speak directly with the factory to discuss the details."}
            </p>
            <a className="text-link" href={"tel:" + contacts.phone}>
              {getCopy(locale, "callFactory")}
              <Icon name="arrow" />
            </a>
          </details>
        </div>
      </article>
      {related.length ? (
        <section className="section related-section">
          <div className="section-heading">
            <h2>{ar ? "من نفس المجموعة" : "From the same collection"}</h2>
            {category ? (
              <Link className="text-link" href={base + "/collections/" + category.id}>
                {getCopy(locale, "viewAll")}
                <Icon name="arrow" />
              </Link>
            ) : null}
          </div>
          <ProductGrid products={related} locale={locale} />
        </section>
      ) : null}
    </>
  );
}
