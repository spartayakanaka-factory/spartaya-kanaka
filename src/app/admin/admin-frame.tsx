import { commerceEnabled } from "@/lib/commerce/runtime";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminActor } from "@/lib/server/admin-session";
import { roleLabelsAr } from "@/lib/admin/permissions";
import { LogoutButton } from "@/app/admin/logout-button";
import { hasPermission } from "@/lib/admin/permissions";

const links = [
  ["/admin", "نظرة عامة"],
  ["/admin/products", "المنتجات"],
  ["/admin/categories", "التصنيفات"],
  ["/admin/inventory", "المخزون"],
  ["/admin/settings", "إعدادات المتجر"],
];

export function AdminFrame({ actor, children }: { actor: AdminActor; children: ReactNode }) {
  return (
    <div className="admin-layout" dir="rtl">
      <aside className="admin-sidebar" aria-label="قائمة الإدارة">
        <Link className="admin-brand" href="/admin">
          <strong>سبرتاية وكنكة</strong>
          <span>إدارة المتجر</span>
        </Link>
        <nav className="admin-nav">
          {links
            .filter(
              ([href]) =>
                href === "/admin" ||
                (href === "/admin/products" && hasPermission(actor.roleCode, "PRODUCTS_READ")) ||
                (href === "/admin/categories" &&
                  hasPermission(actor.roleCode, "CATEGORIES_READ")) ||
                (href === "/admin/inventory" && hasPermission(actor.roleCode, "INVENTORY_READ")) ||
                (href === "/admin/settings" && hasPermission(actor.roleCode, "SETTINGS_READ")),
            )
            .map(([href, label]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
          {hasPermission(actor.roleCode, "STAFF_MANAGE") ? (
            <Link href="/admin/staff">فريق العمل</Link>
          ) : null}
          {hasPermission(actor.roleCode, "AUDIT_READ") ? (
            <Link href="/admin/audit">سجل العمليات</Link>
          ) : null}
          {hasPermission(actor.roleCode, "PRODUCTS_READ") ? (
            <Link href="/admin/products/review">مراجعة الكتالوج</Link>
          ) : null}
          {commerceEnabled() && ["OWNER", "MANAGER"].includes(actor.roleCode) ? (
            <>
              <Link href="/admin/orders">الطلبات</Link>
              <Link href="/admin/commerce-settings">إعدادات الطلبات والتنبيهات</Link>
            </>
          ) : null}
          {commerceEnabled() &&
          process.env.P4_OWNER_REPORTS === "1" &&
          actor.roleCode === "OWNER" ? (
            <Link href="/admin/reports">التقارير</Link>
          ) : null}
          {commerceEnabled() && actor.roleCode === "OWNER" ? (
            <Link href="/admin/customers">حسابات العملاء</Link>
          ) : null}
          <Link href="/admin/password">كلمة المرور</Link>
        </nav>
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
      </aside>
      <main className="admin-main" id="admin-main" tabIndex={-1}>
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
        <p className="admin-kicker">سبرتاية وكنكة · لوحة الإدارة</p>
        <h1>{title}</h1>
        {description ? <p className="admin-muted">{description}</p> : null}
      </div>
      {action ? <div className="admin-header-action">{action}</div> : null}
    </header>
  );
}
