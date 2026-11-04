import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/server/admin-session";
import { getDatabase } from "@/lib/server/database";
import { getMediaStorage } from "@/lib/server/media-storage";
import { hasTrustedRequestOrigin } from "@/lib/server/request-origin";
import { getStagingAccessResponse } from "@/lib/staging-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const originalKey = /^product-originals\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/;
const displayKey = /^product-displays\/[0-9a-f-]{36}\.webp$/;
const response = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** Remove an unreferenced upload and retain a durable exact-key cleanup receipt. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;
  if (!hasTrustedRequestOrigin(request)) return response("FORBIDDEN", 403);
  const { id } = await context.params;
  if (!uuid.test(id)) return response("NOT_FOUND", 404);

  let storage: ReturnType<typeof getMediaStorage> | undefined;
  try {
    const actor = await requirePermission("MEDIA_WRITE");
    const configured = getMediaStorage();
    storage = configured;
    const db = getDatabase();
    const { originalsBucket, displayBucket, endpoint } = configured;
    const keys = await db.$transaction(async (tx) => {
      // The upload audit row survives removal and serializes late finalizers.
      await tx.$queryRaw`SELECT id FROM audit_events WHERE id = ${id} FOR UPDATE`;
      // Parent-row lock serializes deletion with foreign-key attachment writes.
      await tx.$queryRaw`SELECT id FROM media_assets WHERE id = ${id} FOR UPDATE`;
      const asset = await tx.mediaAsset.findUnique({
        where: { id },
        include: { _count: { select: { products: true, variants: true, categories: true } } },
      });
      if (!asset) {
        const receipt = await tx.auditEvent.findFirst({
          where: { entity: "MediaAsset", entityId: id, action: "media.cleanup-requested", actorId: actor.id },
          select: { afterData: true },
        });
        const data = receipt?.afterData;
        if (!data || typeof data !== "object" || Array.isArray(data) ||
            data.originalsBucket !== originalsBucket || data.displayBucket !== displayBucket || data.endpoint !== endpoint ||
            typeof data.original !== "string" || !originalKey.test(data.original) ||
            typeof data.display !== "string" || !displayKey.test(data.display))
          throw new Error("NOT_FOUND");
        return { original: data.original, display: data.display };
      }
      if (asset.provider !== "S3_COMPATIBLE" || asset.uploadedById !== actor.id ||
          !originalKey.test(asset.originalKey) || !asset.originalKey.startsWith(`product-originals/${id}.`) || !asset.displayKey || !displayKey.test(asset.displayKey))
        throw new Error("NOT_FOUND");
      if (Object.values(asset._count).some(Boolean)) throw new Error("MEDIA_REFERENCED");
      const ticket = await tx.auditEvent.findUnique({ where: { id }, select: { action: true, afterData: true } });
      const data = ticket?.afterData;
      if (ticket?.action !== "media.upload-authorized" || !data || typeof data !== "object" ||
          Array.isArray(data) || data.endpoint !== endpoint || data.bucket !== originalsBucket)
        throw new Error("NOT_FOUND");
      const keys = { original: asset.originalKey, display: asset.displayKey };
      await tx.auditEvent.create({ data: {
        actorId: actor.id, actorLabel: actor.name, action: "media.cleanup-requested",
        entity: "MediaAsset", entityId: id, afterData: { ...keys, originalsBucket, displayBucket, endpoint },
      } });
      await tx.mediaAsset.delete({ where: { id } });
      return keys;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    await configured.client.send(new DeleteObjectCommand({ Bucket: displayBucket, Key: keys.display }));
    await configured.client.send(new DeleteObjectCommand({ Bucket: originalsBucket, Key: keys.original }));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return response(message, 403);
    if (message === "NOT_FOUND") return response(message, 404);
    if (message === "MEDIA_REFERENCED") return response(message, 409);
    return response("MEDIA_CLEANUP_UNAVAILABLE", 503);
  } finally {
    storage?.client.destroy();
  }
}
