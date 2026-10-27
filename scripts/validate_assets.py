#!/usr/bin/env python3
"""Verify local image files and product/category manifest relationships."""
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from lxml import etree
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "sprtaya-kanaka-assets"


def valid_image(path):
    data = path.read_bytes()
    if not data:
        return False, None, None, "zero-byte file"
    digest = hashlib.sha256(data).hexdigest()
    if b"<svg" in data[:2048].lower():
        try:
            node = etree.fromstring(data)
            if etree.QName(node).localname.lower() != "svg":
                return False, digest, None, "invalid SVG root"
            return True, digest, None, None
        except Exception as exc:
            return False, digest, None, f"invalid SVG: {exc}"
    try:
        from io import BytesIO
        with Image.open(BytesIO(data)) as image:
            dims = image.size
            image.verify()
        return True, digest, dims, None
    except Exception as exc:
        return False, digest, None, f"invalid image: {exc}"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    products = read_json(ROOT / "بيانات/products.json")
    images = read_json(ROOT / "بيانات/images.json")
    categories = read_json(ROOT / "بيانات/categories.json")["categories"]
    manifest_rows = []
    import csv
    with (ROOT / "بيانات/image-manifest.csv").open(encoding="utf-8-sig", newline="") as f:
        manifest_rows = list(csv.DictReader(f))

    refs = 0
    missing_sources = []
    missing_paths = []
    corrupt_refs = []
    bad_hash_refs = []
    dimension_mismatches = []
    product_link_mismatches = []
    product_ref_counts = Counter()
    hash_references = defaultdict(list)
    referenced_paths = {row.get("local_path") for row in manifest_rows if row.get("local_path")}
    image_manifest_missing_urls = sum(not row.get("source_url") for row in manifest_rows)

    for product in products:
        product_id = product.get("id")
        for item in product.get("images", []):
            refs += 1
            product_ref_counts[product_id] += 1
            url = item.get("source_url")
            if not url:
                missing_sources.append((product_id, product.get("name_ar")))
            if item.get("product_id") != product_id:
                product_link_mismatches.append((product_id, item.get("product_id"), item.get("source_url")))
            if item.get("status") == "failed":
                continue
            rel = item.get("local_path")
            path = (ROOT / rel).resolve() if rel else None
            if not rel or ROOT.resolve() not in path.parents:
                missing_paths.append((product_id, rel))
                continue
            referenced_paths.add(rel)
            if not path.is_file():
                missing_paths.append((product_id, rel))
                continue
            ok, actual_hash, dimensions, error = valid_image(path)
            if not ok:
                corrupt_refs.append((product_id, rel, error))
                continue
            if actual_hash != item.get("sha256"):
                bad_hash_refs.append((product_id, rel, item.get("sha256"), actual_hash))
            expected = (item.get("width"), item.get("height"))
            if dimensions and all(x is not None for x in expected) and tuple(map(int, expected)) != dimensions:
                dimension_mismatches.append((rel, expected, dimensions))
            hash_references[item.get("sha256")].append(item)

    stored_files = []
    zero_byte = []
    corrupt_files = []
    local_hashes = {}
    non_arabic_names = []
    ignored_metadata_files = []
    for folder in (ROOT / "المنتجات", ROOT / "الهوية البصرية"):
        for path in folder.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT).as_posix()
            # Finder metadata is not a product image; preserve it without treating it as corrupt media.
            if path.name == ".DS_Store" and rel not in referenced_paths:
                ignored_metadata_files.append(rel)
                continue
            stored_files.append(rel)
            if path.stat().st_size == 0:
                zero_byte.append(rel)
            if not re.search(r"[\u0600-\u06ff]", path.stem):
                non_arabic_names.append(rel)
            ok, digest, _, error = valid_image(path)
            if not ok:
                corrupt_files.append((rel, error))
            if digest:
                local_hashes.setdefault(digest, []).append(rel)

    image_entry_errors = []
    for item in images:
        if not item.get("source_url"):
            image_entry_errors.append(("missing source URL", item.get("local_path")))
        rel = item.get("local_path")
        if not rel or not (ROOT / rel).is_file():
            image_entry_errors.append(("missing local path", rel))
        if not item.get("sha256"):
            image_entry_errors.append(("missing SHA-256", rel))
        elif rel and (ROOT / rel).is_file():
            actual = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()
            if actual != item.get("sha256"):
                image_entry_errors.append(("SHA-256 mismatch", rel))
    unmanifested = sorted(set(stored_files) - referenced_paths)
    duplicate_local_hashes = {h: paths for h, paths in local_hashes.items() if len(paths) > 1}
    repeated_product_hashes = {
        h: sorted({x.get("product_id") for x in rows if x.get("product_id")})
        for h, rows in hash_references.items()
        if len({x.get("product_id") for x in rows if x.get("product_id")}) > 1
    }
    product_rows = len(products)
    result = {
        "categories": len(categories),
        "accessible_categories": sum(c.get("status") != "inaccessible" for c in categories),
        "product_records": product_rows,
        "products_with_images": sum(any(i.get("local_path") for i in p.get("images", [])) for p in products),
        "product_gallery_references": refs,
        "failed_gallery_references": sum(i.get("status") == "failed" for p in products for i in p.get("images", [])),
        "unique_image_records": len(images),
        "stored_image_files": len(stored_files),
        "ignored_metadata_files": ignored_metadata_files,
        "total_bytes": sum((ROOT / p).stat().st_size for p in stored_files),
        "unique_local_hashes": len(local_hashes),
        "duplicate_local_hash_groups": len(duplicate_local_hashes),
        "repeated_product_content_groups": len(repeated_product_hashes),
        "category_assigned_products": sum(bool(p.get("category_urls")) for p in products),
        "category_unassigned_products": sum(not bool(p.get("category_urls")) for p in products),
        "missing_sources": len(missing_sources),
        "missing_paths": len(missing_paths),
        "corrupt_references": len(corrupt_refs),
        "corrupt_files": len(corrupt_files),
        "hash_mismatches": len(bad_hash_refs),
        "dimension_mismatches": len(dimension_mismatches),
        "product_image_relationship_errors": len(product_link_mismatches),
        "image_manifest_errors": len(image_entry_errors),
        "image_manifest_missing_source_urls": image_manifest_missing_urls,
        "unmanifested_files": len(unmanifested),
        "zero_byte_files": len(zero_byte),
        "filenames_without_arabic": len(non_arabic_names),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    errors = {
        "missing_paths": missing_paths[:20], "corrupt_references": corrupt_refs[:20],
        "corrupt_files": corrupt_files[:20], "hash_mismatches": bad_hash_refs[:20],
        "product_image_relationship_errors": product_link_mismatches[:20],
        "image_manifest_errors": image_entry_errors[:20], "unmanifested_files": unmanifested[:20],
        "filenames_without_arabic": non_arabic_names[:20],
    }
    for name, items in errors.items():
        if items:
            print(f"{name}: {json.dumps(items, ensure_ascii=False)}")
    hard_errors = (missing_paths or corrupt_refs or corrupt_files or bad_hash_refs or product_link_mismatches
                   or image_entry_errors or unmanifested or zero_byte or duplicate_local_hashes)
    return 1 if hard_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
