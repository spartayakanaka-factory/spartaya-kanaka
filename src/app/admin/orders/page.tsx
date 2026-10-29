import {notFound,redirect} from "next/navigation";
import {requireAdminPage} from "@/lib/server/admin-page";
import {commerceEnabled} from "@/lib/commerce/runtime";
import {staff} from "@/lib/server/commerce/admin";
import {AdminFrame,AdminPageHeader} from "@/app/admin/admin-frame";
import {AdminCommercePanel} from "@/app/admin/commerce-panel";
export const dynamic="force-dynamic";
export default async function Page(){
 if(!commerceEnabled())notFound();const actor=await requireAdminPage();if(!["OWNER","MANAGER"].includes(actor.roleCode))redirect("/admin?error=permission");await staff(actor.id);

 return <AdminFrame actor={actor}><AdminPageHeader title="إدارة الطلبات" description="طلبات اصطناعية محلية — دون مدفوعات حقيقية"/><AdminCommercePanel  owner={actor.roleCode==="OWNER"}/></AdminFrame>;}
