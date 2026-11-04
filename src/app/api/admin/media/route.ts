import { catalogLikePattern } from "@/app/admin/products/product-search";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/server/admin-session";
import { getDatabase } from "@/lib/server/database";
import { getStagingAccessResponse } from "@/lib/staging-access";
import { getProductImageUrl } from "@/lib/asset-url";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;
  try {
    await requirePermission("PRODUCTS_READ");
    const u = new URL(request.url),
      q = (u.searchParams.get("q") ?? "").trim(),
      page = Number(u.searchParams.get("page") ?? 0);
    if (q.length > 120 || !Number.isSafeInteger(page) || page < 0 || page > 10000)
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    const where: Prisma.MediaAssetWhereInput = {
      OR: [{ provider: "LEGACY_LOCAL" }, { publicUrl: { not: null } }],
    };
    const db = getDatabase();
    const [total, rows] = q ? await db.$transaction(async (tx) => {
      const pattern = catalogLikePattern(q);
      const predicate = Prisma.sql`(m.provider = 'LEGACY_LOCAL' OR m.publicUrl IS NOT NULL) AND (
        m.altAr COLLATE utf8mb4_unicode_ci LIKE ${pattern} ESCAPE '!' OR
        m.originalKey COLLATE utf8mb4_unicode_ci LIKE ${pattern} ESCAPE '!'
      )`;
      const [total] = await tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM media_assets m WHERE ${predicate}`;
      const rows = await tx.$queryRaw<{ id: string; altAr: string | null; originalKey: string; publicUrl: string | null }[]>`
        SELECT m.id, m.altAr, m.originalKey, m.publicUrl FROM media_assets m WHERE ${predicate}
        ORDER BY m.createdAt DESC, m.id ASC LIMIT ${36} OFFSET ${page * 36}
      `;
      return [Number(total.count), rows] as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }) : await Promise.all([
      db.mediaAsset.count({ where }),
      db.mediaAsset.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 36,
        skip: page * 36,
        select: { id: true, altAr: true, originalKey: true, publicUrl: true },
      }),
    ]);
    return Response.json(
      {
        total,
        page,
        assets: rows.map((a) => ({
          id: a.id,
          label: a.altAr || a.originalKey.split("/").pop() || "صورة",
          url: getProductImageUrl({
            publicUrl: a.publicUrl ?? undefined,
            localPath: a.originalKey.startsWith("legacy:") ? a.originalKey.slice(7) : "",
          }),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error && e.message === "FORBIDDEN" ? "FORBIDDEN" : "MEDIA_UNAVAILABLE",
      },
      { status: e instanceof Error && e.message === "FORBIDDEN" ? 403 : 503 },
    );
  }
}
