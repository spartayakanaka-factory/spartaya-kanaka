import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { request } from "playwright";
import { createRuntimeDatabase } from "./runtime-db";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
import { cairoDate, reportRange } from "../src/lib/reports/calendar";

async function main() {
  assertCommerceEnvironment();
  const u = new URL(process.env.DATABASE_URL!);
  if (
    process.env.SR_LOCAL_ISOLATION !== "1" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.username !== "sprtaya_sr_runtime" ||
    u.pathname !== "/sprtaya_sr_staging_local" ||
    process.env.P3_BASE_URL !== "http://localhost:3008"
  )
    throw Error("Wrong local sandbox");
  const base = process.env.P3_BASE_URL,
    data = JSON.parse(readFileSync(path.join(process.env.P3_STATE_DIR!, "staff.json"), "utf8"));
  const owner = await request.newContext(),
    manager = await request.newContext(),
    anonymous = await request.newContext(),
    db = createRuntimeDatabase();
  try {
    for (const [client, person] of [
      [owner, data.staff[0]],
      [manager, data.staff[1]],
    ] as const) {
      const login = await client.post(base + "/api/auth/sign-in/email", {
        headers: { origin: base },
        data: { email: person.email, password: person.password },
      });
      assert.equal(login.status(), 200, "fixture staff login");
    }
    const stored = await db.commercePaymentEvidence.findFirstOrThrow({
      orderBy: { createdAt: "asc" },
    });
    const evidenceResponse = await owner.get(
      base + "/api/commerce/payment-evidence?audience=staff&paymentId=" + stored.paymentId,
    );
    assert.equal(evidenceResponse.status(), 200);
    const evidence = await evidenceResponse.json();
    const preview = evidence.evidence.find(
      (item: { id: string }) => item.id === stored.id,
    ).previewUrl;
    const file = await owner.get(base + preview);
    assert.equal(file.status(), 200);
    assert.equal(
      createHash("sha256")
        .update(await file.body())
        .digest("hex"),
      stored.sha256,
    );
    assert.notEqual((await anonymous.get(base + preview)).status(), 200);
    console.log(
      "PASS previously stored private payment evidence survives the application restart and remains inaccessible anonymously.",
    );
    const day = cairoDate(new Date()),
      range = reportRange(day, day),
      url = base + `/api/admin/reports?start=${day}&end=${day}`;
    assert.equal((await anonymous.get(url)).status(), 403);
    assert.equal((await manager.get(url)).status(), 403);
    const response = await owner.get(url);
    assert.equal(response.status(), 200, "owner report available");
    assert.match(response.headers()["cache-control"], /no-store/);
    const report = await response.json();
    const expected = await db.commerceOrder.count({
      where: { createdAt: { gte: range.start, lt: range.end } },
    });
    assert.equal(report.totalOrders, expected);
    assert.ok(expected >= 3);
    const egp = report.currencies.find((c: { currency: string }) => c.currency === "EGP");
    const orders = await db.commerceOrder.findMany({
      where: {
        createdAt: { gte: range.start, lt: range.end },
        currency: "EGP",
        state: { notIn: ["CANCELLED", "EXPIRED", "RETURNED"] },
      },
      select: { totalMinor: true, paidMinor: true, creditedMinor: true, refundedMinor: true },
    });
    const balance = orders.reduce(
      (sum, o) => sum + o.totalMinor - o.paidMinor - o.creditedMinor + o.refundedMinor,
      0n,
    );
    assert.ok(egp && BigInt(egp.collected) > 0n && balance > 0n);
    assert.equal(BigInt(egp.outstanding), balance);
    assert.ok(
      BigInt(egp.codCount) > 0n && BigInt(egp.walletCount) > 0n && BigInt(egp.instapayCount) > 0n,
    );
    console.log(
      `PASS owner report: ${expected} database orders; reconciled COD, wallet and InstaPay; outstanding balance; manager and anonymous denied.`,
    );
  } finally {
    await Promise.all([owner.dispose(), manager.dispose(), anonymous.dispose(), db.$disconnect()]);
  }
}
main().catch((error) => {
  console.error("Local owner report check failed:", error.message);
  process.exitCode = 1;
});
