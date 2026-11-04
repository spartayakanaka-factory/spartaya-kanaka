import { describe, it, expect, vi } from "vitest";
vi.mock("../database", () => ({
  getDatabase: () => ({
    $transaction: () => {
      throw Error("backend unavailable");
    },
  }),
}));
vi.mock("@/lib/commerce/runtime", () => ({ assertCommerceEnvironment: () => {} }));
import { allowReportRequest } from "./report-rate";
describe("shared limiter backend failure", () => {
  it("does not allow a request when the shared backend is unavailable", async () => {
    await expect(allowReportRequest("synthetic-owner")).rejects.toThrow("backend unavailable");
  });
});
