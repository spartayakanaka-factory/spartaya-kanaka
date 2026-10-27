import "server-only";
import { headers } from "next/headers";
import { getAuth } from "@/lib/server/auth";
import type { AdminPermission, AdminRoleCode } from "@/lib/admin/permissions";
import { hasPermission } from "@/lib/admin/permissions";

export type AdminActor = { id: string; name: string; email: string; roleCode: AdminRoleCode; forcePasswordChange: boolean };

export async function getAdminActor(): Promise<AdminActor | null> {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL)
    return null;
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session) return null;
    const user = session.user as unknown as { id: string; name: string; email: string; roleCode?: string; forcePasswordChange?: boolean };
    if (!user.roleCode || !["OWNER", "MANAGER", "CATALOG_EDITOR", "INVENTORY_STAFF"].includes(user.roleCode)) return null;
    return { id: user.id, name: user.name, email: user.email, roleCode: user.roleCode as AdminRoleCode, forcePasswordChange: Boolean(user.forcePasswordChange) };
  } catch {
    return null;
  }
}

export async function requirePermission(permission: AdminPermission) {
  const actor = await getAdminActor();
  if (!actor || actor.forcePasswordChange || !hasPermission(actor.roleCode, permission)) {
    throw new Error("FORBIDDEN");
  }
  return actor;
}
