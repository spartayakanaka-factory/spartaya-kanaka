# Restricted staging promotion — prepared, not executed

This procedure is an approval packet, not authorization. Preserve the working Phase 2 deployment until database/client compatibility is proven. The new Prisma client cannot safely read an old schema merely because commerce flags are off.

## 1. Source and deployment isolation

Hostinger currently reports Git auto-deployment enabled. Obtain authorization to disable it; verify disabled via read-only deployment state, repository integrations and relevant branch triggers. Never push while isolation is uncertain. Canonical must remain `cea867a0df48d0aa145613b0d491b1a779b4ee3d` or be reconciled first. Create the requested review branch from the reviewed local commit, push without force, open a draft PR to `codex/hostinger-nextjs-source`, and execute validation-only CI. Do not merge.

CI requires an ephemeral Linux Docker-capable runner, Node 22, pinned pnpm, browser system dependencies and access to official MariaDB 11.8.9/SeaweedFS 4.51 images. The new workflow has no deploy operation or real merchant credentials. Linux bootstrap still requires its first actual run; do not treat macOS tests or its isolation unit tests as that run.

## 2. Identify the exact database and create a verified backup

After separately approved private runtime access, inspect server-side target names without printing credentials. Required designated fingerprint: `DATABASE_TARGET=hostinger-phase2-test`, database `u858869017_sprtaya_phase2`, designated user `u858869017_sprtaya_test`, internal `127.0.0.1:3306`, MariaDB 11.8.9. No unrestricted Remote MySQL. The association with another temporary website must be reviewed with Hostinger; do not reassign it or assume the Node app can connect.

Read-only identity SQL:

```sql
SELECT DATABASE(), CURRENT_USER(), VERSION(), @@port,
       @@default_storage_engine, @@foreign_key_checks,
       @@check_constraint_checks;
SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME;
```

Inspect `_prisma_migrations` only if present. For an accepted Phase 2 database require exactly the two completed historical names/checksums in `docs/phase3/migration-manifest.json`, no failed/rolled-back/unknown row. Empty or unmanaged state stops this two-migration promotion: request an explicitly different baseline approval. Do not manufacture history with inserts, `db push`, `migrate reset` or blind `migrate resolve`.

Quiesce writers/workers; preserve schema and history inventory. Use a Hostinger-supported private export or phpMyAdmin Custom SQL export including all tables/data/history/triggers and applicable routines/events, with transaction-consistent InnoDB data and no concurrent DDL. If a private command runner is supported, an example backup operation is `mariadb-dump --defaults-extra-file=/PRIVATE/db.cnf --single-transaction --routines --events --triggers --hex-blob DATABASE > /PRIVATE/phase2-before.sql`. The file contains no command-line password. Review privileges and completeness; do not run this from an unsupported SSH assumption.

Download to trusted private storage, SHA-256, retain a separate copy, then restore that exact artifact into a separately approved isolated recovery target. Verify inventory/history/counts/original-column row fingerprints. A hash alone is insufficient. Never put SQL exports, `db.cnf`, URLs, credentials or raw user rows in Git/CI artifacts. Do not restore over the live target.

## 3. Read-only preflight and approval certificate

Set private server-side variables for the exact target and a nonpublic `P3_STATE_DIR`. Execute inside a **reviewed private supported runner**, not a public HTTP maintenance endpoint. No such hosted runner has been authorized/executed in this task.

```sh
pnpm exec tsx scripts/phase3-promotion-check.ts preflight \
  --out /PRIVATE/state/promotion-before.json
```

This command only reads the DB and writes a private certificate. It verifies configured/connected identity, exact version, FK/CHECK/InnoDB, migration-source checksums and completed Phase 2 history. Both pre/post modes were executed in the disposable local restore rehearsal. Historical legacy entry points deliberately refuse this Phase 3 target; raw CLI is not an authorized bypass.

Supply for E1 approval: exact source/package SHA, target identity, table/history inventory, export and independent restore evidence, source migration digests, pending names, maintenance window, supported execution method and code/schema recovery pair.

## 4. Migration execution — separate approval required

Approve a narrowly scoped runner that rechecks target, source manifest, preflight and backup certificate immediately before executing the pinned Prisma deploy process. It must have no seed/bootstrap/import/reset hooks and must stop on first failure. This task has **not added or enabled a persistent write runner**.

For an already accepted Phase 2 schema, only pending migrations are:

- `20261029143000_phase3_local_commerce`
- `20261029144500_phase3_cancellation_review`

Prisma must create migration-history rows itself. A temporary Hostinger build-command runner changes a deployment and needs explicit bounded approval plus confirmation that secrets/internal DB are available in that execution boundary. Do not assume SSH, phpMyAdmin SQL execution, a migration build hook, or the normal application build is authorized. Normal `pnpm build` never migrates.

After approved execution:

