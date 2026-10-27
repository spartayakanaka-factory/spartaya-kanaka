import type { Metadata } from "next";
import localFont from "next/font/local";
import "../globals.css";
import "./admin.css";

const arabic = localFont({
  src: [{ path: "../fonts/noto-arabic.woff2", weight: "400 600", style: "normal" }],
  variable: "--font-arabic",
  display: "swap",
  fallback: ["Tahoma", "Arial"],
});

export const metadata: Metadata = { title: "إدارة سبرتاية وكنكة", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl" className={arabic.variable}><body>{children}</body></html>;
}
