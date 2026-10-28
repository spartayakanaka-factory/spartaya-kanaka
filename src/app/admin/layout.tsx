import type { Metadata } from "next";
import localFont from "next/font/local";
import "../globals.css";
import { requireStagingPageAccess } from "@/lib/server/staging-page-access";
import "./admin.css";

const arabic = localFont({
  src: [{ path: "../fonts/noto-arabic.woff2", weight: "400 600", style: "normal" }],
  variable: "--font-arabic",
  display: "swap",
  fallback: ["Tahoma", "Arial"],
});

export const metadata: Metadata = { title: "إدارة سبرتاية وكنكة", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStagingPageAccess();
  return <html lang="ar" dir="rtl" className={arabic.variable}><body>{children}</body></html>;
}
