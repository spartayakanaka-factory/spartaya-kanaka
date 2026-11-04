import { describe, expect, it } from "vitest";
import { decimalFromMinor, formatMoneyMinor } from "@/lib/money";

describe("minor-unit money formatting", () => {
  it("keeps whole and fractional units exact", () => {
    expect(decimalFromMinor(125035)).toBe("1250.35");
    expect(decimalFromMinor(5)).toBe("0.05");
    expect(formatMoneyMinor(123450, "en")).toContain("1,234.50");
  });
});

describe("large and signed ledger displays", () => {
  it("uses Egyptian Arabic digits and currency text for the Arabic interface", () => {
    const text = formatMoneyMinor(12345, "ar");
    expect(text).toContain("١٢٣٫٤٥");
    expect(text).toContain("ج.م.");
  });
  it("formats integer strings without losing minor units above Number precision", () => {
    expect(formatMoneyMinor("90071992547409931", "en")).toContain("900,719,925,474,099.31");
  });
  it("formats negative reconciled values with one sign and an absolute fraction", () => {
    expect(formatMoneyMinor(-105, "en")).toContain("1.05");
    expect(formatMoneyMinor(-105, "en")).toContain("-");
    expect(formatMoneyMinor("-5", "en")).toContain("0.05");
  });
});
