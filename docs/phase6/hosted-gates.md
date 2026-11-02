# Phase 6 — separate hosted approval gates

These are executable procedures, **not authorization**. Only `bisque-pheasant-330767.hostingersite.com` is a target. Keep the current maintenance configuration and automatic deployment disabled. Never repeat spoofable IP allowlisting. No hosted gate was executed in Phase 6.

## Decision before Gate 1

**NO-GO for a protected deployment under the present guarantee requirement.** The accepted Phase 5.5 ZIP contains an importer defect; the corrected local candidate must be reviewed instead. Hostinger may regenerate `.htaccess` during publication. The present maintenance rule works, but its durability during publication is not established. Continuous monitoring and an automatic restoration guard reduce duration; they do not guarantee zero exposure. No independent upstream gate is currently established on this preview domain.

The smallest proposed approach is existing Next.js staging Basic Authentication, independent staff/customer authorization and private file placement. A separately approved, bounded code/security window with **explicit acceptance of the remaining publication gap** is the practical alternative if uninterrupted blocking cannot be provided. Do not silently reinterpret that alternative as guaranteed protection or carry forward authorization for an older archive. If zero exposure remains mandatory, keep maintenance and require a supported gate outside replaced directories; an independently protected custom staging domain is a fallback requiring separate approval, not work executed here.

Only reviewed client JavaScript/CSS and already-public factory/product/brand imagery could be classified as nonsensitive public static content, and only with owner approval. Private evidence, orders, customer data, source, source maps, credentials, logs and archives must never be classified this way. A public nonsensitive robots response is permitted; the current `User-agent: * / Allow: /` body still needs correction before permanent reopening.

## Gate 1 — release deployment

**Preconditions:** review the new source SHA/artifact in `readiness-report.md`; inspect its delta from accepted Phase 5.5; verify artifact checksum, verified recovery ZIP, off-server media backup, secure owner-held backup of the five existing values, and a fresh private copy/checksum of current maintenance `.htaccess`. Preserve the external shared-media path. Confirm the existing app/build through both hPanel and `hbuilds/current`. No new website, Git reconnection or automatic deployment.

**Authorization:** one manual ZIP deployment of the exact corrected artifact, any explicitly listed nonsecret safety flag changes, and the chosen publication protection/residual-risk decision. This phase grants none of these writes. No database/storage/provider credentials at this gate.

**Actions after approval:** start independent anonymous monitoring before upload. Ensure the tested server-side maintenance restoration guard is running independently of the application and has a fixed deadline. In the existing app use Deployments → Redeploy/Upload new files, not Create app. Upload only the checksum-verified source ZIP. Keep Next.js, Node 22, pnpm 11.24.0, root `./`, script `build`, output `.next`. Preserve all five existing private values and Passenger/Node directives; never replace the full env set with masked API output. If the UI cannot demonstrably preserve them, stop. Keep catalog local, all commerce/customer/mock-payment/manual-transfer/refund/report/notification feature flags disabled; `PAYMENT_MODE=MOCK` alone enables nothing. Do not add isolation attestations without evidence. Build once, record build ID, inspect logs and the actual generated `server.js`/current version target. Hostinger repackages the current release into a standalone-style launcher even though the source config does not request standalone: verify its helpers, Proxy/function output and runtime, rather than assuming local `next start` proves hosted behavior.

**Expected/evidence:** exact release-manifest source/member identity in the deployed build, successful build/start, unchanged five values (private owner verification, names-only report), original media count/path unchanged, no migration/import/bootstrap activity. Keep anonymous probes on Arabic/English pages, admin, APIs, real JS/CSS, representative image and direct source/archive probes throughout publication. Record timings/status only, no auth headers.

**Fail/recovery:** unexpected sensitive response, missing protection/monitoring, env loss, wrong release, runtime exception or altered media: restore the exact maintenance copy immediately, verify protected pages/APIs/static resources return 403, and keep the site closed. Use the app-only recovery below if startup/routing is broken. Do not call a successful build deployment acceptance.

## Gate 2 — hosted authentication verification

**Preconditions:** Gate 1 completed under maintenance; credentials accessed privately; tested restoration guard and independent observer available; inventory of actual emitted assets/direct mappings and source/ZIP locations recorded. No database or external-service credentials. No trusted-forwarded-header authorization.

