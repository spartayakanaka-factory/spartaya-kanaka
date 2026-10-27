import { getProductById, getProductsInCategory } from "@/lib/catalog";

// Editorial selections reference existing source IDs; no catalog records are rewritten.
export const merchandising = {
  heroProductId: "1bfab0186a7c",
  detailProductId: "7e3a9e813cfe",
  coffeeProductId: "5a3986111c50",
  shellProductId: "74c40ee0169b",
  homeCategoryIds: [
    "sprtaya-kanaka",
    "atkm-kho",
    "kanaka",
    "soany",
    "cup",
    "zgagh-oakoab-almyah",
    "mntjat-alsdf-altbyaay",
    "mbakhr",
  ],
  categoryProductIds: {
    "sprtaya-kanaka": "7e3a9e813cfe",
    "atkm-kho": "1bfab0186a7c",
    soany: "1dea0685209b",
    "mntjat-alsdf-altbyaay": "74c40ee0169b",
    cup: "adbf0e8190ba",
    "zgagh-oakoab-almyah": "45c5b52bf609",
    kanaka: "30067c4b7c2b",
    mbakhr: "0de1d5b118e6",
  } as Record<string, string>,
};

export function getCategoryCover(id: string) {
  const selected = getProductById(merchandising.categoryProductIds[id]);
  const products = getProductsInCategory(id);
  return selected && products.some((product) => product.id === selected.id)
    ? selected
    : products.find((product) => product.images.length > 0);
}
