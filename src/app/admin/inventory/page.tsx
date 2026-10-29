import { getDatabase } from "@/lib/server/database";
import { requireAdminPage } from "@/lib/server/admin-page";
import { hasPermission } from "@/lib/admin/permissions";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { adjustInventory, setLowStockThreshold } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const actor = await requireAdminPage("INVENTORY_READ");
  const query = await searchParams;
  const canAdjust = hasPermission(actor.roleCode, "INVENTORY_ADJUST");
  const [balances, movements, orderMovements] = await Promise.all([
    getDatabase().inventoryBalance.findMany({
      where: {
        product: { type: "READY_MADE", status: { not: "ARCHIVED" } },
        variant: { active: true },
      },
      include: {
        product: { select: { titleAr: true, slug: true, status: true } },
        variant: { select: { nameAr: true, sku: true } },
      },
      orderBy: [{ quantity: "asc" }, { product: { titleAr: "asc" } }],
      take: 300,
    }),
    getDatabase().inventoryMovement.findMany({
      include: {
        balance: {
          include: {
            product: { select: { titleAr: true } },
            variant: { select: { nameAr: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    getDatabase().commerceStockEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const orderVariants = await getDatabase().productVariant.findMany({
    where: { id: { in: [...new Set(orderMovements.map((m) => m.variantId))] } },
    select: { id: true, nameAr: true, product: { select: { titleAr: true } } },
  });
  const variantNames = new Map(
    orderVariants.map((v) => [v.id, v.product.titleAr + " · " + v.nameAr]),
  );
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader
        title="المخزون"
        description="المتاح = الرصيد الفعلي ناقص المحجوز للطلبات. التعديل زيادة أو نقص، وليس استبدال الرصيد كله."
      />
      {query.saved ? (
        <p className="admin-notice" role="status">
          {query.saved === "replay"
            ? "تم تجاهل إرسال مكرر؛ لم يتغير الرصيد مرة أخرى."
            : "تم تحديث المخزون."}
        </p>
      ) : null}
      {query.error ? (
        <p className="admin-error" role="alert">
          {query.error === "stock"
            ? "لم يتم التعديل. لا يمكن خفض الرصيد عن الكمية المحجوزة للطلبات. حدّث الصفحة وراجع المتاح."
            : "راجع الكمية وسبب التعديل."}
        </p>
      ) : null}
      <section className="admin-table-wrap inventory-table-region" tabIndex={0} role="region" aria-label="أرصدة المخزون">
        <table className="admin-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>SKU</th>
              <th>الرصيد الفعلي</th>
              <th>المحجوز للطلبات</th>
              <th>المتاح للبيع</th>
              <th>تنبيه المخزون</th>
              <th>تعديل الكمية</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((balance) => (
              <tr key={balance.id}>
                <td>
                  <a href={"/admin/products/" + balance.productId}>{balance.product.titleAr}</a>
                  <small className="admin-table-sub">{balance.variant.nameAr}</small>
                </td>
                <td dir="ltr">{balance.variant.sku || "—"}</td>
                <td>{new Intl.NumberFormat("ar-EG").format(balance.quantity)}</td>
                <td>{new Intl.NumberFormat("ar-EG").format(balance.reserved)}</td>
                <td>
                  <span
                    className={
                      "admin-badge " +
                      (balance.quantity - balance.reserved <= balance.lowStockAt
                        ? "admin-badge-warning"
                        : "admin-badge-success")
                    }
                  >
                    {new Intl.NumberFormat("ar-EG").format(balance.quantity - balance.reserved)}
                  </span>
                </td>
                <td>
                  {canAdjust ? (
                    <form action={setLowStockThreshold} className="admin-inline-form">
                      <input name="variantId" type="hidden" value={balance.variantId} />
                      <label>
                        حد التنبيه
                        <input
                          defaultValue={balance.lowStockAt}
                          max="9999999"
                          min="0"
                          name="lowStockAt"
                          type="number"
                        />
                      </label>
                      <button aria-label="حفظ حد التنبيه" className="admin-button" type="submit">
                        حفظ
                      </button>
                    </form>
                  ) : (
                    balance.lowStockAt + " أو أقل"
                  )}
                </td>
                <td>
                  {canAdjust ? (
                    <form action={adjustInventory} className="admin-inline-form">
                      <input name="variantId" type="hidden" value={balance.variantId} />
                      <input name="requestKey" type="hidden" value={crypto.randomUUID()} />
                      <label>
                        زيادة أو نقص
                        <input max="9999999" min="-9999999" name="delta" required type="number" />
                      </label>
                      <label>
                        السبب
                        <input className="admin-reason" maxLength={500} name="reason" required />
                      </label>
                      <button className="admin-button" type="submit">
                        حفظ
                      </button>
                    </form>
                  ) : (
                    "للقراءة فقط"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {balances.length ? null : (
          <p className="admin-empty">لا توجد أرصدة مخزون بعد. أضف منتجاً جاهزاً أولاً.</p>
        )}
      </section>
      <section className="admin-panel admin-subsection">
        <h2>آخر حركات المخزون</h2>
        {movements.length ? (
          <div
            className="admin-table-wrap inventory-table-region"
            tabIndex={0}
            role="region"
            aria-label="حركات تعديل المخزون"
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>المنتج</th>
                  <th>التغيير</th>
                  <th>الرصيد بعدها</th>
                  <th>السبب</th>
                  <th>المسؤول</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((move) => (
                  <tr key={move.id}>
                    <td>
                      {new Intl.DateTimeFormat("ar-EG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(move.createdAt)}
                    </td>
                    <td>
                      {move.balance.product.titleAr} · {move.balance.variant.nameAr}
                    </td>
                    <td dir="ltr">
                      {move.delta > 0 ? "+" : ""}
                      {move.delta}
                    </td>
                    <td>{move.balanceAfter}</td>
                    <td>{move.reason}</td>
                    <td>{move.actorLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-muted">لم تُسجل حركات بعد.</p>
        )}
      </section>
      <section className="admin-panel admin-subsection">
        <h2>حركات الطلبات والحجوزات</h2>
        <div
          className="admin-table-wrap inventory-table-region"
          tabIndex={0}
          role="region"
          aria-label="حركات الطلبات والحجوزات"
        >
          <table className="admin-table">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المنتج</th>
                <th>العملية</th>
                <th>تغيير الرصيد</th>
                <th>تغيير المحجوز</th>
                <th>المتاح بعدها</th>
              </tr>
            </thead>
            <tbody>
              {orderMovements.map((move) => (
                <tr key={move.id}>
                  <td>
                    {new Intl.DateTimeFormat("ar-EG", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(move.createdAt)}
                  </td>
                  <td>{variantNames.get(move.variantId) || move.variantId}</td>
                  <td>
                    {move.quantityDelta < 0
                      ? "صرف للطلب"
                      : move.quantityDelta > 0
                        ? "إعادة بعد الفحص"
                        : move.reservedDelta > 0
                          ? "حجز للطلب"
                          : "تحرير حجز"}
                  </td>
                  <td>{move.quantityDelta}</td>
                  <td>{move.reservedDelta}</td>
                  <td>{move.quantityAfter - move.reservedAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orderMovements.length ? null : <p>لا توجد حركات طلبات بعد.</p>}
        </div>
      </section>
    </AdminFrame>
  );
}
