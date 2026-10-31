/** Offline review only: never connects to a database or applies a migration. */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

type Migration = { name: string; sha256: string };
const manifest = JSON.parse(readFileSync("docs/phase4/migration-manifest.json", "utf8")) as {
  migrations: Migration[];
};
const folders = readdirSync("prisma/migrations", { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
if (
  manifest.migrations.length !== 7 ||
  JSON.stringify(folders) !== JSON.stringify(manifest.migrations.map((m) => m.name).sort())
)
  throw Error("Migration inventory mismatch");
for (const m of manifest.migrations) {
  const sql = readFileSync(path.join("prisma/migrations", m.name, "migration.sql"));
  if (createHash("sha256").update(sql).digest("hex") !== m.sha256)
    throw Error("Migration checksum mismatch: " + m.name);
  if (
    /\b(?:DROP\s+(?:TABLE|DATABASE)|TRUNCATE|DELETE\s+FROM|RENAME\s+TABLE)\b/i.test(sql.toString())
  )
    throw Error("Migration needs additional destructive-change review: " + m.name);
}
console.log(
  "PASS seven migration files match the reviewed local manifest; no database was accessed. DROP INDEX remains in scope and requires backup review.",
);
console.log(
  "Hosted Phase 3 migration deploy remains blocked by the existing guard; no command is authorized by this check.",
);
