import Link from "next/link";
import Image from "next/image";
import { CategoryGrid, ProductGrid } from "@/components/storefront-ui";
import { HeroShowcase } from "@/components/hero-showcase";
import { Icon } from "@/components/icon";
import { getProductImageUrl } from "@/lib/asset-url";
import { getStoreCategories, getStoreFeaturedProducts, getStoreProductById } from "@/lib/server/storefront-catalog";
import { merchandising } from "@/lib/merchandising";
import { getProductById as getEditorialProduct } from "@/lib/catalog";
import { getCopy, isLocale } from "@/lib/i18n";
import { site } from "@/lib/site-config";
import { getStoreContactSettings } from "@/lib/server/store-settings";
import type { Metadata } from "next";
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
      locale === "ar"
        ? "سبرتاية وكنكة | نحاس وصدف من قلب القاهرة"
        : "Sprtaya & Kanaka | Copper & Shell from Cairo",
    description:
      locale === "ar"
        ? "اكتشف السبرتايات والكنك وأطقم القهوة والصواني وقطع الصدف من مصنع سبرتاية وكنكة. تواصل مع المصنع لمعرفة السعر والتوافر."
        : "Explore authentic copper coffee sets, burners, trays and natural shell pieces from Sprtaya & Kanaka, Cairo. Contact the factory for prices and availability.",
    alternates: {
      canonical: site.siteUrl + "/" + locale,
      languages: { ar: site.siteUrl + "/ar", en: site.siteUrl + "/en" },
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ar = locale === "ar";
  const base = "/" + locale;
  const [allCategories, featuredProducts, heroProducts, detailProduct, shell, coffee, contacts] = await Promise.all([
    getStoreCategories(),
    getStoreFeaturedProducts(),
    Promise.all([
      getStoreProductById(merchandising.heroProductId),
      getStoreProductById(merchandising.detailProductId),
      getStoreProductById(merchandising.coffeeProductId),
    ]),
    getStoreProductById(merchandising.detailProductId),
    getStoreProductById(merchandising.shellProductId),
    getStoreProductById(merchandising.coffeeProductId),
    getStoreContactSettings(),
  ]);
  const curatedCategoryIds = new Set(merchandising.homeCategoryIds);
  const curatedCategories = allCategories.filter((category) => category.featured || curatedCategoryIds.has(category.id));
  const categories = curatedCategories.length ? curatedCategories : allCategories.slice(0, 8);
  const choices = [
    { product: heroProducts[0], sourceId: merchandising.heroProductId, label: ar ? "طقم القهوة" : "The coffee set" },
    { product: heroProducts[1], sourceId: merchandising.detailProductId, label: ar ? "السبرتاية والكنكة" : "The coffee ritual" },
    { product: heroProducts[2], sourceId: merchandising.coffeeProductId, label: ar ? "الدلة العربية" : "The Arabic pot" },
  ].flatMap(({ product, sourceId, label }) => {
    // Approved editorial photography remains part of the factory's art
    // direction while catalog records await review. Draft detail links stay hidden.
    const image = product?.images[0] ?? getEditorialProduct(sourceId)?.images[0];
    return image
      ? [
          {
            label,
            name: product?.nameAr ?? label,
            src: getProductImageUrl(image),
            href: product ? base + "/products/" + product.slug : base + "/products",
            width: image.width ?? 900,
            height: image.height ?? 1200,
            unoptimized: Boolean(image.publicUrl),
          },
        ]
      : [];
  });
  const detail = detailProduct?.images[0] ?? getEditorialProduct(merchandising.detailProductId)?.images[0];
  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <h1 id="home-title">
            {ar ? (
              <>
                للقهوة طقوس.
                <br />
                وللنحاس حكاية.
              </>
            ) : (
              <>
                A slower coffee.
                <br />A lasting piece.
              </>
            )}
          </h1>
          <p>
            {contacts.descriptionAr || (ar
              ? "سبرتايات وكنك وأطقم قهوة من النحاس، وقطع صدف تضيف لبيتك حكاية من قلب القاهرة."
              : "Copper coffee sets, traditional burners and natural shell pieces. A little of Cairo, made part of your everyday.")}
          </p>
          <div className="hero-actions">
            <Link className="button button-copper" href={base + "/products"}>
              {ar ? "اكتشف المجموعة" : "Shop the collection"}
              <Icon name="arrow" />
            </Link>
            <Link className="text-link" href="#categories">
              {ar ? "تسوق حسب التصنيف" : "Explore categories"}
            </Link>
          </div>
          <p className="hero-note">
            {ar
              ? "تصفح القطع، وأكد السعر والتوافر مع المصنع."
              : "Explore the pieces. Confirm price & availability with us."}
          </p>
        </div>
        <HeroShowcase choices={choices} locale={locale} />
      </section>

      <aside className="store-notes" aria-label={ar ? "عن مجموعتنا" : "About our collection"}>
        <p>{ar ? "نحاس وصدف، بتفاصيل تستحق التأمل" : "Copper & shell, in considered detail"}</p>
        <p>{ar ? "من مصنع سبرتاية وكنكة" : "From Sprtaya & Kanaka factory"}</p>
        <a href={"tel:" + contacts.phone}>
          {ar ? "للجملة والتصنيع الخاص" : "Wholesale & custom enquiries"}
          <Icon name="arrow" />
        </a>
      </aside>

      <section
        className="section category-section"
        id="categories"
        aria-labelledby="categories-title"
      >
        <div className="section-heading">
          <div>
            <h2 id="categories-title">{ar ? "لكل قطعة مكان" : "Find your collection"}</h2>
            <p>
              {ar
                ? "من فنجان القهوة إلى تفاصيل البيت."
                : "From the morning coffee to the finishing touch."}
            </p>
          </div>
          <Link className="text-link" href={base + "/collections"}>
            {getCopy(locale, "browseCategories")}
            <Icon name="arrow" />
          </Link>
        </div>
        <CategoryGrid categories={categories} locale={locale} compact />
      </section>

      <section
        className="section product-section featured-products"
        aria-labelledby="featured-title"
      >
        <div className="section-heading">
          <div>
            <h2 id="featured-title">{ar ? "مختارات من المجموعة" : "Selected for your home"}</h2>
            <p>
              {ar
                ? "أطقم قهوة، سبرتايات، وقطع للبيت."
                : "Coffee sets, traditional burners & pieces for home."}
            </p>
          </div>
          <Link className="text-link" href={base + "/products"}>
            {ar ? "تصفح كل القطع" : "Explore all pieces"}
            <Icon name="arrow" />
          </Link>
        </div>
        <ProductGrid products={featuredProducts} locale={locale} />
      </section>

      <section className="craft-section" aria-labelledby="craft-title">
        <div className="craft-photo">
          {detail ? (
            <Image
              src={getProductImageUrl(detail)}
              unoptimized={Boolean(detail.publicUrl)}
              alt={
                ar
                  ? "تفاصيل السبرتاية والكنكة المرتلي من المجموعة"
                  : "Detail of the hammered burner and coffee pot in the collection"
              }
              width={detail.width ?? 900}
              height={detail.height ?? 1200}
              sizes="(max-width: 700px) 100vw, 54vw"
            />
          ) : null}
        </div>
        <div className="craft-copy">
          <h2 id="craft-title">{ar ? "حرفة تُرى في التفاصيل" : "Craft you can see"}</h2>
          <p>
            {ar
              ? "في نقشة النحاس ولمعة الصدف، تفاصيل تمنح كل قطعة حضورها. سبرتاية وكنكة مصنع مصري يقدم قطعاً للبيت والقهوة والهدايا، امتداداً للحرف اليدوية التراثية في القاهرة."
              : "In the engraving of copper and the lustre of shell, a piece finds its character. Sprtaya & Kanaka is an Egyptian factory creating homeware, coffee pieces and gifts rooted in Cairo’s traditional crafts."}
          </p>
          <Link className="text-link" href={base + "/about"}>
            {ar ? "تعرف على حكايتنا" : "Meet the factory"}
            <Icon name="arrow" />
          </Link>
        </div>
      </section>

      <section className="section collections-section" aria-labelledby="collections-title">
        <div className="section-heading">
          <div>
            <h2 id="collections-title">
              {ar ? "تفاصيل تصنع الفرق" : "Small details, lasting character"}
            </h2>
            <p>
              {ar
                ? "مجموعات تختار منها ما يشبهك."
                : "Two collections, each with a character of its own."}
            </p>
          </div>
        </div>
        <div className="collection-pair">
          {[
            {
              product: coffee,
              sourceId: merchandising.coffeeProductId,
              id: "dal-kho-aarby",
              title: ar ? "على مهل، فنجان قهوة" : "Make time for coffee",
              text: ar
                ? "دلال القهوة العربية بتفاصيلها النحاسية."
                : "Discover the copper Arabic coffee pots.",
            },
            {
              product: shell,
              sourceId: merchandising.shellProductId,
              id: "mntjat-alsdf-altbyaay",
              title: ar ? "من الصدف، لبيتك" : "Shell for home",
              text: ar
                ? "علب وقطع صدف، لكل منها حضورها."
                : "Explore shell boxes and decorative pieces.",
            },
          ].map(({ product, sourceId, id, title, text }) => {
            const image = product?.images[0] ?? getEditorialProduct(sourceId)?.images[0];
            return (
              <Link className="collection-feature" key={id} href={allCategories.some((category) => category.id === id) ? base + "/collections/" + id : base + "/products"}>
                <div className="collection-feature-image">
                  {image ? (
                    <Image
                      src={getProductImageUrl(image)}
                      unoptimized={Boolean(image.publicUrl)}
                      alt={product?.nameAr ?? title}
                      width={image.width ?? 900}
                      height={image.height ?? 1200}
                      sizes="(max-width: 700px) 90vw, 46vw"
                    />
                  ) : null}
                </div>
                <div className="collection-feature-copy">
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <span className="text-link">
                    {ar ? "اكتشف المجموعة" : "Explore collection"}
                    <Icon name="arrow" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="contact-band" aria-labelledby="trade-title">
        <div>
          <h2 id="trade-title">{ar ? "من فكرة، إلى قطعة" : "From an idea to a piece"}</h2>
          <p>
            {ar
              ? "للتصنيع حسب الطلب أو شراء مجموعة لمتجرك، تواصل مع المصنع لمناقشة التفاصيل والكميات."
              : "Custom work or a collection for your store? Speak with the factory about the details and quantities."}
          </p>
        </div>
        <div className="contact-band-actions">
          <a
            className="contact-phone"
            href={"tel:" + contacts.phone}
            aria-label={(ar ? "اتصل بالمصنع على " : "Call the factory on ") + contacts.phone}
          >
            <Icon name="phone" />
            <span className="phone-number" dir="ltr">{contacts.phone}</span>
          </a>
          <p>{ar ? "التصنيع الخاص يبدأ بمكالمة." : "Custom work starts with a call."}</p>
        </div>
      </section>
    </>
  );
}
