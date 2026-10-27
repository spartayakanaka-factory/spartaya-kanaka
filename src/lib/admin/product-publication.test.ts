import { describe, expect, it } from "vitest";
import { productPublicationBlockers, type PublishableProduct } from "@/lib/admin/product-publication";

const validReadyMade: PublishableProduct = {
  titleAr: "كنكة نحاس",
  detailsReviewedAt: new Date("2026-10-27T00:00:00Z"),
  priceMinor: 12_500,
  type: "READY_MADE",
  media: [{}],
  categories: [{ category: { visible: true, reviewRequired: false } }],
  variants: [{ inventory: { quantity: 0 } }],
  manufacturingPolicy: null,
};

describe("product publication requirements", () => {
  it("accepts an explicitly reviewed ready-made product with a zero stock balance", () => {
    expect(productPublicationBlockers(validReadyMade)).toEqual([]);
  });

  it("blocks incomplete imported records without guessing price, type, review, or stock", () => {
    expect(productPublicationBlockers({
      ...validReadyMade,
      detailsReviewedAt: null,
      priceMinor: null,
      type: null,
      variants: [],
      categories: [{ category: { visible: false, reviewRequired: true } }],
      media: [],
    })).toEqual(["details-review", "price", "media", "category", "type"]);
  });

  it("requires an available manufacturing policy for made-to-order products", () => {
    expect(productPublicationBlockers({ ...validReadyMade, type: "MADE_TO_ORDER", variants: [], manufacturingPolicy: { available: false } })).toContain("manufacturing-policy");
    expect(productPublicationBlockers({ ...validReadyMade, type: "MADE_TO_ORDER", variants: [], manufacturingPolicy: { available: true } })).toEqual([]);
  });

  it("requires a balance for every active ready-made variant, while zero is a valid reviewed balance", () => {
    expect(productPublicationBlockers({ ...validReadyMade, variants: [{ inventory: null }] })).toContain("inventory");
  });
});
