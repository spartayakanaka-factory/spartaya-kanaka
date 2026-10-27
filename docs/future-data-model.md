# Data model direction and Phase 2 implementation

Phase 1 used a local read-only catalog and had no database. Phase 2 now implements catalog, categories, media metadata, variants, inventory, manufacturing policy settings, staff roles, authentication, and audit models in `prisma/schema.prisma` with MySQL/MariaDB migrations. This document retains the broader future direction; orders and payments are not implemented.

## Catalog and content

- **products**: stable internal UUID, preserved source ID, source URL/slug, publication state, fulfillment mode (ready_made, made_to_order, inquiry_only), timestamps, and review state.
- **product_translations**: product ID, locale, reviewed title and description, translation status.
- **categories**: stable ID, preserved source URL/slug, translated names, publication and review state.
- **product_categories**: many-to-many association with source and review provenance.
- **product_media**: product ID, storage key, alt text by locale, position, source URL, checksum, and review state.
- **product_options** and **product_option_values**: approved size, finish, engraving, or other configurable values.
- **price_lists** and **product_prices**: amount in integer minor units, currency, effective dates, and approval history. Never use floating-point arithmetic.
- **inventory_items**: product/variant ID, on-hand quantity, reserved quantity, and location; do not infer stock from a scraped catalog.

## Orders and fulfillment

- **customers**: contact details and consent records; minimize personal information.
- **orders** and **order_items**: immutable price snapshots, currency, address snapshot, quantity, customer, and separate order state.
- **payment_attempts**: provider/reference ID, amount, currency, status, verification result, and reconciliation timestamps. Card data stays with the licensed provider.
- **refunds**: amount, reason, provider reference, and status.
- **manufacturing_orders**: order item, approved specification, deposit terms, expected window, and separate production status.
- **shipments**: carrier, tracking details, destination, and shipment state.
- **notification_outbox**: durable message jobs, unique deduplication key, retry count, next attempt, and sent timestamp.
- **admin_users**, **roles**, **audit_events**: least-privilege access and a record of owner changes.

Use constrained status values and explicit transitions. An order status, payment status, manufacturing status, and shipment status are separate state machines. Calculate totals on the server from approved prices and option values; validate again at order creation. Store EGP amounts as integer piasters (or another exact minor-unit representation) with an ISO currency code.

## Provider and hosting fit

MySQL or MariaDB is the Phase 2 system of record. The application uses Prisma's MariaDB adapter and Better Auth's Prisma adapter. Any database or object-storage credential stays server-side. Uploaded photos use S3-compatible object storage/CDN with database records for ordering and alt text. The legacy importer retains local archive references; migrate those objects before removing the archive from a deployment package.

Hostinger's current managed Node.js guidance lists Next.js and Node 18, 20, 22, and 24 for eligible Business/Unlimited and Cloud web plans. Its current limits describe one long-running Node process per app and no always-running background worker, inbound WebSockets, Docker, or Redis on managed web hosting. Use scheduled cron-triggered queue processing or an approved external durable job service; never depend on an in-process timer as the job queue.

Orders, checkout, payments, refunds, customer accounts, manufacturing work orders, shipments, and notification queues remain outside this Phase 2 implementation.
