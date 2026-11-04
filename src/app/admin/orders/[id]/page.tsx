import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/server/admin-page";
import { commerceEnabled } from "@/lib/commerce/runtime";
import { staff } from "@/lib/server/commerce/admin";
import { AdminFrame, AdminPageHeader } from "@/app/admin/admin-frame";
import { AdminCommercePanel } from "@/app/admin/commerce-panel";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!commerceEnabled()) notFound();
  const actor = await requireAdminPage();
  if (!["OWNER", "MANAGER"].includes(actor.roleCode)) redirect("/admin?error=permission");
  await staff(actor.id);
  const { id } = await params;
  return (
    <AdminFrame actor={actor}>
      <AdminPageHeader
        title="إدارة الطلبات"
        description="طلبات اصطناعية محلية — دون مدفوعات حقيقية"
      />
      <AdminCommercePanel key={id} orderId={id} owner={actor.roleCode === "OWNER"} />
    </AdminFrame>
  );
}
