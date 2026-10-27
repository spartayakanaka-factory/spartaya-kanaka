# Phase 2 completion and remaining work

Phase 2 implements a MySQL/MariaDB catalog foundation, an Arabic staff console, product/category editing, role permissions, inventory ledger, audited settings, draft-only legacy import, and an S3-compatible direct-upload path. It does not add orders, checkout, customer accounts, payment capture, a quotation flow, or deployment.

Before the Phase 2 acceptance criteria can be marked complete:

1. Provision a local or staging MySQL/MariaDB database and run the documented migrations, role seed, and owner bootstrap.
2. Exercise login, forced password update, role-specific access, product/category editing, and inventory adjustments against that database.
3. Provision an S3-compatible bucket, credentials, public delivery URL, and CORS rules. Verify upload, image derivative generation, read-back, and durability across a rebuild.
4. Import the source catalog into a non-production database and review all 487 products, 38 categories, prices, category links, product types, variants, and imagery before publishing any record.
5. Confirm the factory phone is suitable for voice calls with the owner before accepting custom-manufacturing requests.
6. Run storefront and administration review against the selected Hostinger plan and its actual MySQL version, environment-variable handling, database network policy, backup/restore path, and managed-build behavior.

Keep all unverified rows as drafts and prices absent. Do not switch a live storefront to the database catalog until the records, image availability, and host behavior above have been checked. Phase 3 is not started by this roadmap.
