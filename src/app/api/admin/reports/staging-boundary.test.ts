import { afterEach, describe, expect, it, vi } from "vitest";

const actor = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/server/admin-session", () => ({ getAdminActor: actor }));
vi.mock("@/lib/server/commerce/reports", () => ({ ownerReport: vi.fn() }));
vi.mock("@/lib/server/commerce/report-rate", () => ({ allowReportRequest: vi.fn() }));
import { GET } from "./route";

describe("report route with hosted staging disabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  it("rejects before session or database access even with valid site credentials", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SITE", "1");
    vi.stubEnv("STAGING_ACCESS_USERNAME", "test-reviewer");
    vi.stubEnv("STAGING_ACCESS_PASSWORD", "synthetic-test-password-12345678");
    const credentials = Buffer.from("test-reviewer:synthetic-test-password-12345678").toString(
      "base64",
    );
    const response = await GET(
      new Request("http://localhost/api/admin/reports?start=2050-01-01&end=2050-01-01", {
        headers: { authorization: "Basic " + credentials },
      }),
    );
    expect(response.status).toBe(503);
    expect(actor).not.toHaveBeenCalled();
  });
});
