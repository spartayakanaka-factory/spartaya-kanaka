"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";

export type AdminNavEntry = { href: string; label: string; group: string };
export function AdminNavigation({
  entries,
  account,
}: {
  entries: AdminNavEntry[];
  account?: ReactNode;
}) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const active = entries
    .filter(
      ({ href }) => pathname === href || (href !== "/admin" && pathname.startsWith(href + "/")),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const groups = [...new Set(entries.map((entry) => entry.group))];
  const links = groups.map((group) => (
    <div className="admin-nav-group" key={group}>
      <p>{group}</p>
      {entries
        .filter((entry) => entry.group === group)
        .map(({ href, label }) => (
          <Link
            href={href}
            key={href}
            aria-current={active === href ? "page" : undefined}
            onClick={() => {
              if (menu.current) menu.current.open = false;
            }}
          >
            {label}
          </Link>
        ))}
    </div>
  ));
  return (
    <>
      <nav className="admin-nav admin-desktop-nav" aria-label="أقسام إدارة المصنع">
        {links}
      </nav>
      <details
        className="admin-mobile-menu"
        ref={menu}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menu.current) {
            menu.current.open = false;
            menu.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary>
          القائمة{" "}
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </summary>
        <nav className="admin-nav" aria-label="قائمة الإدارة على الهاتف">
          {links}
        </nav>
        <div className="admin-mobile-account">{account}</div>
      </details>
    </>
  );
}
