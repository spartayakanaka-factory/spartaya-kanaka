# Hostinger staging and Cloudflare R2 preparation

Status: **blocked; local implementation and review only**. The two approved R2 buckets exist, but no token, hosted environment variable, database grant, or deployment has been created or changed. Hosted restricted commerce is implemented locally but not deployed or accepted. This document is not permission to apply changes.

## Proposed R2 setup

The approved Standard-class buckets `sprtaya-staging-private` and `sprtaya-staging-public` have been created. Both have public access disabled, as the owner requested. The first holds originals and synthetic evidence; the second is for synthetic display derivatives. Do not enable public access, a public domain, or `r2.dev` for either bucket.

The owner declined credential creation; do not create an R2 token. A future separately authorized Object Read & Write token would need to be scoped to those two buckets only. The current application uses one access-key pair for both buckets; do not give it account-wide or bucket administration permissions. Store the key pair only in server-side Hostinger environment variables, never in source, command arguments, chat, or logs. Provider checkout, credentials and permissions require separately approved actions. Enable usage alerts and assess charges; free allowances do not guarantee a zero bill.

The current admin product-media uploader sends a signed browser PUT to the private bucket. Proposed Cloudflare dashboard CORS JSON for that bucket (verify using an actual upload after provisioning):

```json
[
  {
    "AllowedOrigins": ["https://bisque-pheasant-330767.hostingersite.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "if-none-match", "x-amz-meta-owner"],
    "MaxAgeSeconds": 300
  }
]
```

CORS is not access control. The evidence upload goes through the application server, not directly from a browser. Confirm the app SDK's actual signed headers in a browser, conditional PUT behavior, CORS, and private-object denial before acceptance. The application serves registered synthetic display derivatives through its Basic-Auth-protected staging route; both buckets remain private. This path is tested with mocks only and requires actual hosted R2 verification. Establish a separate backup and tested restore method for both buckets; R2 configuration alone does not verify recovery.

## Hostinger environment variable inventory (do not set yet)

The current site has only `APP_ENV`, `STAGING_SITE`, `STAGING_ACCESS_USERNAME`, `STAGING_ACCESS_PASSWORD`, and `LEGACY_ASSET_ROOT`. Names are known; values have not been inspected. Hostinger's replace operation can replace the entire set, so retain verified existing entries and do not submit masked placeholders.

- Staging access: `APP_ENV=staging`, `STAGING_SITE=1`, and unique private `STAGING_ACCESS_USERNAME` / `STAGING_ACCESS_PASSWORD`.
- Database: `DATABASE_URL` with the approved least-privilege staging user, and `DATABASE_TARGET` selected only after reviewing the migration/runtime guards. The existing `u858869017_sprtaya_test` user has all privileges on its database and must not be assumed to be a least-privilege runtime account.
- Authentication: unique staging-only `BETTER_AUTH_SECRET`, `CUSTOMER_AUTH_SECRET`, and the exact HTTPS staging origin in `BETTER_AUTH_URL`, `CUSTOMER_AUTH_URL`, and `AUTH_TRUSTED_ORIGINS`; configure the approved test identity registry when its hosted implementation exists.
- Media: `STAGING_R2_ACCOUNT_ID` (configuration-check input only), `MEDIA_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `MEDIA_S3_REGION=auto`, `MEDIA_S3_ORIGINALS_BUCKET=sprtaya-staging-private`, `MEDIA_S3_DISPLAY_BUCKET=sprtaya-staging-public`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_BASE_URL=https://bisque-pheasant-330767.hostingersite.com/api/staging-media`, and `MEDIA_S3_FORCE_PATH_STYLE` set to the tested SDK setting. No credential values belong in this document.
- Payments, notifications and commerce flags: all off until a reviewed hosted implementation enforces mock-only operation, approved identities, test-only notifications, correct storage isolation, and protected staging access. Hosted commerce remains unavailable until the gated candidate is deployed after separate approval. `P3_STATE_DIR` would need an approved private writable location if the existing notification sink is reused; do not assume that Hostinger deployment directories survive redeployments.

Run `node --import tsx scripts/check-staging-r2-config.ts` only inside a private process with the relevant environment supplied. It checks configuration shape and prints field names only; it does **not** connect to R2, validate credentials, inspect bucket policy, prove isolation, verify DNS, or enable commerce.

## Database, access and rollout gates

