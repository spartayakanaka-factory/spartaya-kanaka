import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
import { getDatabase } from "../src/lib/server/database";
import { getMediaStorage } from "../src/lib/server/media-storage";
async function main() {
  assertCommerceEnvironment();
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/sprtaya_phase35_disposable_local");
  assert.equal(process.env.MEDIA_S3_ENDPOINT, "http://127.0.0.1:39110");
  assert.equal(path.resolve(process.env.P3_STATE_DIR!), path.resolve("../runtime"));
  const db = getDatabase(),
    storage = getMediaStorage();
  try {
    const proofs = await db.commercePaymentEvidence.findMany({
        take: 3,
        orderBy: { createdAt: "desc" },
      }),
      media = await db.mediaAsset.findMany({
        where: { provider: { not: "LEGACY_LOCAL" }, publicUrl: { not: null } },
        take: 3,
      });
    assert.ok(proofs.length);
    assert.ok(media.length);
    const hashes = async () => {
      const result: string[] = [];
      for (const p of proofs) {
        const object = await storage.client.send(
          new GetObjectCommand({ Bucket: storage.originalsBucket, Key: p.storageKey }),
        );
        const bytes = await object.Body!.transformToByteArray(),
          hash = createHash("sha256").update(bytes).digest("hex");
        assert.equal(hash, p.sha256);
        result.push(hash);
        const anonymous = await fetch(
          process.env.MEDIA_S3_ENDPOINT + "/" + storage.originalsBucket + "/" + p.storageKey,
        );
        assert.equal(anonymous.status, 403);
        await anonymous.body?.cancel();
      }
      for (const m of media) {
        const response = await fetch(m.publicUrl!);
        assert.equal(response.status, 200);
        result.push(
          createHash("sha256")
            .update(new Uint8Array(await response.arrayBuffer()))
            .digest("hex"),
        );
      }
      return result;
    };
    const before = await hashes();
    const beforePid = readFileSync(path.join(process.env.P3_STATE_DIR!, "media/pid"), "utf8");
    for (const command of ["stop", "start"]) {
      const r = spawnSync(process.execPath, ["scripts/phase3-media.mjs", command], {
        env: process.env,
        stdio: "pipe",
      });
      assert.equal(r.status, 0, "Local storage " + command + " failed; inspect private logs");
    }
    const afterPid = readFileSync(path.join(process.env.P3_STATE_DIR!, "media/pid"), "utf8");
    assert.notEqual(beforePid, afterPid);
    assert.deepEqual(await hashes(), before);
    writeFileSync(
      "docs/phase35/storage-restart.json",
      JSON.stringify(
        {
          scope:
            "Only Phase 3.5 loopback 39110 filesystem-backed storage restarted; original Phase 3 service untouched",
          privateProofs: proofs.length,
          publicDisplays: media.length,
          pidChanged: true,
          allObjectHashesPreserved: true,
          privateAnonymousStatus: 403,
          publicDisplayStatus: 200,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "PASS real storage process restart, private/public object persistence and SHA verification",
    );
  } finally {
    storage.client.destroy();
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Local storage persistence check failed; inspect private service logs without exposing keys",
  );
  process.exitCode = 1;
});
