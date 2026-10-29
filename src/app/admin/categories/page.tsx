import Link from "next/link";
import { getDatabase } from "@/lib/server/database";
import { requireAdminPage } from "@/lib/server/admin-page";
import { hasPermission } from "@/lib/admin/permissions";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { saveCategory, deleteCategory } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; saved?: string }> }) {
  const actor = await requireAdminPage("CATEGORIES_READ");
  const query = await searchParams;
  const db = getDatabase();
  const [categories, edit, assets] = await Promise.all([
    db.category.findMany({ include: { _count: { select: { products: true } }, parent: { select: { nameAr: true } }, image: { select: { altAr: true, publicUrl: true, originalKey: true } } }, orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }] }),
    query.edit ? db.category.findUnique({ where: { id: query.edit } }) : Promise.resolve(null),
    db.mediaAsset.findMany({ select: { id: true, altAr: true, originalKey: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const canWrite = hasPermission(actor.roleCode, "CATEGORIES_WRITE");
  const errors: Record<string, string> = { invalid: "راجع الحقول المطلوبة.", hierarchy: "هذا الترتيب ينشئ دورة غير صالحة في التصنيفات.", media: "الصورة المختارة غير متاحة.", slug: "رابط التصنيف مستخدم بالفعل. اختر رابطاً آخر.", missing: "لم يعد التصنيف موجوداً.", "not-empty": "التصنيف مرتبط بمنتجات أو تصنيفات فرعية. يمكنك إخفاؤه بدلاً من حذفه." };
  return <AdminFrame actor={actor}>
    <AdminPageHeader title="التصنيفات" description="راجع تصنيفات المصنع، ثم أظهر ما تم اعتماده في المتجر." />
    {query.saved ? <p className="admin-notice" role="status">{query.saved === "deleted" ? "تم حذف التصنيف الفارغ وتسجيل العملية." : "تم حفظ التصنيف."}</p> : null}
    {errors[query.error ?? ""] ? <p className="admin-error" role="alert">{errors[query.error ?? ""]}</p> : null}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>التصنيف</th><th>المنتجات</th><th>المراجعة</th><th>الظهور</th><th>الصورة</th><th>إجراء</th></tr></thead><tbody>
      {categories.map((category) => <tr key={category.id}><td>{category.nameAr}<small className="admin-table-sub">{category.slug}</small></td><td>{new Intl.NumberFormat("ar-EG").format(category._count.products)}</td><td><span className={"admin-badge " + (category.reviewRequired ? "admin-badge-warning" : "admin-badge-success")}>{category.reviewRequired ? "تحتاج مراجعة" : "مراجعة مكتملة"}</span></td><td>{category.visible ? "ظاهر" : "مخفي"}{category.featured ? " · مختار" : ""}</td><td>{category.image?.altAr || category.image?.originalKey.split("/").pop() || "—"}</td><td>{canWrite ? <Link href={"/admin/categories?edit=" + category.id}>تعديل</Link> : "—"}</td></tr>)}
    </tbody></table></div>
    {canWrite ? <section className="admin-panel admin-subsection">
      <h2>{edit ? "تعديل التصنيف" : "إضافة تصنيف"}</h2>
      <form action={saveCategory} className="admin-form">
        {edit ? <input name="id" type="hidden" value={edit.id} /> : null}
        <div className="admin-form-grid">
          <label>الاسم بالعربية *<input defaultValue={edit?.nameAr} name="nameAr" required /></label>
          <label>الاسم بالإنجليزية<input defaultValue={edit?.nameEn ?? ""} name="nameEn" /></label>
          <label>رابط التصنيف *<input defaultValue={edit?.slug ?? ""} name="slug" required /></label>
          <label>التصنيف الأب<select defaultValue={edit?.parentId ?? ""} name="parentId"><option value="">بدون تصنيف أب</option>{categories.filter((item) => item.id !== edit?.id).map((item) => <option key={item.id} value={item.id}>{item.nameAr}</option>)}</select></label>
          <label>ترتيب العرض<input defaultValue={edit?.sortOrder ?? categories.length} min="0" max="9999" name="sortOrder" type="number" /></label>
          <label>صورة التصنيف<select defaultValue={edit?.imageAssetId ?? ""} name="imageAssetId"><option value="">بدون صورة</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altAr || asset.originalKey.split("/").pop()}</option>)}</select></label>
          <label className="wide">وصف قصير<textarea defaultValue={edit?.descriptionAr ?? ""} name="descriptionAr" rows={3} /></label>
          <label className="admin-check"><input defaultChecked={edit ? !edit.reviewRequired : false} name="reviewRequired" type="checkbox" />تم التحقق من بيانات التصنيف</label>
          <label className="admin-check"><input defaultChecked={edit?.visible ?? false} name="visible" type="checkbox" />إظهار التصنيف في واجهة المتجر</label>
          <label className="admin-check"><input defaultChecked={edit?.featured ?? false} name="featured" type="checkbox" />إظهار ضمن تصنيفات الصفحة الرئيسية</label>
        </div>
        <div className="admin-form-actions"><button className="admin-button admin-button-primary" type="submit">حفظ التصنيف</button>{edit ? <Link className="admin-button" href="/admin/categories">تصنيف جديد</Link> : null}</div>
      </form>
      {edit ? <form action={deleteCategory.bind(null, edit.id)} className="admin-subsection"><p className="admin-muted">الحذف متاح للتصنيف الفارغ فقط. يحتفظ السجل بالمنتجات والتصنيفات المرتبطة.</p><button className="admin-button" disabled={Boolean(categories.find((item) => item.id === edit.id)?._count.products || categories.some((item) => item.parentId === edit.id))} type="submit">حذف التصنيف الفارغ</button></form> : null}
    </section> : null}
  </AdminFrame>;
}
