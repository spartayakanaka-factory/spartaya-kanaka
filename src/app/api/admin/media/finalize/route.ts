import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp, { type Metadata, type OutputInfo } from "sharp";
import { z } from "zod";
import { requirePermission } from "@/lib/server/admin-session";
import { getDatabase } from "@/lib/server/database";
import { getMediaStorage, mediaPublicUrl } from "@/lib/server/media-storage";
import { hasTrustedRequestOrigin } from "@/lib/server/request-origin";
import { getStagingAccessResponse } from "@/lib/staging-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ key: z.string().regex(/^product-originals\/[0-9a-f-]{36}\.(?:jpg|png|webp|avif)$/i), size: z.number().int().positive().max(10 * 1024 * 1024), altAr: z.string().trim().max(191).optional() });
const mimeByExtension: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };

async function bodyBuffer(body: unknown) {
  if (!body || typeof body !== "object" || !(Symbol.asyncIterator in body)) throw new Error("INVALID_OBJECT");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 10 * 1024 * 1024) throw new Error("INVALID_OBJECT");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function deleteOwnedOriginal(storage: ReturnType<typeof getMediaStorage>, key: string) {
  try { await storage.client.send(new DeleteObjectCommand({ Bucket: storage.originalsBucket, Key: key })); } catch { /* Best effort for a failed unreferenced upload. */ }
}

export async function POST(request: Request) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;
  let ownedKey: string | null = null;
  let storage: ReturnType<typeof getMediaStorage> | null = null;
  try {
    const actor = await requirePermission("MEDIA_WRITE");
    if (!hasTrustedRequestOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    if (Number(request.headers.get("content-length") ?? 0) > 2_048) return Response.json({ error: "INVALID_REQUEST" }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 2_048) return Response.json({ error: "INVALID_REQUEST" }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "INVALID_REQUEST" }, { status: 400 }); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "INVALID_IMAGE" }, { status: 400 });
    ownedKey = parsed.data.key;
    storage = getMediaStorage();
    const db = getDatabase();

    const existing = await db.mediaAsset.findUnique({ where: { originalKey: parsed.data.key }, select: { id: true, publicUrl: true, width: true, height: true, altAr: true, uploadedById: true } });
    if (existing) {
      if (existing.uploadedById !== actor.id) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
      return Response.json({ id: existing.id, url: existing.publicUrl, width: existing.width, height: existing.height, alt: existing.altAr }, { headers: { "Cache-Control": "no-store" } });
    }

    const head = await storage.client.send(new HeadObjectCommand({ Bucket: storage.originalsBucket, Key: parsed.data.key }));
    if (head.Metadata?.owner !== actor.id) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const extension = parsed.data.key.split(".").pop()?.toLowerCase() ?? "";
    const expectedMime = mimeByExtension[extension];
    if (head.ContentLength !== parsed.data.size || head.ContentLength > 10 * 1024 * 1024 || head.ContentType !== expectedMime) {
      await deleteOwnedOriginal(storage, parsed.data.key);
      return Response.json({ error: "INVALID_IMAGE" }, { status: 400 });
    }

    const object = await storage.client.send(new GetObjectCommand({ Bucket: storage.originalsBucket, Key: parsed.data.key }));
    const original = await bodyBuffer(object.Body);
    let metadata: Metadata;
    let display: Buffer;
    let info: OutputInfo;
    try {
      metadata = await sharp(original, { limitInputPixels: 40_000_000, failOn: "error", animated: false }).metadata();
      const converted = await sharp(original, { limitInputPixels: 40_000_000, failOn: "error", animated: false }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
      display = converted.data;
      info = converted.info;
    } catch {
      await deleteOwnedOriginal(storage, parsed.data.key);
      return Response.json({ error: "INVALID_IMAGE" }, { status: 400 });
    }
    const validFormat = metadata.format === "jpeg" && expectedMime === "image/jpeg"
      || metadata.format === "png" && expectedMime === "image/png"
      || metadata.format === "webp" && expectedMime === "image/webp"
      || metadata.format === "heif" && expectedMime === "image/avif";
    if (!metadata.width || !metadata.height || !validFormat) {
      await deleteOwnedOriginal(storage, parsed.data.key);
      return Response.json({ error: "INVALID_IMAGE" }, { status: 400 });
    }
    const displayKey = `product-displays/${parsed.data.key.split("/").pop()?.replace(/\.[^.]+$/, ".webp")}`;
    await storage.client.send(new PutObjectCommand({ Bucket: storage.displayBucket, Key: displayKey, Body: display, ContentLength: display.length, ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable" }));
    const publicUrl = mediaPublicUrl(storage.publicBase, displayKey);
    try {
      const asset = await db.$transaction(async (tx) => {
        const created = await tx.mediaAsset.create({
          data: {
            provider: "S3_COMPATIBLE",
            originalKey: parsed.data.key,
            displayKey,
            publicUrl,
            mimeType: "image/webp",
            byteSize: original.length,
            width: info.width,
            height: info.height,
            sha256: createHash("sha256").update(original).digest("hex"),
            altAr: parsed.data.altAr || null,
            uploadedById: actor.id,
          },
        });
        await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "media.uploaded", entity: "MediaAsset", entityId: created.id, afterData: { byteSize: created.byteSize, width: created.width, height: created.height } } });
        return created;
      });
      return Response.json({ id: asset.id, url: asset.publicUrl, width: asset.width, height: asset.height, alt: asset.altAr }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      try { await storage.client.send(new DeleteObjectCommand({ Bucket: storage.displayBucket, Key: displayKey })); } catch { /* Preserve the original for safe retry and clean the derivative best-effort. */ }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    if (message === "MEDIA_STORAGE_UNAVAILABLE") return Response.json({ error: "MEDIA_STORAGE_UNAVAILABLE" }, { status: 503 });
    if (message === "INVALID_OBJECT") {
      if (storage && ownedKey) await deleteOwnedOriginal(storage, ownedKey);
      return Response.json({ error: "INVALID_IMAGE" }, { status: 400 });
    }
    return Response.json({ error: "UPLOAD_UNAVAILABLE" }, { status: 503 });
  }
}
