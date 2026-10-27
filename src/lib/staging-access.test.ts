import { describe, expect, it } from "vitest";
import { getStagingAccessConfig, isAuthorizedStagingBasicAuth } from "./staging-access";

const protectedEnvironment = {
  STAGING_SITE: "1",
  STAGING_ACCESS_USERNAME: "stage-reviewer",
  STAGING_ACCESS_PASSWORD: "x".repeat(24),
};

describe("staging access gate", () => {
  it("stays disabled unless explicitly enabled", () => {
    expect(getStagingAccessConfig({})).toEqual({ mode: "disabled" });
    expect(getStagingAccessConfig({ STAGING_SITE: "0" })).toEqual({ mode: "disabled" });
  });

  it("fails closed for invalid flags or missing credentials", () => {
    expect(getStagingAccessConfig({ STAGING_SITE: "yes" })).toEqual({ mode: "misconfigured" });
    expect(getStagingAccessConfig({ STAGING_SITE: "1" })).toEqual({ mode: "misconfigured" });
    expect(getStagingAccessConfig({ APP_ENV: "staging", STAGING_SITE: "0" })).toEqual({
      mode: "misconfigured",
    });
    expect(
      getStagingAccessConfig({ ...protectedEnvironment, STAGING_ACCESS_PASSWORD: "short" }),
    ).toEqual({ mode: "misconfigured" });
  });

  it("fails closed on the known Hostinger staging hostname until access is configured", () => {
    expect(getStagingAccessConfig({}, "bisque-pheasant-330767.hostingersite.com")).toEqual({
      mode: "misconfigured",
    });
    expect(getStagingAccessConfig({}, "bisque-pheasant-330767.hostingersite.com:443")).toEqual({
      mode: "misconfigured",
    });
    expect(getStagingAccessConfig({}, "store.example.com")).toEqual({ mode: "disabled" });
  });

  it("accepts only the configured HTTP Basic credentials", () => {
    const token = Buffer.from(
      `${protectedEnvironment.STAGING_ACCESS_USERNAME}:${protectedEnvironment.STAGING_ACCESS_PASSWORD}`,
    ).toString("base64");
    expect(isAuthorizedStagingBasicAuth(`Basic ${token}`, protectedEnvironment)).toBe(true);
    expect(isAuthorizedStagingBasicAuth("Basic bm90LWF1dGhvcml6ZWQ=", protectedEnvironment)).toBe(
      false,
    );
    expect(isAuthorizedStagingBasicAuth(null, protectedEnvironment)).toBe(false);
  });
});
