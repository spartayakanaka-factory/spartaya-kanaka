import { notFound } from "next/navigation";
import { CommercePage } from "@/components/commerce-client";
import { commerceCheckoutEnabled, commerceEnabled } from "@/lib/commerce/runtime";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!commerceEnabled() || !isLocale(locale)) notFound();
  return <CommercePage locale={locale} view="cart" checkoutEnabled={commerceCheckoutEnabled()} />;
}
