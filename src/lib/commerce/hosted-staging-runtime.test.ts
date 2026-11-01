import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalShopper } from "../server/commerce/store";
import {
  approvedLocalFixture,
  commerceEnabled,
  hostedStagingConfigured,
  fixtureRestrictionsEnabled,
} from "./runtime";
import { localFixtureInstructionsSafe } from "./factory-policy";

const account = "a".repeat(32),
  owner = "11ac7f20-070f-48d2-b540-9904e3f21d01",
  customer = "18ac7f20-070f-48d2-b540-9904e3f21d02";
const env = {
  NODE_ENV: "production" as const,
  APP_ENV: "staging",
  STAGING_SITE: "1",
  SR_HOSTED_ISOLATION: "1",
  STAGING_ACCESS_CONTROL_VERIFIED: "1",
  STAGING_DATABASE_ISOLATION_VERIFIED: "1",
  STAGING_R2_ISOLATION_VERIFIED: "1",
  STAGING_ACCESS_USERNAME: "synthetic",
  STAGING_ACCESS_PASSWORD: "synthetic-staging-password-long",
  DATABASE_URL: "mysql://u858869017_sprtaya_run:synthetic@127.0.0.1:3306/u858869017_sprtaya_phase2",
  P3_ENABLED: "1",
  P3_SIMULATION: "1",
  P3_DISPOSABLE: "1",
  PAYMENT_MODE: "MOCK",
  P3_NOTIFICATIONS: "0",
  CATALOG_SOURCE: "mysql",
  BETTER_AUTH_URL: "https://bisque-pheasant-330767.hostingersite.com",
  CUSTOMER_AUTH_URL: "https://bisque-pheasant-330767.hostingersite.com",
  AUTH_TRUSTED_ORIGINS: "https://bisque-pheasant-330767.hostingersite.com",
  BETTER_AUTH_SECRET: "x".repeat(32),
  CUSTOMER_AUTH_SECRET: "y".repeat(32),
  MOCK_PAYMENT_SECRET: "z".repeat(32),
  SR_HOSTED_ALLOWED_STAFF_IDS: owner,
  SR_HOSTED_ALLOWED_CUSTOMER_IDS: customer,
  STAGING_R2_ACCOUNT_ID: account,
  MEDIA_S3_ENDPOINT: `https://${account}.r2.cloudflarestorage.com`,
  MEDIA_S3_REGION: "auto",
  MEDIA_S3_ORIGINALS_BUCKET: "sprtaya-staging-private",
  MEDIA_S3_DISPLAY_BUCKET: "sprtaya-staging-public",
  MEDIA_ACCESS_KEY_ID: "synthetic",
  MEDIA_SECRET_ACCESS_KEY: "synthetic",
  MEDIA_PUBLIC_BASE_URL: "https://bisque-pheasant-330767.hostingersite.com/api/staging-media",
  MEDIA_S3_FORCE_PATH_STYLE: "true",
};
afterEach(() => vi.unstubAllEnvs());
describe("hosted restricted commerce configuration", () => {
  it("allows only the explicitly configured synthetic target", () => {
    expect(hostedStagingConfigured(env)).toBe(true);
    expect(commerceEnabled(env)).toBe(true);
    expect(fixtureRestrictionsEnabled(env)).toBe(true);
    expect(approvedLocalFixture("staff", owner, env)).toBe(true);
    expect(approvedLocalFixture("customer", customer, env)).toBe(true);
    expect(approvedLocalFixture("staff", customer, env)).toBe(false);
    expect(approvedLocalFixture("customer", owner, env)).toBe(false);
  });
  it.each([
    ["SR_HOSTED_ISOLATION", "0"],
    ["SR_LOCAL_ISOLATION", "1"],
    ["APP_ENV", "production"],
    ["NODE_ENV", "development"],
    ["STAGING_SITE", "0"],
    ["STAGING_ACCESS_CONTROL_VERIFIED", "0"],
    ["STAGING_DATABASE_ISOLATION_VERIFIED", "0"],
    ["STAGING_R2_ISOLATION_VERIFIED", "0"],
    [
      "DATABASE_URL",
      "mysql://u858869017_sprtaya_test:synthetic@127.0.0.1:3306/u858869017_sprtaya_phase2",
    ],
    ["DATABASE_URL", "mysql://u858869017_sprtaya_run:synthetic@127.0.0.1:3306/production"],
    ["PAYMENT_MODE", "LIVE"],
    ["P3_SIMULATION", "0"],
    ["P3_NOTIFICATIONS", "1"],
    ["CATALOG_SOURCE", "local"],
    ["SR_HOSTED_ALLOWED_STAFF_IDS", ""],
    ["SR_HOSTED_ALLOWED_CUSTOMER_IDS", "invalid"],
    ["STAGING_ACCESS_PASSWORD", "short"],
    ["BETTER_AUTH_URL", "https://production.invalid"],
    ["MOCK_PAYMENT_SECRET", ""],
    ["MOCK_PAYMENT_SECRET", "x".repeat(32)],
    ["MEDIA_S3_ORIGINALS_BUCKET", "production"],
    ["MEDIA_S3_ENDPOINT", "https://production.invalid"],
  ])("fails closed when %s is unsafe", (key, value) => {
    expect(hostedStagingConfigured({ ...env, [key]: value })).toBe(false);
    expect(commerceEnabled({ ...env, [key]: value })).toBe(false);
  });
  it("enforces hosted customer identities before database access", () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    expect(() => assertLocalShopper({ key: "guest:forged" })).toThrow("SYNTHETIC_LOGIN_REQUIRED");
    expect(() => assertLocalShopper({ key: `customer:${owner}`, userId: owner })).toThrow(
      "SYNTHETIC_LOGIN_REQUIRED",
    );
    expect(() =>
      assertLocalShopper({ key: `customer:${customer}`, userId: customer }),
    ).not.toThrow();
  });
  it("rejects real-looking transfer instructions under hosted isolation", () => {
    expect(
      localFixtureInstructionsSafe(
        {
          WALLET: {
            enabled: true,
            identifier: "real-account",
            recipient: "someone",
            instructionsAr: "transfer",
            instructionsEn: "transfer",
          },
        },
        env,
      ),
    ).toBe(false);
  });
});
