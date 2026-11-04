import { createHash } from "node:crypto";
async function main() {
  const u = new URL(process.env.DATABASE_URL || "");
  if (
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.pathname !== "/sprtaya_phase4_disposable_test" ||
    u.username !== "sprtaya_phase4"
  )
    throw Error("Wrong source target");
  if (process.env.P4_RECOVERY === "1") {
    u.pathname = "/sprtaya_phase4_recovery_v3";
    process.env.DATABASE_URL = u.toString();
  }
  const { getDatabase } = await import("../src/lib/server/database"),
    { ownerReport } = await import("../src/lib/server/commerce/reports"),
    { cairoDate } = await import("../src/lib/reports/calendar");
  const db = getDatabase();
  try {
    const owner = await db.adminUser.findFirstOrThrow({
      where: {
        name: "Synthetic report owner",
        roleCode: "OWNER",
        banned: false,
        forcePasswordChange: false,
      },
      orderBy: { createdAt: "asc" },
    });
    const event = await db.commerceEvent.findFirstOrThrow({
      where: { actorKey: "staff:" + owner.id, kind: "payment.verified" },
      orderBy: { createdAt: "asc" },
    });
    const date = cairoDate(event.createdAt),
      report = await ownerReport(owner.id, date, date);
    console.log(
      JSON.stringify({
        date,
        orders: report.totalOrders,
        digest: createHash("sha256")
          .update(
            JSON.stringify(report, (key, value) => (key === "generatedAt" ? undefined : value)),
          )
          .digest("hex"),
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Recovery report comparison failed");
  process.exitCode = 1;
});
