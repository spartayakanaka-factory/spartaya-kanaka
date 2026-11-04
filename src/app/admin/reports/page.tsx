import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/server/admin-page";
import { commerceEnabled } from "@/lib/commerce/runtime";
import { cairoDate } from "@/lib/reports/calendar";
import { AdminFrame, AdminPageHeader } from "../admin-frame";
import { ReportsPanel } from "./reports-panel";
import "./reports.css";
export const dynamic = "force-dynamic";
export default async function ReportsPage() {
  if (!commerceEnabled() || process.env.P4_OWNER_REPORTS !== "1") notFound();
  const actor = await requireAdminPage();
  if (actor.roleCode !== "OWNER") redirect("/admin?error=permission");
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader title="تقارير المتجر" description="ملخص الطلبات وحركات التحصيل المؤكدة" />
      <ReportsPanel today={cairoDate(new Date())} />
    </AdminFrame>
  );
}
