import { z } from "zod";
import { egyptianMobileSchema, manualInstructionsSchema } from "./factory-policy";

export const policySchema = z.object({
  currency: z.literal("EGP"),
  taxMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]),
  taxRateBps: z.number().int().min(0).max(10000),
  taxRounding: z.literal("HALF_UP_LINE"),
  discountMode: z.literal("DISABLED"),
  depositRounding: z.literal("CEILING_LINE"),
  shippingTaxable: z.boolean(),
  shippingCollection: z.literal("UPFRONT"),
  codShippingCollection: z.literal("AT_DELIVERY"),
  fixedDepositBasis: z.literal("PER_LINE"),
  mixedCart: z.literal("SPLIT_REQUIRED"),
  balanceDue: z.literal("BEFORE_DISPATCH"),
  holdSeconds: z.number().int().min(30).max(86400),
  manualHoldSeconds: z.number().int().min(30).max(604800),
  allowGuest: z.boolean(),
  syntheticGuestContact: z.boolean(),
  allowUnpaidCancellation: z.boolean(),
  allowMockRefunds: z.boolean(),
  financeSelfApproval: z.literal(false),
  distinctReconciler: z.literal(true),
  international: z.literal(false),
  externalNotifications: z.literal(false),
  manualInstructions: manualInstructionsSchema.optional(),
});
export type CommercePolicy = z.infer<typeof policySchema>;
export class CommerceError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
export function demand(value: unknown, code: string, status = 409): asserts value {
  if (!value) throw new CommerceError(code, status);
}
export const minor = (value: string | number | bigint): bigint => {
  demand(typeof value !== "number" || Number.isSafeInteger(value), "INVALID_MONEY");
  demand(/^\d+$/.test(String(value)), "INVALID_MONEY");
  const amount = BigInt(value);
  demand(amount <= BigInt("900000000000000"), "MONEY_LIMIT");
  return amount;
};
export const halfUp = (n: bigint, d: bigint) => (n * BigInt(2) + d) / (d * BigInt(2));
export function lineMoney(unit: bigint, quantity: number, policy: CommercePolicy) {
  demand(Number.isInteger(quantity) && quantity > 0 && quantity <= 99, "INVALID_QUANTITY");
  const value = minor(unit) * BigInt(quantity),
    rate = BigInt(policy.taxRateBps);
  const tax =
    policy.taxMode === "INCLUSIVE"
      ? halfUp(value * rate, BigInt(10000) + rate)
      : halfUp(value * rate, BigInt(10000));
  return {
    net: policy.taxMode === "INCLUSIVE" ? value - tax : value,
    tax,
    gross: policy.taxMode === "INCLUSIVE" ? value : value + tax,
  };
}
export function deposit(gross: bigint, mode: string, type: string, value: number) {
  if (mode === "FULL_ADVANCE") return gross;
  demand(mode === "DEPOSIT" && Number.isSafeInteger(value) && value > 0, "DEPOSIT_POLICY_REQUIRED");
  const amount =
    type === "PERCENT" ? (gross * BigInt(value) + BigInt(99)) / BigInt(100) : BigInt(value);
  demand(
    ((type === "PERCENT" && value <= 100) || type === "FIXED_MINOR") && amount <= gross,
    "DEPOSIT_POLICY_INVALID",
  );
  return amount;
}
export const newManufacturingTemplate = () => ({
  depositMode: "DEPOSIT" as const,
  depositType: "PERCENT" as const,
  depositValue: 50,
  balanceCollection: "BEFORE_DISPATCH" as const,
  codBalanceEligible: false,
});
export const methods = ["MOCK_CARD", "INSTAPAY", "WALLET", "COD"] as const;
export type PaymentMethod = (typeof methods)[number];
export const addressSchema = z.object({
  label: z.string().trim().min(1).max(80),
  recipient: z.string().trim().min(2).max(120),
  phone: egyptianMobileSchema,
  country: z.string().regex(/^[A-Z]{2}$/),
  region: z.string().trim().min(1).max(96),
  city: z.string().trim().min(1).max(96),
  area: z.string().trim().max(96).optional(),
  deliveryInstructions: z.string().trim().max(500).optional(),
  line1: z.string().trim().min(5).max(240),
  postalCode: z.string().max(32).optional(),
});
export type Address = z.infer<typeof addressSchema>;
export type Jsonified<T> = T extends bigint
  ? string
  : T extends Date
    ? string
    : T extends readonly (infer V)[]
      ? Jsonified<V>[]
      : T extends object
        ? { [K in keyof T]: Jsonified<T[K]> }
        : T;
export function jsonValue<T>(value: T): Jsonified<T> {
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}