The Hostinger phpMyAdmin view reported the named test database has no tables on 2026-11-01 and a backup entry exists; recheck identity and migration history immediately before any approved migration. Verify an export and rehearse restore to a separate isolated target. Inventory the seven migrations in `docs/phase4/migration-manifest.json`. The current migration deploy script intentionally rejects Phase 3; do not bypass it with raw Prisma, SQL, or build hooks. A separately reviewed exact-target migration mechanism is needed.

Anonymous and invalid-auth requests to `/` and `/admin` returned 401, but `/robots.txt` was served publicly with wildcard allow. Resolve Hostinger routing and verify all paths plus authenticated access, noindex headers, and independent admin authorization before storing secrets or enabling commerce. Exact runtime delivery of environment variables, staging storage, scoped database access and notification persistence still require testing.

Proposed rollout after an explicit approval: establish isolated resources, independently verify private and scoped access, verify backup and restore, use a reviewed exact-target migration procedure, configure complete server-side environment, publish the reviewed exact candidate with auto-deployment disabled, then run synthetic hosted tests. Rollback requires a verified database backup and separately reviewed restoration into an isolated target, plus a controlled return to the prior `cea867a0df48d0aa145613b0d491b1a779b4ee3d` application build; returning application code alone is not a database rollback.

References: [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [R2 tokens](https://developers.cloudflare.com/r2/api/tokens/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [public bucket access](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## Locally implemented hosted guard (not activated)

The candidate uses `SR_HOSTED_ISOLATION=1` only with `APP_ENV=staging`, `STAGING_SITE=1`, Node production mode, the exact staging origin for all auth origins, and the exact MariaDB database at `127.0.0.1:3306` with the **proposed, not yet created or verified** runtime user `u858869017_sprtaya_run`. This user must be independently verified to have only `SELECT, INSERT, UPDATE, DELETE` on the named test schema and no unrelated schema access. Local tests confirmed those grants and cross-schema denial with a separate local user, not the hosted account.

The candidate also requires three operator confirmation flags, `STAGING_ACCESS_CONTROL_VERIFIED`, `STAGING_DATABASE_ISOLATION_VERIFIED`, and `STAGING_R2_ISOLATION_VERIFIED`; they are configuration gates and **are not evidence** that any check occurred. Set them only after independent verification. `SR_HOSTED_ALLOWED_STAFF_IDS` and `SR_HOSTED_ALLOWED_CUSTOMER_IDS` must contain only explicitly provisioned synthetic UUIDs. Public customer signup and guest commerce are disabled. Transfer instructions are restricted to non-payable fixtures. `PAYMENT_MODE=MOCK`, `P3_ENABLED=1`, `P3_SIMULATION=1`, `P3_DISPOSABLE=1`, `CATALOG_SOURCE=mysql`, and all required R2 fields must pass validation. `P3_NOTIFICATIONS=0` is mandatory: no outbound or test notification delivery occurs; synthetic order events remain in the database outbox. `MOCK_PAYMENT_SECRET`, `BETTER_AUTH_SECRET`, and `CUSTOMER_AUTH_SECRET` must be distinct high-entropy server-side values of at least 32 characters. Set individual `P3_*` feature flags only during the approved test scope. The implementation does not prove that uploaded data is synthetic or that Hostinger's routing reaches the protection layer; those remain operational controls and hosted acceptance gates.

## Migration and recovery rehearsal

`node --import tsx scripts/check-hostinger-migration-manifest.ts` verifies the seven local migration checksums without connecting to a database. The existing deploy guard still blocks hosted Phase 3 migrations; **no hosted migration command has yet been approved or enabled**. One reviewed migration replaces an index, so do not describe the sequence as entirely non-destructive. `scripts/sr-recovery-check.py` checks the digest of the previously recorded synthetic backup, restores it into two newly created randomly named local schemas, compares all 47 tables and the six recorded migration checksums, and deletes only its own schemas. It never connects to Hostinger. Hostinger's backup still needs an independent export verification and isolated restore rehearsal before migration.

Read-only November 1 checks returned HTTP 200 for `/robots.txt`, including with a diagnostic query, while `/sitemap.xml` and `/admin` returned 401. This shows a path-specific response difference but does not establish whether the cache, hosting routing, or another layer causes it. Keep credentials and commerce disabled until Hostinger support resolves the routing and both access and noindex behavior are independently verified.

The owner explicitly declined credential creation and public bucket access. Do not ask for or create credentials as an assumed next step; hosted storage stays blocked until the owner changes that decision. The actual Hostinger backup was downloaded with permission, passed gzip validation, and restored to a newly created disposable local MariaDB schema with zero tables and no migration ledger. That verifies the downloaded October 31 backup only; recheck the hosted database and backup immediately before any approved migration.
