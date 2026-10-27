import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasTrustedRequestOrigin } from "@/lib/server/request-origin";

const originKeys = ["AUTH_TRUSTED_ORIGINS", "BETTER_AUTH_URL"] as const;
const originalOriginConfig = new Map(originKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of originKeys) delete process.env[key];
});

afterEach(() => {
  for (const key of originKeys) {
    const value = originalOriginConfig.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("trusted request origins", () => {
  it("accepts only configured origins and normalizes a trailing slash", () => {
    process.env.AUTH_TRUSTED_ORIGINS = "https://store.example, https://admin.example";
    expect(
      hasTrustedRequestOrigin(
        new Request("https://app.example/api", { headers: { origin: "https://admin.example" } }),
      ),
    ).toBe(true);
    expect(
      hasTrustedRequestOrigin(
        new Request("https://app.example/api", { headers: { origin: "https://admin.example/" } }),
      ),
    ).toBe(true);
    expect(
      hasTrustedRequestOrigin(
        new Request("https://app.example/api", { headers: { origin: "https://attacker.example" } }),
      ),
    ).toBe(false);
  });

  it("rejects absent, malformed, and non-origin request headers", () => {
    process.env.AUTH_TRUSTED_ORIGINS = "https://admin.example";
    expect(hasTrustedRequestOrigin(new Request("https://app.example/api"))).toBe(false);
    expect(
      hasTrustedRequestOrigin(
        new Request("https://app.example/api", { headers: { origin: "null" } }),
      ),
    ).toBe(false);
    expect(
      hasTrustedRequestOrigin(
        new Request("https://app.example/api", {
          headers: { origin: "https://admin.example/path" },
        }),
      ),
    ).toBe(false);
  });

  it("falls back to Better Auth's configured base URL", () => {
    process.env.BETTER_AUTH_URL = "https://admin.example/base";
    expect(
      hasTrustedRequestOrigin(
        new Request("https://app.example/api", { headers: { origin: "https://admin.example" } }),
      ),
    ).toBe(true);
  });
});
