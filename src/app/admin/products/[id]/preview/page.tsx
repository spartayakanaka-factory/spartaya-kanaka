import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { ProductGallery } from "@/components/product-gallery";
import { ProductFulfillment } from "@/components/storefront-ui";
import { formatMoneyMinor, isPositiveProductPrice } from "@/lib/money";
import { getAdminProductPreview } from "@/lib/server/storefront-catalog";

export const dynamic = "force-dynamic";

export default async function ProductPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, product } = await getAdminProductPreview(id);
  if (!product) notFound();
  const price = product.priceMinor ?? null;
  const days = product.productionDays;
  const format = new Intl.NumberFormat("ar-EG");

  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader
        title="معاينة المنتج"
        description="عرض خاص للإدارة من آخر نسخة محفوظة."
        action={
          <Link className="admin-button" href={`/admin/products/${id}`}>
            العودة إلى التعديل
          </Link>
        }
      />
      <article className="product-detail admin-product-preview">
        <ProductGallery images={product.images} name={product.nameAr} locale="ar" />
        <div className="product-info">
          {product.categoryNamesAr.length ? (
            <p className="product-category">{product.categoryNamesAr.join("، ")}</p>
          ) : null}
          <h2>{product.nameAr}</h2>
          <ProductFulfillment product={product} locale="ar" />
          {days ? (
            <p className="production-lead">
              مدة التصنيع المقدّرة{" "}
              <bdi>
                {days.min === days.max
                  ? format.format(days.min)
                  : `${format.format(days.min)}–${format.format(days.max)}`}
              </bdi>{" "}
              يوم
            </p>
          ) : null}
          <p className="detail-price">
            {isPositiveProductPrice(price)
              ? formatMoneyMinor(price, "ar", product.sourceCurrency ?? "EGP")
              : "لم يُحدد السعر"}
          </p>
          {product.descriptionAr ? (
            <div className="product-description">{product.descriptionAr}</div>
          ) : (
            <p className="admin-muted">لم يُضف وصف بعد.</p>
          )}
          {product.variants?.length ? (
            <section className="variant-details" aria-labelledby="preview-options">
              <h3 id="preview-options">خيارات المنتج</h3>
              <ul>
                {product.variants.map((variant) => (
                  <li key={variant.id}>
                    <span>{variant.nameAr}</span>
                    {isPositiveProductPrice(variant.priceMinor) ? (
                      <strong>
                        {formatMoneyMinor(
                          variant.priceMinor,
                          "ar",
                          product.sourceCurrency ?? "EGP",
                        )}
                      </strong>
                    ) : null}
                    {Object.keys(variant.options).length ? (
                      <small>
                        {Object.entries(variant.options)
                          .map(([label, value]) => `${label} · ${value}`)
                          .join("، ")}
                      </small>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </article>
    </AdminFrame>
  );
}
