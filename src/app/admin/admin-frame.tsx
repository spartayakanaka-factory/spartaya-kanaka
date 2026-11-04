import { commerceEnabled } from "@/lib/commerce/runtime";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminActor } from "@/lib/server/admin-session";
import { roleLabelsAr, hasPermission } from "@/lib/admin/permissions";
import { LogoutButton } from "@/app/admin/logout-button";
import { AdminNavigation, type AdminNavEntry } from "./admin-navigation";

export function AdminFrame({ actor, children }: { actor: AdminActor; children: ReactNode }) {
  const commerce = commerceEnabled();
  const operations = commerce && ["OWNER", "MANAGER"].includes(actor.roleCode);
  const entries: AdminNavEntry[] = [
    { href: "/admin", label: "متابعة اليوم", group: "العمل اليومي" },
  ];
  if (operations)
    entries.push({ href: "/admin/orders", label: "الطلبات والتصنيع", group: "العمل اليومي" });
  for (const [href, label, permission] of [
    ["/admin/products", "المنتجات", "PRODUCTS_READ"],
    ["/admin/products/review", "مراجعة الأسعار", "PRODUCTS_READ"],
    ["/admin/categories", "التصنيفات", "CATEGORIES_READ"],
    ["/admin/inventory", "المخزون والحجوزات", "INVENTORY_READ"],
  ] as const)
    if (hasPermission(actor.roleCode, permission))
      entries.push({ href, label, group: "الكتالوج والمخزون" });
  if (commerce && actor.roleCode === "OWNER")
    entries.push({ href: "/admin/customers", label: "العملاء", group: "إدارة المصنع" });
  if (commerce && process.env.P4_OWNER_REPORTS === "1" && actor.roleCode === "OWNER")
    entries.push({ href: "/admin/reports", label: "التقارير والتحصيل", group: "إدارة المصنع" });
  if (hasPermission(actor.roleCode, "SETTINGS_READ"))
    entries.push({ href: "/admin/settings", label: "بيانات المتجر", group: "إدارة المصنع" });
  if (operations)
    entries.push({
      href: "/admin/commerce-settings",
      label: "الشحن والدفع",
      group: "إدارة المصنع",
    });
  if (hasPermission(actor.roleCode, "STAFF_MANAGE"))
    entries.push({ href: "/admin/staff", label: "فريق العمل والصلاحيات", group: "إدارة المصنع" });
  if (hasPermission(actor.roleCode, "AUDIT_READ"))
    entries.push({ href: "/admin/audit", label: "سجل العمليات", group: "إدارة المصنع" });
  entries.push({ href: "/admin/password", label: "كلمة المرور", group: "الحساب" });
  return (
    <div className="admin-layout" dir="rtl" data-ui="factory-admin">
      <a href="#admin-main" className="admin-skip-link">
        الانتقال إلى المحتوى
      </a>
      <aside className="admin-sidebar" aria-label="قائمة الإدارة">
        <Link className="admin-brand" href="/admin">
          <strong>
            سبرتاية وكنكة
            <span className="admin-brand-dot" aria-hidden="true" />
          </strong>
          <span>مساحة إدارة المصنع</span>
        </Link>
        <AdminNavigation
          entries={entries}
          account={
            <>
              <span>
                {actor.name} · {roleLabelsAr[actor.roleCode]}
              </span>
              <LogoutButton />
            </>
          }
        />
        <div className="admin-user">
          <span className="admin-avatar" aria-hidden="true">
            {actor.name.slice(0, 1)}
          </span>
          <div>
            <strong>{actor.name}</strong>
            <small>{roleLabelsAr[actor.roleCode]}</small>
          </div>
          <LogoutButton />
        </div>
        <Link className="admin-store-link" href="/ar">
          فتح واجهة المتجر ↗
        </Link>
      </aside>
      <main className="admin-main" id="admin-main" tabIndex={-1}>
        {process.env.P3_SIMULATION === "1" ? (
          <p className="admin-environment-note">
            بيئة اختبار · الطلبات والمدفوعات اصطناعية ولا تُرسل رسائل للعملاء.
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p className="admin-muted">{description}</p> : null}
      </div>
      {action ? <div className="admin-header-action">{action}</div> : null}
    </header>
  );
}
