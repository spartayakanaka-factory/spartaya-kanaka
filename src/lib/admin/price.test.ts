import { describe, expect, it } from "vitest";
import { parsePriceMinor } from "./price";

describe("explicit EGP price review", () => {
  it.each([
    ["123.45", 12345], ["١٢٣٫٤٥", 12345], ["۱۲۳٫۴۵", 12345],
    ["1,234.5", 123450], ["١٬٢٣٤٫٥٠", 123450], ["0", 0],
    ["9999999.99", 999999999], [" 25.01 ", 2501],
  ])("parses %s into integer minor units", (input, minor) => {
    expect(parsePriceMinor(input)).toBe(minor);
  });
  it("keeps missing prices unapproved", () => {
    expect(parsePriceMinor("")).toBeNull();
    expect(parsePriceMinor(undefined)).toBeNull();
  });
  it.each(["123,45", "-1", "1.001", "1e3", "10000000", "1 2", "١٢ج.م", "NaN"])("rejects ambiguous or invalid %s", (input) => {
    expect(() => parsePriceMinor(input)).toThrow("INVALID_PRICE");
  });
});
