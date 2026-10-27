import { createRuntimeDatabase } from "./runtime-db";
import { assertSafeDatabaseTarget } from "./database-target";

const permissionSets = {
  OWNER: ["PRODUCTS_READ", "PRODUCTS_WRITE", "PRODUCTS_PUBLISH", "CATEGORIES_READ", "CATEGORIES_WRITE", "MEDIA_WRITE", "INVENTORY_READ", "INVENTORY_ADJUST", "SETTINGS_READ", "SETTINGS_WRITE", "STAFF_MANAGE", "AUDIT_READ"],
  MANAGER: ["PRODUCTS_READ", "PRODUCTS_WRITE", "PRODUCTS_PUBLISH", "CATEGORIES_READ", "CATEGORIES_WRITE", "MEDIA_WRITE", "INVENTORY_READ", "INVENTORY_ADJUST", "SETTINGS_READ", "AUDIT_READ"],
  CATALOG_EDITOR: ["PRODUCTS_READ", "PRODUCTS_WRITE", "CATEGORIES_READ", "CATEGORIES_WRITE", "MEDIA_WRITE"],
  INVENTORY_STAFF: ["INVENTORY_READ", "INVENTORY_ADJUST"],
} as const;
const labels = { OWNER: "المالك", MANAGER: "المدير", CATALOG_EDITOR: "محرر الكتالوج", INVENTORY_STAFF: "مسؤول المخزون" } as const;

async function main() {
  assertSafeDatabaseTarget();
  const db = createRuntimeDatabase();
  try {
    await db.$transaction(async (tx) => {
      for (const [code, permissions] of Object.entries(permissionSets)) {
        await tx.adminRole.upsert({ where: { code }, create: { code, nameAr: labels[code as keyof typeof labels] }, update: { nameAr: labels[code as keyof typeof labels] } });
        for (const permission of permissions) {
          await tx.adminRolePermission.upsert({ where: { roleCode_permission: { roleCode: code, permission } }, create: { roleCode: code, permission }, update: {} });
        }
        await tx.adminRolePermission.deleteMany({ where: { roleCode: code, permission: { notIn: [...permissions] } } });
      }
      await tx.manufacturingPolicy.upsert({ where: { id: "global" }, create: { id: "global" }, update: {} });
      await tx.storeSetting.upsert({ where: { key: "phone" }, create: { key: "phone", value: "+201142800111" }, update: {} });
      await tx.storeSetting.upsert({ where: { key: "whatsapp" }, create: { key: "whatsapp", value: "+201142800111" }, update: {} });
    });
    process.stdout.write("Seeded administrative roles, permissions, and non-payment store defaults.\n");
  } finally { await db.$disconnect(); }
}

main().catch((error: unknown) => { process.stderr.write((error instanceof Error ? error.message : "Seed failed.") + "\n"); process.exitCode = 1; });
