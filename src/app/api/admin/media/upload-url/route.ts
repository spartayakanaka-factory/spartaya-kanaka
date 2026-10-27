import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { requirePermission } from "@/lib/server/admin-session";
import { getMediaStorage } from "@/lib/server/media-storage";
import { hasTrustedRequestOrigin } from "@/lib/server/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.object({ contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]), size: z.number().int().positive().max(10 * 1024 * 1024) });
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as const;

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("MEDIA_WRITE");
    if (!hasTrustedRequestOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    if (Number(request.headers.get("content-length") ?? 0) > 2_048) return Response.json({ error: "INVALID_REQUEST" }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 2_048) return Response.json({ error: "INVALID_REQUEST" }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "INVALID_REQUEST" }, { status: 400 }); }
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "INVALID_IMAGE" }, { status: 400 });
    const storage = getMediaStorage();
    const id = crypto.randomUUID();
    const key = `product-originals/${id}.${extensions[parsed.data.contentType]}`;
    const signedHeaders = { "Content-Type": parsed.data.contentType, "x-amz-meta-owner": actor.id };
    const uploadUrl = await getSignedUrl(storage.client, new PutObjectCommand({ Bucket: storage.originalsBucket, Key: key, ContentType: parsed.data.contentType, ContentLength: parsed.data.size, Metadata: { owner: actor.id } }), { expiresIn: 300 });
    return Response.json({ uploadUrl, key, signedHeaders }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    if (message === "MEDIA_STORAGE_UNAVAILABLE") return Response.json({ error: "MEDIA_STORAGE_UNAVAILABLE" }, { status: 503 });
    return Response.json({ error: "UPLOAD_UNAVAILABLE" }, { status: 503 });
  }
}
