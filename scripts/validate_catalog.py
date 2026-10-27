#!/usr/bin/env python3
"""Validate the extracted catalog relationships without editing the asset archive."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "sprtaya-kanaka-assets"
DATA = ASSETS / "بيانات"


def main():
    products = json.loads((DATA / "products.json").read_text(encoding="utf-8"))
    categories = json.loads((DATA / "categories.json").read_text(encoding="utf-8"))["categories"]
    category_by_url = {category["url"]: category for category in categories}
    product_urls = {product["url"]: product for product in products}
    missing_product_images = []
    missing_image_files = []
    unlinked_category_refs = []
    unassigned = []
    duplicate_ids = []
    duplicate_slugs = []
    id_counts = Counter(product["id"] for product in products)
    slug_counts = Counter(product["url"].rstrip("/").split("/")[-1] for product in products)

    for product in products:
        if id_counts[product["id"]] > 1:
            duplicate_ids.append(product["id"])
        slug = product["url"].rstrip("/").split("/")[-1]
        if slug_counts[slug] > 1:
            duplicate_slugs.append(slug)
        if not product.get("images"):
            missing_product_images.append(product["id"])
        if product.get("category_review_required"):
            unassigned.append(product["id"])
        for category_url in product.get("category_urls", []):
            category = category_by_url.get(category_url)
            if not category or product["url"] not in category.get("product_urls", []):
                unlinked_category_refs.append([product["url"], category_url])
        for image in product.get("images", []):
            local_path = image.get("local_path")
            if local_path and not (ASSETS / local_path).is_file():
                missing_image_files.append([product["id"], local_path])

    category_reverse_mismatches = []
    for category in categories:
        if category.get("review_required") or category.get("status") == "inaccessible":
            continue
        for product_url in category.get("product_urls", []):
            product = product_urls.get(product_url)
            if product and category["url"] not in product.get("category_urls", []):
                category_reverse_mismatches.append([category["url"], product_url])

    result = {
        "products": len(products),
        "categories_discovered": len(categories),
        "verified_categories_with_products": sum(
            1 for category in categories
            if not category.get("review_required")
            and category.get("status") != "inaccessible"
            and any(category["url"] in product.get("category_urls", []) for product in products)
        ),
        "products_missing_verified_category": len(unassigned),
        "products_missing_gallery": len(missing_product_images),
        "missing_image_files": len(missing_image_files),
        "product_category_link_mismatches": len(unlinked_category_refs) + len(category_reverse_mismatches),
        "duplicate_product_ids": len(set(duplicate_ids)),
        "duplicate_product_slugs": len(set(duplicate_slugs)),
        "price_fields_present": sum(product.get("price") not in (None, "") for product in products),
        "inventory_fields_present": sum("stock" in product or "inventory" in product for product in products),
        "variant_fields_nonempty": sum(bool(product.get("variants")) for product in products),
        "description_fields_present": sum(bool(product.get("description")) for product in products),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    failures = missing_product_images or missing_image_files or unlinked_category_refs or category_reverse_mismatches or duplicate_ids or duplicate_slugs
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
