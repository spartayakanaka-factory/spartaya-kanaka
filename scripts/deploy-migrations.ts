import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeDatabaseTarget } from "./database-target";
import {
  requireEmptyHostingerPhase2Target,
  requireHostingerMigrationApproval,
} from "./migration-approval";
import { runHostingerPhase2Preflight } from "./preflight-hostinger-phase2";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argumentsList = process.argv.slice(2);
const hostingerTestTarget = process.env.DATABASE_TARGET === "hostinger-phase2-test";

async function main() {
  if (existsSync(path.join(root,"prisma/migrations/20261029143000_phase3_local_commerce"))) {
    throw new Error("Phase 3 promotion is blocked. Use scripts/phase3 migrate for the reviewed disposable-only preflight.");
  }
  if (hostingerTestTarget) {
    requireHostingerMigrationApproval(argumentsList);
    assertSafeDatabaseTarget({ allowHostingerPhase2Test: true });
    const preflight = await runHostingerPhase2Preflight();
    requireEmptyHostingerPhase2Target(argumentsList, preflight);
    process.stdout.write(
      "Backup reference provided; verify it identifies the completed hPanel database backup.\n",
    );
  } else {
    assertSafeDatabaseTarget();
  }

  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { cwd: root, env: process.env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch((error: unknown) => {
  process.stderr.write(
    (error instanceof Error ? error.message : "Migration deployment failed.") + "\n",
  );
  process.exitCode = 1;
});
