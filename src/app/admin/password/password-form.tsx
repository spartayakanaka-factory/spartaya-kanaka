"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeAdminPassword } from "@/app/admin/actions";

export function PasswordForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return <form className="admin-form" action={async (data) => {
    setPending(true);
    setError("");
    const newPassword = String(data.get("newPassword") ?? "");
    if (newPassword.length < 12 || newPassword !== String(data.get("confirmPassword") ?? "")) {
      setError("تأكد من تطابق كلمتي المرور واستخدام 12 حرفاً على الأقل.");
      setPending(false);
      return;
    }
    try {
      const result = await changeAdminPassword(data);
      if (result !== "ok") {
        setError(result === "current" ? "كلمة المرور الحالية غير صحيحة." : result === "invalid" ? "تأكد من تطابق كلمتي المرور واستخدام 12 حرفاً على الأقل." : "انتهت الجلسة. سجّل الدخول مجدداً.");
        setPending(false);
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("تعذر تغيير كلمة المرور حالياً.");
      setPending(false);
    }
  }}>
    <label>كلمة المرور الحالية<input autoComplete="current-password" name="currentPassword" required type="password" /></label>
    <label>كلمة المرور الجديدة<input autoComplete="new-password" minLength={12} maxLength={128} name="newPassword" required type="password" /></label>
    <label>تأكيد كلمة المرور<input autoComplete="new-password" minLength={12} maxLength={128} name="confirmPassword" required type="password" /></label>
    {error ? <p className="admin-error" role="alert">{error}</p> : null}
    <button className="admin-button admin-button-primary" disabled={pending} type="submit">{pending ? "جارٍ الحفظ…" : "تغيير كلمة المرور"}</button>
  </form>;
}
