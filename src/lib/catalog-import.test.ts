import { describe, expect, it } from "vitest";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  buildLegacyProductDraft,
  createLegacyProductIfUnmapped,
  resolveLegacyAssetPath,
  summarizeLegacyCatalog,
  type LegacyProduct,
} from "@/lib/catalog-import";

const product: LegacyProduct = {
  id: "legacy-42",
  url: "https://factory.example/products/kanaka-copper-42/",
  name_ar: "كنكة نحاس",
  description: "وصف من المصدر يحتاج إلى مراجعة",
  price: "1,250",
  currency: "EGP",
  category_urls: ["https://factory.example/collections/coffee/"],
  images: [
    { local_path: "المنتجات/قطعة.jpg", status: "downloaded" },
    { local_path: "المنتجات/قطعة.jpg", status: "downloaded" },
    { local_path: "المنتجات/فشل.jpg", status: "failed" },
  ],
};

function mockImportDatabase(options: { failMappingCreate?: boolean } = {}) {
  const state: {
    products: { id: string; data: Prisma.ProductCreateInput }[];
    mappings: { id: string; data: Record<string, unknown> }[];
  } = { products: [], mappings: [] };

  const db = {
    legacyProductMapping: {
      findFirst: async ({ where }: { where: { sourceProductId: string } }) =>
        state.mappings.find((mapping) => mapping.data.sourceProductId === where.sourceProductId) ??
        null,
    },
    $transaction: async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => {
      const stagedProducts: typeof state.products = [];
      const stagedMappings: typeof state.mappings = [];
      const tx = {
        product: {
          create: async ({ data }: { data: Prisma.ProductCreateInput }) => {
            const record = {
              id: `mock-product-${state.products.length + stagedProducts.length + 1}`,
              data,
            };
            stagedProducts.push(record);
            return { id: record.id };
          },
        },
        legacyProductMapping: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            if (options.failMappingCreate) throw new Error("mock mapping write failed");
            const record = { id: `mock-mapping-${stagedMappings.length + 1}`, data };
            stagedMappings.push(record);
            return record;
          },
        },
      } as unknown as Prisma.TransactionClient;
      const result = await run(tx);
      state.products.push(...stagedProducts);
      state.mappings.push(...stagedMappings);
      return result;
    },
  } as unknown as PrismaClient;

  return { db, state };
}

describe("legacy catalog importer (mocked persistence only)", () => {
  it("keeps extracted source prices as evidence while building a non-publishable draft", () => {
    const draft = buildLegacyProductDraft(
      product,
      new Map([[product.category_urls?.[0] ?? "", "category-verified"]]),
      new Map([["المنتجات/قطعة.jpg", "media-one"]]),
    );

    expect(draft).toMatchObject({
      slug: "kanaka-copper-42",
      titleAr: "كنكة نحاس",
      type: null,
      status: "DRAFT",
      availability: "UNAVAILABLE",
      priceMinor: null,
      currency: "EGP",
      categories: { create: [{ categoryId: "category-verified", position: 0 }] },
      media: { create: [{ mediaId: "media-one", position: 0 }] },
    });
    expect(draft).not.toHaveProperty("sourcePrice");
  });

  it("summarizes only mapped categories and non-failed gallery paths", () => {
    const categories = [
      {
        id: "verified",
        name_ar: "قهوة",
        url: "https://factory.example/collections/coffee/",
        product_urls: [product.url],
      },
      {
        id: "review",
        name_ar: "غير مؤكد",
        url: "https://factory.example/collections/other/",
        product_urls: [product.url],
        review_required: true,
      },
    ];
    const result = summarizeLegacyCatalog([product], categories, new Set(["المنتجات/قطعة.jpg"]));
    expect(result).toMatchObject({
      sourceProducts: 1,
      sourceCategories: 2,
      sourceVerifiedCategories: 1,
      uniqueArchivedImages: 1,
      missingArchivedImageFiles: 1,
      galleryReferences: 2,
      sourceRowsWithPriceEvidence: 1,
      operationalPricesImported: 0,
      productsToCreateAsDrafts: 1,
      unmappedCategoryReferences: 0,
    });
  });

  it("does not replace an existing mapped product on rerun", async () => {
    const { db, state } = mockImportDatabase();
    const draft = buildLegacyProductDraft(product, new Map(), new Map());

    await expect(createLegacyProductIfUnmapped(db, product, draft)).resolves.toBe("imported");
    state.products[0].data.titleAr = "اسم راجعه المالك";
    state.products[0].data.priceMinor = 25000;

    await expect(createLegacyProductIfUnmapped(db, product, draft)).resolves.toBe("skipped");
    expect(state.products).toHaveLength(1);
    expect(state.products[0]?.data.titleAr).toBe("اسم راجعه المالك");
    expect(state.products[0]?.data.priceMinor).toBe(25000);
    expect(state.mappings[0]?.data.payload).toMatchObject({ price: "1,250" });
  });

  it("rolls back the product if its legacy mapping cannot be written", async () => {
    const { db, state } = mockImportDatabase({ failMappingCreate: true });
    const draft = buildLegacyProductDraft(product, new Map(), new Map());

    await expect(createLegacyProductIfUnmapped(db, product, draft)).rejects.toThrow(
      "mock mapping write failed",
    );
    expect(state.products).toHaveLength(0);
    expect(state.mappings).toHaveLength(0);
  });

  it("rejects asset paths that escape the preserved archive", () => {
    expect(resolveLegacyAssetPath("/archive", "المنتجات/قطعة.jpg")).toBe(
      "/archive/المنتجات/قطعة.jpg",
    );
    expect(() => resolveLegacyAssetPath("/archive", "../outside.jpg")).toThrow(
      "outside the preserved asset archive",
    );
  });
});
