"use client";
import Link from "next/link";
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="admin-loading-page" dir="rtl">
      <h1>تعذر تحميل هذه الصفحة</h1>
      <p role="alert">لم نتمكن من جلب أحدث البيانات. تحقق من الاتصال ثم حاول مرة أخرى.</p>
      <button className="admin-button admin-button-primary" onClick={reset}>
        إعادة المحاولة
      </button>
      <Link className="admin-back-link" href="/admin">
        العودة إلى متابعة اليوم
      </Link>
    </main>
  );
}
