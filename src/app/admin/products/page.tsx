import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import Image from "next/image";
import { getProductImageUrl } from "@/lib/asset-url";
import { getDatabase } from "@/lib/server/database";
import { requireAdminPage } from "@/lib/server/admin-page";
import { hasPermission } from "@/lib/admin/permissions";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { archiveProduct, duplicateProduct, publishProduct } from "@/app/admin/actions";
import { formatMoneyMinor } from "@/lib/money";
import { productSearchWhere } from "./product-search";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdminPage("PRODUCTS_READ");
  const query = await searchParams;
  const value = (key: string) => {
    const input = query[key];
    return (Array.isArray(input) ? input[0] : input)?.trim() ?? "";
  };
  const q = value("q").slice(0, 191);
  const category = value("category").slice(0, 191);
  const statusValue = value("status");
  const typeValue = value("type");
  const status = statusValue === "DRAFT" || statusValue === "PUBLISHED" || statusValue === "ARCHIVED"
    ? statusValue : undefined;
  const type = typeValue === "READY_MADE" || typeValue === "MADE_TO_ORDER" ? typeValue : undefined;
  const filtered = Boolean(q || category || status || type);
  const where: Prisma.ProductWhereInput = {
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(category ? { categories: { some: { categoryId: category } } } : {}),
  };
  const db = getDatabase();
  const pageSize = 50;
  const requestedPage = Number(value("page") || 1);
  const pageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageFor = (count: number) => Math.min(pageNumber, Math.max(1, Math.ceil(count / pageSize)));
  const include = {
    categories: { include: { category: true }, orderBy: { position: "asc" } },
    variants: { where: { active: true }, include: { inventory: true } },
    media: { include: { media: true }, orderBy: { position: "asc" }, take: 1 },
  } satisfies Prisma.ProductInclude;
  const orderBy = [{ updatedAt: "desc" }, { titleAr: "asc" }, { id: "asc" }] satisfies Prisma.ProductOrderByWithRelationInput[];
  const [result, categories] = await Promise.all([
    q
      ? db.$transaction(async (tx) => {
          const predicate = productSearchWhere({ q, category, status, type });
          const [total] = await tx.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) AS count FROM products p WHERE ${predicate}
          `;
          const count = Number(total.count);
          const page = pageFor(count);
          const ids = await tx.$queryRaw<{ id: string }[]>`
            SELECT p.id FROM products p WHERE ${predicate}
            ORDER BY p.updatedAt DESC, p.titleAr ASC, p.id ASC
            LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
          `;
          const rows = ids.length
            ? await tx.product.findMany({ where: { id: { in: ids.map(({ id }) => id) } }, include, orderBy })
            : [];
          return { count, page, rows };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
      : (async () => {
          const count = await db.product.count({ where });
          const page = pageFor(count);
          const rows = await db.product.findMany({ where, include, orderBy, take: pageSize, skip: (page - 1) * pageSize });
          return { count, page, rows };
        })(),
    db.category.findMany({ select: { id: true, nameAr: true }, orderBy: [{ nameAr: "asc" }, { id: "asc" }] }),
  ]);
  const { count, page, rows } = result;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const pageHref = (value: number) => {
    const params = new URLSearchParams({ page: String(value) });
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    return "/admin/products?" + params;
  };
  const canWrite = hasPermission(actor.roleCode, "PRODUCTS_WRITE");
  const canPublish = hasPermission(actor.roleCode, "PRODUCTS_PUBLISH");
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader
        title="المنتجات"
        description="راجع المنتجات قبل نشرها في واجهة المتجر."
        action={
          canWrite ? (
            <div className="admin-row-actions">
              <Link className="admin-button" href="/admin/products/review">
                مراجعة الكتالوج
              </Link>
              <Link className="admin-button admin-button-primary" href="/admin/products/new">
                إضافة منتج
              </Link>
            </div>
          ) : undefined
        }
      />
      <form action="/admin/products" className="admin-toolbar" method="get" role="search" aria-label="بحث المنتجات">
        <div className="admin-filter">
          <label>
            بحث عن منتج
            <input defaultValue={q} name="q" type="search" maxLength={191} placeholder="الاسم أو الرابط…" />
          </label>
          <label>
            الحالة
            <select defaultValue={status ?? ""} name="status">
              <option value="">كل الحالات</option>
              <option value="DRAFT">مسودة</option>
              <option value="PUBLISHED">منشور</option>
              <option value="ARCHIVED">مؤرشف</option>
            </select>
          </label>
          <label>
            نوع المنتج
            <select name="type" defaultValue={type ?? ""}>
              <option value="">كل الأنواع</option>
              <option value="READY_MADE">جاهز بالمخزون</option>
              <option value="MADE_TO_ORDER">تصنيع حسب الطلب</option>
            </select>
          </label>
          <label>
            التصنيف
            <select name="category" defaultValue={category}>
              <option value="">كل التصنيفات</option>
              {category && !categories.some((item) => item.id === category) ? (
                <option value={category}>تصنيف غير متاح</option>
              ) : null}
              {categories.map((item) => <option key={item.id} value={item.id}>{item.nameAr}</option>)}
            </select>
          </label>
          <button className="admin-button" type="submit">
            عرض النتائج
          </button>
          {filtered && count > 0 ? <Link href="/admin/products">مسح الفلاتر</Link> : null}
        </div>
        <span className="admin-muted" role="status">
          {new Intl.NumberFormat("ar-EG").format(count)} منتج · صفحة{" "}
          {new Intl.NumberFormat("ar-EG").format(page)} من{" "}
          {new Intl.NumberFormat("ar-EG").format(totalPages)}
        </span>
      </form>
      <div className="admin-table-wrap" role="region" aria-label="قائمة المنتجات" tabIndex={0}>
        {rows.length ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>التصنيف</th>
                <th>السعر</th>
                <th>النوع والمتاح</th>
                <th>الحالة</th>
                <th>آخر تحديث</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="admin-product-identity">
                      {product.media[0] ? (
                        <Image
                          className="admin-product-thumbnail"
                          src={getProductImageUrl({
                            localPath: product.media[0].media.originalKey.replace(/^legacy:/, ""),
                            publicUrl: product.media[0].media.publicUrl ?? undefined,
                          })}
                          alt=""
                          width={48}
                          height={56}
                          unoptimized
                        />
                      ) : (
                        <span className="admin-product-thumbnail admin-product-placeholder">
                          بلا صورة
                        </span>
                      )}
                      <div>
                        <Link href={canWrite ? "/admin/products/" + product.id : "/admin/products"}>
                          {product.titleAr}
                        </Link>
                        <small className="admin-table-sub">{product.slug}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {product.categories.map(({ category }) => category.nameAr).join("، ") || "—"}
                  </td>
                  <td>
                    {product.priceMinor === null
                      ? "غير محدد"
                      : formatMoneyMinor(product.priceMinor, "ar", product.currency)}
                  </td>
                  <td>
                    {product.type === "MADE_TO_ORDER" ? (
                      "يصنع بعد الطلب"
                    ) : product.type === "READY_MADE" ? (
                      <>
                        <span>جاهز بالمخزون</span>
                        <small className="admin-table-sub">
                          {product.variants.length && product.variants.every((v) => v.inventory)
                            ? new Intl.NumberFormat("ar-EG").format(
                                product.variants.reduce(
                                  (sum, v) => sum + (v.inventory!.quantity - v.inventory!.reserved),
                                  0,
                                ),
                              ) + " متاح للبيع"
                            : "الرصيد غير مسجل"}
                        </small>
                      </>
                    ) : (
                      "النوع يحتاج مراجعة"
                    )}
                  </td>
                  <td>
                    <span
                      className={
                        "admin-badge " +
                        (product.status === "PUBLISHED"
                          ? "admin-badge-success"
                          : product.status === "DRAFT"
                            ? "admin-badge-warning"
                            : "")
                      }
                    >
                      {product.status === "PUBLISHED"
                        ? "منشور"
                        : product.status === "DRAFT"
                          ? "مسودة"
                          : "مؤرشف"}
                    </span>
                  </td>
                  <td>
                    {new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(
                      product.updatedAt,
                    )}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      {canWrite ? <Link href={"/admin/products/" + product.id}>تعديل</Link> : null}
                      {canWrite ? (
                        <form action={duplicateProduct.bind(null, product.id)}>
                          <button className="admin-text-button" type="submit">
                            نسخ
                          </button>
                        </form>
                      ) : null}
                      {canPublish && product.status !== "ARCHIVED" ? (
                        <form
                          action={publishProduct.bind(
                            null,
                            product.id,
                            product.status !== "PUBLISHED",
                          )}
                        >
                          <button className="admin-text-button" type="submit">
                            {product.status === "PUBLISHED" ? "إلغاء النشر" : "نشر"}
                          </button>
                        </form>
                      ) : null}
                      {canWrite && product.status !== "ARCHIVED" ? (
                        <form action={archiveProduct.bind(null, product.id)}>
                          <button className="admin-text-button admin-text-danger" type="submit">
                            أرشفة
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="admin-empty">
            <p>{filtered ? "لم نجد منتجات تطابق البحث أو الفلاتر." : "لا توجد منتجات في الكتالوج بعد."}</p>
            {filtered ? <Link className="admin-button" href="/admin/products">مسح الفلاتر</Link> : null}
          </div>
        )}
      </div>
      {totalPages > 1 ? (
        <nav aria-label="صفحات المنتجات" className="review-pagination">
          <span>
            عرض {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} من {count}
          </span>
          <div>
            {page > 1 ? (
              <Link className="admin-button" href={pageHref(page - 1)}>
                السابق
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link className="admin-button" href={pageHref(page + 1)}>
                التالي
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </AdminFrame>
  );
}
