import Link from "next/link";
import { getDatabase } from "@/lib/server/database";
import { requireAdminPage } from "@/lib/server/admin-page";
import { hasPermission } from "@/lib/admin/permissions";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { saveStoreSettings } from "@/app/admin/actions";
import { site } from "@/lib/site-config";

export const dynamic = "force-dynamic";
function settingValue(value: unknown) { return typeof value === "string" ? value : ""; }

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requireAdminPage("SETTINGS_READ");
  const query = await searchParams;
  const canWrite = hasPermission(actor.roleCode, "SETTINGS_WRITE");
  const rows = await getDatabase().storeSetting.findMany({ where: { key: { in: ["phone", "whatsapp", "email", "descriptionAr"] } } });
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return <AdminFrame actor={actor}>
    <AdminPageHeader title="إعدادات المتجر" description="بيانات اتصال ومعلومات أساسية تظهر على واجهة المتجر." action={<Link className="admin-button" href="/admin/audit">سجل التغييرات</Link>} />
    {query.saved ? <p className="admin-notice" role="status">تم حفظ الإعدادات.</p> : null}
    {query.error ? <p className="admin-error" role="alert">راجع رقم الهاتف والبريد والحدود المطلوبة.</p> : null}
    <section className="admin-panel"><form action={canWrite ? saveStoreSettings : undefined} className="admin-form">
      <div className="admin-form-grid">
        <label>هاتف المصنع<input defaultValue={settingValue(values.phone) || site.factoryPhone} dir="ltr" name="phone" required /></label>
        <label>واتساب المصنع<input defaultValue={settingValue(values.whatsapp) || site.factoryPhone} dir="ltr" name="whatsapp" /></label>
        <label>البريد الإلكتروني<input defaultValue={settingValue(values.email)} dir="ltr" name="email" type="email" /></label>
        <label className="wide">وصف المتجر بالعربية<textarea defaultValue={settingValue(values.descriptionAr)} maxLength={2000} name="descriptionAr" rows={5} /></label>
      </div>
      {canWrite ? <div className="admin-form-actions"><button className="admin-button admin-button-primary" type="submit">حفظ بيانات المتجر</button></div> : <p className="admin-muted">حسابك يملك صلاحية القراءة فقط.</p>}
    </form></section>
    <section className="admin-panel"><h2>إعدادات الشراء</h2><p className="admin-muted">الطلب والدفع الإلكتروني غير مفعّلين في Phase 2. إعدادات التصنيع مستقبلية فقط ولا تنفذ أي تحصيل.</p></section>
  </AdminFrame>;
}
