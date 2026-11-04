import type { Locale } from "@/lib/types";

/** Match checkout's variant override and product fallback. */
export function effectiveProductPrice(productPrice: number | null, variantPrice?: number | null) {
  return variantPrice ?? productPrice;
}

export function isPositiveProductPrice(price: number | null): price is number {
  return price !== null && Number.isSafeInteger(price) && price > 0;
}

export function decimalFromMinor(minor: number): string {
  const amount = BigInt(minor);
  const hundred = BigInt(100);
  return `${amount / hundred}.${(amount % hundred).toString().padStart(2, "0")}`;
}

export function formatMoneyMinor(
  minor: number | bigint | string,
  locale: Locale,
  currency = "EGP",
): string {
  const amount = BigInt(minor);
  const displayLocale = locale === "ar" ? "ar-EG" : locale;
  const hundred = BigInt(100);
  const absolute = amount < BigInt(0) ? -amount : amount;
  const integer = absolute / hundred;
  const fraction = absolute % hundred;
  const pattern = new Intl.NumberFormat(displayLocale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(amount < BigInt(0) ? -1 : 0);
  const whole = new Intl.NumberFormat(displayLocale, { maximumFractionDigits: 0 }).format(integer);
  const cents = new Intl.NumberFormat(displayLocale, {
    useGrouping: false,
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
  }).format(Number(fraction));
  let wroteWhole = false;
  return pattern
    .map((part) => {
      if (part.type === "integer") {
        if (wroteWhole) return "";
        wroteWhole = true;
        return whole;
      }
      if (part.type === "fraction") return cents;
      return part.value;
    })
    .join("");
}
