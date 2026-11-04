import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMediaStorage, mediaPublicUrl, privateStagingMediaEnabled } from "@/lib/server/media-storage";

const mediaKeys = [
  "MEDIA_S3_ENDPOINT",
  "MEDIA_S3_REGION",
  "MEDIA_S3_ORIGINALS_BUCKET",
  "MEDIA_S3_DISPLAY_BUCKET",
  "MEDIA_ACCESS_KEY_ID",
  "MEDIA_SECRET_ACCESS_KEY",
  "MEDIA_PUBLIC_BASE_URL",
  "MEDIA_S3_FORCE_PATH_STYLE",
] as const;
const originalMediaConfig = new Map(mediaKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of mediaKeys) delete process.env[key];
});

afterEach(() => {
  for (const key of mediaKeys) {
    const value = originalMediaConfig.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("S3-compatible media configuration (no persistence claim)", () => {
  it("requires distinct private-original and public-display buckets", () => {
    expect(() => getMediaStorage()).toThrow("MEDIA_STORAGE_UNAVAILABLE");

    process.env.MEDIA_S3_ENDPOINT = "https://objects.example";
    process.env.MEDIA_S3_ORIGINALS_BUCKET = "factory-originals";
    process.env.MEDIA_S3_DISPLAY_BUCKET = "factory-originals";
    process.env.MEDIA_ACCESS_KEY_ID = "test-access-key";
    process.env.MEDIA_SECRET_ACCESS_KEY = "test-secret-key-not-real";
    process.env.MEDIA_PUBLIC_BASE_URL = "https://images.example";
    expect(() => getMediaStorage()).toThrow("MEDIA_STORAGE_UNAVAILABLE");
  });

  it("accepts a complete HTTPS configuration without contacting storage", () => {
    process.env.MEDIA_S3_ENDPOINT = "https://objects.example";
    process.env.MEDIA_S3_REGION = "auto";
    process.env.MEDIA_S3_ORIGINALS_BUCKET = "factory-originals";
    process.env.MEDIA_S3_DISPLAY_BUCKET = "factory-displays";
    process.env.MEDIA_ACCESS_KEY_ID = "test-access-key";
    process.env.MEDIA_SECRET_ACCESS_KEY = "test-secret-key-not-real";
    process.env.MEDIA_PUBLIC_BASE_URL = "https://images.example";

    const storage = getMediaStorage();
    expect(storage.originalsBucket).toBe("factory-originals");
    expect(storage.displayBucket).toBe("factory-displays");
    expect(storage.publicBase).toBe("https://images.example");
    storage.client.destroy();
  });

  it("enables exact private staging storage independently of commerce and fails closed", () => {
    const account = "a".repeat(32);
    const settings = {
      APP_ENV: "staging", STAGING_SITE: "1", STAGING_ACCESS_USERNAME: "owner-test",
      STAGING_ACCESS_PASSWORD: "synthetic-local-password-long",
      MEDIA_STAGING_UPLOADS: "1", P3_ENABLED: "0", SR_HOSTED_ISOLATION: "0",
      STAGING_R2_ACCOUNT_ID: account, MEDIA_S3_ENDPOINT: `https://${account}.r2.cloudflarestorage.com`,
      MEDIA_S3_ORIGINALS_BUCKET: "sprtaya-staging-private", MEDIA_S3_DISPLAY_BUCKET: "sprtaya-staging-public",
      MEDIA_S3_REGION: "auto", MEDIA_S3_FORCE_PATH_STYLE: "true",
      MEDIA_ACCESS_KEY_ID: "synthetic", MEDIA_SECRET_ACCESS_KEY: "synthetic",
      MEDIA_PUBLIC_BASE_URL: "https://bisque-pheasant-330767.hostingersite.com/api/staging-media",
    };
    try {
      for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
      expect(privateStagingMediaEnabled()).toBe(true);
      getMediaStorage().client.destroy();
      vi.stubEnv("MEDIA_PUBLIC_BASE_URL", "https://untrusted.example");
      expect(privateStagingMediaEnabled()).toBe(false);
      expect(() => getMediaStorage()).toThrow("MEDIA_STORAGE_UNAVAILABLE");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("encodes object-key path segments for public delivery URLs", () => {
    expect(mediaPublicUrl("https://images.example/", "products/مقاس كبير/1.webp")).toBe(
      "https://images.example/products/%D9%85%D9%82%D8%A7%D8%B3%20%D9%83%D8%A8%D9%8A%D8%B1/1.webp",
    );
  });
});
