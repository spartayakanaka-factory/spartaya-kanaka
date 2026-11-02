import type { Prisma } from "@/generated/prisma/client";
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
      AND: [
        { OR: [{ provider: "LEGACY_LOCAL" }, { publicUrl: { not: null } }] },
        ...(q ? [{ OR: [{ altAr: { contains: q } }, { originalKey: { contains: q } }] }] : []),
      ],
    };
    const db = getDatabase();
    const [total, rows] = await Promise.all([
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
