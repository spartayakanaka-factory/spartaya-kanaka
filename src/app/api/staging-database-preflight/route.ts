import { createHash, timingSafeEqual } from "node:crypto";
import { hostedStagingDatabaseConfigured } from "@/lib/commerce/runtime";
import { assertCompatibleDatabaseVersion } from "@/lib/server/database-engine";
import { getDatabase } from "@/lib/server/database";
import {
  getStagingAccessResponse,
  getStagingRequestHostname,
  hostingerPhase2StagingHostname,
} from "@/lib/staging-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  Vary: "Authorization, X-Staging-DB-Preflight-Token",
};

type DatabaseIdentity = {
  databaseName: string;
  currentUser: string;
  serverVersion: string;
  serverPort: number | bigint | string;
};

type TableInventory = { tableCount: number | bigint | string; hasMigrationLedger: number | bigint };
type MigrationInventory = {
  migrationName: string;
  checksum: string;
  finishedAt: Date | string | null;
  rolledBackAt: Date | string | null;
};

function constantTimeSecretMatch(actual: string | null, expected: string) {
  if (!actual || actual.length > 512) return false;
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

function response(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: responseHeaders });
}

/**
 * Temporary, read-only check for Hostinger's actual Next.js Node process.
 * It stays unavailable unless the exact staging target, Basic Auth, and a
 * separate one-time preflight secret are configured.
 */
export async function GET(request: Request) {
  const hostname = getStagingRequestHostname(request.headers);
  if (hostname !== hostingerPhase2StagingHostname) return response(404, { status: "not-found" });

  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;

  const preflightSecret = process.env.STAGING_DB_PREFLIGHT_SECRET;
  if (
    !hostedStagingDatabaseConfigured() ||
    !preflightSecret ||
    preflightSecret.length < 32 ||
    !constantTimeSecretMatch(request.headers.get("x-staging-db-preflight-token"), preflightSecret)
  )
    return response(404, { status: "not-found" });

  try {
    const db = getDatabase();
    const identityRows = await db.$queryRaw<DatabaseIdentity[]>`
      SELECT DATABASE() AS databaseName,
             CURRENT_USER() AS currentUser,
             VERSION() AS serverVersion,
             @@port AS serverPort
    `;
    const identity = identityRows[0];
    const databaseUser = identity?.currentUser.split("@", 1)[0] ?? "";
    const version = identity?.serverVersion ?? "";
    const compatible = assertCompatibleDatabaseVersion(version);
    if (
      identity?.databaseName !== "u858869017_sprtaya_phase2" ||
      databaseUser !== "u858869017_sprtaya_test" ||
      Number(identity.serverPort) !== 3306 ||
      compatible.engine !== "MariaDB" ||
      !/^11\.8\./.test(compatible.version)
    )
      return response(503, { status: "identity-mismatch" });

    const inventoryRows = await db.$queryRaw<TableInventory[]>`
      SELECT COUNT(*) AS tableCount,
             SUM(CASE WHEN TABLE_NAME = '_prisma_migrations' THEN 1 ELSE 0 END) AS hasMigrationLedger
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `;
    const inventory = inventoryRows[0];
    if (!inventory) return response(503, { status: "preflight-unavailable" });

    const hasMigrationLedger = Number(inventory.hasMigrationLedger) > 0;
    let migrations: MigrationInventory[] = [];
    if (hasMigrationLedger) {
      migrations = await db.$queryRaw<MigrationInventory[]>`
        SELECT migration_name AS migrationName,
               checksum,
               finished_at AS finishedAt,
               rolled_back_at AS rolledBackAt
        FROM _prisma_migrations
        ORDER BY started_at, migration_name
      `;
    }

    return response(200, {
      status: "connected",
      database: identity.databaseName,
      user: identity.currentUser,
      engine: compatible.engine,
      version: compatible.version,
      port: Number(identity.serverPort),
      tableCount: Number(inventory.tableCount),
      migrationLedgerPresent: hasMigrationLedger,
      migrations: migrations.map((migration) => ({
        name: migration.migrationName,
        checksum: migration.checksum,
        finished: Boolean(migration.finishedAt) && !migration.rolledBackAt,
      })),
    });
  } catch {
    return response(503, { status: "preflight-unavailable" });
  }
}
