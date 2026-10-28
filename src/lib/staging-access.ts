import { createHash, timingSafeEqual } from "node:crypto";

export const hostingerPhase2StagingHostname = "bisque-pheasant-330767.hostingersite.com";

export type StagingAccessConfig =
  | { mode: "disabled" }
  | { mode: "misconfigured" }
  | { mode: "protected"; username: string; password: string };

export type StagingAccessDecision =
  | { mode: "disabled"; authorized: true }
  | { mode: "misconfigured"; authorized: false }
  | { mode: "protected"; authorized: boolean };

function normalizeHostname(hostname: string | null | undefined) {
  return (
    hostname?.split(",", 1)[0]?.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "") || null
  );
}

/**
 * Prefer a known staging hostname from either proxy header. A conflicting
 * forwarded host must never hide the actual staging Host header.
 */
export function getStagingRequestHostname(requestHeaders: Pick<Headers, "get">) {
  const candidates = [
    normalizeHostname(requestHeaders.get("x-forwarded-host")),
    normalizeHostname(requestHeaders.get("host")),
    normalizeHostname(requestHeaders.get("x-original-host")),
  ].filter((hostname): hostname is string => Boolean(hostname));

  return (
    candidates.find((hostname) => hostname === hostingerPhase2StagingHostname) ??
    candidates[0] ??
    null
  );
}

export function getStagingAccessConfig(
  environment: Record<string, string | undefined> = process.env,
  hostname?: string | null,
): StagingAccessConfig {
  const enabled = environment.STAGING_SITE;
  const forceProtection = normalizeHostname(hostname) === hostingerPhase2StagingHostname;
  if (
    (enabled === undefined || enabled === "0") &&
    environment.APP_ENV !== "staging" &&
    !forceProtection
  ) {
    return { mode: "disabled" };
  }
  if (enabled !== "1") return { mode: "misconfigured" };

  const username = environment.STAGING_ACCESS_USERNAME;
  const password = environment.STAGING_ACCESS_PASSWORD;
  if (!username || username.length < 4 || !password || password.length < 24) {
    return { mode: "misconfigured" };
  }

  return { mode: "protected", username, password };
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isAuthorizedStagingBasicAuth(
  authorization: string | null,
  environment: Record<string, string | undefined> = process.env,
  hostname?: string | null,
) {
  const config = getStagingAccessConfig(environment, hostname);
  if (config.mode !== "protected" || !authorization || authorization.length > 4096) return false;

  const match = authorization.match(/^Basic\s+([A-Za-z0-9+/]+={0,2})$/i);
  if (!match?.[1]) return false;
  const encoded = match[1];
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) return false;

  const separator = decoded.indexOf(0x3a);
  if (separator < 1) return false;
  const username = decoded.subarray(0, separator).toString("utf8");
  const password = decoded.subarray(separator + 1).toString("utf8");
  const actual = fingerprint(`${username}\0${password}`);
  const expected = fingerprint(`${config.username}\0${config.password}`);
  return timingSafeEqual(actual, expected);
}

export function getStagingAccessDecision(
  requestHeaders: Pick<Headers, "get">,
  environment: Record<string, string | undefined> = process.env,
): StagingAccessDecision {
  const hostname = getStagingRequestHostname(requestHeaders);
  const config = getStagingAccessConfig(environment, hostname);
  if (config.mode === "disabled") return { mode: "disabled", authorized: true };
  if (config.mode === "misconfigured") return { mode: "misconfigured", authorized: false };
  return {
    mode: "protected",
    authorized: isAuthorizedStagingBasicAuth(
      requestHeaders.get("authorization"),
      environment,
      hostname,
    ),
  };
}

const stagingResponseHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Type": "text/plain; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  Vary: "Authorization",
};

/** Return a fail-closed Basic Auth response for server routes that can return HTTP status codes. */
export function getStagingAccessResponse(
  requestHeaders: Pick<Headers, "get">,
  environment: Record<string, string | undefined> = process.env,
) {
  const decision = getStagingAccessDecision(requestHeaders, environment);
  if (decision.authorized) return null;

  const misconfigured = decision.mode === "misconfigured";
  return new Response(
    misconfigured ? "Staging access is not configured." : "Authentication required.",
    {
      status: misconfigured ? 503 : 401,
      headers: {
        ...stagingResponseHeaders,
        ...(misconfigured
          ? {}
          : { "WWW-Authenticate": 'Basic realm="Sprtaya Phase 2 Staging", charset="UTF-8"' }),
      },
    },
  );
}
