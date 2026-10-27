import { describe, expect, it } from "vitest";
import {
  assertSafeDatabaseTarget,
  databaseIdentityFingerprint,
} from "../../../scripts/database-target";

const hostingerEnvironment = {
  DATABASE_TARGET: "hostinger-phase2-test",
  DATABASE_URL:
    "mysql://u858869017_sprtaya_test:test-password@127.0.0.1:3306/u858869017_sprtaya_phase2",
  APP_ENV: "staging",
  STAGING_SITE: "1",
  NODE_ENV: "production",
};

describe("database target safety guard", () => {
  it("permits the exact designated Hostinger test identity in staging mode", () => {
    expect(
      databaseIdentityFingerprint("u858869017_sprtaya_phase2", "u858869017_sprtaya_test"),
    ).toBe("c682b57673c1d6e08101934269d02fc87a87eb020e327cd2414a840151c14554");
    expect(
      assertSafeDatabaseTarget({
        allowHostingerPhase2Test: true,
        environment: hostingerEnvironment,
      }),
    ).toMatchObject({
      target: "hostinger-phase2-test",
      host: "127.0.0.1",
      database: "u858869017_sprtaya_phase2",
      username: "u858869017_sprtaya_test",
    });
  });

  it("requires explicit target approval and exact connection identity", () => {
    expect(() => assertSafeDatabaseTarget({ environment: hostingerEnvironment })).toThrow(
      /explicitly confirmed/,
    );
  });

  it("rejects unknown targets and any different database or database user", () => {
    for (const environment of [
      { ...hostingerEnvironment, DATABASE_TARGET: "production" },
      {
        ...hostingerEnvironment,
        DATABASE_URL:
          "mysql://u858869017_sprtaya_test:test-password@127.0.0.1:3306/u858869017_sprtaya_other",
      },
      {
        ...hostingerEnvironment,
        DATABASE_URL:
          "mysql://u858869017_other:test-password@127.0.0.1:3306/u858869017_sprtaya_phase2",
      },
    ]) {
      expect(() =>
        assertSafeDatabaseTarget({ allowHostingerPhase2Test: true, environment }),
      ).toThrow();
    }
  });

  it("requires the Hostinger staging markers and local database endpoint", () => {
    for (const changed of [
      { ...hostingerEnvironment, APP_ENV: "production" },
      { ...hostingerEnvironment, STAGING_SITE: "0" },
      {
        ...hostingerEnvironment,
        DATABASE_URL:
          "mysql://u858869017_sprtaya_test:test-password@example.invalid:3306/u858869017_sprtaya_phase2",
      },
      {
        ...hostingerEnvironment,
        DATABASE_URL:
          "mysql://u858869017_sprtaya_test:test-password@127.0.0.1:3307/u858869017_sprtaya_phase2",
      },
    ]) {
      expect(() =>
        assertSafeDatabaseTarget({
          allowHostingerPhase2Test: true,
          environment: changed,
        }),
      ).toThrow(/APP_ENV=staging/);
    }
  });

  it("continues to reject production database maintenance", () => {
    expect(() =>
      assertSafeDatabaseTarget({
        environment: {
          DATABASE_TARGET: "local",
          DATABASE_URL: "mysql://test:test@127.0.0.1:3306/sprtaya_test",
          NODE_ENV: "production",
        },
      }),
    ).toThrow(/disabled for production/);
  });
});
