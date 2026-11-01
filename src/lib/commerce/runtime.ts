import { CommerceError } from "./policy";
import { stagingR2ConfigIssues } from "./staging-r2-config";

const stagingOrigin = "https://bisque-pheasant-330767.hostingersite.com";
const hostedStagingDatabase = "u858869017_sprtaya_phase2";
const hostedStagingDatabaseUser = "u858869017_sprtaya_test";
const hostedStagingDatabaseHost = "127.0.0.1";
const hostedStagingDatabasePort = 3306;
const fixtureIds = (value: string | undefined) =>
  Boolean(
    value &&
    value
      .split(",")
      .every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
      ),
  );

/** Explicit operator attestations are gates, not proof of infrastructure isolation. */
export function hostedStagingConfigured(env: NodeJS.ProcessEnv = process.env) {
  try {
    return (
      env.SR_HOSTED_ISOLATION === "1" &&
      env.SR_LOCAL_ISOLATION !== "1" &&
      env.APP_ENV === "staging" &&
      env.STAGING_SITE === "1" &&
      env.NODE_ENV === "production" &&
      env.STAGING_ACCESS_CONTROL_VERIFIED === "1" &&
      env.STAGING_DATABASE_ISOLATION_VERIFIED === "1" &&
      env.STAGING_R2_ISOLATION_VERIFIED === "1" &&
      (env.STAGING_ACCESS_USERNAME?.length || 0) >= 4 &&
      (env.STAGING_ACCESS_PASSWORD?.length || 0) >= 24 &&
      hostedStagingDatabaseConfigured(env) &&
      env.P3_ENABLED === "1" &&
      env.P3_SIMULATION === "1" &&
      env.P3_DISPOSABLE === "1" &&
      env.PAYMENT_MODE === "MOCK" &&
      env.P3_NOTIFICATIONS === "0" &&
      env.CATALOG_SOURCE === "mysql" &&
      env.BETTER_AUTH_URL === stagingOrigin &&
      env.CUSTOMER_AUTH_URL === stagingOrigin &&
      env.AUTH_TRUSTED_ORIGINS === stagingOrigin &&
      (env.BETTER_AUTH_SECRET?.length || 0) >= 32 &&
      (env.CUSTOMER_AUTH_SECRET?.length || 0) >= 32 &&
      (env.MOCK_PAYMENT_SECRET?.length || 0) >= 32 &&
      env.BETTER_AUTH_SECRET !== env.CUSTOMER_AUTH_SECRET &&
      env.BETTER_AUTH_SECRET !== env.MOCK_PAYMENT_SECRET &&
      env.CUSTOMER_AUTH_SECRET !== env.MOCK_PAYMENT_SECRET &&
      fixtureIds(env.SR_HOSTED_ALLOWED_STAFF_IDS) &&
      fixtureIds(env.SR_HOSTED_ALLOWED_CUSTOMER_IDS) &&
      stagingR2ConfigIssues(env).length === 0
    );
  } catch {
    return false;
  }
}

/** Exact database target gate shared by hosted commerce and the temporary read-only preflight. */
export function hostedStagingDatabaseConfigured(env: NodeJS.ProcessEnv = process.env) {
  try {
    const url = new URL(env.DATABASE_URL || "");
    return (
      env.DATABASE_TARGET === "hostinger-phase2-test" &&
      env.APP_ENV === "staging" &&
      env.STAGING_SITE === "1" &&
      env.NODE_ENV === "production" &&
      url.protocol === "mysql:" &&
      url.hostname === hostedStagingDatabaseHost &&
      Number(url.port || hostedStagingDatabasePort) === hostedStagingDatabasePort &&
      decodeURIComponent(url.username) === hostedStagingDatabaseUser &&
      Boolean(decodeURIComponent(url.password)) &&
      url.pathname === `/${hostedStagingDatabase}` &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function fixtureRestrictionsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.SR_LOCAL_ISOLATION === "1" || env.SR_HOSTED_ISOLATION === "1";
}
export function commerceEnabled(env = process.env) {
  if (env.SR_HOSTED_ISOLATION === "1") return hostedStagingConfigured(env);
  try {
    const u = new URL(env.DATABASE_URL || "");
    const localStaging =
      u.pathname === "/sprtaya_sr_staging_local" &&
      u.username === "sprtaya_sr_runtime" &&
      env.SR_LOCAL_ISOLATION === "1";
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
      (localStaging ||
        [
          "/sprtaya_phase3_disposable_local",
          "/sprtaya_phase3_disposable_test",
          "/sprtaya_phase35_disposable_local",
          "/sprtaya_phase35_disposable_test",
          "/sprtaya_phase4_disposable_local",
          "/sprtaya_phase4_disposable_test",
          "/sprtaya_phase4_recovery_v3",
        ].includes(u.pathname))
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

/** The dedicated local sandbox accepts only server-provisioned account IDs. */
export function approvedLocalFixture(
  kind: "staff" | "customer",
  id: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!fixtureRestrictionsEnabled(env)) return true;
  if (!commerceEnabled(env) || !id) return false;
  const list =
    env.SR_HOSTED_ISOLATION === "1"
      ? kind === "staff"
        ? env.SR_HOSTED_ALLOWED_STAFF_IDS
        : env.SR_HOSTED_ALLOWED_CUSTOMER_IDS
      : kind === "staff"
        ? env.SR_LOCAL_ALLOWED_STAFF_IDS
        : env.SR_LOCAL_ALLOWED_CUSTOMER_IDS;
  return Boolean(list && list.split(",").some((candidate) => candidate === id));
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
