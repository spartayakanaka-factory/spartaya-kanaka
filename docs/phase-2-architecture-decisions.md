# Phase 2 architecture decisions

Decisions recorded before implementation, 27 October 2026.

## Starting point

- Existing Next.js 16.4.3 / React 19.3.1 application, strict TypeScript, Node engine `^22.12.0 || ^24.0.0` to satisfy Prisma 7.10.1.
- Catalog is a synchronous read-only adapter over local manifests: 487 product records, 38 scraped categories (36 verified populated categories), 2,823 gallery references, and 1,753 archived image files. No inventory, variants, approved current prices, or authenticated admin exists.
- The project directory has no readable `.git` metadata or source commit; no starting commit can be reported. Preserve current files; do not invent Git provenance.
- No database URL, admin secret, R2 credentials, local MySQL server, MySQL/MariaDB CLI, Docker, or Podman is present in the available workspace/environment.

## Database and catalog

- Use stable Prisma 7 with its MySQL datasource and a bounded MariaDB driver adapter. Prisma 7 officially supports MariaDB 11; the designated Hostinger test target was owner-verified as MariaDB 11.8.9.
- Store source records as unverified drafts. Keep legacy source IDs/URLs unique and import only observed data. Do not infer EGP price, availability, variant, ready-made/made-to-order classification, or category assignment from a scraped value alone. Source price is retained in legacy evidence only; operational product price starts unset.
- Public reads select only `PUBLISHED` rows and require media/category data explicitly. The current static adapter remains an explicit local preview fallback until an operator supplies a non-production MySQL database. Production must fail closed when the DB mode is selected but unconfigured.
- Use request-time queries and path revalidation after writes so newly published or edited catalog entries can appear without rebuilding the application. Existing route shapes remain source-slug compatible.

## Authentication and authorization

- Use a maintained Better Auth library with Prisma/MySQL, database-backed sessions, non-public signup, secure host-only HTTP-only cookies, email/password login, account revocation, strict origin checking, and persistent rate limiting.
- Bootstrap the first owner only through a one-time operator CLI that reads the secret from standard input; do not supply default credentials or a public registration screen.
- Recheck role and session inside each DAL operation/action/route handler. UI visibility and `/admin` navigation do not grant access.
- Enforce OWNER, MANAGER, CATALOG_EDITOR, and INVENTORY_STAFF permissions from one server-side matrix. Audit price, publication, category, media, settings, and inventory changes.

## Media and Hostinger

- Hostinger's current Node.js deployment documentation says each deployment is built in a versioned managed directory and files under managed build paths are overwritten on deployment. It does not establish persistence for arbitrary user-upload paths. Therefore uploaded media must use object storage, not the app filesystem.
- Design direct, short-lived, server-authorized S3-compatible uploads and public delivery via Cloudflare R2, an explicit optional external service. Do not create a bucket, spend money, or claim durable uploads until the owner provisions R2 and supplies secrets. Current published R2 terms include 10 GB-month and 1 million Class A / 10 million Class B requests in the monthly Standard free tier, then $0.015/GB-month, $4.50/million writes, $0.36/million reads, no R2 egress fee. Billable usage can exceed this; verify current terms before provisioning.
- Preserve the original 316 MiB archive byte-for-byte; it remains the local legacy image source. New uploads never enter the repository.

## Runtime and boundaries

- Separate local, staging, and production DB URLs in environment configuration and documentation. Never point tests/import dry runs at production.
- Hostinger web-app environment uses the generated database host/user/name/password in hPanel; `127.0.0.1:3306` is an operator-confirmed deployment value, not a development default. Verify that this purchased Unlimited plan exposes Node.js apps and MySQL to the same app before deployment. No deployment is authorized.
- No checkout, payment capture, COD collection, orders, manufacturing work orders, customer accounts, quotations, or production deployment in this phase.

## Verification constraints

Schema and importer can be tested deterministically without credentials. Database engine behavior, live admin persistence, login/session lifecycle against MySQL, image bucket durability, managed-plan compatibility, and update-without-redeploy require separately provisioned local/staging infrastructure. Those criteria must remain **PARTIAL** until verified.
