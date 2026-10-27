export const adminRoles = ["OWNER", "MANAGER", "CATALOG_EDITOR", "INVENTORY_STAFF"] as const;
export type AdminRoleCode = (typeof adminRoles)[number];

export const permissions = [
  "PRODUCTS_READ",
  "PRODUCTS_WRITE",
  "PRODUCTS_PUBLISH",
  "CATEGORIES_READ",
  "CATEGORIES_WRITE",
  "MEDIA_WRITE",
  "INVENTORY_READ",
  "INVENTORY_ADJUST",
  "SETTINGS_READ",
  "SETTINGS_WRITE",
  "STAFF_MANAGE",
  "AUDIT_READ",
] as const;
export type AdminPermission = (typeof permissions)[number];

const all = new Set<AdminPermission>(permissions);
const matrix: Record<AdminRoleCode, ReadonlySet<AdminPermission>> = {
  OWNER: all,
  MANAGER: new Set([
    "PRODUCTS_READ",
    "PRODUCTS_WRITE",
    "PRODUCTS_PUBLISH",
    "CATEGORIES_READ",
    "CATEGORIES_WRITE",
    "MEDIA_WRITE",
    "INVENTORY_READ",
    "INVENTORY_ADJUST",
    "SETTINGS_READ",
    "AUDIT_READ",
  ]),
  CATALOG_EDITOR: new Set([
    "PRODUCTS_READ",
    "PRODUCTS_WRITE",
    "CATEGORIES_READ",
    "CATEGORIES_WRITE",
    "MEDIA_WRITE",
  ]),
  INVENTORY_STAFF: new Set(["INVENTORY_READ", "INVENTORY_ADJUST"]),
};

export function hasPermission(role: string, permission: AdminPermission): boolean {
  return adminRoles.includes(role as AdminRoleCode) && matrix[role as AdminRoleCode].has(permission);
}

export function listPermissions(role: AdminRoleCode): AdminPermission[] {
  return [...matrix[role]];
}

export const roleLabelsAr: Record<AdminRoleCode, string> = {
  OWNER: "المالك",
  MANAGER: "المدير",
  CATALOG_EDITOR: "محرر الكتالوج",
  INVENTORY_STAFF: "مسؤول المخزون",
};
