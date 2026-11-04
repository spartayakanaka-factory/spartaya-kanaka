import "server-only";
import { createHash } from "node:crypto";
import { getDatabase } from "../database";
import { assertCommerceEnvironment } from "@/lib/commerce/runtime";

/** Shared fixed window. One non-secret, namespaced row per owner; the database clock is authoritative. */
export async function allowReportRequest(ownerId: string, limit = 30, windowMs = 60000) {
  assertCommerceEnvironment();
  const digest = createHash("sha256").update(ownerId).digest("hex");
  const key = `p4-report:${digest}`;
  const db = getDatabase();
  return db.$transaction(
    async (tx) => {
      const clock = await tx.$queryRaw<
        { nowMs: bigint }[]
      >`SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) AS nowMs`;
      const now = BigInt(clock[0].nowMs);
      // The upsert obtains the row's exclusive lock atomically; no lock upgrade.
      await tx.$executeRaw`INSERT INTO auth_rate_limits (id, \`key\`, count, lastRequest) VALUES (${key}, ${key}, 1, ${now}) ON DUPLICATE KEY UPDATE count = IF(lastRequest <= ${now - BigInt(windowMs)}, 1, LEAST(count + 1, ${limit + 1})), lastRequest = IF(lastRequest <= ${now - BigInt(windowMs)}, ${now}, lastRequest)`;
      const row = await tx.authRateLimit.findUniqueOrThrow({
        where: { key },
        select: { count: true },
      });
      return row.count <= limit;
    },
    { timeout: 10000 },
  );
}
