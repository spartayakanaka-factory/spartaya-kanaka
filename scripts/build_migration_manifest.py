#!/usr/bin/env python3
"""Build a review manifest from the source URLs; this does not create redirects."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "sprtaya-kanaka-assets" / "بيانات"
OUTPUT = ROOT / "src" / "data" / "migration-manifest.json"


def main():
    products = json.loads((DATA / "products.json").read_text(encoding="utf-8"))
    categories = json.loads((DATA / "categories.json").read_text(encoding="utf-8"))["categories"]
    category_rows = []
    for category in categories:
        valid = not category.get("review_required") and category.get("status") != "inaccessible"
        category_rows.append({
            "sourceUrl": category["url"],
            "sourceId": category["id"],
            "targetPath": "/ar/collections/" + category["id"] if valid else None,
            "needsReview": not valid,
        })
    manifest = {
        "version": 1,
        "source": "https://www.sprtaya-kanaka.net",
        "generatedFrom": "sprtaya-kanaka-assets/بيانات",
        "note": "Review every mapping before launch. This file does not publish redirects.",
        "products": [
            {
                "sourceUrl": product["url"],
                "sourceId": product["id"],
                "sourceSlug": product["url"].rstrip("/").split("/")[-1],
                "targetPath": "/ar/products/" + product["url"].rstrip("/").split("/")[-1],
                "categorySourceUrls": product.get("category_urls", []),
                "needsReview": bool(product.get("category_review_required")),
            }
            for product in products
        ],
        "categories": category_rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Wrote " + str(OUTPUT))


if __name__ == "__main__":
    main()
