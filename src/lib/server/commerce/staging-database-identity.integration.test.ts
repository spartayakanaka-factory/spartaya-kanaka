import { createHmac, randomBytes } from "node:crypto";
import mariadb from "mariadb";
import { describe, expect, it } from "vitest";
import {
  assertStagingDatabaseIdentity,
  type StagingIdentityClient,
} from "./staging-database-identity";

const enabled = process.env.PHASE3_DB_INTEGRATION === "1" && process.env.P4_WORKSTREAM === "1";
describe.skipIf(!enabled)("staging identity using an isolated MariaDB session", () => {
  it("checks a signed temporary marker and fails closed after tampering or disconnection", async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "33078" ||
      url.pathname !== "/sprtaya_phase4_disposable_test" ||
      url.username !== "sprtaya_phase4"
    )
      throw new Error("Exact disposable Phase 4 test database required");
    const conn = await mariadb.createConnection({
      host: url.hostname,
      port: Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    });
    const marker = randomBytes(32).toString("hex"),
      secret = randomBytes(32).toString("hex");
    const env = {
      APP_ENV: "staging",
      STAGING_SITE: "1",
      STAGING_DATABASE_APPROVED: "1",
      PAYMENT_MODE: "MOCK",
      DATABASE_URL: url.toString(),
      STAGING_DB_HOST: url.hostname,
      STAGING_DB_PORT: url.port,
      STAGING_DB_NAME: url.pathname.slice(1),
      STAGING_DB_USER: url.username,
      STAGING_DB_MARKER_ID: marker,
      STAGING_DB_MARKER_SECRET: secret,
    };
    const signature = createHmac("sha256", secret)
      .update(
        JSON.stringify([
          "sprtaya-staging-v1",
          marker,
          url.hostname,
          Number(url.port),
          url.pathname.slice(1),
          url.username,
        ]),
      )
      .digest("hex");
    const db = {
      $queryRaw: async (query: TemplateStringsArray, ...args: unknown[]) =>
        conn.query(query.join("?"), args),
    } as unknown as StagingIdentityClient;
    try {
      await conn.query(
        "CREATE TEMPORARY TABLE staging_identity (marker_id CHAR(64) PRIMARY KEY, signature CHAR(64) NOT NULL)",
      );
      await conn.query("INSERT INTO staging_identity (marker_id, signature) VALUES (?, ?)", [
        marker,
        signature,
      ]);
      await expect(assertStagingDatabaseIdentity(db, env)).resolves.toBeUndefined();
      await conn.query("UPDATE staging_identity SET signature = ? WHERE marker_id = ?", [
        "b".repeat(64),
        marker,
      ]);
      await expect(assertStagingDatabaseIdentity(db, env)).rejects.toThrow(
        "STAGING_IDENTITY_UNAVAILABLE",
      );
    } finally {
      await conn.end();
    }
    await expect(assertStagingDatabaseIdentity(db, env)).rejects.toThrow(
      "STAGING_IDENTITY_UNAVAILABLE",
    );
  });
});
