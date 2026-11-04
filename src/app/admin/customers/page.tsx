import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/server/admin-page";
import { commerceEnabled } from "@/lib/commerce/runtime";
import { AdminFrame, AdminPageHeader } from "../admin-frame";
import { CustomerAccessPanel } from "./customer-access-panel";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!commerceEnabled()) notFound();
  const actor = await requireAdminPage();
  if (actor.roleCode !== "OWNER") redirect("/admin?error=permission");
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader
        title="حسابات العملاء"
        description="متابعة الحسابات المسجلة وإيقاف الوصول عند الحاجة"
      />
      <CustomerAccessPanel />
    </AdminFrame>
  );
}
