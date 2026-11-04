import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "./database";

/** Read-only, bounded inventory view. Call only after the INVENTORY_READ page gate. */
export async function inventoryPage(input: { q?: string; low?: string; page?: string }) {
  const q = (input.q ?? "").trim().slice(0, 120),
    low = input.low === "1";
  const pattern = "%" + q.replace(/[=%_]/g, (s) => "=" + s) + "%";
  const where = Prisma.sql`FROM inventory_balances b JOIN products p ON p.id=b.productId JOIN product_variants v ON v.id=b.variantId
    WHERE p.type='READY_MADE' AND p.status<>'ARCHIVED' AND v.active=1
    ${q ? Prisma.sql`AND (p.titleAr LIKE ${pattern} ESCAPE '=' OR p.slug LIKE ${pattern} ESCAPE '=' OR v.nameAr LIKE ${pattern} ESCAPE '=' OR v.sku LIKE ${pattern} ESCAPE '=')` : Prisma.empty}
    ${low ? Prisma.sql`AND b.quantity-b.reserved<=b.lowStockAt` : Prisma.empty}`;
  return getDatabase().$transaction(
    async (tx) => {
      const [result] = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) n ${where}`);
      const total = Number(result.n),
        pages = Math.max(1, Math.ceil(total / 50)),
        requested = Number(input.page ?? 1);
      const page = Math.min(
        Number.isSafeInteger(requested) && requested > 0 ? requested : 1,
        pages,
      );
      const ids = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT b.id ${where} ORDER BY b.quantity-b.reserved,p.titleAr,b.id LIMIT 50 OFFSET ${(page - 1) * 50}`,
      );
      const records = await tx.inventoryBalance.findMany({
        where: { id: { in: ids.map((r) => r.id) } },
        include: {
          product: { select: { titleAr: true, slug: true, status: true } },
          variant: { select: { nameAr: true, sku: true } },
        },
      });
      const map = new Map(records.map((r) => [r.id, r]));
      return { rows: ids.map((r) => map.get(r.id)!), total, pages, page, q, low };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
