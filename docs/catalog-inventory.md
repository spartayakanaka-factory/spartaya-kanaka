# Catalog inventory and migration gaps

## Source reviewed

The archive was found in **sprtaya-kanaka-assets**, with scripts in **scripts**, JSON and CSV manifests in **sprtaya-kanaka-assets/بيانات**, and reports in **sprtaya-kanaka-assets/تقارير**. The extraction report describes a public sitemap and collection crawl. It also records that no collection pagination URLs appeared in the saved HTML, a later request returned HTTP 429, and a browser visit showed a CAPTCHA. No access restrictions were bypassed.

The current live site was read for brand context at [the home page](https://www.sprtaya-kanaka.net/) and [About page](https://www.sprtaya-kanaka.net/pages/about-us). The About page publishes the factory name, copper and shell products, and the statement that work began in 1993 in historic Cairo. This is presented as source-published copy, not independently verified history.

## What was found

| Record                                 |                     Discovered |                            Usable in this preview |
| -------------------------------------- | -----------------------------: | ------------------------------------------------: |
| Product records                        |                            487 |                                   487 browse-only |
| Categories                             |                             38 | 36 categories with a verified product association |
| Product gallery references             |                          2,823 |                                             2,823 |
| Unique downloaded image files          |                          1,753 |                                             1,753 |
| Image archive size                     | 331,437,554 bytes (316.08 MiB) |                        Served from original files |
| Product records with downloaded images |                            487 |                                               487 |

The product records preserve the original ID, source product URL, Arabic title and description, source price/currency, variants field, category references, and gallery image metadata. The image manifests preserve the original media URLs, local paths, dimensions, byte counts, hashes, and product relationships.

The extraction report lists 37 accessible category pages and one inaccessible category. Two category records need review: one has the source name “اتصل بنا” and no products; one slug returned HTTP 404 and has no known category name.

## Completeness and integrity

The local asset validator found zero missing paths, corrupt files, hash mismatches, dimension mismatches, product-image relationship errors, unmanifested files, or zero-byte files. It found no duplicate local file hashes. The product/category validator found zero broken category links and zero duplicate product IDs or slugs.

All 487 product records contain a scraped price field and an Arabic description. No inventory or stock field is present, and no product record has populated variants. The source price field is preserved for later owner review but is not displayed anywhere in the preview and does not make a product purchasable.

Only 205 products have a verified category association. The other 282 are retained in All Products with a “category assignment under review” label. Category pages include only records linked in both the product and category manifests. The extraction report also notes 1 failed image download overall; it did not leave any product without a local gallery.

The integrity validator reports repeated image content references across different product galleries. These are references to shared files, not duplicate local files; the original archive and its existing duplicate report remain intact.

## Migration status

**src/data/migration-manifest.json** maps source product URLs and collection URLs to proposed Arabic routes. It retains source IDs and flags category uncertainty. The mappings are proposals for review; no redirects have been activated and the live site has not been modified.

## Required owner review before commerce

- Confirm current product names, descriptions, variants, and category assignments.
- Reconfirm every price, currency, and product's sale status.
- Enter inventory or made-to-order status and approved lead times.
- Confirm the published contact number supports calls and custom-order enquiries.
- Confirm the factory's current history/about copy before carrying it into launch copy.
