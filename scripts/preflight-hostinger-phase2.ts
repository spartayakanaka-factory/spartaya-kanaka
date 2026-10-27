import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as mariadb from "mariadb";
import { assertCompatibleDatabaseVersion } from "../src/lib/server/database-engine";
import { assertSafeDatabaseTarget, databaseIdentityFingerprint } from "./database-target";

type IdentityRow = {
  databaseName: string;
  currentUser: string;
  serverVersion: string;
};

type TableRow = { tableName: string };
type StorageSettingsRow = {
  defaultStorageEngine: string;
  foreignKeyChecks: number | bigint | string;
};
type CheckConstraintSettingRow = { checkConstraintChecks: number | bigint | string };
type MigrationRow = {
  migrationName: string;
  checksum: string;
  finishedAt: Date | string | null;
  rolledBackAt: Date | string | null;
};

function localMigrationChecksums(root: string) {
  const directory = path.join(root, "prisma", "migrations");
  const lockFile = readFileSync(path.join(directory, "migration_lock.toml"), "utf8");
  if (!/^provider\s*=\s*"mysql"\s*$/m.test(lockFile)) {
    throw new Error("The migration provider is not MySQL; staging preflight stopped.");
  }

  return new Map<string, string>(
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const migrationSql = readFileSync(path.join(directory, entry.name, "migration.sql"));
        return [entry.name, createHash("sha256").update(migrationSql).digest("hex")] as const;
      })
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export async function runHostingerPhase2Preflight() {
  const target = assertSafeDatabaseTarget({ allowHostingerPhase2Test: true });
  if (target.target !== "hostinger-phase2-test") {
    throw new Error("This preflight is only for the designated Hostinger Phase 2 test database.");
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required.");
  const url = new URL(raw);
  const connection = await mariadb.createConnection({
    host: target.host,
    port: target.port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: target.database,
    connectTimeout: 10_000,
  });

  try {
    const identityRows = (await connection.query(
      "SELECT DATABASE() AS databaseName, CURRENT_USER() AS currentUser, VERSION() AS serverVersion",
    )) as IdentityRow[];
    const identity = identityRows[0];
    if (!identity?.databaseName || !identity.currentUser || !identity.serverVersion) {
      throw new Error("The database connection did not return a complete identity.");
    }
    const authenticatedUser = identity.currentUser.split("@", 1)[0] ?? "";
    if (
      databaseIdentityFingerprint(identity.databaseName, authenticatedUser) !==
      databaseIdentityFingerprint(target.database, target.username)
    ) {
      throw new Error("Connected database identity does not match the designated Phase 2 target.");
    }

    const serverVersion = identity.serverVersion;
    const databaseVersion = assertCompatibleDatabaseVersion(serverVersion);

    const storageSettingsRows = (await connection.query(
      "SELECT @@SESSION.default_storage_engine AS defaultStorageEngine, @@SESSION.foreign_key_checks AS foreignKeyChecks",
    )) as StorageSettingsRow[];
    const storageSettings = storageSettingsRows[0];
    if (!storageSettings || storageSettings.defaultStorageEngine.toLowerCase() !== "innodb") {
      throw new Error("The database session must use InnoDB as its default storage engine.");
    }
    if (Number(storageSettings.foreignKeyChecks) !== 1) {
      throw new Error("Foreign-key enforcement is disabled for the database session.");
    }
    if (databaseVersion.engine === "MariaDB") {
      const checkSettingsRows = (await connection.query(
        "SELECT @@SESSION.check_constraint_checks AS checkConstraintChecks",
      )) as CheckConstraintSettingRow[];
      if (Number(checkSettingsRows[0]?.checkConstraintChecks) !== 1) {
        throw new Error(
          "MariaDB CHECK-constraint enforcement is disabled for the database session.",
        );
      }
    }

    const tableRows = (await connection.query(
      "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
    )) as TableRow[];
    const tableNames = new Set(tableRows.map((row) => row.tableName));
    const migrationChecksums = localMigrationChecksums(process.cwd());
    const hasMigrationHistory = tableNames.has("_prisma_migrations");

    if (!hasMigrationHistory && tableNames.size > 0) {
      throw new Error(
        "The database contains tables without Prisma migration history. Preserve its contents and review the schema manually before proceeding.",
      );
    }

    let history: MigrationRow[] = [];
    if (hasMigrationHistory) {
      history = (await connection.query(
        "SELECT migration_name AS migrationName, checksum, finished_at AS finishedAt, rolled_back_at AS rolledBackAt FROM _prisma_migrations ORDER BY started_at, migration_name",
      )) as MigrationRow[];
    }

    const applied = new Set<string>();
    for (const row of history) {
      if (!row.finishedAt || row.rolledBackAt) {
        throw new Error(
          `Migration history contains an incomplete or rolled-back entry (${row.migrationName}); manual review is required.`,
        );
      }
      const expectedChecksum = migrationChecksums.get(row.migrationName);
      if (!expectedChecksum || expectedChecksum !== row.checksum) {
        throw new Error(
          `Migration history does not match the checked-in migration (${row.migrationName}); manual review is required.`,
        );
      }
      if (applied.has(row.migrationName)) {
        throw new Error(`Migration history contains duplicate entries (${row.migrationName}).`);
      }
      applied.add(row.migrationName);
    }

    const pendingMigrations = [...migrationChecksums.keys()].filter((name) => !applied.has(name));
    process.stdout.write(
      [
        "Hostinger Phase 2 database preflight: PASS (read-only)",
        "Target identity: exact designated database and username verified",
        `Database engine: ${databaseVersion.engine} ${databaseVersion.version}`,
        `Default storage engine: ${storageSettings.defaultStorageEngine}`,
        "Foreign-key enforcement: enabled",
        ...(databaseVersion.engine === "MariaDB" ? ["CHECK-constraint enforcement: enabled"] : []),
        `Existing tables: ${tableNames.size}`,
        `Completed migrations: ${applied.size ? [...applied].join(", ") : "none"}`,
        `Pending migrations: ${pendingMigrations.length ? pendingMigrations.join(", ") : "none"}`,
        "No schema, catalog, or account data was changed.",
        "A Hostinger backup is still a separate manual prerequisite before any migration.",
      ].join("\n") + "\n",
    );

    return {
      engine: databaseVersion.engine,
      version: databaseVersion.version,
      serverVersion,
      tableCount: tableNames.size,
      appliedMigrations: [...applied],
      pendingMigrations,
    };
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runHostingerPhase2Preflight().catch((error: unknown) => {
    process.stderr.write((error instanceof Error ? error.message : "Preflight failed.") + "\n");
    process.exitCode = 1;
  });
}
