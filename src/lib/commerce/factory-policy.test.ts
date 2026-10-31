import { describe, it, expect } from "vitest";
import {
  egyptianMobile,
  destinationMatches,
  localFixtureInstructionsSafe,
  manualInstructionsSchema,
} from "./factory-policy";
import { approvedLocalFixture, commerceEnabled } from "./runtime";
describe("Egypt-first factory checkout policy", () => {
  it.each(["01012345678", "+201012345678", "00201012345678", "٠١٠١٢٣٤٥٦٧٨", "۰۱۰۱۲۳۴۵۶۷۸"])(
    "normalizes supported Egyptian mobile input %s",
    (input) => expect(egyptianMobile(input)).toBe("01012345678"),
  );
  it.each(["+14155552671", "0212345678", "01312345678", "0101234567", "010123456789", "<script>"])(
    "rejects invalid or unsupported mobile input %s",
    (input) => expect(egyptianMobile(input)).toBeNull(),
  );
  it("requires configured city/area matches and preserves explicitly governorate-wide rates", () => {
    expect(
      destinationMatches({ city: "Cairo", area: "North" }, { city: "cairo", area: "north" }),
    ).toBe(true);
    expect(
      destinationMatches({ city: "Cairo", area: "North" }, { city: "Cairo", area: "South" }),
    ).toBe(false);
    expect(destinationMatches({ city: "", area: "" }, { city: "Configured region city" })).toBe(
      true,
    );
  });
  it("permits a disabled unconfigured method but requires complete instructions before enablement", () => {
    const empty = {
      enabled: false,
      identifier: "",
      recipient: "",
      instructionsAr: "",
      instructionsEn: "",
    };
    expect(manualInstructionsSchema.safeParse({ WALLET: empty }).success).toBe(true);
    expect(
      manualInstructionsSchema.safeParse({ WALLET: { ...empty, enabled: true } }).success,
    ).toBe(false);
    expect(
      manualInstructionsSchema.safeParse({ WALLET: { ...empty, password: "secret" } }).success,
    ).toBe(false);
  });
  it("allows only exact isolated target names and retains staging/production protection", () => {
    const env = {
      NODE_ENV: "test" as const,
      P3_ENABLED: "1",
      P3_SIMULATION: "1",
      P3_DISPOSABLE: "1",
      PAYMENT_MODE: "MOCK",
      APP_ENV: "local",
      STAGING_SITE: "0",
      DATABASE_URL: "mysql://test:fixture@127.0.0.1:33078/sprtaya_phase35_disposable_test",
    };
    expect(commerceEnabled(env)).toBe(true);
    for (const patch of [
      { APP_ENV: "staging" },
      { STAGING_SITE: "1" },
      { PAYMENT_MODE: "LIVE" },
      { DATABASE_URL: "mysql://test:fixture@127.0.0.1:3306/sprtaya_phase35_disposable_test" },
      { DATABASE_URL: "mysql://test:fixture@127.0.0.1:33078/sprtaya_phase35_production" },
    ])
      expect(commerceEnabled({ ...env, ...patch })).toBe(false);
  });
  it("allows the dedicated local fixture database only with its exact user and explicit opt-in", () => {
    const env = {
      NODE_ENV: "test" as const,
      P3_ENABLED: "1",
      P3_SIMULATION: "1",
      P3_DISPOSABLE: "1",
      PAYMENT_MODE: "MOCK",
      APP_ENV: "local",
      STAGING_SITE: "0",
      SR_LOCAL_ISOLATION: "1",
      DATABASE_URL: "mysql://sprtaya_sr_runtime:synthetic@127.0.0.1:33078/sprtaya_sr_staging_local",
    };
    expect(commerceEnabled(env)).toBe(true);
    for (const patch of [
      { SR_LOCAL_ISOLATION: "0" },
      { APP_ENV: "staging" },
      { STAGING_SITE: "1" },
      { PAYMENT_MODE: "LIVE" },
      { DATABASE_URL: "mysql://other:synthetic@127.0.0.1:33078/sprtaya_sr_staging_local" },
      {
        DATABASE_URL:
          "mysql://sprtaya_sr_runtime:synthetic@127.0.0.1:3306/sprtaya_sr_staging_local",
      },
    ])
      expect(commerceEnabled({ ...env, ...patch })).toBe(false);
  });
  it("accepts only separately provisioned IDs in the dedicated local sandbox", () => {
    const env = {
      NODE_ENV: "test" as const,
      P3_ENABLED: "1",
      P3_SIMULATION: "1",
      P3_DISPOSABLE: "1",
      PAYMENT_MODE: "MOCK",
      APP_ENV: "local",
      STAGING_SITE: "0",
      SR_LOCAL_ISOLATION: "1",
      DATABASE_URL: "mysql://sprtaya_sr_runtime:synthetic@127.0.0.1:33078/sprtaya_sr_staging_local",
      SR_LOCAL_ALLOWED_STAFF_IDS: "owner-id,staff-id",
      SR_LOCAL_ALLOWED_CUSTOMER_IDS: "customer-id",
    };
    expect(approvedLocalFixture("staff", "owner-id", env)).toBe(true);
    expect(approvedLocalFixture("customer", "customer-id", env)).toBe(true);
    expect(approvedLocalFixture("staff", "customer-id", env)).toBe(false);
    expect(approvedLocalFixture("customer", "other-id", env)).toBe(false);
    expect(approvedLocalFixture("staff", "owner-id", { ...env, APP_ENV: "staging" })).toBe(false);
    expect(
      approvedLocalFixture("customer", "customer-id", {
        ...env,
        SR_LOCAL_ALLOWED_CUSTOMER_IDS: "",
      }),
    ).toBe(false);
  });
  it("rejects real-looking transfer instructions in the dedicated local sandbox", () => {
    const fake = {
      enabled: true,
      identifier: "LOCAL-TEST-NOT-PAYABLE",
      recipient: "Synthetic recipient - no real transfer",
      instructionsAr: "Local test only. Do not transfer real funds.",
      instructionsEn: "Local test only. Do not transfer real funds.",
    };
    const env = { NODE_ENV: "test" as const, SR_LOCAL_ISOLATION: "1" };
    expect(localFixtureInstructionsSafe({ WALLET: fake }, env)).toBe(true);
    expect(
      localFixtureInstructionsSafe({ WALLET: { ...fake, identifier: "REAL-ACCOUNT" } }, env),
    ).toBe(false);
    expect(localFixtureInstructionsSafe({ INSTAPAY: { ...fake, enabled: false } }, env)).toBe(true);
    expect(localFixtureInstructionsSafe({ INSTAPAY: { ...fake, enabled: false, identifier: "REAL-ACCOUNT" } }, env)).toBe(false);
  });
});
