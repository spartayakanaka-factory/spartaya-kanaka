import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { getDatabase } from "@/lib/server/database";

vi.mock("@/lib/server/database", () => ({ getDatabase: vi.fn() }));

const username = "stage-reviewer";
const password = "synthetic-staging-password-long";
const preflightToken = "synthetic-one-time-preflight-token-0123456789";
const database = { $queryRaw: vi.fn() };

function request(options: { auth?: boolean; token?: string; host?: string } = {}) {
  const headers = new Headers({ host: options.host ?? "bisque-pheasant-330767.hostingersite.com" });
  if (options.auth !== false)
    headers.set(
      "authorization",
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
    );
  if (options.token) headers.set("x-staging-db-preflight-token", options.token);
  return new Request(
    "https://bisque-pheasant-330767.hostingersite.com/api/staging-database-preflight",
    {
      headers,
    },
  );
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("STAGING_SITE", "1");
  vi.stubEnv("STAGING_ACCESS_USERNAME", username);
  vi.stubEnv("STAGING_ACCESS_PASSWORD", password);
  vi.stubEnv("STAGING_DB_PREFLIGHT_SECRET", preflightToken);
  vi.stubEnv("DATABASE_TARGET", "hostinger-phase2-test");
  vi.stubEnv(
    "DATABASE_URL",
    "mysql://u858869017_sprtaya_test:synthetic@127.0.0.1:3306/u858869017_sprtaya_phase2",
  );
  vi.mocked(getDatabase).mockClear();
  vi.mocked(getDatabase).mockReturnValue(database as never);
  database.$queryRaw.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("temporary Hostinger database preflight", () => {
  it("rejects anonymous requests before database access", async () => {
    const response = await GET(request({ auth: false, token: preflightToken }));
    expect(response.status).toBe(401);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("rejects the wrong host and missing or invalid preflight tokens", async () => {
    expect((await GET(request({ host: "example.invalid", token: preflightToken }))).status).toBe(
      404,
    );
    expect((await GET(request())).status).toBe(404);
    expect((await GET(request({ token: "wrong-token" }))).status).toBe(404);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("fails closed for an unrelated database target before connecting", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://other:synthetic@127.0.0.1:3306/production");
    const response = await GET(request({ token: preflightToken }));
    expect(response.status).toBe(404);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("runs only read-only identity and inventory queries in the Node handler", async () => {
    database.$queryRaw
      .mockResolvedValueOnce([
        {
          databaseName: "u858869017_sprtaya_phase2",
          currentUser: "u858869017_sprtaya_test@127.0.0.1",
          serverVersion: "11.8.9-MariaDB-log",
          serverPort: 3306,
        },
      ])
      .mockResolvedValueOnce([{ tableCount: 0, hasMigrationLedger: 0 }]);

    const response = await GET(request({ token: preflightToken }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "connected",
      database: "u858869017_sprtaya_phase2",
      user: "u858869017_sprtaya_test@127.0.0.1",
      engine: "MariaDB",
      version: "11.8.9",
      port: 3306,
      tableCount: 0,
      migrationLedgerPresent: false,
      migrations: [],
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    const sql = database.$queryRaw.mock.calls.map(([parts]) => parts.join(" "));
    expect(sql).toHaveLength(2);
    expect(sql.every((query) => /^\s*SELECT\b/i.test(query))).toBe(true);
    expect(JSON.stringify(body)).not.toContain("synthetic");
  });

  it("reports a present migration ledger without changing its history", async () => {
    database.$queryRaw
      .mockResolvedValueOnce([
        {
          databaseName: "u858869017_sprtaya_phase2",
          currentUser: "u858869017_sprtaya_test@127.0.0.1",
          serverVersion: "11.8.9-MariaDB-log",
          serverPort: 3306,
        },
      ])
      .mockResolvedValueOnce([{ tableCount: 3, hasMigrationLedger: 1 }])
      .mockResolvedValueOnce([
        {
          migrationName: "20261027000000_phase2_initial",
          checksum: "a".repeat(64),
          finishedAt: new Date("2026-11-01T00:00:00Z"),
          rolledBackAt: null,
        },
      ]);

    const response = await GET(request({ token: preflightToken }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tableCount: 3,
      migrationLedgerPresent: true,
      migrations: [{ name: "20261027000000_phase2_initial", finished: true }],
    });
    const sql = database.$queryRaw.mock.calls.map(([parts]) => parts.join(" "));
    expect(sql).toHaveLength(3);
    expect(sql.every((query) => /^\s*SELECT\b/i.test(query))).toBe(true);
  });

  it("rejects a connected database with an unexpected identity and hides connection errors", async () => {
    database.$queryRaw.mockResolvedValueOnce([
      {
        databaseName: "other_database",
        currentUser: "unexpected@127.0.0.1",
        serverVersion: "11.8.9-MariaDB-log",
        serverPort: 3306,
      },
    ]);
    const mismatch = await GET(request({ token: preflightToken }));
    expect(mismatch.status).toBe(503);
    expect(await mismatch.json()).toEqual({ status: "identity-mismatch" });

    database.$queryRaw.mockRejectedValueOnce(new Error("private connection detail"));
    const failed = await GET(request({ token: preflightToken }));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private connection detail");
  });
});
