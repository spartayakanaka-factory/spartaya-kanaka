import { afterEach, expect, it, vi } from "vitest";
import { assertLocalShopper } from "./store";

afterEach(() => vi.unstubAllEnvs());
it("rejects guest, unapproved, and forged shopper keys before database operations", () => {
  for (const [key, value] of Object.entries({
    SR_LOCAL_ISOLATION: "1",
    SR_LOCAL_ALLOWED_CUSTOMER_IDS: "approved",
    APP_ENV: "local",
    STAGING_SITE: "0",
    P3_ENABLED: "1",
    P3_SIMULATION: "1",
    P3_DISPOSABLE: "1",
    PAYMENT_MODE: "MOCK",
    DATABASE_URL: "mysql://sprtaya_sr_runtime:test@127.0.0.1:33078/sprtaya_sr_staging_local",
  }))
    vi.stubEnv(key, value);
  expect(() => assertLocalShopper({ key: "guest:forged" })).toThrow("SYNTHETIC_LOGIN_REQUIRED");
  expect(() => assertLocalShopper({ key: "customer:other", userId: "other" })).toThrow(
    "SYNTHETIC_LOGIN_REQUIRED",
  );
  expect(() => assertLocalShopper({ key: "customer:other", userId: "approved" })).toThrow(
    "SYNTHETIC_LOGIN_REQUIRED",
  );
  expect(() => assertLocalShopper({ key: "customer:approved", userId: "approved" })).not.toThrow();
});
