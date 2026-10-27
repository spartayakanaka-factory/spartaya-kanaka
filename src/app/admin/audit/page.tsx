import { getDatabase } from "@/lib/server/database";
import { requireAdminPage } from "@/lib/server/admin-page";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const actor = await requireAdminPage("AUDIT_READ");
  const events = await getDatabase().auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return <AdminFrame actor={actor}><AdminPageHeader title="سجل التغييرات" description="آخر 100 تغيير مسجل في حسابات الإدارة والكتالوج والمخزون." />
    <div className="admin-table-wrap">{events.length ? <table className="admin-table"><thead><tr><th>الوقت</th><th>المسؤول</th><th>الإجراء</th><th>العنصر</th><th>التفاصيل</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "short" }).format(event.createdAt)}</td><td>{event.actorLabel}</td><td dir="ltr">{event.action}</td><td>{event.entity} {event.entityId ? <small dir="ltr">· {event.entityId.slice(0, 8)}</small> : null}</td><td><details><summary>عرض</summary><pre className="admin-json">{JSON.stringify(event.afterData, null, 2)}</pre></details></td></tr>)}</tbody></table> : <p className="admin-empty">لا توجد تغييرات مسجلة بعد.</p>}</div>
  </AdminFrame>;
}
