import "server-only";
import { headers } from "next/headers";
import { getDatabase } from "@/lib/server/database";
import { getAuth } from "@/lib/server/auth";
import type { AdminPermission, AdminRoleCode } from "@/lib/admin/permissions";
import { hasPermission } from "@/lib/admin/permissions";
import { getStagingAccessDecision } from "@/lib/staging-access";

export type AdminActor = {
  id: string;
  name: string;
  email: string;
  roleCode: AdminRoleCode;
  forcePasswordChange: boolean;
};

export async function getAdminActor(): Promise<AdminActor | null> {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL)
    return null;
  try {
    const requestHeaders = await headers();
    if (!getStagingAccessDecision(requestHeaders).authorized) return null;
    const session = await getAuth().api.getSession({ headers: requestHeaders });
    if (!session) return null;
    const user = session.user as unknown as {
      id: string;
      name: string;
      email: string;
      roleCode?: string;
      forcePasswordChange?: boolean;
    };
    if (
      !user.roleCode ||
      !["OWNER", "MANAGER", "CATALOG_EDITOR", "INVENTORY_STAFF"].includes(user.roleCode)
    )
      return null;
    const current = await getDatabase().adminUser.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        roleCode: true,
        forcePasswordChange: true,
        banned: true,
      },
    });
    if (
      !current ||
      current.banned ||
      !["OWNER", "MANAGER", "CATALOG_EDITOR", "INVENTORY_STAFF"].includes(current.roleCode)
    )
      return null;
    return {
      id: current.id,
      name: current.name,
      email: current.email,
      roleCode: current.roleCode as AdminRoleCode,
      forcePasswordChange: current.forcePasswordChange,
    };
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
