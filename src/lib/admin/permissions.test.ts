import { describe, expect, it } from "vitest";
import { hasPermission, listPermissions } from "@/lib/admin/permissions";

describe("admin permission matrix", () => {
  it("matches the complete role-to-permission policy", () => {
    const expected = {
      OWNER: [
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
      ],
      MANAGER: [
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
      ],
      CATALOG_EDITOR: [
        "PRODUCTS_READ",
        "PRODUCTS_WRITE",
        "CATEGORIES_READ",
        "CATEGORIES_WRITE",
        "MEDIA_WRITE",
      ],
      INVENTORY_STAFF: ["INVENTORY_READ", "INVENTORY_ADJUST"],
    } as const;

    for (const role of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(listPermissions(role).sort()).toEqual([...expected[role]].sort());
      const allowed = new Set<string>(expected[role]);
      for (const permission of [
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
      ] as const) {
        expect(hasPermission(role, permission)).toBe(allowed.has(permission));
      }
    }
    expect(hasPermission("UNKNOWN", "STAFF_MANAGE")).toBe(false);
  });

  it("keeps inventory staff limited to inventory", () => {
    expect(listPermissions("INVENTORY_STAFF")).toEqual(["INVENTORY_READ", "INVENTORY_ADJUST"]);
    expect(hasPermission("INVENTORY_STAFF", "PRODUCTS_PUBLISH")).toBe(false);
    expect(hasPermission("INVENTORY_STAFF", "SETTINGS_WRITE")).toBe(false);
  });

  it("lets catalog editors manage catalog content without inventory or settings", () => {
    expect(hasPermission("CATALOG_EDITOR", "PRODUCTS_WRITE")).toBe(true);
    expect(hasPermission("CATALOG_EDITOR", "PRODUCTS_PUBLISH")).toBe(false);
    expect(hasPermission("CATALOG_EDITOR", "MEDIA_WRITE")).toBe(true);
    expect(hasPermission("CATALOG_EDITOR", "INVENTORY_ADJUST")).toBe(false);
  });

  it("prevents managers from granting staff roles or changing owner-only settings", () => {
    expect(hasPermission("MANAGER", "PRODUCTS_PUBLISH")).toBe(true);
    expect(hasPermission("MANAGER", "STAFF_MANAGE")).toBe(false);
    expect(hasPermission("MANAGER", "SETTINGS_WRITE")).toBe(false);
    expect(hasPermission("MANAGER", "AUDIT_READ")).toBe(true);
  });
});
