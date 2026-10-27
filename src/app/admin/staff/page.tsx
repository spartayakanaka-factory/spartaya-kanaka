import { getDatabase } from "@/lib/server/database";
import { requireAdminPage } from "@/lib/server/admin-page";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { createStaffAccount } from "@/app/admin/actions";
import { roleLabelsAr } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requireAdminPage("STAFF_MANAGE");
  const query = await searchParams;
  const users = await getDatabase().adminUser.findMany({ select: { id: true, name: true, email: true, roleCode: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  return <AdminFrame actor={actor}><AdminPageHeader title="المستخدمون" description="أضف حسابات موثوقة بأقل صلاحية لازمة." />
    {query.error === "exists" ? <p className="admin-error">هذا البريد مسجل بالفعل.</p> : query.error ? <p className="admin-error">راجع البيانات. كلمة المرور 12 حرفاً على الأقل.</p> : null}
    {query.saved ? <p className="admin-notice">تم إنشاء الحساب لـ {query.saved}. يجب عليه تغيير كلمة المرور عند الدخول الأول.</p> : null}
    <section className="admin-table-wrap"><table className="admin-table"><thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>أضيف في</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name}</td><td dir="ltr">{user.email}</td><td>{roleLabelsAr[user.roleCode as keyof typeof roleLabelsAr] ?? user.roleCode}</td><td>{new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(user.createdAt)}</td></tr>)}</tbody></table></section>
    <section className="admin-panel admin-subsection"><h2>إضافة مستخدم</h2><form action={createStaffAccount} className="admin-form"><div className="admin-form-grid"><label>الاسم *<input maxLength={120} name="name" required /></label><label>البريد الإلكتروني *<input autoComplete="off" dir="ltr" name="email" required type="email" /></label><label>الدور *<select name="roleCode"><option value="MANAGER">مدير</option><option value="CATALOG_EDITOR">محرر الكتالوج</option><option value="INVENTORY_STAFF">مسؤول المخزون</option></select></label><label>كلمة مرور أولية *<input autoComplete="new-password" minLength={12} maxLength={128} name="password" required type="password" /></label></div><p className="admin-muted">لا تُرسل كلمة المرور عبر البريد. أعطها للموظف مباشرة عبر قناة آمنة.</p><div className="admin-form-actions"><button className="admin-button admin-button-primary" type="submit">إنشاء الحساب</button></div></form></section>
  </AdminFrame>;
}
