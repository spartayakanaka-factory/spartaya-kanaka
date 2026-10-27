import Link from "next/link";

export default function LocaleNotFound() {
  return (
    <section className="page-content empty-state">
      <h1 lang="ar" dir="rtl">
        الصفحة غير موجودة
      </h1>
      <p lang="en" dir="ltr">
        This page is unavailable. Find another piece in the collection.
      </p>
      <Link className="text-link" href="/">
        Back to home · العودة للرئيسية <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