**Authorization:** one bounded maintenance-to-application-auth diagnostic, maximum duration **65 seconds**, unconditional restoration, no permanent reopening. A shorter proven existing guard is preferable. Do not execute unless that deadline, independent monitoring and immediate rollback can be maintained.

**Actions:** monitor before a reviewed atomic `.htaccess` replacement removing only maintenance denial and preserving all Passenger/Node directives. Test anonymous, invalid and valid site credentials on `/ar`, `/en`, `/admin/login`, `/api/admin/media`, `/api/admin/commerce`, `/api/auth/get-session`, disabled `/api/staging-database-preflight`, emitted JS/CSS, `/icon.svg`, `/assets/…` and any observed direct static mapping. Check private/source/`.env`/Git/package/schema/manifest/ZIP/log/evidence paths even with valid site credentials. Site credentials alone must not allow privileged reads/writes or create upload URLs. No data-mutating probes. Run the exact Arabic image byte/hash/content-type probe in `evidence/arabic-image-probe.json`. Check `X-Robots-Tag`, cache behavior and robots from independent clients, including a repeated anonymous request after a valid response to detect cache leakage.

**Expected/evidence:** protected routes anonymous/invalid 401; valid storefront/admin-login/allowed images 200; staffless privileged APIs rejected; private/source resources absent or denied for everyone. Nonsensitive public static exceptions require explicit owner classification. Storefront pages are noindex, protected responses private/no-store; effective robots disallows all crawlers. A 401 alone does not establish who handled every static route. Retain response status/header/body-hash records, route inventory and layer-specific evidence.

**Fail/recovery:** any sensitive response, ambiguous auth, cache leakage or monitoring loss restores maintenance immediately. Restore unconditionally by deadline even on success; verify original checksum plus anonymous and credentialed 403s on pages/APIs/static paths. Public nonsensitive robots is an accepted exception to maintenance status. Its wildcard Allow body is an indexing defect, not evidence of app exposure. If Hostinger overrides robots after the candidate deploy, correct that supported hosting control only with separate approval; do not claim the app's metadata route overrides an upstream response.

## Gate 3 — connectivity, backup and database initialization

**Preconditions:** Gate 2 passed, exact server identity verified and private database-use/grants impact reviewed. Target is database `u858869017_sprtaya_phase2`, user `u858869017_sprtaya_test`, `127.0.0.1:3306`, target label `hostinger-phase2-test`. Magenta-magpie association needs no reassignment; do not touch it. One user per database means privilege reduction cannot be assumed safe. The historical empty state is unverified today.

**Authorization in two parts:** first approve private connection configuration and authenticated **read-only** preflight; then separately approve fresh export/disposable local restore verification and the exact seven schema migrations with backup/source hashes and execution boundary. Do not collapse connectivity approval into migration approval.

**Actions (read only first):** preserve existing values; add only `DATABASE_URL`, `DATABASE_TARGET`, temporary `STAGING_DB_PREFLIGHT_SECRET` (unique, at least 32 characters), never in public env/URLs/logs. Use Basic plus private `x-staging-db-preflight-token`. Verify `DATABASE()`, `CURRENT_USER()`, engine/version, port, InnoDB, FK/CHECK enforcement, current table inventory and existing ledger rows/checksums. Inspect account grants/use privately. Invalid/missing site/token auth must fail. Disable the temporary token and verify it is disabled afterward.

**Backup/migration:** before an apply approval, validate the chosen inside-host execution boundary using only the read-only preflight. Runtime connectivity does not prove a separate build container shares that endpoint. If a temporary build boundary is used, review its full command/output behavior: it must produce the normal `.next` output as well as the approved operation, preserve maintenance, and restore the normal build setting. A migration-only build that changes the schema and then fails for missing output is not an approved procedure. Require `NODE_ENV=production`, `APP_ENV=staging`, `STAGING_SITE=1`, `PAYMENT_MODE=MOCK` and disabled commerce/notification flags; separately approve these nonsecret settings if needed. Then obtain a fresh consistent export with structure/data/triggers/constraints, SHA-256 and off-server private copy; restore into an isolated disposable local database and compare inventory/ledger. No reset or restore into an existing persistent database. Review errors, selectors/definers and privileges, never ignore failed export statements. The guarded packaged commands are:

