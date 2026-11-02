import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import mariadb from "mariadb";
import { getDatabase } from "./database";
import { fixtureProduct } from "../commerce/fixtures";
import { stock } from "./commerce/store";
describe.skipIf(process.env.PHASE3_DB_INTEGRATION !== "1" || process.env.P5_WORKSTREAM !== "1")(
  "Real isolated connection-loss recovery",
  () => {
    it("rolls back an interrupted stock transaction, reconnects and prevents a duplicate event", async () => {
      const u = new URL(process.env.DATABASE_URL!);
      expect(u.hostname).toBe("127.0.0.1");
      expect(u.port).toBe("33078");
      expect(u.username).toBe("sprtaya_phase5");
      expect(u.pathname).toBe("/sprtaya_phase5_disposable_test");
      const db = getDatabase(),
        key = "p55-kill-" + randomUUID(),
        p = await fixtureProduct(db, key, "READY_MADE", 3),
        control = await mariadb.createConnection({
          host: u.hostname,
          port: 33078,
          user: decodeURIComponent(u.username),
          password: decodeURIComponent(u.password),
          database: u.pathname.slice(1),
        });
      try {
        await expect(
          db.$transaction(async (tx) => {
            await stock(tx, p.variantId, -1, 0, key);
            const [r] = await tx.$queryRaw<{ id: bigint }[]>`SELECT CONNECTION_ID() id`;
            const id = Number(r.id);
            expect(Number.isSafeInteger(id) && id > 0).toBe(true);
            await control.query("KILL CONNECTION " + id);
            await tx.product.findUnique({ where: { id: p.id } });
          }),
        ).rejects.toThrow();
        expect(
          (await db.inventoryBalance.findUniqueOrThrow({ where: { variantId: p.variantId } }))
            .quantity,
        ).toBe(3);
        expect(await db.commerceStockEvent.count({ where: { operationKey: key } })).toBe(0);
        await db.$transaction((tx) => stock(tx, p.variantId, -1, 0, key));
        await expect(db.$transaction((tx) => stock(tx, p.variantId, -1, 0, key))).rejects.toThrow();
        expect(
          (await db.inventoryBalance.findUniqueOrThrow({ where: { variantId: p.variantId } }))
            .quantity,
        ).toBe(2);
        expect(await db.commerceStockEvent.count({ where: { operationKey: key } })).toBe(1);
      } finally {
        await control.end();
        await db.commerceStockEvent.deleteMany({ where: { variantId: p.variantId } });
        await db.product.delete({ where: { id: p.id } });
        await db.$disconnect();
      }
    }, 30000);
  },
);
