# Controlled Phase 3.5 promotion — prepared only

This is a review procedure, **not approval**. No push, PR edit/merge, persistent migration, hosted deployment/restart, DNS, original factory-site change or live payment is authorized by this document. The original Phase 3 promotion report remains historical; this document supersedes its old enabled-auto-deploy assumption for Phase 3.5.

## Candidate and gates

Use the final local commit from the Phase 3.5 acceptance report, descended from `a9b4a08806a498658695bfe89ca119a4ef86693a`, branch `codex/phase3-5-local`. Review both additive Phase 3.5 migrations and the four preserved historical migrations against `docs/phase3/migration-manifest.json`. Verify checksums and Git ancestry before integration. First obtain explicit approval to publish a separate review branch without force, inspect current remote history/validation-only CI and keep the existing draft Phase 3 PR/canonical branch intact. Reconfirm Hostinger auto-deploy is absent and repository CI has no deployment triggers. Do not treat local results as new GitHub CI results.

**Compatibility stop:** the new Prisma client includes new customer, payment, notification and shipping columns. Do not run it against an old schema merely with commerce flags disabled. Choose an approved maintenance/compatible-code sequence with writers and workers stopped. Keep the working Phase 2 artifact until the target schema and new client are verified.

## Environment and infrastructure preflight

Names only; values stay private. Retain `APP_ENV=staging`, `STAGING_SITE=1`, `STAGING_ACCESS_USERNAME`, `STAGING_ACCESS_PASSWORD`, correct `LEGACY_ASSET_ROOT`, Node 22, pnpm 11.24.0, Next 16.4.3, root `./`, `build`, output `.next`, SWC exports/CJS/ESM tracing and existing secure startup. Frozen dependencies are unchanged.

Database: server-side `DATABASE_URL`, `DATABASE_TARGET=hostinger-phase2-test`, exact database/user fingerprint for `u858869017_sprtaya_phase2` / `u858869017_sprtaya_test`, reviewed internal host/port and MariaDB 11.8.9. The account metadata association is still with the other temporary website. Obtain Hostinger confirmation of correct private app-to-database reachability before any connection; do not reassign or expose MySQL.

Authentication: `BETTER_AUTH_URL`, strong independent `BETTER_AUTH_SECRET`, exact `AUTH_TRUSTED_ORIGINS`; later customer activation separately requires `CUSTOMER_AUTH_URL` and a strong distinct `CUSTOMER_AUTH_SECRET`. Configure secrets privately and never print a URL/password or put them in a build log/PR/export report.

