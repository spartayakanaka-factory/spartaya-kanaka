import { createHash, timingSafeEqual } from "node:crypto";

export const hostingerPhase2StagingHostname = "bisque-pheasant-330767.hostingersite.com";

export type StagingAccessConfig =
  | { mode: "disabled" }
  | { mode: "misconfigured" }
  | { mode: "protected"; username: string; password: string };

export function getStagingAccessConfig(
  environment: Record<string, string | undefined> = process.env,
  hostname?: string | null,
): StagingAccessConfig {
  const enabled = environment.STAGING_SITE;
  const forceProtection =
    hostname?.toLowerCase().replace(/:\d+$/, "") === hostingerPhase2StagingHostname;
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
) {
  const config = getStagingAccessConfig(environment);
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
