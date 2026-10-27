import { existsSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { createRuntimeDatabase } from "./runtime-db";
import { assertSafeDatabaseTarget } from "./database-target";
import {
  buildLegacyProductDraft,
  createLegacyProductIfUnmapped,
  isImportableLegacyImage,
  resolveLegacyAssetPath,
  summarizeLegacyCatalog,
  uniqueProductImagePaths,
  type LegacyCategory,
  type LegacyProduct,
} from "../src/lib/catalog-import";
import rawProducts from "../sprtaya-kanaka-assets/بيانات/products.json";
import rawCategories from "../sprtaya-kanaka-assets/بيانات/categories.json";

const assetRoot = resolve(process.cwd(), "sprtaya-kanaka-assets");
const products = rawProducts as LegacyProduct[];
const categoryData = rawCategories as { categories: LegacyCategory[] };
const categories = categoryData.categories;
const paths = uniqueProductImagePaths(products);
const missingPaths = paths.filter((path) => !existsSync(safePathForPreview(path)));
const summary = {
  mode: process.argv.includes("--apply") ? "apply" : "dry-run",
  ...summarizeLegacyCatalog(products, categories, new Set(missingPaths)),
};

function safePathForPreview(localPath: string) {
  try {
    return resolveLegacyAssetPath(assetRoot, localPath);
  } catch {
    return "";
  }
}

async function main() {
  const issues: { sourceProductId: string; message: string }[] = [];
  if (!process.argv.includes("--apply")) {
    for (const path of paths) resolveLegacyAssetPath(assetRoot, path);
    process.stdout.write(
      JSON.stringify(
        { ...summary, storageReads: "manifest and local file metadata only; database unchanged" },
        null,
        2,
      ) + "\n",
    );
    return;
  }
  assertSafeDatabaseTarget();
  if (process.argv.includes("--dry-run")) throw new Error("Choose either --dry-run or --apply.");
  const db = createRuntimeDatabase();
  let importedProducts = 0;
  let skippedExistingProducts = 0;
  let importedCategories = 0;
  let importedMedia = 0;
  let importedRelations = 0;
  try {
    const categoryIds = new Map<string, string>();
    for (const row of categories) {
      const existed = await db.category.findUnique({
        where: { sourceId: row.id },
        select: { id: true },
      });
      const category = await db.category.upsert({
        where: { sourceId: row.id },
        create: {
          sourceId: row.id,
          sourceUrl: row.url,
          slug: row.id,
          nameAr: row.name_ar,
          visible: false,
          reviewRequired: Boolean(row.review_required),
          sortOrder: 0,
        },
        update: {},
      });
      categoryIds.set(row.url, category.id);
      if (!existed) importedCategories++;
    }
    const mediaIds = new Map<string, string>();
    for (const path of paths) {
      const full = resolveLegacyAssetPath(assetRoot, path);
      if (!existsSync(full)) continue;
      const source = products
        .flatMap((row) => row.images ?? [])
        .find((image) => image.local_path === path);
      const exists = existsSync(full);
      const stat = exists ? statSync(full) : null;
      const extension = extname(path).toLowerCase();
      const mime =
        source?.mime_type && /^image\/[a-z0-9.+-]+$/.test(source.mime_type)
          ? source.mime_type
          : extension === ".png"
            ? "image/png"
            : extension === ".webp"
              ? "image/webp"
              : "image/jpeg";
      const existingMedia = await db.mediaAsset.findUnique({
        where: { originalKey: "legacy:" + path },
        select: { id: true },
      });
      const asset = await db.mediaAsset.upsert({
        where: { originalKey: "legacy:" + path },
        create: {
          provider: "LEGACY_LOCAL",
          originalKey: "legacy:" + path,
          mimeType: mime,
          byteSize: stat?.size ?? source?.bytes ?? 0,
          width: source?.width ?? null,
          height: source?.height ?? null,
          sha256: source?.sha256 ?? null,
        },
        update: {},
      });
      mediaIds.set(path, asset.id);
      if (!existingMedia) importedMedia++;
    }
    for (const row of products) {
      try {
        const linkedCategories = [
          ...new Set(
            (row.category_urls ?? [])
              .map((url) => categoryIds.get(url))
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const images = (row.images ?? []).filter(
          (image) =>
            isImportableLegacyImage(image) && image.local_path && mediaIds.has(image.local_path),
        );
        const pathSet = new Set<string>();
        const uniqueImages = images.filter((image) => {
          const key = image.local_path as string;
          if (pathSet.has(key)) return false;
          pathSet.add(key);
          return true;
        });
        const result = await createLegacyProductIfUnmapped(
          db,
          row,
          buildLegacyProductDraft(row, categoryIds, mediaIds),
        );
        if (result === "skipped") {
          skippedExistingProducts++;
          continue;
        }
        importedProducts++;
        importedRelations += linkedCategories.length + uniqueImages.length;
        await db.legacyImportIssue.deleteMany({ where: { sourceProductId: row.id } });
        const missingImage = (row.images ?? []).some(
          (image) => image.local_path && missingPaths.includes(image.local_path),
        );
        if (missingImage) {
          const message =
            "One or more referenced local image files are missing from the preserved archive.";
          issues.push({ sourceProductId: row.id, message });
          await db.legacyImportIssue.upsert({
            where: { sourceProductId: row.id },
            create: { sourceProductId: row.id, sourceUrl: row.url.slice(0, 512), error: message },
            update: { sourceUrl: row.url.slice(0, 512), error: message, attemptedAt: new Date() },
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 4000) : "Unknown import error";
        issues.push({ sourceProductId: row.id, message });
        await db.legacyImportIssue.upsert({
          where: { sourceProductId: row.id },
          create: { sourceProductId: row.id, sourceUrl: row.url.slice(0, 512), error: message },
          update: { sourceUrl: row.url.slice(0, 512), error: message, attemptedAt: new Date() },
        });
      }
    }
    // Use the actual first product image as a hidden category cover; category visibility remains owner-controlled.
    for (const category of categories) {
      const product = products.find(
        (row) =>
          (category.product_urls ?? []).includes(row.url) &&
          (row.images ?? []).some(
            (image) =>
              isImportableLegacyImage(image) && image.local_path && mediaIds.has(image.local_path),
          ),
      );
      const imagePath = product?.images?.find(
        (image) =>
          isImportableLegacyImage(image) && image.local_path && mediaIds.has(image.local_path),
      )?.local_path;
      const categoryId = categoryIds.get(category.url);
      const imageAssetId = imagePath ? mediaIds.get(imagePath) : undefined;
      if (categoryId && imageAssetId)
        await db.category.updateMany({
          where: { id: categoryId, imageAssetId: null },
          data: { imageAssetId },
        });
    }
    process.stdout.write(
      JSON.stringify(
        {
          ...summary,
          importedCategories,
          importedMedia,
          importedProducts,
          skippedExistingProducts,
          importedCategoryAndGalleryRelations: importedRelations,
          failedProducts: issues.length,
          issues,
        },
        null,
        2,
      ) + "\n",
    );
    if (issues.length) process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : "Catalog import failed.") + "\n");
  process.exitCode = 1;
});