```sh
pnpm db:migrate:phase55 --prepare
pnpm db:preflight --confirm-hostinger-phase2-test
# Only after separate migration approval, inside the supported hosted runner:
pnpm db:migrate:phase55 --apply --confirm-hostinger-phase2-test --approve-reviewed-staging --expect-empty-database --approve-phase55-initialization --backup-reference=sha256:BACKUP_SHA256 --restore-verified=sha256:BACKUP_SHA256 --approved-source=APPROVED_RELEASE_COMMIT
```

`--prepare` is local-files-only and has passed. Apply uses the exact packaged source, all seven SQL checksums/lexical names, disabled commerce, backup/restore attestations and a fresh empty-target preflight. Those attestations do not independently prove a real backup. Use only the approved one-off Hostinger runner/build boundary; no interactive npm-over-SSH assumption. A build boundary needs its own reviewed procedure and immediate restoration of normal `build`; migrations never become the regular build/start script. The generic old `db:migrate:deploy` remains intentionally blocked for this release. Do not paste SQL or fabricate Prisma history in phpMyAdmin.

**Expected/evidence:** use [verification-readonly.sql](verification-readonly.sql), observing its ledger/import preconditions, and compare with [the seven-migration manifest](../phase4/migration-manifest.json). Fresh preflight zero tables/no applied ledger and seven pending names; successful approved application records seven successful Prisma ledger rows with matching checksums. Verify expected tables/indexes, InnoDB/FKs/CHECKs and no pending/failed/unknown migration. Record runner/build setting restoration. No seed/import/owner creation. Initializer rerun rejects the nonempty database without writes. Only read-only preflight is used for subsequent verification.

**Fail/recovery:** nonempty/drifted/foreign/failed target or mismatched backup/source stops before apply. Partial DDL failure is not assumed transactional on MariaDB: preserve maintenance, inspect actual schema/ledger, and request a reviewed forward repair or separate restore approval. App ZIP rollback does not undo schema/data. No automatic DOWN/reset/DROP, credential/account replacement or privilege changes.

## Gate 4 — product and media import

**Preconditions:** approved schema verified; original-media backup and Arabic integrity probe available; private R2 bucket separation/credentials reviewed if new uploads are enabled. Fix source is required: the accepted old CLI references undefined image metadata. All original image bytes remain untouched, including WebP content named `.jpg`.

**Authorization:** explicit 487-draft/category/media-metadata import and rerun; separately scoped synthetic R2 object tests/upload configuration. No originals/customer evidence uploaded externally, publishing, prices or stock changes.

**Actions:** first `pnpm catalog:import --dry-run` with preserved `LEGACY_ASSET_ROOT`; inspect missing paths and exact 487 draft plan. After data-write approval only, `pnpm catalog:import --apply --confirm-hostinger-phase2-test`. Verify categories hidden; all 487 operational prices null and status DRAFT; source mappings/gallery/metadata match originals. Rerun and prove no duplicate or existing-record mutation. Existing FULL_ADVANCE policies and stock states must remain unchanged.

For private R2 use **actual code names**: `STAGING_R2_ACCOUNT_ID`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION=auto`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`, `MEDIA_S3_FORCE_PATH_STYLE` (explicit validated boolean), `MEDIA_S3_ORIGINALS_BUCKET=sprtaya-staging-private`, `MEDIA_S3_DISPLAY_BUCKET=sprtaya-staging-public`, `MEDIA_PUBLIC_BASE_URL=https://bisque-pheasant-330767.hostingersite.com/api/staging-media`. Both buckets remain private; credentials limited to these buckets. Do not use the erroneous `MEDIA_S3_ACCESS_KEY_ID`/`MEDIA_S3_SECRET_ACCESS_KEY` names. No credential values were inspected in this phase.

