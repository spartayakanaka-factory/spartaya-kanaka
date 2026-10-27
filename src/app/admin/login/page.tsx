import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/app/admin/login/login-form";

export const metadata: Metadata = { title: "دخول الإدارة | سبرتاية وكنكة", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  const configured = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL);
  return (
    <main className="admin-login-page" dir="rtl">
      <div className="admin-login-brand">
        <span>سبرتاية وكنكة</span>
        <small>إدارة الكتالوج</small>
      </div>
      <section className="admin-login-card" aria-labelledby="login-title">
        <p className="admin-kicker">مساحة خاصة بفريق المصنع</p>
        <h1 id="login-title">تسجيل الدخول</h1>
        <p className="admin-muted">إدارة المنتجات والتصنيفات والمخزون.</p>
        <LoginForm configured={configured} />
      </section>
      <Link className="admin-back-link" href="/ar">العودة إلى المتجر</Link>
    </main>
  );
}
