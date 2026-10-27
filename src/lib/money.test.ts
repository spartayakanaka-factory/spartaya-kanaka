import { describe, expect, it } from "vitest";
import { decimalFromMinor, formatMoneyMinor } from "@/lib/money";

describe("minor-unit money formatting", () => {
  it("keeps whole and fractional units exact", () => {
    expect(decimalFromMinor(125035)).toBe("1250.35");
    expect(decimalFromMinor(5)).toBe("0.05");
    expect(formatMoneyMinor(123450, "en")).toContain("1,234.50");
  });
});
