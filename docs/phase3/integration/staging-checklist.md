# Staging promotion checklist — do not execute yet

Candidate source is a local canonical-lineage worktree. Neither publishing, migration nor deployment is authorized by this checklist.

## Preserve the repaired runtime

- Node 22.12+; locally tested official Node 22.23.4 on macOS ARM64. Hostinger's exact Linux minor/build remains an on-host verification item.
- pnpm **11.24.0**, frozen lockfile and `nodeLinker: hoisted`; dependency versions unchanged.
- Next.js **16.4.3**, Prisma **7.10.1**, existing `next build --webpack`, normal application root `./`, output `.next`, existing Hostinger start/packaging configuration.
- Preserve complete `@swc/helpers/**/*` tracing, canonical runtime dependencies including Prisma utilities, staging-only direct images and noindex headers. The local clean install has real hoisted packages; do not copy linked node_modules or arbitrary helper files.
- Preserve `LEGACY_ASSET_ROOT` outside deployment versions/public_html. Verify all 1,753 product/brand files and directory permissions again after any future rebuild; include this directory in backup. This is the existing archive delivery path, not proof of new admin-upload S3 persistence.

## Mandatory release gates

1. **Before any future push:** disable Git auto-deployment for the staging repository/branch and verify the setting. The 29 October repair report explicitly says it is enabled. This task did not change that setting. A source-only push must not implicitly deploy an unpromoted schema/client.
2. Review the 30/30 ledger, candidate commit, new source inventory, secret scan and Node 22 test evidence. Publish only after separate authorization, onto a review branch descending from the then-current canonical head. Re-fetch and compare again; do not overwrite/force-push/merge unrelated histories.
3. Complete E1 database review and verified export/restore in `database-promotion-and-recovery.md`. Keep the working Phase 2 source until exact schema compatibility and a separate manual application deployment are approved.
4. Keep the staging application password protected. Verify anonymous and invalid Basic Auth return 401 for storefront/admin/assets/new APIs; missing credentials fail closed. Valid staging credentials permit viewing, never staff actions. Staff role/session/ban/grant/CSRF checks remain independent.
5. **Robots override:** the repair evidence shows Hostinger's temporary-domain layer still substitutes a 58-byte robots response allowing wildcard crawlers. The application returns Disallow `/` and noindex locally, but that is not a hosted fix. Obtain a Hostinger-supported platform correction or explicitly review accepting a private-staging exception while 401/noindex are proven. This is not public-release acceptance. Do not weaken password protection to test crawlers.
6. Do not enable Phase 3 on staging by copying local flags. Its current guard intentionally permits only the isolated local database. Approve a narrowly scoped staging simulation mode, private notification-capture directory, synthetic fixtures and separate owner provisioning/acceptance before activation. Real financial policies/providers/notifications/international remain off.
7. New admin media requires approved S3-compatible private-original/public-display buckets, scoped credentials, HTTPS endpoint/base URL, allowed staging origin, lifecycle/retention and a real upload/finalize/restart/read/anonymous-denial check. No paid storage was created. The restored archive does not satisfy this separate upload requirement.

## Server-side environment names — never paste values in Git or logs

Existing: `APP_ENV`, `STAGING_SITE`, `STAGING_ACCESS_USERNAME`, `STAGING_ACCESS_PASSWORD`, `DATABASE_URL`, `DATABASE_TARGET`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `AUTH_TRUSTED_ORIGINS`, `CATALOG_SOURCE`, `LEGACY_ASSET_ROOT`. Public URL only: `NEXT_PUBLIC_SITE_URL`.

Optional upload storage: `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_ORIGINALS_BUCKET`, `MEDIA_S3_DISPLAY_BUCKET`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_BASE_URL`, `MEDIA_S3_FORCE_PATH_STYLE`.

Phase 3 preparation: `CUSTOMER_AUTH_URL`, `CUSTOMER_AUTH_SECRET`, `MOCK_PAYMENT_SECRET`, `P3_STATE_DIR`, `PAYMENT_MODE`, `P3_ENABLED`, `P3_SIMULATION`, `P3_DISPOSABLE`, `P3_CUSTOMER_ACCOUNTS`, `P3_CHECKOUT`, `P3_MOCK_PAYMENTS`, `P3_MANUAL_TRANSFERS`, `P3_REFUNDS`, `P3_NOTIFICATIONS`. Keep all capabilities off for the unapproved hosted candidate. Test integration flags and local runner paths are not hosted settings. No default owner/password or public staff signup.

## Independently verify a separately approved deployment

Record expected Git SHA, actual Hostinger build ID/commit, Node/pnpm versions, normal build/start/output settings, auto-deployment disabled, worker entry and sanitized build/runtime logs. Test anonymous/invalid/valid requests separately for `/`, `/ar`, `/en`, `/admin`, `/admin/login`, `/robots.txt`, a real image, JS, nonexistent route and the media/new commerce APIs. Check actual status, non-empty body, content type, authentication challenge, private cache/noindex headers, redirects and asset hashes. Compare application-versus-platform robots responses. Never request a signed upload URL merely to test anonymous denial.

After schema and simulation approvals, use only synthetic accounts/products to verify customer isolation, owner login, separate manager grants, order/payment/inventory transitions and notifications. Report hosted results separately from local ones. Preserve existing images, drafts and unapproved prices; do not seed the synthetic policy over merchant settings.

If a build/runtime check fails, preserve logs and the current/previous artifacts, stop promotion and diagnose before rebuilding. Roll back only to a code/schema pair reviewed as compatible; preserve the external media root and private state. No DNS, original factory domain, live payment, automatic deployment or production operation is part of this procedure.
