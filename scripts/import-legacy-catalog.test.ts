import { afterEach, expect, it, vi } from "vitest";
import path from "node:path";
import rawProducts from "../sprtaya-kanaka-assets/بيانات/products.json";
import type { LegacyProduct } from "../src/lib/catalog-import";

const fixture = vi.hoisted(() => ({
  db: {
    category: {
      findUnique: vi.fn(async () => ({ id: "existing-category" })),
      upsert: vi.fn(async () => ({ id: "existing-category" })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    mediaAsset: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: "synthetic-media" })),
    },
    $disconnect: vi.fn(async () => undefined),
  },
}));
vi.mock("./runtime-db", () => ({ createRuntimeDatabase: () => fixture.db }));
vi.mock("./database-target", () => ({ assertSafeDatabaseTarget: vi.fn() }));
vi.mock("../src/lib/catalog-import", async (original) => {
  const actual = await original<typeof import("../src/lib/catalog-import")>();
  const products = (await import("../sprtaya-kanaka-assets/بيانات/products.json"))
    .default as LegacyProduct[];
  const image = products.flatMap((p) => p.images ?? []).find(actual.isImportableLegacyImage)!;
  return {
    ...actual,
    uniqueProductImagePaths: () => [image.local_path],
    // This regression executes the CLI media path; product persistence is covered separately.
    createLegacyProductIfUnmapped: vi.fn(async () => "skipped"),
  };
});

afterEach(() => vi.unstubAllEnvs());
it("executes import media creation with preserved metadata and byte-derived MIME (mocked database)", async () => {
  const image = (rawProducts as LegacyProduct[])
    .flatMap((p) => p.images ?? [])
    .find((i) => i.local_path && i.status !== "failed")!;
  const argv = process.argv;
  const previousExitCode = process.exitCode;
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    // The original files are read only. No database, external storage or secret is configured.
    vi.stubEnv("LEGACY_ASSET_ROOT", path.resolve("../../../sprtaya-kanaka-assets"));
    process.argv = [argv[0], "import-legacy-catalog.ts", "--apply"];
    await import("./import-legacy-catalog");
    await vi.waitFor(() => expect(fixture.db.$disconnect).toHaveBeenCalledOnce());
    expect(error).not.toHaveBeenCalled();
    expect(fixture.db.mediaAsset.upsert).toHaveBeenCalledOnce();
    expect(fixture.db.mediaAsset.upsert).toHaveBeenCalledWith({
      where: { originalKey: "legacy:" + image.local_path },
      create: expect.objectContaining({
        provider: "LEGACY_LOCAL",
        originalKey: "legacy:" + image.local_path,
        mimeType: "image/webp",
        byteSize: expect.any(Number),
        width: image.width ?? null,
        height: image.height ?? null,
        sha256: image.sha256 ?? null,
      }),
      update: {},
    });
    expect(process.exitCode).toBe(previousExitCode);
  } finally {
    process.argv = argv;
    process.exitCode = previousExitCode;
    output.mockRestore();
    error.mockRestore();
  }
});
