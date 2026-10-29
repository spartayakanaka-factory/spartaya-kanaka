// Read-only pre/postflight. Never applies or resolves a migration.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertSafeDatabaseTarget } from "./database-target";
import { createRuntimeDatabase } from "./runtime-db";

type Snapshot = { columns: Record<string, string[]>; tables: Record<string, { rows: number; sha256: string }> };
type Certificate = { readOnly: true; mode: string; identity: string; snapshot: Snapshot; migrations: string[] };
const args = process.argv.slice(2), mode = args[0];
function option(name: string) { return args[args.indexOf(name) + 1]; }
function privateFile(name: string) {
  const root = path.resolve(process.env.P3_STATE_DIR || "");
  const file = path.resolve(name || "");
  if (!process.env.P3_STATE_DIR || !file.startsWith(root + path.sep)) throw Error("Output/baseline must be in the configured private state directory.");
  return file;
}
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v, (_, x) => typeof x === "bigint" ? ["bigint", String(x)] : x)).digest("hex");
const identifier = (v: string) => { if (!/^[A-Za-z0-9_]+$/.test(v)) throw Error("Invalid database identifier."); return "`" + v + "`"; };
async function main() {
  if (!["preflight", "postflight"].includes(mode)) throw Error("Use preflight or postflight; this tool is read-only.");
  const target = assertSafeDatabaseTarget({ allowHostingerPhase2Test: true });
  if (target.target !== "hostinger-phase2-test" && !(target.target === "local" && target.host === "127.0.0.1" && target.port === 33078 && /^sprtaya_phase3_(?:rehearsal|disposable)_(?:local|test)$/.test(target.database))) throw Error("Unknown promotion target refused.");
  const output = privateFile(option("--out"));
  const db = createRuntimeDatabase();
  try {
    const rows = await db.$queryRaw<{name: string; user: string; version: string; port: number; fk: number; checks: number; engine: string}[]>`SELECT DATABASE() name,CURRENT_USER() user,VERSION() version,@@port port,@@foreign_key_checks fk,@@check_constraint_checks checks,@@default_storage_engine engine`;
    const actual = rows[0];
    if (actual.name !== target.database || !actual.user.startsWith(target.username + "@") || Number(actual.port) !== target.port || !actual.version.startsWith("11.8.9-MariaDB") || Number(actual.fk)!==1 || Number(actual.checks)!==1 || actual.engine.toLowerCase()!=="innodb") throw Error("Connected identity/engine/enforcement mismatch.");
    const identity = digest({ name: actual.name, user: actual.user, version: actual.version, port: actual.port });
    const manifest = JSON.parse(readFileSync("docs/phase3/migration-manifest.json", "utf8")) as {migrations:{name:string;sha256:string}[]};
    for(const m of manifest.migrations)if(createHash("sha256").update(readFileSync(`prisma/migrations/${m.name}/migration.sql`)).digest("hex")!==m.sha256)throw Error("Migration source checksum mismatch.");
    const history = await db.$queryRaw<{migration_name:string;checksum:string;finished_at:Date|null;rolled_back_at:Date|null}[]>`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
    const expected = manifest.migrations.slice(0, mode === "preflight" ? 2 : 4);
    if(history.length!==expected.length || history.some((h,i)=>h.migration_name!==expected[i].name || h.checksum!==expected[i].sha256 || !h.finished_at || h.rolled_back_at))throw Error("Unexpected or unresolved migration history; no operation performed.");
    const baseline = mode === "postflight" ? JSON.parse(readFileSync(privateFile(option("--baseline")),"utf8")) as Certificate : null;
    if(baseline && (!baseline.readOnly || baseline.mode!=="preflight" || baseline.identity!==identity))throw Error("Baseline identity differs.");
    const snapshot: Snapshot = {columns:baseline?.snapshot.columns || {},tables:{}};
    if(!baseline){
      const fields=await db.$queryRaw<{t:string;c:string}[]>`SELECT TABLE_NAME t,COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'_prisma_migrations' ORDER BY TABLE_NAME,ORDINAL_POSITION`;
      for(const {t,c} of fields)(snapshot.columns[t] ||= []).push(c);
    }
    for(const [table,columns] of Object.entries(snapshot.columns)){
      const values = await db.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT ${columns.map(identifier).join(",")} FROM ${identifier(table)}`);
      snapshot.tables[table]={rows:values.length,sha256:digest(values.map(digest).sort())};
    }
    if(baseline && digest(snapshot.tables)!==digest(baseline.snapshot.tables))throw Error("Existing Phase 2 rows changed.");
    if(mode === "postflight"){
      const bad=await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) n FROM inventory_balances WHERE reserved<0 OR reserved>quantity`;
      if(Number(bad[0].n)!==0)throw Error("Inventory invariant failed.");
      const checks=await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inventory_balances' AND CONSTRAINT_TYPE='CHECK'`;
      if(Number(checks[0].n)<2)throw Error("Inventory CHECK constraints missing.");
      const tables=await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()`;
      if(Number(tables[0].n)!==45)throw Error("Unexpected Phase 3 table inventory.");
    }
    const result: Certificate={readOnly:true,mode,identity,snapshot,migrations:history.map(h=>h.migration_name)};
    mkdirSync(path.dirname(output),{recursive:true,mode:0o700});writeFileSync(output,JSON.stringify(result,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify({readOnly:true,mode,tablesPreserved:Object.keys(snapshot.tables).length,migrations:history.length,result:"PASS"}));
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error("Read-only promotion check failed; inspect identity/history/private certificate without exposing connection secrets.");process.exitCode=1;});