Test tiny synthetic uploads, authorized short-lived signed operations, anonymous raw-object denial, forbidden evidence/display cross-access, exact WebP retrieval and bounded upload/finalization validation. Restart/redeploy acceptance requires another approval: prove the same object and DB metadata survive it before cleanup of only approved test keys. Token possession grants signed-URL access until expiry: do not log signed URLs or call them user authentication. This bearer-access behavior is documented by [Cloudflare presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/); bucket-limited object credentials are supported by [Cloudflare R2 authentication](https://developers.cloudflare.com/r2/api/tokens/). Retain evidence privately. Local filesystem-backed S3 results do not establish R2 persistence.

**Expected/evidence:** import/dry-run/rerun summaries, 487 preserved draft invariants, original checksums, authorized/unauthorized object tests, before/after restart persistence and cleanup evidence. Display route checks site auth and registered derivative keys; evidence remains separate and staff/order authorized. Separate backup/lifecycle expectations for evidence and display objects require owner retention rules, not public bucket activation.

**Fail/recovery:** stop on missing/changed originals, pricing/publication/stock mutation, duplicate import or storage authorization/persistence failure. Disable the affected capability; do not blanket-delete imported records, overwrite originals or empty buckets. Any database restore requires separate approval.

## Gate 5 — synthetic business workflows

**Preconditions:** all previous gates accepted, owner financial rules still enforced and unresolved/live capabilities off. Approved distinct Better Auth/customer/mock secrets and exact staging origins; no public staff signup/default passwords. Independently approve synthetic owner/staff/customer provisioning and explicit allowlists/financial grants. Isolation attestations are recorded only after evidence, never set merely to pass a guard.

**Authorization:** narrowly scoped synthetic database/storage writes and mock feature flags only. Real transactions, provider activation, outbound notifications and publishing imported originals remain excluded.

**Actions:** owner/admin login/forced rotation, Arabic product/category CRUD and price review, synthetic publish/unpublish reflected in storefront without code changes, inventory/reservation races/expiry, eligible COD, made-order 50% template override/deposit/balance rounding, mixed-cart/shipping/tax blockers, manual proof vs verified settlement, duplicate callbacks/refunds, financial separation/self-approval prevention, manufacturing/fulfillment/cancellation, reports and bilingual notification capture only. Use approved synthetic prices/fees/taxes and accounts, never merchant defaults inferred from fixtures. Test customer/guest cross-order access, role revocation, failed transactions and idempotent recovery against real isolated hosted DB/private storage.

**Expected/evidence:** separately label actual hosted DB/storage results vs local/mocked results. Arabic mobile/tablet/desktop browser evidence; invariant queries/audit event references, no outbound delivery, no original catalog/policy/stock mutations.

**Fail/recovery:** disable affected features and restore maintenance as needed. Preserve audit evidence; use reviewed compensating actions for synthetic transactions. No destructive cleanup or old-schema rollback without separate review/approval.

## Gate 6 — human owner acceptance

**Preconditions:** technical/security/business gates passed; factory owner has a separate approved staff account; synthetic test instructions ready.

**Authorization:** owner performs `docs/phase55/owner-checklist-ar.md` using approved synthetic data. This is not authorization for live sales or permanent opening.

**Actions/expected/evidence:** owner personally completes Arabic products, prices/images, orders/payments, manufacturing, shipment, cancellation/refunds, stock and reports at mobile/desktop sizes. Record dated human signoff, failures and exact merchant decisions. Automated browser checks are not owner signoff.

**Fail/recovery:** keep staging restricted, unresolved features off, record usability defects for a local fix and repeat only affected acceptance. No production/DNS/payment promotion.

## Exact app-only rollback procedure

1. Reapply the privately preserved maintenance `.htaccess` **including the exact Passenger/Node directives** atomically where supported. Verify its recorded checksum and 403s on pages, APIs and real JS/CSS/image URLs from an independent client. Do not replace it with a bare deny directive that drops routing configuration.
2. Retain failed build ID/logs without credentials. In the **same app** select manual Upload new files and the verified `sprtaya-recovery-cea867a.zip`; preserve Node 22/pnpm/root/build/.next and all private values. No Git reconnection, auto-deployment or database action. Publication has the same maintenance-gap risk and needs the approved mitigation/risk decision.
3. Build once, verify hbuilds/current matches the restored build, startup/logs, maintenance checksum/HTTP responses and all 1,753 shared files. Do not reopen merely because build succeeded.
4. Recovery source predates Phase 5.5 and is only an app rollback for the no-database deployment. Once Gate 3 changes schema/data, separately assess old-client compatibility before any rollback. Never claim a ZIP restores MariaDB or private R2 objects.
5. Shared media restoration is unnecessary unless damage is proven and separately authorized. The off-server archive remains immutable. No delete/reset/restore has been executed in this preflight.
