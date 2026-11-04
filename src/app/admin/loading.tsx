export default function Loading() {
  return (
    <main className="admin-loading-page" dir="rtl" aria-busy="true" aria-label="تحميل الإدارة">
      <h1>جارٍ تحميل مساحة الإدارة</h1>
      <p>نُحضّر أحدث بيانات المصنع.</p>
      <div className="admin-loading-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
