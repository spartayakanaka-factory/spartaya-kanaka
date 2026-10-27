import { redirect } from "next/navigation";
import { getAdminActor } from "@/lib/server/admin-session";
import { PasswordForm } from "@/app/admin/password/password-form";

export const dynamic = "force-dynamic";

export default async function FirstPasswordPage() {
  const actor = await getAdminActor();
  if (!actor) redirect("/admin/login");
  return <main className="admin-login-page" dir="rtl"><section className="admin-login-card"><p className="admin-kicker">{actor.forcePasswordChange ? "خطوة أمان مطلوبة" : "إعدادات الحساب"}</p><h1>غيّر كلمة المرور</h1><p className="admin-muted">{actor.forcePasswordChange ? "قبل استخدام لوحة الإدارة، اختر كلمة مرور خاصة بك." : "أدخل كلمة المرور الحالية ثم اختر كلمة مرور جديدة."}</p><div style={{ marginTop: 24 }}><PasswordForm /></div></section></main>;
}
