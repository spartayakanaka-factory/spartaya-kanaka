# Application architecture

## Phase 1 structure

The application is a small Next.js App Router project with strict TypeScript and a modular-monolith boundary. Server-rendered route segments handle the storefront and catalog reads; the product gallery is the only client-side interactive component. The media route reads approved image files from the existing local archive.

The source catalog adapter is **src/lib/catalog.ts**. It normalizes the extracted product and category manifests into typed records. Pages depend on those adapter functions rather than importing scraped data themselves, so a later repository implementation can replace the local reader without changing the page components.

Main areas:

- **src/app/[locale]** — Arabic and English storefront routes.
- **src/components** — shared navigation, catalog cards, notices, and gallery.
- **src/lib/catalog.ts** — current local catalog adapter.
- **src/lib/i18n.ts** — localized interface labels and display names for category navigation.
- **src/app/assets/[...path]/route.ts** — allow-listed image delivery from the original archive.
- **src/data/migration-manifest.json** — source URLs and proposed Arabic target paths for review.
- **sprtaya-kanaka-assets** — read-only source archive with the original image library, scripts, reports, and manifests.

## Boundaries and trade-offs

The catalog is a local read-only import in Phase 1. This makes the preview run without a paid service or database, preserves original Arabic text and IDs, and avoids presenting scraped data as verified commerce data. The trade-off is that product edits do not persist and the image archive must accompany the application at runtime.

In Phase 1, the storefront deliberately had no cart, checkout, account, payment, or admin routes. A product detail page could call the factory, but did not claim that an item was in stock or available at a shown price.

The current app imports the 4.8 MB products manifest into the server bundle. This is simple and deterministic for 487 products. If the catalog grows materially, load records through a repository with pagination rather than bundling an increasingly large JSON file.

The image route allows only image extensions under the product and visual identity directories. It reads the original files without copying or modifying them. It caches those static files aggressively. The full archive is about 316 MiB, so a production packaging pass should create reviewed, compressed derivatives in a separate directory before launch; the source archive remains unchanged.

## Future modules

The Phase 2 modular monolith implements catalog, price evidence, variants, inventory, media, admin identity and authorization, audit events, manufacturing policy settings, and store content in one Next.js application and one MySQL/MariaDB database. Orders, cart, payments, shipping workflows, notifications, and customer accounts are deferred.

Phase 1's Postgres/Supabase proposal was superseded in Phase 2 by the MySQL/MariaDB schema and Prisma adapter. The current schema and remaining future directions are described in [future-data-model.md](future-data-model.md).

## Language and SEO

Arabic is the source language for extracted catalog titles and descriptions. The English interface translates navigation and explanatory UI only. Product content remains in Arabic until reviewed translations are supplied. Every locale has its own URL and direction attribute.

Metadata, canonical URLs, a sitemap, and robots rules are present. Product structured data is intentionally omitted because price and availability are not verified and the records are not purchasable. The current source website publishes an About-page statement that the factory began in 1993 in historic Cairo; the storefront labels that as information from the current website rather than an independently verified claim.

## Current source

The existing public website was reviewed at [sprtaya-kanaka.net](https://www.sprtaya-kanaka.net/). Its current About page publishes the factory name, copper and shell products, and the 1993/Cairo statement. Its contact page says to contact via WhatsApp; the shipping page lists 01142800111 in its payment-transfer instructions. The current site also exposed an inconsistent Polish-złoty price in the homepage crawl. For those reasons, source prices are not shown, and the listed number needs owner confirmation as a voice-call destination before launch.

## Phase 2 implementation

Phase 2 adds a MySQL/MariaDB catalog and Arabic administration foundation while retaining the Phase 1 local catalog as the preview default. Set `CATALOG_SOURCE=mysql` only after the database is migrated, the owner is bootstrapped, catalog rows are reviewed, and legacy image delivery is available. All DB-backed reads are request-time server reads; only published products assigned to visible, reviewed categories are eligible for the storefront.

Prisma 7 with `@prisma/adapter-mariadb` owns the schema and SQL migrations. Better Auth provides database-backed staff sessions with role-aware access, forced first-password changes, and audit events. S3-compatible object storage is the intended destination for newly uploaded media. Do not rely on a Hostinger build directory for durable uploads. Imported legacy media still references the preserved local archive until it is explicitly migrated to object storage.

The current phase intentionally ends before orders, checkout, payments, customer accounts, notifications, or production deployment. See [Phase 2 setup](phase-2-setup.md) and [PHASE_2_REPORT.md](../PHASE_2_REPORT.md) for infrastructure and validation status.
