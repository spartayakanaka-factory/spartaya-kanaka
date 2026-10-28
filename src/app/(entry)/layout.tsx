import type { ReactNode } from "react";
import { requireStagingPageAccess } from "@/lib/server/staging-page-access";

export default async function EntryLayout({ children }: { children: ReactNode }) {
  await requireStagingPageAccess();
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
