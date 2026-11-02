// Read-only acceptance against the exact disposable Phase 5 fixture schema.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "../src/lib/server/database";
import { ownerReport } from "../src/lib/server/commerce/reports";
import { cairoDate, cairoDayStart, nextDate } from "../src/lib/reports/calendar";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";

let stage = "target";
async function main() {
  assertCommerceEnvironment();
  const u = new URL(process.env.DATABASE_URL!);
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.port, "33078");
  assert.equal(u.username, "sprtaya_phase5");
  assert.equal(u.pathname, "/sprtaya_phase5_disposable_local");
  const fixtures = JSON.parse(
    await readFile(path.join(process.env.P3_STATE_DIR!, "staff.json"), "utf8"),
  );
  const db = getDatabase();
  try {
    stage = "drafts";
    const imported = await db.legacyProductMapping.findMany({
      include: { product: { include: { variants: { include: { inventory: true } } } } },
    });
    assert.equal(imported.length, 487);
    for (const { product: p } of imported) {
      assert.equal(p.status, "DRAFT");
      assert.equal(p.priceMinor, null);
      assert.ok(
        p.variants.every(
          (v) => !v.inventory || (v.inventory.quantity === 0 && v.inventory.reserved === 0),
        ),
      );
    }
    stage = "inventory";
    const balances = await db.inventoryBalance.findMany();
    for (const b of balances) assert.ok(b.quantity >= b.reserved && b.reserved >= 0);
    const events = await db.commerceStockEvent.findMany({
      where: { variantId: fixtures.ready.variantId },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(events.some((e) => e.reservedDelta > 0));
    assert.ok(events.some((e) => e.quantityDelta < 0));
    const balance = await db.inventoryBalance.findUniqueOrThrow({
      where: { variantId: fixtures.ready.variantId },
    });
    const last = events.at(-1)!;
    assert.equal(balance.quantity, last.quantityAfter);
    assert.equal(balance.reserved, last.reservedAfter);
    stage = "reports";
    const day = cairoDate(new Date()),
      start = cairoDayStart(day),
      end = cairoDayStart(nextDate(day, 1));
    const report = await ownerReport(fixtures.staff[0].id, day, day);
    const orders = await db.commerceOrder.findMany({
      where: { createdAt: { gte: start, lt: end } },
      include: { payments: true, shipment: true },
    });
    assert.equal(report.totalOrders, orders.length);
    const totals = new Map<
      string,
      { collected: bigint; outstanding: bigint; orderValue: bigint }
    >();
    for (const order of orders) {
      const total = totals.get(order.currency) ?? {
        collected: 0n,
        outstanding: 0n,
        orderValue: 0n,
      };
      if (!["CANCELLED", "EXPIRED", "RETURNED"].includes(order.state))
        total.orderValue += order.totalMinor;
      if (!["CANCELLED", "EXPIRED", "RETURNED"].includes(order.state))
        total.outstanding +=
          order.totalMinor - order.paidMinor - order.creditedMinor + order.refundedMinor;
      total.collected +=
        order.paymentMethod === "COD"
          ? order.shipment?.collectionState === "RECONCILED"
            ? order.totalMinor
            : 0n
          : order.payments
              .filter((p) => p.state === "SUCCEEDED")
              .reduce((sum, p) => sum + p.amountMinor, 0n);
      totals.set(order.currency, total);
    }
    for (const row of report.currencies) {
      const expected = totals.get(row.currency)!;
      assert.equal(row.orderValue, String(expected.orderValue));
      assert.equal(row.collected, String(expected.collected));
      assert.equal(row.outstanding, String(expected.outstanding));
    }
    stage = "migrations";
    const ledger = await db.$queryRaw<
      {
        migration_name: string;
        checksum: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }[]
    >`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
    const manifest = JSON.parse(
      await readFile("docs/phase4/migration-manifest.json", "utf8"),
    ).migrations;
    assert.equal(ledger.length, manifest.length);
    ledger.forEach((row, i) => {
      assert.equal(row.migration_name, manifest[i].name);
      assert.equal(row.checksum, manifest[i].sha256);
      assert.ok(row.finished_at);
      assert.equal(row.rolled_back_at, null);
    });
    const evidence = {
      scope: "Read-only; exact isolated local Phase 5 schema",
      importedDrafts: imported.length,
      unapprovedPricesPreserved: true,
      stockInvariants: true,
      reservationAndDispatchEvents: events.length,
      readyStock: { quantity: balance.quantity, reserved: balance.reserved },
      cairoDay: day,
      dashboardAndReportOrderCount: orders.length,
      authoritativeCurrencyTotals: report.currencies,
      reportComparedToActualPaymentAndShipmentRows: true,
      reviewedMigrations: ledger.length,
      newMigrations: 0,
    };
    await writeFile(
      path.join(process.env.P5_ACCEPTANCE_DIR || "docs/phase5", "data-acceptance.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(
      "PASS draft preservation, inventory conservation, report-to-ledger reconciliation and all seven migration checksums",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(
    "Phase 5 read-only reconciliation failed at",
    stage,
    e.name,
    e.code ?? "",
    (e.stack ?? "").split("\n").find((v: string) => v.includes("phase5-acceptance.ts:")) ?? "",
  );
  process.exitCode = 1;
});
