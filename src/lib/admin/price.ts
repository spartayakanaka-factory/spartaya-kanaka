/** Parse an explicitly entered EGP amount without floating-point rounding. */
export function parsePriceMinor(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const value = raw.trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, ".");
  if (!/^(?:\d{1,7}|\d{1,3}(?:[,٬]\d{3})+)(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("INVALID_PRICE");
  }
  const [whole, fraction = ""] = value.replace(/[,٬]/g, "").split(".");
  if (whole.length > 7) throw new Error("INVALID_PRICE");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("INVALID_PRICE");
  return minor;
}
