import { readFileSync } from "node:fs";
import path from "node:path";
import { getDatabase } from "../src/lib/server/database";
async function main() {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.pathname !== "/sprtaya_phase4_disposable_local" ||
    u.username !== "sprtaya_phase4"
  )
    throw Error("Wrong target");
  const f = JSON.parse(readFileSync(path.join(process.env.P3_STATE_DIR!, "staff.json"), "utf8"));
  const db = getDatabase();
  try {
    await db.authSession.deleteMany({ where: { userId: f.staff[0].id } });
    console.log("Revoked synthetic owner sessions.");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  process.exitCode = 1;
});
