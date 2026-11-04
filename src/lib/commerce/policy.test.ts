import { describe, it, expect } from "vitest";
import { deposit, lineMoney, minor, newManufacturingTemplate, policySchema } from "./policy";
import { commerceEnabled } from "./runtime";
export const fixturePolicy = {
  currency: "EGP",
  taxMode: "EXCLUSIVE",
  taxRateBps: 1400,
  taxRounding: "HALF_UP_LINE",
  discountMode: "DISABLED",
  depositRounding: "CEILING_LINE",
  shippingTaxable: false,
  shippingCollection: "UPFRONT",
  codShippingCollection: "AT_DELIVERY",
  fixedDepositBasis: "PER_LINE",
  mixedCart: "SPLIT_REQUIRED",
  balanceDue: "BEFORE_DISPATCH",
  holdSeconds: 300,
  manualHoldSeconds: 900,
  allowGuest: true,
  syntheticGuestContact: true,
  allowUnpaidCancellation: true,
  allowMockRefunds: true,
  financeSelfApproval: false,
  distinctReconciler: true,
  international: false,
  externalNotifications: false,
} as const;
describe("explicit money and local boundaries", () => {
  it("never supplies absent tax policy", () => {
    expect(policySchema.safeParse({ currency: "EGP" }).success).toBe(false);
  });
  it("calculates inclusive/exclusive tax without floats", () => {
    const p = policySchema.parse(fixturePolicy);
    expect(lineMoney(BigInt(101), 3, p)).toEqual({
      net: BigInt(303),
      tax: BigInt(42),
      gross: BigInt(345),
    });
    expect(lineMoney(BigInt(11400), 1, { ...p, taxMode: "INCLUSIVE" })).toEqual({
      net: BigInt(10000),
      tax: BigInt(1400),
      gross: BigInt(11400),
    });
  });
  it("ceilings only new template deposits and preserves full advance", () => {
    expect(newManufacturingTemplate().depositValue).toBe(50);
    expect(deposit(BigInt(101), "DEPOSIT", "PERCENT", 50)).toBe(BigInt(51));
    expect(deposit(BigInt(101), "FULL_ADVANCE", "FIXED_MINOR", 0)).toBe(BigInt(101));
    expect(() => deposit(BigInt(10), "DEPOSIT", "FIXED_MINOR", 11)).toThrow();
  });
  it("rejects unsafe amounts", () => {
    expect(() => minor(1.1)).toThrow();
    expect(() => minor("-1")).toThrow();
  });
  it("rejects persistent/remote/hosted targets even with flags", () => {
    expect(
      commerceEnabled({
        ...process.env,
        DATABASE_URL: "mysql://x:x@127.0.0.1:33077/sprtaya_phase2_test",
      }),
    ).toBe(false);
    expect(commerceEnabled({ ...process.env, APP_ENV: "staging" })).toBe(false);
  });
});
