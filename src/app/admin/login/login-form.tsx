"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/client/auth-client";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signIn.email({
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        callbackURL: "/admin",
      });
      if (result.error) {
        setError("تعذر تسجيل الدخول. راجع البريد وكلمة المرور وحاول مجدداً.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بخدمة الإدارة حالياً.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="admin-form admin-login-form"
      action={async (data) => {
        await submit(data);
      }}
    >
      {!configured ? (
        <div className="admin-alert" role="status">
          لوحة الإدارة جاهزة، لكن لم يتم إعداد اتصال قاعدة البيانات ومفاتيح الجلسة في هذه البيئة.
        </div>
      ) : null}
      <label htmlFor="admin-email">البريد الإلكتروني</label>
      <input autoComplete="username" dir="ltr" id="admin-email" name="email" required type="email" />
      <label htmlFor="admin-password">كلمة المرور</label>
      <input autoComplete="current-password" id="admin-password" name="password" required type="password" />
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      <button className="admin-button admin-button-primary" disabled={!configured || pending} type="submit">
        {pending ? "جارٍ الدخول…" : "تسجيل الدخول"}
      </button>
      <p className="admin-help">لا يوجد تسجيل عام. يضيف مالك النظام الحسابات من خلال إجراء التهيئة الآمن.</p>
    </form>
  );
}
