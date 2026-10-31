import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Read-only building block for a future staging runtime. It does not enable
 * commerce: identity, storage, accounts and payment boundaries must all be
 * enforced at every entry point before the local-only runtime may be changed.
 */
export type StagingIdentityClient = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export type StagingIdentityEnvironment = Record<string, string | undefined>;

function expectedConfiguration(env: StagingIdentityEnvironment) {
  if (
    env.APP_ENV !== "staging" ||
    env.STAGING_SITE !== "1" ||
    env.STAGING_DATABASE_APPROVED !== "1" ||
    env.PAYMENT_MODE !== "MOCK" ||
    !env.STAGING_DB_HOST ||
    !env.STAGING_DB_PORT ||
    !env.STAGING_DB_NAME ||
    !env.STAGING_DB_USER ||
    !/^[a-f0-9]{64}$/.test(env.STAGING_DB_MARKER_ID || "") ||
    !env.STAGING_DB_MARKER_SECRET ||
    env.STAGING_DB_MARKER_SECRET.length < 32
  )
    throw new Error("STAGING_IDENTITY_UNAVAILABLE");

  let url: URL;
  try {
    url = new URL(env.DATABASE_URL || "");
  } catch {
    throw new Error("STAGING_IDENTITY_UNAVAILABLE");
  }
  const port = Number(env.STAGING_DB_PORT);
  const name = decodeURIComponent(url.pathname.slice(1));
  const username = decodeURIComponent(url.username);
  if (
    url.protocol !== "mysql:" ||
    !url.password ||
    url.hostname !== env.STAGING_DB_HOST ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    Number(url.port || 3306) !== port ||
    name !== env.STAGING_DB_NAME ||
    username !== env.STAGING_DB_USER ||
    !/^[A-Za-z0-9_]{1,64}$/.test(name) ||
    !/^[A-Za-z0-9_]{1,80}$/.test(username)
  )
    throw new Error("STAGING_IDENTITY_UNAVAILABLE");
  return {
    name,
    username,
    host: url.hostname,
    port,
    marker: env.STAGING_DB_MARKER_ID!,
    secret: env.STAGING_DB_MARKER_SECRET,
  };
}

/** Verify configured target, actual connection identity and provisioned marker.
 * No marker is created or modified here. All failures are deliberately opaque. */
export async function assertStagingDatabaseIdentity(
  db: StagingIdentityClient,
  env: StagingIdentityEnvironment = process.env,
) {
  try {
    const c = expectedConfiguration(env);
    const rows = await db.$queryRaw<
      { databaseName: string; currentUser: string; serverPort: number | bigint }[]
    >`
      SELECT DATABASE() AS databaseName, CURRENT_USER() AS currentUser, @@port AS serverPort`;
    if (
      rows.length !== 1 ||
      rows[0].databaseName !== c.name ||
      rows[0].currentUser.split("@", 1)[0] !== c.username ||
      Number(rows[0].serverPort) !== c.port
    )
      throw new Error("mismatch");

    const markers = await db.$queryRaw<{ markerId: string; signature: string }[]>`
      SELECT marker_id AS markerId, signature FROM staging_identity WHERE marker_id = ${c.marker} LIMIT 2`;
    if (
      markers.length !== 1 ||
      markers[0].markerId !== c.marker ||
      !/^[a-f0-9]{64}$/.test(markers[0].signature)
    )
      throw new Error("marker");
    const expected = createHmac("sha256", c.secret!)
      .update(JSON.stringify(["sprtaya-staging-v1", c.marker, c.host, c.port, c.name, c.username]))
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(markers[0].signature, "hex")))
      throw new Error("signature");
  } catch {
    throw new Error("STAGING_IDENTITY_UNAVAILABLE");
  }
}
