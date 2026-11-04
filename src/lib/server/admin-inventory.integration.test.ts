import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./database";
import { inventoryPage } from "./admin-inventory";
const enabled = process.env.PHASE2_DB_INTEGRATION === "1" && process.env.P5_WORKSTREAM === "1";
describe.skipIf(!enabled)("Full inventory search and pagination against disposable MariaDB", () => {
  const db = getDatabase(),
    run = randomUUID(),
    ids = Array.from({ length: 301 }, () => randomUUID()),
    variants = ids.map(() => randomUUID());
  beforeAll(async () => {
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/sprtaya_phase5_disposable_test");
    await db.product.createMany({
      data: ids.map((id, i) => ({
        id,
        slug: `p55-${run}-${i}`,
        titleAr: `صنف اصطناعي ${run} ${i}`,
        descriptionAr: "Local search fixture only",
        type: "READY_MADE" as const,
        status: "DRAFT" as const,
      })),
    });
    await db.productVariant.createMany({
      data: ids.map((id, i) => ({
        id: variants[i],
        productId: id,
        nameAr: "خيار اصطناعي",
        sku: `${run}-${i}`,
      })),
    });
    await db.inventoryBalance.createMany({
      data: ids.map((id, i) => ({
        id: randomUUID(),
        productId: id,
        variantId: variants[i],
        quantity: 500 + i,
        reserved: i === 300 ? 799 : 0,
        lowStockAt: 2,
      })),
    });
  }, 30000);
  afterAll(async () => {
    await db.product.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  it("finds the last product beyond the previous 300-row bound and searches SKU/slug", async () => {
    for (const q of [`p55-${run}-300`, `${run}-300`]) {
      const r = await inventoryPage({ q });
      expect(r.total).toBe(1);
      expect(r.rows[0].productId).toBe(ids[300]);
    }
  });
  it("paginates all matching balances without repeats and clamps invalid pages", async () => {
    const a = await inventoryPage({ q: run }),
      b = await inventoryPage({ q: run, page: "2" }),
      last = await inventoryPage({ q: run, page: "99999" });
    expect(a.total).toBe(301);
    expect(a.rows).toHaveLength(50);
    expect(b.rows).toHaveLength(50);
    expect(last.page).toBe(7);
    expect(last.rows).toHaveLength(1);
    expect(new Set([...a.rows, ...b.rows].map((v) => v.id)).size).toBe(100);
    expect((await inventoryPage({ q: run, page: "NaN" })).page).toBe(1);
  });
  it("filters available stock after reservations and treats wildcard characters literally", async () => {
    const r = await inventoryPage({ q: run, low: "1" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].quantity - r.rows[0].reserved).toBe(1);
    expect((await inventoryPage({ q: run + "%" })).total).toBe(0);
  });
});
