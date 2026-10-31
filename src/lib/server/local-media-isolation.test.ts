import { afterEach, expect, it, vi } from "vitest";
import { getMediaStorage } from "./media-storage";

afterEach(() => vi.unstubAllEnvs());
it("rejects wrong storage endpoint, bucket and credentials in the local sandbox", () => {
  const values = {
    SR_LOCAL_ISOLATION: "1",
    APP_ENV: "local",
    STAGING_SITE: "0",
    P3_ENABLED: "1",
    P3_SIMULATION: "1",
    P3_DISPOSABLE: "1",
    PAYMENT_MODE: "MOCK",
    DATABASE_URL: "mysql://sprtaya_sr_runtime:test@127.0.0.1:33078/sprtaya_sr_staging_local",
    MEDIA_S3_ENDPOINT: "http://127.0.0.1:39310",
    MEDIA_S3_ORIGINALS_BUCKET: "sprtaya-phase3-originals",
    MEDIA_S3_DISPLAY_BUCKET: "sprtaya-phase3-display",
    MEDIA_PUBLIC_BASE_URL: "http://127.0.0.1:39310/sprtaya-phase3-display",
    MEDIA_S3_FORCE_PATH_STYLE: "true",
    MEDIA_ACCESS_KEY_ID: "local-key",
    MEDIA_SECRET_ACCESS_KEY: "local-secret",
    SR_LOCAL_MEDIA_ACCESS_KEY_ID: "local-key",
    SR_LOCAL_MEDIA_SECRET_ACCESS_KEY: "local-secret",
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  const storage = getMediaStorage();
  storage.client.destroy();
  for (const [key, value] of [
    ["MEDIA_S3_ENDPOINT", "https://production.invalid"],
    ["MEDIA_S3_ORIGINALS_BUCKET", "production"],
    ["MEDIA_ACCESS_KEY_ID", "wrong-key"],
    ["MEDIA_SECRET_ACCESS_KEY", "wrong-secret"],
  ]) {
    vi.stubEnv(key, value);
    expect(() => getMediaStorage()).toThrow("MEDIA_STORAGE_UNAVAILABLE");
    vi.stubEnv(key, values[key as keyof typeof values]);
  }
});
