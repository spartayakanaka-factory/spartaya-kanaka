import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertStagingDatabaseIdentity,
  type StagingIdentityClient,
} from "./staging-database-identity";

const marker = "a".repeat(64);
const secret = "synthetic-only-secret-for-unit-test-123456";
const env = {
  APP_ENV: "staging",
  STAGING_SITE: "1",
  STAGING_DATABASE_APPROVED: "1",
  PAYMENT_MODE: "MOCK",
  DATABASE_URL: "mysql://stage_user:fixture@127.0.0.1:33078/isolated_test",
  STAGING_DB_HOST: "127.0.0.1",
  STAGING_DB_PORT: "33078",
  STAGING_DB_NAME: "isolated_test",
  STAGING_DB_USER: "stage_user",
  STAGING_DB_MARKER_ID: marker,
  STAGING_DB_MARKER_SECRET: secret,
};
const signature = createHmac("sha256", secret)
  .update(
    JSON.stringify([
      "sprtaya-staging-v1",
      marker,
      "127.0.0.1",
      33078,
      "isolated_test",
      "stage_user",
    ]),
  )
  .digest("hex");
function client(
  rows: unknown[] = [
    [{ databaseName: "isolated_test", currentUser: "stage_user@localhost", serverPort: 33078 }],
    [{ markerId: marker, signature }],
  ],
) {
  const query = vi.fn().mockImplementation(async () => rows.shift());
  return { db: { $queryRaw: query } as unknown as StagingIdentityClient, query };
}
describe("read-only staging database attestation", () => {
  it("accepts only matching connection identity and authenticated marker", async () => {
    const { db, query } = client();
    await expect(assertStagingDatabaseIdentity(db, env)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toBe(marker);
  });
  it.each([
    { APP_ENV: "production" },
    { STAGING_SITE: "0" },
    { STAGING_DATABASE_APPROVED: "0" },
    { PAYMENT_MODE: "LIVE" },
    { STAGING_DB_MARKER_SECRET: "" },
    { STAGING_DB_MARKER_ID: "bad" },
    { DATABASE_URL: "mysql://production:fixture@127.0.0.1:33078/production" },
    { DATABASE_URL: "mysql://stage_user:fixture@other.example:33078/isolated_test" },
  ])("rejects invalid configuration before a query %#", async (patch) => {
    const { db, query } = client();
    await expect(assertStagingDatabaseIdentity(db, { ...env, ...patch })).rejects.toThrow(
      "STAGING_IDENTITY_UNAVAILABLE",
    );
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    [[{ databaseName: "other", currentUser: "stage_user@localhost", serverPort: 33078 }]],
    [[{ databaseName: "isolated_test", currentUser: "other@localhost", serverPort: 33078 }]],
    [[{ databaseName: "isolated_test", currentUser: "stage_user@localhost", serverPort: 3306 }]],
    [
      [{ databaseName: "isolated_test", currentUser: "stage_user@localhost", serverPort: 33078 }],
      [],
    ],
    [
      [{ databaseName: "isolated_test", currentUser: "stage_user@localhost", serverPort: 33078 }],
      [{ markerId: marker, signature: "b".repeat(64) }],
    ],
  ])("rejects identity, marker and signature mismatches %#", async (...rows) => {
    const { db } = client(rows);
    await expect(assertStagingDatabaseIdentity(db, env)).rejects.toThrow(
      "STAGING_IDENTITY_UNAVAILABLE",
    );
  });
  it("fails closed on a database outage without exposing the underlying error", async () => {
    const query = vi.fn().mockRejectedValue(new Error("private database details"));
    const db = { $queryRaw: query } as unknown as StagingIdentityClient;
    await expect(assertStagingDatabaseIdentity(db, env)).rejects.toThrow(
      /^STAGING_IDENTITY_UNAVAILABLE$/,
    );
  });
});
