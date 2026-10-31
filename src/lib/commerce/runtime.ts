import { CommerceError } from "./policy";
export function commerceEnabled(env = process.env) {
  try {
    const u = new URL(env.DATABASE_URL || "");
    return (
      env.P3_ENABLED === "1" &&
      env.P3_SIMULATION === "1" &&
      env.P3_DISPOSABLE === "1" &&
      env.PAYMENT_MODE === "MOCK" &&
      env.APP_ENV === "local" &&
      env.STAGING_SITE === "0" &&
      u.protocol === "mysql:" &&
      u.hostname === "127.0.0.1" &&
      u.port === "33078" &&
      [
        "/sprtaya_phase3_disposable_local",
        "/sprtaya_phase3_disposable_test",
        "/sprtaya_phase35_disposable_local",
        "/sprtaya_phase35_disposable_test",
        "/sprtaya_phase4_disposable_local",
        "/sprtaya_phase4_disposable_test",
        "/sprtaya_phase4_recovery_v3",
      ].includes(u.pathname)
    );
  } catch {
    return false;
  }
}
export function assertCommerceEnvironment() {
  if (!commerceEnabled()) throw new CommerceError("LOCAL_COMMERCE_DISABLED", 503);
}
export function sameOrigin(headers: Headers) {
  if (headers.get("origin") !== process.env.CUSTOMER_AUTH_URL)
    throw new CommerceError("ORIGIN_REJECTED", 403);
}

export type CommerceFeature =
  | "CHECKOUT"
  | "CUSTOMER_ACCOUNTS"
  | "MOCK_PAYMENTS"
  | "MANUAL_TRANSFERS"
  | "REFUNDS"
  | "NOTIFICATIONS";
export function requireFeature(feature: CommerceFeature) {
  assertCommerceEnvironment();
  if (process.env["P3_" + feature] !== "1") throw new CommerceError(feature + "_DISABLED", 503);
}
