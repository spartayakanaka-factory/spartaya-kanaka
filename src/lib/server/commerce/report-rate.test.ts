import { describe, it, expect } from "vitest";
import { createReportRateLimit } from "./report-rate";
describe("owner report rate limit", () => {
  it("limits each owner and resets only after the window expires", () => {
    const allow = createReportRateLimit(2, 1000);
    expect(allow("one", 0)).toBe(true);
    expect(allow("one", 1)).toBe(true);
    expect(allow("one", 2)).toBe(false);
    expect(allow("two", 2)).toBe(true);
    expect(allow("one", 1000)).toBe(true);
  });
});
