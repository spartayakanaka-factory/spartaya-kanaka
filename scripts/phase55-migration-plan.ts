import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { requireHostingerMigrationApproval } from "./migration-approval";
export function reviewedPhase55Migrations(root: string) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, "docs/phase4/migration-manifest.json"), "utf8"),
  ).migrations as { name: string; sha256: string }[];
  if (manifest.length !== 7) throw Error("Exactly seven reviewed initial migrations required");
  const folders = readdirSync(path.join(root, "prisma/migrations"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (JSON.stringify(folders) !== JSON.stringify(manifest.map((m) => m.name)))
    throw Error("Migration inventory differs from reviewed manifest");
  for (const m of manifest) {
    const sql = readFileSync(path.join(root, "prisma/migrations", m.name, "migration.sql"));
    if (createHash("sha256").update(sql).digest("hex") !== m.sha256)
      throw Error("Migration checksum mismatch");
    if (
      /\b(?:DROP\s+(?:DATABASE|TABLE)|TRUNCATE|DELETE\s+FROM|RENAME\s+TABLE)\b/i.test(
        sql.toString(),
      )
    )
      throw Error("Unexpected destructive migration");
  }
  return manifest;
}
export function requirePhase55Initialization(
  args: string[],
  source: string,
  state: { tableCount: number; appliedMigrations: string[]; pendingMigrations: string[] },
  reviewed: { name: string }[],
) {
  const backup = requireHostingerMigrationApproval(args);
  const value = (name: string) =>
    args.find((a) => a.startsWith(name + "="))?.slice(name.length + 1);
  if (
    !args.includes("--apply") ||
    !args.includes("--approve-phase55-initialization") ||
    !args.includes("--expect-empty-database")
  )
    throw Error("Separate explicit Phase 5.5 initialization approval required");
  if (!/^[a-f0-9]{40}$/.test(source) || value("--approved-source") !== source)
    throw Error("Approved source differs from packaged release");
  if (value("--restore-verified") !== backup)
    throw Error("Verified restore must name the same backup digest");
  if (
    state.tableCount !== 0 ||
    state.appliedMigrations.length !== 0 ||
    JSON.stringify(state.pendingMigrations) !== JSON.stringify(reviewed.map((m) => m.name))
  )
    throw Error(
      "Only the freshly verified empty database with all seven migrations pending is permitted",
    );
  return { backupReference: backup, source };
}
