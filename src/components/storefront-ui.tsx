import Link from "next/link";
import Image from "next/image";
import { getProductImageUrl } from "@/lib/asset-url";
import { getCategoryCover } from "@/lib/merchandising";
import { displayCategoryName, displayShortCategoryName, getCopy } from "@/lib/i18n";
import { Icon } from "@/components/icon";
import { formatMoneyMinor } from "@/lib/money";
import type { CatalogCategory, CatalogProduct, Locale } from "@/lib/types";

export function CatalogNotice({ locale }: { locale: Locale }) {
  return (
    <aside className="catalog-notice" aria-label={getCopy(locale, "preview")}>
      <p>{getCopy(locale, "availabilityNote")}</p>
    </aside>
  );
}

export function Breadcrumbs({
  locale,
  items = [],
}: {
  locale: Locale;
  items?: { label: string; href?: string }[];
}) {
  return (
    <nav className="breadcrumbs" aria-label={locale === "ar" ? "مسار الصفحة" : "Breadcrumb"}>
      <ol>
        <li>
          <Link href={"/" + locale}>{locale === "ar" ? "الرئيسية" : "Home"}</Link>
        </li>
        {items.map((item, index) => (
          <li key={index}>
            <span aria-hidden="true">/</span>
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageIntro({
  title,
  description,
  locale,
}: {
  locale: Locale;
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="page-intro">
      <Breadcrumbs locale={locale} items={[{ label: title }]} />
      <h1>{title}</h1>
      {description ? <p className="intro-copy">{description}</p> : null}
    </div>
  );
}

export function ProductCard({
  product,
  locale,
  headingLevel = 3,
}: {
  product: CatalogProduct;
  locale: Locale;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const image = product.images[0];
  const categoryName = product.categoryNamesAr[0];
  const categoryId = product.categoryIds?.[0] ?? "";
  return (
    <article className="product-card">
      <Link href={"/" + locale + "/products/" + product.slug} className="product-card-link">
        <div className="product-image-frame">
          {image ? (
            <Image
              src={getProductImageUrl(image)}
              alt={image.alt}
              lang="ar"
              unoptimized={Boolean(image.publicUrl)}
              loading="lazy"
              sizes="(max-width: 700px) 44vw, (max-width: 1000px) 44vw, 23vw"
              width={image.width ?? 900}
              height={image.height ?? 1200}
            />
          ) : (
            <div className="image-unavailable">
              {locale === "ar" ? "الصورة غير متاحة" : "Image unavailable"}
            </div>
          )}
          <span className="card-open" aria-hidden="true">
            <Icon name="arrow" />
          </span>
        </div>
        <div className="product-card-copy">
          <p className="product-category">
            {categoryName
              ? displayCategoryName(categoryId, categoryName, locale, product.categoryNamesEn?.[0])
              : locale === "ar"
                ? "من مجموعة المصنع"
                : "From the factory collection"}
          </p>
          <Heading className="product-name" lang="ar" dir="rtl" title={product.nameAr}>
            {product.nameAr}
          </Heading>
          <p className="product-price">
            {product.priceMinor !== null && product.priceMinor !== undefined
              ? formatMoneyMinor(product.priceMinor, locale, product.sourceCurrency ?? "EGP")
              : locale === "ar" ? "السعر عند الاستفسار" : "Price on enquiry"}
          </p>
          <span className="product-link">
            {getCopy(locale, "explore")}
            <Icon name="arrow" width={17} height={17} />
          </span>
        </div>
      </Link>
    </article>
  );
}

export function ProductGrid({
  products,
  locale,
  emptyMessage,
  headingLevel = 3,
}: {
  products: CatalogProduct[];
  locale: Locale;
  emptyMessage?: string;
  headingLevel?: 2 | 3;
}) {
  if (!products.length)
    return (
      <div className="empty-state">
        <Icon name="search" width={36} height={36} />
        <h2>{locale === "ar" ? "لنبحث عن قطعة أخرى" : "Let’s find another piece"}</h2>
        <p>{emptyMessage ?? getCopy(locale, "noProducts")}</p>
        <p>
          {locale === "ar"
            ? "جرب كلمة أبسط أو استكشف التصنيفات."
            : "Try a shorter search or explore our categories."}
        </p>
        <Link className="button" href={"/" + locale + "/collections"}>
          {getCopy(locale, "browseCategories")}
          <Icon name="arrow" />
        </Link>
      </div>
    );
  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          locale={locale}
          headingLevel={headingLevel}
        />
      ))}
    </div>
  );
}

export function CategoryCard({
  category,
  locale,
  headingLevel = 3,
  compact = false,
}: {
  category: CatalogCategory;
  locale: Locale;
  headingLevel?: 2 | 3;
  compact?: boolean;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const image = category.image ?? getCategoryCover(category.id)?.images[0];
  const compactImageWidth = image
    ? Math.ceil(Math.max(76, 82 * ((image.width ?? 900) / (image.height ?? 1200))))
    : 76;
  return (
    <Link
      className="category-card"
      href={"/" + locale + "/collections/" + category.id}
      title={displayCategoryName(category.id, category.nameAr, locale, category.nameEn)}
    >
      <div className="category-image-frame">
        {image ? (
          <Image
            src={getProductImageUrl(image)}
            alt=""
            loading="lazy"
            unoptimized={Boolean(image.publicUrl)}
            sizes={
              compact
                ? compactImageWidth + "px"
                : "(max-width: 700px) 44vw, (max-width: 1000px) 44vw, 23vw"
            }
            width={image.width ?? 900}
            height={image.height ?? 1200}
          />
        ) : null}
      </div>
      <div className="category-copy">
        <Heading className="category-name">
          {compact
            ? displayShortCategoryName(category.id, category.nameAr, locale, category.nameEn)
            : displayCategoryName(category.id, category.nameAr, locale, category.nameEn)}
        </Heading>
        <Icon name="arrow" />
      </div>
      <span className="category-count">
        {new Intl.NumberFormat(locale).format(category.productCount)}{" "}
        {compact
          ? locale === "ar"
            ? "قطع"
            : "pieces"
          : locale === "ar"
            ? "قطع في المجموعة"
            : "pieces in the collection"}
      </span>
    </Link>
  );
}

export function CategoryGrid({
  categories,
  locale,
  headingLevel = 3,
  compact = false,
}: {
  categories: CatalogCategory[];
  locale: Locale;
  headingLevel?: 2 | 3;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "category-grid category-grid-compact" : "category-grid"}>
      {categories.map((category) => (
        <CategoryCard
          key={category.id}
          category={category}
          locale={locale}
          headingLevel={headingLevel}
          compact={compact}
        />
      ))}
    </div>
  );
}

export function SearchForm({
  locale,
  initialQuery = "",
}: {
  locale: Locale;
  initialQuery?: string;
}) {
  return (
    <form className="search-form" action={"/" + locale + "/search"} role="search">
      <label htmlFor="catalog-search">{getCopy(locale, "searchLabel")}</label>
      <div className="search-field">
        <input
          id="catalog-search"
          name="q"
          type="search"
          autoComplete="off"
          defaultValue={initialQuery}
          placeholder={locale === "ar" ? "كنكة، سبرتاية، طقم قهوة…" : "Coffee sets, trays, copper…"}
        />
        <button className="icon-button" type="submit" aria-label={getCopy(locale, "search")}>
          <Icon name="search" />
        </button>
      </div>
    </form>
  );
}

export function CatalogPagination({
  locale,
  basePath,
  currentPage,
  totalItems,
  pageSize,
  query,
  filters = {},
}: {
  locale: Locale;
  basePath: string;
  currentPage: number;
  totalItems: number;
  pageSize: number;
  query?: string;
  filters?: Record<string, string>;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;
  const hrefFor = (page: number) => {
    const params = new URLSearchParams(filters);
    params.set("page", String(page));
    if (query) params.set("q", query);
    return basePath + "?" + params.toString();
  };
  const format = new Intl.NumberFormat(locale);
  return (
    <nav className="pagination" aria-label={locale === "ar" ? "التنقل بين الصفحات" : "Pagination"}>
      {currentPage > 1 ? (
        <Link className="page-control" href={hrefFor(currentPage - 1)}>
          {getCopy(locale, "previousPage")}
        </Link>
      ) : (
        <span className="page-control is-disabled" aria-disabled="true">
          {getCopy(locale, "previousPage")}
        </span>
      )}
      <span className="page-count" aria-current="page">
        {getCopy(locale, "pageOf")} {format.format(currentPage)} / {format.format(totalPages)}
      </span>
      {currentPage < totalPages ? (
        <Link className="page-control" href={hrefFor(currentPage + 1)}>
          {getCopy(locale, "nextPage")}
        </Link>
      ) : (
        <span className="page-control is-disabled" aria-disabled="true">
          {getCopy(locale, "nextPage")}
        </span>
      )}
    </nav>
  );
}
