import { afterEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  host: "example.test",
  products: vi.fn(),
  categories: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: context.host }) }));
vi.mock("@/lib/server/storefront-catalog", () => ({
  getStoreProducts: context.products,
  getStoreCategories: context.categories,
}));
import sitemap from "./sitemap";

describe("sitemap environment boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    context.host = "example.test";
  });

  it("never queries or lists products on a staging host even when configuration is missing", async () => {
    context.host = "bisque-pheasant-330767.hostingersite.com";
    vi.stubEnv("STAGING_SITE", "0");
    expect(await sitemap()).toEqual([]);
    expect(context.products).not.toHaveBeenCalled();
    expect(context.categories).not.toHaveBeenCalled();
  });

  it("returns no URLs in explicitly configured staging", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SITE", "1");
    expect(await sitemap()).toEqual([]);
    expect(context.products).not.toHaveBeenCalled();
  });

  it("preserves the ordinary storefront sitemap", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("STAGING_SITE", "0");
    context.products.mockResolvedValue([{ slug: "verified-fixture" }]);
    context.categories.mockResolvedValue([]);
    expect(
      (await sitemap()).some((entry) => entry.url.endsWith("/ar/products/verified-fixture")),
    ).toBe(true);
  });
});
