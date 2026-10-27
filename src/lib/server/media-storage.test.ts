import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMediaStorage, mediaPublicUrl } from "@/lib/server/media-storage";

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

  it("encodes object-key path segments for public delivery URLs", () => {
    expect(mediaPublicUrl("https://images.example/", "products/مقاس كبير/1.webp")).toBe(
      "https://images.example/products/%D9%85%D9%82%D8%A7%D8%B3%20%D9%83%D8%A8%D9%8A%D8%B1/1.webp",
    );
  });
});
