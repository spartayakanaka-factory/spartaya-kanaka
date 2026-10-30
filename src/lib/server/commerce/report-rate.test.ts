import { describe, it, expect } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDatabase } from "../database";
import { allowReportRequest } from "./report-rate";
const enabled = process.env.P4_WORKSTREAM === "1" && process.env.PHASE3_DB_INTEGRATION === "1";
describe.skipIf(!enabled)("shared report rate limit against disposable MariaDB", () => {
  it("enforces concurrent requests from independent calls and expires its fixed window", async () => {
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/sprtaya_phase4_disposable_test");
    const id = randomUUID(),
      key = "p4-report:" + createHash("sha256").update(id).digest("hex"),
      db = getDatabase();
    try {
      const responses = await Promise.all(
        Array.from({ length: 12 }, () => allowReportRequest(id, 5, 60000)),
      );
      expect(responses.filter(Boolean)).toHaveLength(5);
      expect(await allowReportRequest(id, 5, 60000)).toBe(false);
      await db.authRateLimit.update({ where: { key }, data: { lastRequest: BigInt(0) } });
      expect(await allowReportRequest(id, 5, 60000)).toBe(true);
      expect(await allowReportRequest(randomUUID(), 5, 60000)).toBe(true);
    } finally {
      await db.authRateLimit.deleteMany({ where: { key } });
    }
  });
  it("shares its threshold across independent Node processes", async () => {
    const id = randomUUID(),
      key = "p4-report:" + createHash("sha256").update(id).digest("hex"),
      db = getDatabase();
    try {
      const run = promisify(execFile);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          run(
            process.execPath,
            ["--conditions=react-server", "--import", "tsx", "scripts/phase4-rate-worker.ts", id],
            {
              env: {
                ...process.env,
                NODE_PATH: process.cwd() + "/node_modules/next/dist/compiled",
              },
            },
          ),
        ),
      );
      expect(results.filter((r) => r.stdout.trim() === "ALLOW")).toHaveLength(2);
      expect(results.filter((r) => r.stdout.trim() === "DENY")).toHaveLength(2);
    } finally {
      await db.authRateLimit.deleteMany({ where: { key } });
    }
  }, 30000);
});
