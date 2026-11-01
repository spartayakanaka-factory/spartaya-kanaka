import { GetObjectCommand } from "@aws-sdk/client-s3";
import { commerceEnabled } from "@/lib/commerce/runtime";
import { getDatabase } from "@/lib/server/database";
import { getMediaStorage } from "@/lib/server/media-storage";
import {
  getStagingAccessConfig,
  getStagingAccessResponse,
  getStagingRequestHostname,
} from "@/lib/staging-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};
const maxBytes = 10 * 1024 * 1024;

/** Only registered display derivatives, delivered through the authenticated staging app. */
export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;
  if (
    process.env.SR_HOSTED_ISOLATION !== "1" ||
    !commerceEnabled() ||
    getStagingAccessConfig(process.env, getStagingRequestHostname(request.headers)).mode !==
      "protected"
  )
    return new Response(null, { status: 404, headers });
  try {
    const parts = (await context.params).key;
    if (
      parts.length !== 2 ||
      parts[0] !== "product-displays" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i.test(parts[1])
    )
      return new Response(null, { status: 404, headers });
    const key = parts.join("/");
    const asset = await getDatabase().mediaAsset.findUnique({
      where: { displayKey: key },
      select: { id: true },
    });
    if (!asset) return new Response(null, { status: 404, headers });
    const storage = getMediaStorage();
    const object = await storage.client.send(
      new GetObjectCommand({ Bucket: storage.displayBucket, Key: key }),
    );
    if (
      object.ContentType !== "image/webp" ||
      !object.Body ||
      !(Symbol.asyncIterator in object.Body)
    )
      throw Error("MEDIA_UNAVAILABLE");
    if (
      object.ContentLength !== undefined &&
      (object.ContentLength < 1 || object.ContentLength > maxBytes)
    )
      throw Error("MEDIA_UNAVAILABLE");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > maxBytes) throw Error("MEDIA_UNAVAILABLE");
      chunks.push(chunk);
    }
    if (!size || (object.ContentLength !== undefined && size !== object.ContentLength))
      throw Error("MEDIA_UNAVAILABLE");
    return new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { ...headers, "Content-Type": "image/webp" },
    });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
