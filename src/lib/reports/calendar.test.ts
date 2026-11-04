import { describe, it, expect } from "vitest";
import { cairoDayStart, cairoDate, nextDate, reportRange } from "./calendar";
describe("Cairo owner-report calendar", () => {
  it("finds the first instant of the local day at daylight-saving transitions", () => {
    for (const day of ["2026-04-24", "2026-10-30"]) {
      const start = cairoDayStart(day);
      expect(cairoDate(start)).toBe(day);
      expect(cairoDate(new Date(start.getTime() - 1))).toBe(nextDate(day, -1));
    }
    expect(
      (cairoDayStart("2026-04-25").getTime() - cairoDayStart("2026-04-24").getTime()) / 3600000,
    ).toBe(23);
    expect(
      (cairoDayStart("2026-10-30").getTime() - cairoDayStart("2026-10-29").getTime()) / 3600000,
    ).toBe(25);
  });
  it("crosses leap years, months and years without overlapping boundaries", () => {
    expect(nextDate("2024-02-28", 1)).toBe("2024-02-29");
    expect(nextDate("2024-02-29", 1)).toBe("2024-03-01");
    expect(nextDate("2026-12-31", 1)).toBe("2027-01-01");
    const first = reportRange("2026-12-31", "2027-01-01"),
      second = reportRange("2027-01-02", "2027-01-02");
    expect(first.end.getTime()).toBe(second.start.getTime());
  });
  it("rejects invalid calendar dates and ranges longer than 31 inclusive days", () => {
    expect(() => reportRange("2026-02-30", "2026-03-01")).toThrow();
    expect(() => reportRange("2026-03-02", "2026-03-01")).toThrow();
    expect(() => reportRange("2026-01-01", "2026-02-01")).toThrow();
    expect(reportRange("2026-01-01", "2026-01-31").days).toBe(31);
  });
});
