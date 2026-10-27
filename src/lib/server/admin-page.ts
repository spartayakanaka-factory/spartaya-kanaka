import "server-only";
import { redirect } from "next/navigation";
import { getAdminActor } from "@/lib/server/admin-session";
import { hasPermission, type AdminPermission } from "@/lib/admin/permissions";

export async function requireAdminPage(permission?: AdminPermission) {
  const actor = await getAdminActor();
  if (!actor) redirect("/admin/login");
  if (actor.forcePasswordChange) redirect("/admin/password");
  if (permission && !hasPermission(actor.roleCode, permission)) redirect("/admin?error=permission");
  return actor;
}
