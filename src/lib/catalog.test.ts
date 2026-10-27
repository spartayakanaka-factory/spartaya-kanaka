import { describe, expect, it } from "vitest";
import {
  getAllProducts,
  getCategoryById,
  getProductsInCategory,
  getVerifiedCategories,
  normalizeSearch,
  searchProducts,
  sortProducts,
  getRelatedProducts,
} from "@/lib/catalog";

describe("local catalog adapter", () => {
  it("exposes the extracted products as browse-only records", () => {
    const products = getAllProducts();
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((product) => product.purchasable === false)).toBe(true);
    expect(products.every((product) => product.images.length > 0)).toBe(true);
    expect(
      products.every(
        (product) => product.sourcePrice === null || typeof product.sourcePrice === "string",
      ),
    ).toBe(true);
  });

  it("includes only categories that are linked to products", () => {
    const categories = getVerifiedCategories();
    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      expect(category.productCount).toBeGreaterThan(0);
      expect(getProductsInCategory(category.id).length).toBe(category.productCount);
    }
    expect(getCategoryById("kofy-kornr")).toBeUndefined();
  });

  it("searches the Arabic source titles and descriptions", () => {
    const first = getAllProducts()[0];
    const prefix = first.nameAr.slice(0, 4);
    expect(searchProducts(prefix).some((product) => product.id === first.id)).toBe(true);
    expect(normalizeSearch("  سبرتاية   نحاس ")).toBe("سبرتايه نحاس");
  });

  it("matches Arabic diacritics, alef and common spelling differences", () => {
    expect(normalizeSearch("أَطْقَم إِبريق آية سبرتاية")).toBe(
      normalizeSearch("اطقم ابريق ايه سبرتايه"),
    );
    expect(searchProducts("سبرتاية").length).toBeGreaterThan(0);
    expect(searchProducts("قهوة").map((product) => product.id)).toEqual(
      searchProducts("قهوه").map((product) => product.id),
    );
  });

  it("finds English collection terms without inventing product translations", () => {
    const results = searchProducts("coffee sets");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.categoryUrls.length > 0)).toBe(true);
    expect(searchProducts("unlikely-no-match-93746")).toEqual([]);
    expect(searchProducts("   ")).toEqual([]);
  });

  it("sorts a copy of the catalog and keeps related pieces in verified categories", () => {
    const products = getAllProducts();
    const original = products.map((product) => product.id);
    const sorted = sortProducts(products, "name-asc");
    expect(products.map((product) => product.id)).toEqual(original);
    expect(sorted.map((product) => product.nameAr)).toEqual(
      [...sortProducts(products, "name-desc")].reverse().map((product) => product.nameAr),
    );
    const product = products.find((item) => item.categoryUrls.length > 0)!;
    const related = getRelatedProducts(product);
    expect(
      related.every(
        (item) =>
          item.id !== product.id &&
          item.categoryUrls.some((url) => product.categoryUrls.includes(url)),
      ),
    ).toBe(true);
  });
});
