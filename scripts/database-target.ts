import { createHash } from "node:crypto";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const hostingerPhase2IdentityFingerprint =
  "c682b57673c1d6e08101934269d02fc87a87eb020e327cd2414a840151c14554";

export type DatabaseTarget = "local" | "staging" | "hostinger-phase2-test";

export type SafeDatabaseTarget = {
  target: DatabaseTarget;
  host: string;
  port: number;
  database: string;
  username: string;
};

export type DatabaseTargetOptions = {
  environment?: Record<string, string | undefined>;
  allowHostingerPhase2Test?: boolean;
};

export function databaseIdentityFingerprint(database: string, username: string) {
  return createHash("sha256")
    .update(`${database.trim().toLowerCase()}\0${username.trim().toLowerCase()}`)
    .digest("hex");
}

export function assertSafeDatabaseTarget(options: DatabaseTargetOptions = {}): SafeDatabaseTarget {
  const environment = options.environment ?? process.env;
  const target = environment.DATABASE_TARGET;
  const raw = environment.DATABASE_URL;
  const allowedTargets = ["local", "staging", "hostinger-phase2-test"];

  if (!raw || !target || !allowedTargets.includes(target)) {
    throw new Error(
      "Set DATABASE_TARGET to local, staging, or the guarded Hostinger Phase 2 test target, plus DATABASE_URL.",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }

  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://.");

  const host = url.hostname.toLowerCase();
  const port = Number(url.port || 3306);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
  const username = decodeURIComponent(url.username).toLowerCase();
  const password = decodeURIComponent(url.password);

  if (!database || !host || !username) throw new Error("DATABASE_URL is incomplete.");

  if (target === "hostinger-phase2-test") {
    if (!options.allowHostingerPhase2Test) {
      throw new Error(
        "The Hostinger Phase 2 database is only available to an explicitly confirmed preflight or maintenance command.",
      );
    }
    if (
      environment.APP_ENV !== "staging" ||
      environment.STAGING_SITE !== "1" ||
      host !== "127.0.0.1" ||
      port !== 3306 ||
      !password
    ) {
      throw new Error(
        "Hostinger Phase 2 access requires APP_ENV=staging, STAGING_SITE=1, a password, and the Hostinger-local 127.0.0.1:3306 endpoint.",
      );
    }
    const actualFingerprint = databaseIdentityFingerprint(database, username);
    if (actualFingerprint !== hostingerPhase2IdentityFingerprint) {
      throw new Error("DATABASE_URL does not identify the designated Phase 2 test database user.");
    }
  } else if (environment.NODE_ENV === "production") {
    throw new Error("Database maintenance commands are disabled for production database targets.");
  }

  if (
    target === "local" &&
    (!loopbackHosts.has(host) || !/(?:^|[_-])(?:local|test|dev)(?:$|[_-])/.test(database))
  ) {
    throw new Error(
      "DATABASE_TARGET=local requires a loopback host and a database name ending in local, test, or dev.",
    );
  }

  if (
    target === "staging" &&
    (!/(?:^|[_-])(?:staging|stage)(?:$|[_-])/.test(database) || loopbackHosts.has(host))
  ) {
    throw new Error(
      "DATABASE_TARGET=staging requires a non-loopback host and a database name containing staging or stage.",
    );
  }

  return { target: target as DatabaseTarget, host, port, database, username };
}
