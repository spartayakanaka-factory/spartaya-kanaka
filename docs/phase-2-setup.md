# Phase 2 setup and operations

This is the general implementation guide. An isolated local MariaDB and filesystem-backed S3 environment is now available; use [the current local runbook](phase2-local/README.md) and [acceptance results](phase2-local/acceptance.md). Hostinger database acceptance and externally persistent media remain separate release gates. Earlier infrastructure-blocked reports are historical.

## Local or staging database

Use Node 22.12+ or 24.x and pnpm 11. Create a MySQL 8.0.16+ or MariaDB 10.2.1+ database with a UTF-8 compatible charset. The migration uses `CHECK` constraints for nonnegative inventory. The designated Hostinger test database was owner-verified as MariaDB 11.8.9 with no tables in the previous structure check; the guarded preflight must reverify it. Do not point the `local` or `staging` commands at production.

1. Copy `.env.example` to `.env` and replace its placeholders with local values. URL-encode special characters in database credentials. Keep `.env` out of source control. For local commands, use a loopback host and database name ending in `_local`, `_test`, or `_dev`. Generic `DATABASE_TARGET=staging` remains for separate staging databases named with `stage`/`staging`. The designated Hostinger test database has a separate exact-identity target; follow [the Hostinger Phase 2.2 acceptance plan](hostinger-phase2-staging-acceptance.md) instead of weakening the generic guard.
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

The designated Hostinger Phase 2 target now has an exact database/user fingerprint, a required `APP_ENV=staging` and `STAGING_SITE=1` environment, and a Hostinger-local `127.0.0.1:3306` connection check. Read-only preflight validates live identity/version and migration history. Migration deploy additionally requires a Hostinger backup reference and explicit CLI review flags. See [the controlled Hostinger acceptance plan](hostinger-phase2-staging-acceptance.md) for the environment-variable list, account steps, test commands, and release gates. No credentials are stored here.

## Opt-in MySQL integration checks

The database integration suite is disabled during ordinary unit-test runs. For local tests it requires `PHASE2_DB_INTEGRATION=1`, `DATABASE_TARGET=local`, and a loopback database with a `test` or `integration` name. For Hostinger tests, use only the exact target and explicit synthetic-write acknowledgement documented in the acceptance plan. Never point tests at a database containing production/customer data.

```sh
DATABASE_TARGET=local pnpm db:migrate:deploy
DATABASE_TARGET=local pnpm db:migrate:deploy
DATABASE_TARGET=local pnpm db:seed
PHASE2_DB_INTEGRATION=1 DATABASE_TARGET=local pnpm test:integration
```

The suite checks migrated tables, required indexes and foreign keys, seeded role permissions, session-row reads, catalog/media relation writes, integer minor-unit prices, transaction rollback, concurrent stock compare-and-swap, nonnegative adjustment behavior, audit rows, and duplicate inventory request-key rejection. Its synthetic inventory fixture is deleted after the test. It does not replace HTTP-level Better Auth, server-action authorization, importer apply/rerun, storefront route, or object-storage upload/read-back tests; those still require the configured isolated services and owner test account.

Set `DATABASE_TARGET=staging` only for a separately named staging database. The designated Hostinger target is permitted only through its explicit target and command confirmation; production database targets remain blocked. These commands do not provide credentials or perform deployment.

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
