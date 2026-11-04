import { readFile, writeFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
import { imageContentType } from "../src/lib/image-content-type";
import { getDatabase } from "../src/lib/server/database";
async function main() {
  const u = new URL(process.env.DATABASE_URL!);
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.port, "33078");
  assert.equal(u.username, "sprtaya_phase5");
  assert.equal(u.pathname, "/sprtaya_phase5_disposable_local");
  assert.equal(process.env.APP_ENV, "local");
  const root = await realpath(process.env.LEGACY_ASSET_ROOT!),
    files: string[] = [];
  async function walk(dir: string) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(path.join(dir, e.name));
      else if (e.isFile() && /\.(jpg|jpeg|png|webp|avif)$/i.test(e.name))
        files.push(path.join(dir, e.name));
    }
  }
  for (const dir of ["المنتجات", "الهوية البصرية"]) await walk(path.join(root, dir));
  const inventory = new Map<string, { mime: string; sha256: string; format: string }>(),
    formats: Record<string, number> = {},
    mismatches: string[] = [],
    invalid: string[] = [];
  for (const f of files) {
    const bytes = await readFile(f),
      mime = imageContentType(bytes),
      relative = path.relative(root, f);
    try {
      const m = await sharp(bytes).metadata();
      assert.ok(mime && m.width && m.height);
      inventory.set(relative, {
        mime,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        format: m.format!,
      });
      formats[mime] = (formats[mime] || 0) + 1;
      const expected = /\.jpe?g$/i.test(f)
        ? "image/jpeg"
        : /\.png$/i.test(f)
          ? "image/png"
          : /\.avif$/i.test(f)
            ? "image/avif"
            : "image/webp";
      if (mime !== expected) mismatches.push(relative);
    } catch {
      invalid.push(relative);
    }
  }
  assert.equal(invalid.length, 0);
  const db = getDatabase();
  try {
    const assets = await db.mediaAsset.findMany({ where: { provider: "LEGACY_LOCAL" } }),
      plan = [];
    for (const a of assets) {
      const info = inventory.get(a.originalKey.replace(/^legacy:/, ""));
      assert.ok(info, "Registered media must exist");
      if (a.mimeType !== info.mime)
        plan.push({ id: a.id, previous: a.mimeType, corrected: info.mime, sha256: info.sha256 });
    }
    if (process.argv.includes("--apply-local")) {
      const backup = path.resolve("../media-metadata-before.json");
      await writeFile(backup, JSON.stringify(plan, null, 2), { mode: 0o600, flag: "wx" });
      await db.$transaction(
        async (tx) => {
          for (const p of plan) {
            const r = await tx.mediaAsset.updateMany({
              where: { id: p.id, provider: "LEGACY_LOCAL", mimeType: p.previous },
              data: { mimeType: p.corrected },
            });
            assert.equal(r.count, 1);
          }
        },
        { timeout: 120000 },
      );
    }
    await writeFile(
      "docs/phase55/media-readiness.json",
      JSON.stringify(
        {
          scope: "Read-only original files; isolated local metadata only if explicitly requested",
          imageFiles: files.length,
          formats,
          validDecoded: inventory.size,
          filenameContentMismatches: mismatches.length,
          examples: mismatches.slice(0, 6),
          metadataCorrections: plan.length,
          metadataApplied: process.argv.includes("--apply-local"),
          originalBytesModified: false,
          invalid,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        imageFiles: files.length,
        formats,
        mismatches: mismatches.length,
        metadataCorrections: plan.length,
        applied: process.argv.includes("--apply-local"),
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error("Local media verification failed", e.name);
  process.exitCode = 1;
});
