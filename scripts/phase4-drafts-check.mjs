import { readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
import mariadb from "mariadb";
const raw = parse(await readFile("/Users/zuriki/Desktop/Desha Kanka/.local/phase2/env.local"));
const u = new URL(raw.DATABASE_URL);
if (u.hostname !== "127.0.0.1" || u.port !== "33077" || u.pathname !== "/sprtaya_phase2_local")
  throw Error("Unexpected Phase 2 identity");
let conn;
try {
  conn = await mariadb.createConnection({
    host: u.hostname,
    port: Number(u.port),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    connectTimeout: 2000,
  });
  await conn.query("SET SESSION TRANSACTION READ ONLY");
  await conn.beginTransaction();
  const [row] = await conn.query(
    "SELECT COUNT(*) AS mappings, SUM(p.status='DRAFT') AS drafts, SUM(p.priceMinor IS NOT NULL) AS priced, SUM(p.status <> 'DRAFT') AS nondrafts FROM legacy_product_mappings m JOIN products p ON p.id=m.productId WHERE m.status='IMPORTED'",
  );
  await conn.rollback();
  const result = {
    source: "Read-only local Phase 2 database",
    mappings: Number(row.mappings),
    drafts: Number(row.drafts),
    priced: Number(row.priced),
    nondrafts: Number(row.nondrafts),
  };
  await writeFile("docs/phase4/draft-preservation.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} catch {
  console.error("Read-only Phase 2 draft verification unavailable; no credential diagnostics.");
  process.exitCode = 1;
} finally {
  if (conn) await conn.end();
}
