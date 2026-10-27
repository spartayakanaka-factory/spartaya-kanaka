import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isLocale } from "@/lib/i18n";
import { site } from "@/lib/site-config";
import "../globals.css";

const arabic = localFont({
  src: [{ path: "../fonts/noto-arabic.woff2", weight: "400 600", style: "normal" }],
  variable: "--font-arabic",
  display: "swap",
  fallback: ["Tahoma", "Arial"],
});
const editorial = localFont({
  src: "../fonts/cormorant.woff2",
  variable: "--font-editorial",
  display: "swap",
  weight: "500",
  fallback: ["Georgia"],
  preload: false,
});

export const viewport: Viewport = { themeColor: "#f6f4f0", width: "device-width", initialScale: 1 };

type LocaleParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    metadataBase: new URL(site.siteUrl),
    title: "سبرتاية وكنكة | Sprtaya & Kanaka",
    applicationName: site.name,
    description:
      locale === "ar"
        ? "كتالوج مصنع سبرتاية وكنكة للنحاس والصدف."
        : "Explore the Sprtaya & Kanaka factory catalog. Product details remain in their original Arabic.",
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: locale === "ar" ? "ar_EG" : "en_US",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: value } = await params;
  if (!isLocale(value)) notFound();
  return (
    <html
      lang={value}
      dir={value === "ar" ? "rtl" : "ltr"}
      className={arabic.variable + " " + editorial.variable}
    >
      <body>
        <div className={"site-shell locale-" + value}>
          <SiteHeader locale={value} />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter locale={value} />
        </div>
      </body>
    </html>
  );
}
