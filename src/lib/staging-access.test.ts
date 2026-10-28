import { describe, expect, it } from "vitest";
import {
  getStagingAccessConfig,
  getStagingAccessDecision,
  getStagingAccessResponse,
  isAuthorizedStagingBasicAuth,
} from "./staging-access";

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

  it("passes the target hostname into the credential check", () => {
    const token = Buffer.from(
      `${protectedEnvironment.STAGING_ACCESS_USERNAME}:${protectedEnvironment.STAGING_ACCESS_PASSWORD}`,
    ).toString("base64");
    expect(
      isAuthorizedStagingBasicAuth(
        `Basic ${token}`,
        protectedEnvironment,
        "bisque-pheasant-330767.hostingersite.com",
      ),
    ).toBe(true);
  });

  it("uses any known staging host even when proxy host headers disagree", () => {
    const requestHeaders = new Headers({
      host: "bisque-pheasant-330767.hostingersite.com",
      "x-forwarded-host": "internal-node.local",
    });
    expect(getStagingAccessDecision(requestHeaders, protectedEnvironment)).toEqual({
      mode: "protected",
      authorized: false,
    });
  });

  it("returns no-store 401 responses for missing and invalid credentials", () => {
    for (const authorization of [null, "Basic bm90LWF1dGhvcml6ZWQ="]) {
      const requestHeaders = new Headers({ host: "bisque-pheasant-330767.hostingersite.com" });
      if (authorization) requestHeaders.set("authorization", authorization);
      const response = getStagingAccessResponse(requestHeaders, protectedEnvironment);
      expect(response?.status).toBe(401);
      expect(response?.headers.get("www-authenticate")).toContain("Basic");
      expect(response?.headers.get("x-robots-tag")).toContain("noindex");
      expect(response?.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("allows valid staging credentials and fails closed when a staging host is misconfigured", () => {
    const token = Buffer.from(
      `${protectedEnvironment.STAGING_ACCESS_USERNAME}:${protectedEnvironment.STAGING_ACCESS_PASSWORD}`,
    ).toString("base64");
    const validHeaders = new Headers({
      host: "bisque-pheasant-330767.hostingersite.com",
      authorization: `Basic ${token}`,
    });
    expect(getStagingAccessResponse(validHeaders, protectedEnvironment)).toBeNull();

    const missingCredentials = new Headers({ host: "bisque-pheasant-330767.hostingersite.com" });
    expect(
      getStagingAccessResponse(missingCredentials, { APP_ENV: "staging", STAGING_SITE: "1" })
        ?.status,
    ).toBe(503);
  });

  it("keeps local non-staging requests accessible", () => {
    expect(
      getStagingAccessResponse(new Headers({ host: "localhost:3000" }), {
        APP_ENV: "local",
        STAGING_SITE: "0",
      }),
    ).toBeNull();
  });
});
