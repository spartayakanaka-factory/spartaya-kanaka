import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

export function getMediaStorage() {
  const {
    MEDIA_S3_ENDPOINT: endpoint,
    MEDIA_S3_ORIGINALS_BUCKET: originalsBucket,
    MEDIA_S3_DISPLAY_BUCKET: displayBucket,
    MEDIA_ACCESS_KEY_ID: accessKeyId,
    MEDIA_SECRET_ACCESS_KEY: secretAccessKey,
  } = process.env;
  const publicBase = process.env.MEDIA_PUBLIC_BASE_URL;
  if (
    !endpoint ||
    !originalsBucket ||
    !displayBucket ||
    originalsBucket === displayBucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBase
  )
    throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  const parsed = new URL(endpoint);
  const publicUrl = new URL(publicBase);
  if (
    parsed.protocol !== "https:" &&
    parsed.hostname !== "localhost" &&
    parsed.hostname !== "127.0.0.1"
  )
    throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  if (
    publicUrl.protocol !== "https:" &&
    publicUrl.hostname !== "localhost" &&
    publicUrl.hostname !== "127.0.0.1"
  )
    throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  const client = new S3Client({
    endpoint: parsed.toString(),
    region: process.env.MEDIA_S3_REGION || "auto",
    forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === "true",
    // A presigned upload has no body until the browser supplies the image.
    // Do not calculate an empty-body checksum while creating its signed URL.
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId, secretAccessKey },
  });
  return {
    client,
    originalsBucket,
    displayBucket,
    publicBase: publicUrl.toString().replace(/\/$/, ""),
  };
}

export function mediaPublicUrl(base: string, key: string) {
  return base.replace(/\/+$/, "") + "/" + key.split("/").map(encodeURIComponent).join("/");
}
