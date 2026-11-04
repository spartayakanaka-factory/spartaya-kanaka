/** Run only against the two named private staging buckets with disposable objects. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getMediaStorage } from "../src/lib/server/media-storage";

const service = "sprtaya-r2-staging";
let stage = "keychain";
const keychain = (account: string) =>
  execFileSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

async function main() {
  const endpoint = "https://b2c700ac4fb9325de8bb7dee4d0ed3a2.r2.cloudflarestorage.com";
  process.env.MEDIA_S3_ENDPOINT = endpoint;
  process.env.MEDIA_S3_REGION = "auto";
  process.env.MEDIA_S3_ORIGINALS_BUCKET = "sprtaya-staging-private";
  process.env.MEDIA_S3_DISPLAY_BUCKET = "sprtaya-staging-public";
  process.env.MEDIA_PUBLIC_BASE_URL =
    "https://bisque-pheasant-330767.hostingersite.com/api/staging-media";
  process.env.MEDIA_S3_FORCE_PATH_STYLE = "true";
  process.env.MEDIA_ACCESS_KEY_ID = keychain("sprtaya-r2-staging-access-key");
  process.env.MEDIA_SECRET_ACCESS_KEY = keychain("sprtaya-r2-staging-secret-key");
  if (!process.env.MEDIA_ACCESS_KEY_ID || !process.env.MEDIA_SECRET_ACCESS_KEY)
    throw new Error("KEYCHAIN");
  if (process.env.SR_LOCAL_ISOLATION === "1" || process.env.SR_HOSTED_ISOLATION === "1")
    throw new Error("UNEXPECTED_RUNTIME");
  const first = getMediaStorage();
  const key = `codex-synthetic-test/${randomUUID()}.txt`;
  const body = "Synthetic staging R2 test. No customer information.\n";
  const created: string[] = [];
  let passed = false;
  try {
    for (const bucket of [first.originalsBucket, first.displayBucket]) {
      stage = `upload:${bucket}`;
      await first.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: "text/plain",
          IfNoneMatch: "*",
        }),
      );
      created.push(bucket);
      stage = `retrieval:${bucket}`;
      const response = await first.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if ((await response.Body?.transformToString()) !== body) throw new Error("READ_MISMATCH");
      const signed = await getSignedUrl(
        first.client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 60 },
      );
      const signedResponse = await fetch(signed);
      stage = `signed-read:${bucket}`;
      if (!signedResponse.ok || (await signedResponse.text()) !== body)
        throw new Error("SIGNED_READ");
      const signedUpload = await getSignedUrl(
        first.client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: "text/plain" }),
        { expiresIn: 60 },
      );
      stage = `signed-upload:${bucket}`;
      const upload = await fetch(signedUpload, {
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body,
      });
      if (!upload.ok) throw new Error("SIGNED_UPLOAD");
      const anonymous = await fetch(`${endpoint}/${bucket}/${key}`);
      stage = `anonymous-denial:${bucket}`;
      if (![400, 401, 403].includes(anonymous.status)) throw new Error("ANONYMOUS_ACCESS");
    }
    first.client.destroy();
    const second = getMediaStorage();
    try {
      for (const bucket of created) {
        const object = await second.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if ((await object.Body?.transformToString()) !== body) throw new Error("PERSISTENCE");
      }
      passed = true;
    } finally {
      for (const bucket of created) {
        await second.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        try {
          await second.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          throw new Error("CLEANUP_UNVERIFIED");
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("$metadata" in error) ||
            (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 404
          )
            throw error;
        }
      }
      second.client.destroy();
    }
  } finally {
    if (!passed) {
      const cleanup = getMediaStorage();
      try {
        for (const bucket of created)
          await cleanup.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } finally {
        cleanup.client.destroy();
      }
    }
    first.client.destroy();
    delete process.env.MEDIA_ACCESS_KEY_ID;
    delete process.env.MEDIA_SECRET_ACCESS_KEY;
  }
  console.log(
    "PASS: application storage client upload, retrieval, signed upload and retrieval, anonymous denial, new-client persistence and verified cleanup in both staging buckets.",
  );
}

main().catch((error: unknown) => {
  const status =
    error && typeof error === "object" && "$metadata" in error
      ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
      : undefined;
  console.error(
    `R2 test failed at ${stage}${status ? ` (HTTP ${status})` : ""}; no secrets or signed URLs were printed. Inspect bucket contents before retrying.`,
  );
  process.exitCode = 1;
});