Storage names: `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_FORCE_PATH_STYLE`, `MEDIA_S3_ORIGINALS_BUCKET`, `MEDIA_S3_DISPLAY_BUCKET`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_BASE_URL`. Private originals and payment evidence must reject anonymous reads and bucket listing; display assets alone may be public. Verify least-privilege object write/read/delete behavior and exact origin CORS. No wildcard production origins. Prove persistence across runtime restart, backup, missing-object failure and exact restoration before acceptance. Do not upload local private state or the original image archive in a Git/deployment package.

Keep `P3_ENABLED`, `P3_CHECKOUT`, `P3_CUSTOMER_ACCOUNTS`, `P3_MOCK_PAYMENTS`, `P3_MANUAL_TRANSFERS`, `P3_REFUNDS`, `P3_NOTIFICATIONS`, `P35_PAYMENT_EVIDENCE` off and `PAYMENT_MODE=DISABLED` until separately approved. **The current runtime intentionally permits only finite loopback disposable database aliases; hosted commerce cannot be activated by copying local flags.** A restricted hosted synthetic mode and synthetic contacts/fixtures need separate review, not relaxation of the existing guard. Local `P3_STATE_DIR` capture files and loopback SeaweedFS are not hosted infrastructure.

## Identity, history and independently verified backup

Use a Hostinger-supported private runner inside the correct application boundary or separately approved private staging build command. No public migration HTTP endpoint, arbitrary remote MySQL, assumed SSH support or automatic build-time migrations.

1. Read-only `pnpm db:preflight:hostinger` with exact guard acknowledgements specified in the existing Phase 2 plan. Verify connected `DATABASE()`, `CURRENT_USER()`, `VERSION()`, `@@port`, InnoDB, FK/CHECK enforcement, full table inventory and completed migration ledger/checksums. Do not infer current contents from metadata size or earlier phpMyAdmin observations.
2. Stop if empty/unmanaged/unknown/failed/partial history. An approved Phase 2 promotion requires exactly its two historical migrations; a current accepted Phase 3 target requires exactly the four historical migrations. Never insert ledger rows, `db push`, `migrate reset`, or blindly `migrate resolve`.
3. Quiesce writes/jobs. Create a transaction-consistent private full export including `_prisma_migrations`, data, all tables and applicable schema objects. Prefer the supported host export; a private runner may use `mariadb-dump --defaults-extra-file=/PRIVATE/db.cnf --single-transaction --hex-blob --routines --events --triggers DATABASE > /PRIVATE/before.sql` after privileges/contents review. Never put passwords on command lines.
4. Hash the artifact, preserve a separate private copy and restore **that exact artifact** into a separately approved isolated recovery target. Compare table/history/counts and sorted original-column fingerprints, product policies, stock, auth and media references. A checksum alone does not prove recoverability.
5. Run reviewed read-only source/history checks, storing certificates under a nonpublic `P3_STATE_DIR`: `node --import tsx scripts/phase3-promotion-check.ts preflight --out /PRIVATE/preflight.json` is prepared for the exact two-migration Phase 2 baseline. A four-migration current baseline requires a separately reviewed matching preflight mode; do not bypass this existing fail-closed check.
6. Request separate explicit migration approval naming the exact database, source commit, baseline, pending migration filenames/checksums, verified backup and executor. All preparation must be reviewable before asking approval.

## Approved execution sequence — not executed here

After that approval only, use the pinned toolchain and reviewed private environment, invoke `pnpm exec prisma migrate deploy` once. On a two-migration baseline it applies the two Phase 3 and two Phase 3.5 migrations; on a separately reviewed four-migration baseline only the two Phase 3.5 migrations are pending. Do not run the local disposable helper on Hostinger. No seed/import/owner bootstrap hooks are part of the migration.

MariaDB DDL is not an all-or-nothing transaction. Phase 3.5 replaces the old destination index and adds columns/tables/constraints. If any DDL or ledger step fails, stop and preserve the state/logs; do not blindly rerun or mark it applied. Compare exact schema and history and request a reviewed repair/recovery decision.

Postflight must verify all six completed checksums, 47 tables including the ledger for the rehearsed baseline, original-column fingerprints unchanged, FK/CHECK enforcement, nonnegative reserved stock not exceeding quantity, evidence FKs/unique references/revisions/dimensions and note constraints. Independently inspect product totals, 487 mapped drafts/null prices and unchanged FULL_ADVANCE where present; do not claim those counts on a different actual baseline. Verify no customer/owner/import writes occurred.

Restore the **normal build command immediately** if a temporary one-off execution command was approved. Keep auto-deployment disabled. Obtain separate approval for one manual compatible-code deployment of the exact commit using normal `next build --webpack`, then inspect actual deployed SHA, build/runtime logs and SWC helper resolution. Never deploy to the factory domain.

## Restricted acceptance and recovery

Before DB/admin credentials or synthetic writes, independently test anonymous/invalid/valid Basic requests for storefront, admin, API, private media, JS/assets and missing routes; missing config must fail closed. Basic staging access must never confer staff authority. Check no-store/noindex headers, actual host robots override and sitemap. Treat the host robots override as a separate issue until verified.

After separately approved owner provisioning and synthetic DB/storage writes, run real owner login/session/revocation/role tests, product publish/read/unpublish, ready-made COD/reservations/last-item race, manual wallet/InstaPay proof privacy/IDOR/replay/grants/rejection/credit-once, new-template deposit versus preserved FULL_ADVANCE, manufacturing/balance/dispatch gates, collection reconciliation, refund separation, notification retry and exact media recovery. Report actual hosted results apart from local mocks and captured notifications.

Stop for identity/history/backup mismatch, incomplete DDL, changed accepted rows, missing media, auth/noindex failure, 5xx/module error or order/inventory/financial invariant violation. Keep failed evidence private, prevent new writes, preserve artifacts and obtain a recovery decision. Prefer reviewed forward repair; any database restore requires separate approval, the verified artifact, a distinct recovery target and matching old application/client. Reconcile post-backup orders before any switch. Do not automatically drop tables/down-migrate or restore over a live target.

## Merchant decisions still blocking live activation

Approve actual receiving account instructions and verified reconciliation operators; specific manager limits, self-approval separation and single-owner operating procedure; COD destinations/carriers/fees/caps/remittance rules; real currency/tax/shipping/discount/rounding contract; deposit/balance collection/cancellation/refund channels and timing without automatic forfeiture; reservation expiry; contact/guest recovery and privacy/evidence retention; approved reliable email/worker provider. International, cards, unofficial wallet/WhatsApp automation and live refunds remain disabled/deferred.
