import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: undefined as unknown,
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`TEST_REDIRECT:${path}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server/admin-session", () => ({
  getAdminActor: vi.fn(),
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/server/auth", () => ({ getAuth: vi.fn() }));
vi.mock("@/lib/server/database", () => ({ getDatabase: () => mocks.database }));

import { saveBulkProductReview } from "@/app/admin/actions";

const productId = "f0f4e554-8b40-4c83-99b5-59b4df8fba05";
const actor = {
  id: "test-owner",
  name: "Test Owner",
  email: "owner@example.invalid",
  roleCode: "OWNER" as const,
  forcePasswordChange: false,
};

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: productId,
    titleAr: "اسم مستورد",
    type: "READY_MADE",
    status: "DRAFT",
    priceMinor: null,
    detailsReviewedAt: null,
    availability: "UNAVAILABLE",
    inventory: [],
    variants: [{ id: "variant-1", active: true, inventory: { quantity: 0 } }],
    categories: [{ category: { id: "category-1", visible: true, reviewRequired: false } }],
    media: [{ mediaId: "media-1" }],
    manufacturingPolicy: null,
    ...overrides,
  };
}

function makeMockDatabase(initialProduct: ReturnType<typeof makeProduct>) {
  let current = structuredClone(initialProduct);
  const auditEvents: Record<string, unknown>[] = [];
  const transaction = async <T>(run: (tx: Record<string, unknown>) => Promise<T>) => {
    let staged = structuredClone(current);
    const stagedAudits: Record<string, unknown>[] = [];
    const tx = {
      product: {
        findMany: async () => [structuredClone(staged)],
        update: async ({ data }: { data: Record<string, unknown> }) => {
          staged = { ...staged, ...data };
          return structuredClone(staged);
        },
      },
      inventoryBalance: {
        aggregate: async () => ({ _sum: { quantity: 0 } }),
      },
      auditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          stagedAudits.push(data);
          return data;
        },
      },
    } as unknown as Record<string, unknown>;
    const result = await run(tx);
    current = staged;
    auditEvents.push(...stagedAudits);
    return result;
  };

  const db = { $transaction: transaction };
  return {
    db,
    state: () => structuredClone(current),
    auditEvents,
  };
}

function formFor(intent: "save" | "publish") {
  const form = new FormData();
  form.set("intent", intent);
  form.append("productIds", productId);
  if (intent === "publish") form.append("selectedIds", productId);
  form.set(`titleAr_${productId}`, "كنكة نحاس مراجعة");
  form.set(`type_${productId}`, "READY_MADE");
  form.set(`price_${productId}`, "150.00");
  form.set(`detailsReviewed_${productId}`, "on");
  form.set(`newVariantNameAr_${productId}`, "");
  form.set(`initialQuantity_${productId}`, "");
  return form;
}

function expectRedirect(path: string) {
  return expect(saveBulkProductReview(formFor("publish"))).rejects.toThrow(`TEST_REDIRECT:${path}`);
}

describe("bulk product review action (mocked database; no persistence claim)", () => {
  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.revalidatePath.mockReset();
    mocks.redirect.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mocks.database = undefined;
  });

  it("saves reviewed fields and publishes only the selected eligible product", async () => {
    const fake = makeMockDatabase(makeProduct());
    mocks.database = fake.db;

    await expectRedirect("/admin/products/review?saved=published");

    expect(fake.state()).toMatchObject({
      titleAr: "كنكة نحاس مراجعة",
      type: "READY_MADE",
      priceMinor: 15000,
      status: "PUBLISHED",
      availability: "UNAVAILABLE",
    });
    expect(fake.state().detailsReviewedAt).toBeInstanceOf(Date);
    expect(fake.auditEvents.map((event) => event.action)).toEqual([
      "product.bulk-reviewed",
      "product.published",
    ]);
  });

  it("keeps an incomplete product unpublished and rolls back the mocked transaction", async () => {
    const fake = makeMockDatabase(makeProduct({ media: [], categories: [], variants: [] }));
    mocks.database = fake.db;

    await expectRedirect("/admin/products/review?error=publish");

    expect(fake.state()).toMatchObject({
      titleAr: "اسم مستورد",
      priceMinor: null,
      status: "DRAFT",
      detailsReviewedAt: null,
    });
    expect(fake.auditEvents).toHaveLength(0);
  });

  it("does not open the database when the caller lacks catalog-write permission", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN"));
    const form = formFor("save");

    await expect(saveBulkProductReview(form)).rejects.toThrow("FORBIDDEN");
    expect(mocks.database).toBeUndefined();
  });
});