```sh
pnpm exec tsx scripts/phase3-promotion-check.ts postflight \
  --baseline /PRIVATE/state/promotion-before.json \
  --out /PRIVATE/state/promotion-after.json
```

Require four completed exact-checksum history rows, 45 tables, unchanged original-column fingerprints, FK/CHECK/index review and empty read-only Prisma schema diff. Verify inventory `0 <= reserved <= quantity`, no unexpected orders/payments/refunds, no owner creation/import/policy/price updates. `scripts/phase3-promotion-rehearsal.py` provides the tested disposable reference, not a hosted command.

## 5. Persistent media configuration

Preserve existing `LEGACY_ASSET_ROOT` outside deployment versions and its 1,753 archived files; back up/have permissions verified independently of new uploads. Do not move the archive into Git or ephemeral `.next`.

For new uploads separately approve an existing supported S3-compatible service, private originals bucket, public display bucket/CDN and least-privilege server key. Configure names privately: `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_ORIGINALS_BUCKET`, `MEDIA_S3_DISPLAY_BUCKET`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_BASE_URL`, `MEDIA_S3_FORCE_PATH_STYLE`. No paid service is created here.

Use HTTPS endpoints and exact staging origin CORS; allow signed PUT and required `Content-Type`, `x-amz-meta-owner`, `If-None-Match`, and provider-required checksum headers. Prove signature/conditional-create behavior; do not remove the immutability condition if unsupported. No anonymous original read/list/write. Public displays get read-only delivery; keep write/delete/list scoped to the application as required by existing processing/cleanup. Review orphan retention/versioning/backup policies before enabling lifecycle deletion.

Real provider acceptance: first upload/finalize, duplicate/concurrent finalize, denied repeat PUT, public image/private original, invalid MIME/bytes/size, missing object, product replacement, app restart, object backup/restore and no original archive change. Local SeaweedFS evidence is not certification of a selected provider. Permanent deletion is not enabled until its retention policy is approved.

## 6. Runtime environment and manual application deployment

Names only; never log values. Existing staging access variables and `LEGACY_ASSET_ROOT` were manually confirmed by the user. Configure server-side `APP_ENV=staging`, `STAGING_SITE=1`, access username/password, `BETTER_AUTH_URL`, strong `BETTER_AUTH_SECRET`, exact `AUTH_TRUSTED_ORIGINS`, appropriate `CATALOG_SOURCE`, DB variables and public site URL. Local disposable database/test flags are not hosted settings.

Keep all Phase 3 gates `0` and `PAYMENT_MODE=DISABLED` until a **separately reviewed restricted staging simulation mode** exists. Current commerce guard permits only the exact local disposable target; copying local flags cannot activate staging. Customer/financial secrets, private notification capture and worker ownership require that later scoped approval. Public customer signup/live communications/live providers remain off.

After migration and compatible-code approval, manually deploy the exact reviewed source/package once: Node 22, pnpm 11.24.0/frozen lock, Next 16.4.3, normal `pnpm build` retaining `next build --webpack`, root `./`, output `.next`, existing Hostinger start packaging. Preserve hoisted pnpm and full SWC metadata/CJS/ESM tracing. Do not upload local node_modules, test databases, private state or image archive. Verify actual built/deployed commit and build/runtime logs. Auto-deployment stays disabled.

## 7. Acceptance and rollback criteria

Before DB/admin credentials are enabled, verify missing access config fails closed, anonymous and invalid storefront/admin/API/assets/404 requests reject, valid staging credentials allow viewing but not staff actions, and private no-store/noindex headers survive the actual host. Test `/`, `/ar`, `/en`, `/admin/login`, existing image, JS, nonexistent route, APIs, `/robots.txt`, and sitemap. Use independently authorized credentials held privately. Never create an upload URL merely for anonymous status testing.

Hostinger currently overrides robots with wildcard Allow. Obtain platform correction or an explicitly reviewed private-staging exception while authentication and independent noindex are verified. Do not call crawler acceptance PASS while this persists.

Only after separate simulation/DB-write/owner-provisioning approval execute synthetic customer/owner/manager journeys, product publication, inventory, last-item race, payment proof/duplicate/refund/rollback checks, reservation expiry/outbox worker, image restart and backup recovery. Reuse the local scripts where applicable but **do not loosen their loopback guards** or point fixture seeds at existing merchant data. A hosted-specific synthetic runner needs its own scope. Report hosted results separately.

Stop promotion for identity/history/export mismatch, incomplete migration, changed baseline data, missing media, 5xx/helper errors, missing auth/noindex, order/inventory/financial invariant failure, or incompatible client/schema. Preserve current/previous artifacts, failed DB and sanitized logs. Do not automatically down-migrate or overwrite the DB. Prefer reviewed forward repair; any restore uses the verified artifact in a separate approved target and a matching Phase 2 app/client, followed by separately approved switch. Reconcile any post-backup transactions before switching. No DNS, production, original factory website or live payments are included.
