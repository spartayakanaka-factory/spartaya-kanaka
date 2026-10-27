import type { Locale } from "@/lib/types";

export function decimalFromMinor(minor: number): string {
  const amount = BigInt(minor);
  const hundred = BigInt(100);
  return `${amount / hundred}.${(amount % hundred).toString().padStart(2, "0")}`;
}

export function formatMoneyMinor(minor: number, locale: Locale, currency = "EGP"): string {
  const amount = BigInt(minor);
  const hundred = BigInt(100);
  const integer = amount / hundred;
  const fraction = amount % hundred;
  const pattern = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(0);
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(integer);
  const cents = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2, maximumFractionDigits: 0 }).format(Number(fraction));
  let wroteWhole = false;
  return pattern.map((part) => {
    if (part.type === "integer") {
      if (wroteWhole) return "";
      wroteWhole = true;
      return whole;
    }
    if (part.type === "fraction") return cents;
    return part.value;
  }).join("");
}
