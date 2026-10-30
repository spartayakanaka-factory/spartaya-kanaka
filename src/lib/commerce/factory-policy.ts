import { z } from "zod";

/** Normalize only Egyptian mobile numbers; no inferred international service. */
export function egyptianMobile(value: string) {
  let normalized = value
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[\s()-]/g, "");
  if (normalized.startsWith("+20")) normalized = "0" + normalized.slice(3);
  else if (normalized.startsWith("0020")) normalized = "0" + normalized.slice(4);
  return /^01[0125][0-9]{8}$/.test(normalized) ? normalized : null;
}
export const egyptianMobileSchema = z
  .string()
  .max(40)
  .transform(egyptianMobile)
  .pipe(z.string({ error: "EGYPTIAN_MOBILE_REQUIRED" }));
export const manualInstructionSchema = z
  .object({
    enabled: z.boolean(),
    identifier: z
      .string()
      .trim()
      .max(191)
      .regex(/^[A-Za-z0-9@._+: -]*$/),
    recipient: z.string().trim().max(120),
    instructionsAr: z.string().trim().max(1000),
    instructionsEn: z.string().trim().max(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.enabled)
      for (const [field, minimum] of [
        ["identifier", 3],
        ["recipient", 2],
        ["instructionsAr", 4],
        ["instructionsEn", 4],
      ] as const)
        if (value[field].length < minimum)
          ctx.addIssue({ code: "custom", path: [field], message: "PAYMENT_INSTRUCTIONS_REQUIRED" });
  });
export const manualInstructionsSchema = z
  .object({
    WALLET: manualInstructionSchema.optional(),
    INSTAPAY: manualInstructionSchema.optional(),
  })
  .strict();
export const destinationMatches = (
  rate: { city?: string; area?: string },
  address: { city: string; area?: string },
) =>
  (!rate.city ||
    rate.city.trim().toLocaleLowerCase() === address.city.trim().toLocaleLowerCase()) &&
  (!rate.area ||
    rate.area.trim().toLocaleLowerCase() === (address.area || "").trim().toLocaleLowerCase());
export const manualEvidenceEnabled = (env = process.env) => env.P35_PAYMENT_EVIDENCE === "1";
