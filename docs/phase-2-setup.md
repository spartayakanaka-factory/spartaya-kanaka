# Phase 2 setup and operations

This is an implementation guide. No database, object-storage bucket, credentials, import, or hosting deployment is configured in this workspace.

## Local or staging database

Use Node 22 or 24 and pnpm 11. Create a MySQL 8.0.16+ or MariaDB 10.2.1+ database with a UTF-8 compatible charset. The migration uses `CHECK` constraints for nonnegative inventory. Do not point the `local` or `staging` commands at production.

1. Copy `.env.example` to `.env` and replace its placeholders with local values. URL-encode special characters in database credentials. Keep `.env` out of source control. For local commands, use a loopback host and database name ending in `_local`, `_test`, or `_dev`. For staging commands, use a dedicated non-loopback database whose name includes `staging` or `stage`.
2. Validate and generate the client, then apply the committed migration:

   ```sh
   pnpm db:validate
   pnpm db:generate
   DATABASE_TARGET=local pnpm db:migrate:deploy
   DATABASE_TARGET=local pnpm db:seed
   ```

3. Set `OWNER_BOOTSTRAP_EMAIL` to the exact authorized owner identity. Create the first owner from an interactive terminal. The password is entered without echo and the owner must choose a new password after the first sign-in. The bootstrap stores a unique completion marker and refuses all later attempts, even if the original owner is removed:

   ```sh
   DATABASE_TARGET=local pnpm admin:bootstrap -- "owner@example.com" "Factory owner"
   ```

4. Open `/admin/login`. Self-registration is disabled. Add additional staff from the owner-only staff page; their first password change is required.

### Hostinger staging environment

For a later staging run, enter `DATABASE_URL`, `DATABASE_TARGET=staging`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `AUTH_TRUSTED_ORIGINS`, and `CATALOG_SOURCE` in the temporary website's protected environment-variable settings. Keep database credentials and auth secrets out of GitHub, this document, and client-side variables. Obtain the database host and engine/version from Hostinger; do not assume a local connection hostname works from Codex.

Before applying migrations, verify the database is dedicated and its contents are backed up. The current migration safety check accepts staging only when the URL host is non-loopback and the database name contains `stage` or `staging`. The owner reports a provisioned test database whose current name does not meet that rule. Resolve the naming/guard mismatch deliberately before setting `DATABASE_TARGET=staging`; no migration or connection should be attempted until that check passes.

## Opt-in MySQL integration checks

The database integration suite is disabled during ordinary unit-test runs. It refuses to connect unless `PHASE2_DB_INTEGRATION=1`, `DATABASE_TARGET=local`, and `DATABASE_URL` points to loopback with a database name containing `test` or `integration`. Use a newly created, empty database such as `sprtaya_phase2_test`; never point it at a database containing user data. Apply migrations twice to verify replay, seed roles, then run:

```sh
DATABASE_TARGET=local pnpm db:migrate:deploy
DATABASE_TARGET=local pnpm db:migrate:deploy
DATABASE_TARGET=local pnpm db:seed
PHASE2_DB_INTEGRATION=1 DATABASE_TARGET=local pnpm test:integration
```

The suite checks migrated tables, required indexes and foreign keys, seeded role permissions, session-row reads, catalog/media relation writes, integer minor-unit prices, transaction rollback, concurrent stock compare-and-swap, nonnegative adjustment behavior, audit rows, and duplicate inventory request-key rejection. Its synthetic inventory fixture is deleted after the test. It does not replace HTTP-level Better Auth, server-action authorization, importer apply/rerun, storefront route, or object-storage upload/read-back tests; those still require the configured isolated services and owner test account.

Set `DATABASE_TARGET=staging` only when intentionally running against a dedicated staging database. The seed, bootstrap, and importer reject `production` mode; they do not provide production credentials or perform deployment.

## Catalog import and review

`pnpm catalog:import` performs a dry-run using the archived manifests and local image paths. It does not connect to or modify a database. Apply only after reviewing its summary against a non-production database:

```sh
DATABASE_TARGET=local pnpm catalog:import -- --apply
```

Apply creates source-linked categories hidden by default and draft products without operational prices, availability, or product type. Imported prices remain evidence in the legacy payload; do not treat them as verified. An administrator must review category, product type, image, copy, variants, price, and inventory before publication. Publishing is blocked until required fields are reviewed.

Legacy image records point into the preserved local archive. A production package that drops that archive must first copy and verify those images in object storage and update their media records. The importer does not perform that copy.

## Media storage

Set `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_ORIGINALS_BUCKET`, `MEDIA_S3_DISPLAY_BUCKET`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`, and `MEDIA_PUBLIC_BASE_URL` only after creating S3-compatible buckets. Use separate buckets: keep originals private and serve only display derivatives publicly. Restrict credentials to the two named buckets and required object operations. The upload flow stores originals and writes a 1920px WebP display derivative.

Configure the originals bucket CORS for the exact admin origin(s), `PUT`, and the required `Content-Type` and `x-amz-meta-owner` request headers. The display bucket needs public read access only for its display object prefix. Verify a signed upload, finalize-owner matching, public image read-back, and deletion/retention policy against staging. The application cannot confirm bucket durability without this test. Hostinger's managed build directories can be replaced by a new build; never use them as the permanent store for owner uploads.

The import is safe to rerun by source product and image identifiers. It creates new imported products as drafts and does not update mapped products. Category records are created hidden; on rerun the importer adds a fallback cover only when no image is already assigned, preserving an owner-selected category image. Source prices remain in the legacy mapping payload and are never copied to operational price fields.

## Authentication and app environment

Set `DATABASE_URL`, `BETTER_AUTH_URL`, a randomly generated `BETTER_AUTH_SECRET` of at least 32 characters, and comma-separated exact `AUTH_TRUSTED_ORIGINS`. In production the auth cookie is secure and HTTP-only. Keep all secrets server-side; do not prefix them with `NEXT_PUBLIC_`. Set `CATALOG_SOURCE=mysql` only after the DB-backed catalog and media have been reviewed and are ready for public reads. The default `local` source is an offline preview mode.

Before any future Hostinger rollout, verify the chosen plan's Node runtime, actual MySQL/MariaDB version, app-to-database network access, environment-variable storage, backups, object-store CORS, and managed build/update behavior. Test a build and restore on a non-production app first. No deployment is part of this phase.
