import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/server/auth", () => ({
  getAuth: () => ({ api: { getSession: mocks.getSession } }),
}));

import { getAdminActor, requirePermission } from "@/lib/server/admin-session";

const configKeys = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;
const originalAuthConfig = new Map(configKeys.map((key) => [key, process.env[key]]));

function session(roleCode: string, forcePasswordChange = false) {
  return {
    user: {
      id: "test-user",
      name: "Test Admin",
      email: "admin@example.invalid",
      roleCode,
      forcePasswordChange,
    },
  };
}

describe("admin session authorization boundary (mocked session; no persistence claim)", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/sprtaya_phase2_test";
    process.env.BETTER_AUTH_SECRET = "test-only-secret-with-at-least-thirty-two-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getSession.mockResolvedValue(null);
  });

  afterEach(() => {
    for (const key of configKeys) {
      const value = originalAuthConfig.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.clearAllMocks();
  });

  it("fails closed when authentication configuration or the session is missing", async () => {
    delete process.env.DATABASE_URL;
    await expect(getAdminActor()).resolves.toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();

    process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/sprtaya_phase2_test";
    await expect(getAdminActor()).resolves.toBeNull();
    await expect(requirePermission("PRODUCTS_READ")).rejects.toThrow("FORBIDDEN");
  });

  it("accepts only known roles from the session", async () => {
    mocks.getSession.mockResolvedValueOnce(session("INVENTORY_STAFF"));
    await expect(getAdminActor()).resolves.toMatchObject({
      id: "test-user",
      roleCode: "INVENTORY_STAFF",
      forcePasswordChange: false,
    });

    mocks.getSession.mockResolvedValueOnce(session("OWNERISH"));
    await expect(getAdminActor()).resolves.toBeNull();
  });

  it("enforces positive and negative role checks at the shared server guard", async () => {
    mocks.getSession.mockResolvedValue(session("CATALOG_EDITOR"));
    await expect(requirePermission("PRODUCTS_WRITE")).resolves.toMatchObject({
      roleCode: "CATALOG_EDITOR",
    });
    await expect(requirePermission("PRODUCTS_PUBLISH")).rejects.toThrow("FORBIDDEN");
    await expect(requirePermission("INVENTORY_ADJUST")).rejects.toThrow("FORBIDDEN");

    mocks.getSession.mockResolvedValue(session("OWNER"));
    await expect(requirePermission("STAFF_MANAGE")).resolves.toMatchObject({
      roleCode: "OWNER",
    });
  });

  it("blocks all admin permissions until the first password change is complete", async () => {
    mocks.getSession.mockResolvedValue(session("OWNER", true));
    await expect(requirePermission("PRODUCTS_READ")).rejects.toThrow("FORBIDDEN");
    await expect(requirePermission("STAFF_MANAGE")).rejects.toThrow("FORBIDDEN");
  });

  it("fails closed if session lookup throws", async () => {
    mocks.getSession.mockRejectedValue(new Error("session store unavailable"));
    await expect(getAdminActor()).resolves.toBeNull();
    await expect(requirePermission("INVENTORY_READ")).rejects.toThrow("FORBIDDEN");
  });
});
