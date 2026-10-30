import { describe, expect, it } from "vitest";
import { consumeOwnerBootstrapPassword } from "./owner-bootstrap-secret";

const hostingerEnvironment = () => ({
  DATABASE_TARGET: "hostinger-phase2-test",
  APP_ENV: "staging",
  STAGING_SITE: "1",
  OWNER_BOOTSTRAP_PASSWORD: "long-one-time-owner-password",
  OWNER_BOOTSTRAP_PASSWORD_CONFIRM: "long-one-time-owner-password",
});

describe("one-time owner bootstrap secret", () => {
  it("accepts a consumed one-time password for an explicitly confirmed isolated local target", () => {
    const environment = {
      ...hostingerEnvironment(),
      DATABASE_TARGET: "local",
      DATABASE_URL: "mysql://local_user:test@127.0.0.1:33077/sprtaya_phase2_test",
      APP_ENV: "local",
      STAGING_SITE: "0",
    };
    expect(consumeOwnerBootstrapPassword(environment, ["--confirm-local"], false)).toBe(
      "long-one-time-owner-password",
    );
    expect(environment).not.toHaveProperty("OWNER_BOOTSTRAP_PASSWORD");
  });

  it("rejects remote and production targets even with a local confirmation flag", () => {
    const environment = {
      ...hostingerEnvironment(),
      DATABASE_TARGET: "local",
      DATABASE_URL: "mysql://local_user:test@remote.invalid/sprtaya_phase2_test",
      APP_ENV: "local",
      STAGING_SITE: "0",
    };
    expect(() => consumeOwnerBootstrapPassword(environment, ["--confirm-local"], false)).toThrow(/loopback/);
    expect(() => consumeOwnerBootstrapPassword({ ...environment, ...hostingerEnvironment(), DATABASE_TARGET: "local", APP_ENV: "local", STAGING_SITE: "0", DATABASE_URL: "mysql://u:p@127.0.0.1/sprtaya_test", NODE_ENV: "production" }, ["--confirm-local"], false)).toThrow(/production/);
  });

  it("accepts a matching secret only for the explicitly confirmed Hostinger staging target", () => {
    const environment = hostingerEnvironment();
    expect(
      consumeOwnerBootstrapPassword(environment, ["--confirm-hostinger-phase2-test"], false),
    ).toBe("long-one-time-owner-password");
    expect(environment).not.toHaveProperty("OWNER_BOOTSTRAP_PASSWORD");
    expect(environment).not.toHaveProperty("OWNER_BOOTSTRAP_PASSWORD_CONFIRM");
  });

  it("rejects an unconfirmed or different database target and consumes the secret", () => {
    const environment = { ...hostingerEnvironment(), DATABASE_TARGET: "local" };
    expect(() => consumeOwnerBootstrapPassword(environment, [], false)).toThrow(
      /explicit confirmation/,
    );
    expect(environment).not.toHaveProperty("OWNER_BOOTSTRAP_PASSWORD");
  });

  it("rejects a missing or mismatched confirmation without printing secret values", () => {
    const environment = hostingerEnvironment();
    environment.OWNER_BOOTSTRAP_PASSWORD_CONFIRM = "different-value";
    expect(() =>
      consumeOwnerBootstrapPassword(environment, ["--confirm-hostinger-phase2-test"], false),
    ).toThrow("The one-time owner password and confirmation must both be set and match.");
    expect(environment).not.toHaveProperty("OWNER_BOOTSTRAP_PASSWORD");
  });

  it("rejects weak passwords and non-interactive runs without environment secrets", () => {
    const weak = { ...hostingerEnvironment(), OWNER_BOOTSTRAP_PASSWORD: "short" };
    weak.OWNER_BOOTSTRAP_PASSWORD_CONFIRM = "short";
    expect(() =>
      consumeOwnerBootstrapPassword(weak, ["--confirm-hostinger-phase2-test"], false),
    ).toThrow(/between 12 and 128/);
    expect(() => consumeOwnerBootstrapPassword({}, [], false)).toThrow(/private environment/);
  });
});
