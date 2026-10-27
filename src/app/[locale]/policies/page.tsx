import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/storefront-ui";
import { isLocale } from "@/lib/i18n";
import { getStoreContactSettings } from "@/lib/server/store-settings";

export const metadata: Metadata = {
  title: "معلومات الطلب والسياسات | Ordering & Policies | Sprtaya & Kanaka",
};
export default async function PoliciesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ar = locale === "ar";
  const contacts = await getStoreContactSettings();
  return (
    <>
      <PageIntro locale={locale} title={ar ? "معلومات الطلب والسياسات" : "Ordering & policies"} />
      <div className="page-content policies-layout">
        <section>
          <h2>{ar ? "الأسعار والطلبات" : "Prices & orders"}</h2>
          <p>
            {ar
              ? "هذا الموقع يعرض مجموعات المصنع. الأسعار والتوافر وخيارات القطع تحتاج إلى تأكيد مباشر. لا يستقبل الموقع طلبات أو مدفوعات إلكترونية ولا يوفر حسابات عملاء حالياً."
              : "This website presents the factory collection. Prices, availability and options require direct confirmation. Online orders, payments and customer accounts are not currently available."}
          </p>
        </section>
        <section>
          <h2>{ar ? "الشحن والاستبدال" : "Delivery & returns"}</h2>
          <p>
            {ar
              ? "لا توجد سياسة شحن أو استبدال مؤكدة منشورة لهذه النسخة. تواصل مع المصنع قبل الشراء لتأكيد تكاليف الشحن وموعد التسليم وشروط الاستبدال والاسترجاع."
              : "An approved delivery or returns policy has not been published for this release. Confirm shipping costs, timing, exchanges and returns with the factory before purchasing."}
          </p>
        </section>
        <section>
          <h2>{ar ? "الخصوصية" : "Privacy"}</h2>
          <p>
            {ar
              ? "لا يحتوي الموقع على نموذج تسجيل أو دفع أو طلب تسعير. البحث والتصفية مخصصان لتصفح المجموعة. لا تشارك بيانات دفع عبر الموقع؛ تحدث مع المصنع لمعرفة وسائل الشراء المعتمدة."
              : "There is no registration, payment or quotation form. Search and filters are for browsing the collection. Do not submit payment details through this website; contact the factory for approved purchase methods."}
          </p>
        </section>
        <a className="button" href={"tel:" + contacts.phone}>
          {ar ? "اتصل بالمصنع" : "Call the factory"}
        </a>
      </div>
    </>
  );
}
