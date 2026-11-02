# Restricted hosted acceptance — executable gates, not execution authorization

Target only: `bisque-pheasant-330767.hostingersite.com`. Previously recorded deployment: `01a198ba-dc6f-725b-a9c2-4d5b254e552a`; it predates Phase 5. No fresh hosted observation or database connection was made in Phase 5.5. Preserve the existing `Require all denied` configuration. Do not repeat the IP diagnostic or use `Require ip` as a boundary.

## Gate 1: source and maintenance release approval

1. Review the exact source SHA, ZIP checksum and member manifest in the Phase 5.5 release record. Verify the ZIP locally with `shasum -a 256` and ZIP integrity before upload. Use only the existing application, Node 22, pnpm 11.24.0, Next 16.4.3, application root `./`, build script `build`, output `.next`. Do not reconnect GitHub or enable auto-deployment.
2. Confirm the current application/build identity in hPanel and preserve its current files, environment values and reviewed maintenance `.htaccess` with Passenger directives. Do not assume an old checkpoint checksum or an empty deployment list proves the current configuration.
3. Preserve the original shared media at `/home/u858869017/domains/bisque-pheasant-330767.hostingersite.com/shared/sprtaya-kanaka-assets`. Keep its verified off-server backup and the previous recovery ZIP available. Phase 5.5 has not reverified hosted files or backups; verify their current availability before a future change.
4. Owner approval must explicitly cover one monitored ZIP publication and its remaining publication-gap risk. `.htaccess` preservation during publication is not guaranteed. This runbook does not authorize that exposure. Never stage credentials or database dumps in `public_html`, `hbuilds`, uploaded source or a ZIP.
5. Keep the five existing values intact: `APP_ENV`, `STAGING_SITE`, `STAGING_ACCESS_USERNAME`, `STAGING_ACCESS_PASSWORD`, `LEGACY_ASSET_ROOT`. Secure owner-controlled backup only; do not replace the complete set through an API. Use `APP_ENV=staging`, `STAGING_SITE=1`, the known staging origin for `NEXT_PUBLIC_SITE_URL` if set. Do not add a database or payment credential for the first code/security acceptance.
6. Explicitly keep `CATALOG_SOURCE=local`; `P3_ENABLED=0`, `P3_CHECKOUT=0`, `P3_CUSTOMER_ACCOUNTS=0`, `P3_MOCK_PAYMENTS=0`, `P3_MANUAL_TRANSFERS=0`, `P3_REFUNDS=0`, `P3_NOTIFICATIONS=0`, `P4_OWNER_REPORTS=0`. `PAYMENT_MODE=MOCK` never enables anything by itself. Do not set hosted isolation attestations or allowed account IDs merely to bypass a gate.
7. Keep maintenance while uploading/building once. Build runs Prisma **client generation**, not migrations. Startup runs Next.js, not seed/import/provisioning. Preserve all existing Passenger directives; no generated replacement `.htaccess` is included in this ZIP.

## Gate 2: bounded hosted security acceptance — separate explicit approval

Application Basic Authentication is compatible with operation without IP whitelisting **only for requests actually handled by Next.js**. Proxy matcher is `/:path*`; assets, APIs, robots, sitemap and server entry points also have the existing appropriate guards. Admin APIs/actions still require staff sessions and permissions. Source preparation cannot prove LiteSpeed routes every file through Next.js.

Before any credentialed commerce acceptance, approve a short, monitored maintenance-to-application-auth test with an unconditional restoration deadline, a server-side rollback guard, the exact known maintenance copy and an independent observer. Do not use a trusted forwarding header or IP allowlist. Do not permanently reopen as part of a diagnostic.

Test anonymous/invalid/valid site credentials on `/ar`, `/en`, `/admin/login`, `/robots.txt`, `/sitemap.xml`, actual emitted JS/CSS, `/icon.svg`, a real Arabic `/assets/…jpg`, `/_next/image?...` if enabled, and the prepared read-only preflight endpoint while disabled. Test `.env`, `.env.local`, `.git/config`, `package.json`, `prisma/schema.prisma`, source files, uploaded ZIP names, backup names, private evidence paths and any observed direct build mapping. Source files/archives/private material must be absent or denied even for a site viewer; an application 404 alone does not prove an alternate static mapping is blocked.

- Anonymous/invalid protected application resources: 401; valid site credentials: 200 for storefront/admin login. Site credentials alone must not authorize admin reads or writes.
- Check `X-Robots-Tag: noindex, nofollow, noarchive`; authenticated robots disallows all crawlers. The owner's prior exception permits a public nonsensitive robots file, but verify its body disallows crawling rather than treating any 200 as proof of exposure.
- For the Arabic image, compare exact original bytes/SHA-256 and `Content-Type: image/webp`; no rename or transcoding is expected.
- No sensitive public response, loss of monitoring, failed authentication, or ambiguous routing is acceptable: restore maintenance immediately, verify application pages/APIs/static mappings are blocked and record checksum/HTTP evidence.

**Unresolved hosted risk:** direct LiteSpeed static mappings and ZIP publication can bypass Next.js. The previous host evidence is incomplete for this candidate. If direct nonpublic files are exposed, stop; move them outside the served root using a supported reviewed configuration or keep maintenance. A custom staging domain with an independently enforced edge gate could materially reduce exposure, but adds DNS/domain/edge configuration and is not authorized or implemented here. It is an optional fallback, not a prerequisite for local acceptance.

## Gate 3: read-only database connectivity — separate approval

Only after Gate 2 passes: privately configure the exact URL for database `u858869017_sprtaya_phase2`, user `u858869017_sprtaya_test`, internal `127.0.0.1:3306`. Hostinger confirmed the magenta-magpie hPanel association does not require reassignment for same-server connectivity. Do not modify magenta-magpie or enable Remote MySQL.

Required temporary names: `DATABASE_URL`, `DATABASE_TARGET=hostinger-phase2-test`, and a unique `STAGING_DB_PREFLIGHT_SECRET` of at least 32 characters. Keep commerce flags disabled and catalog local. Use HTTP Basic site authentication plus the `x-staging-db-preflight-token` header; never put the secret in a URL, browser history, command-line argument or logs. Supply headers through a private in-memory client or a permission-0600 temporary configuration.

Run the authenticated read-only preflight from the actual Next.js runtime. It must verify current database identity, authenticated user, MariaDB engine/version, table inventory and Prisma ledger. Anonymous, invalid site credentials and invalid preflight secret must fail. Disable the temporary secret immediately after testing and verify disabled access. Do not claim the database is empty based on historical reports.

## Gate 4: fresh backup, isolation and migration approval

1. Use the supported inside-Hostinger runner/build execution boundary, not unsupported npm-over-SSH assumptions. Separately approve the exact one-off command and use the existing guarded `db:preflight`; never turn migrations into the normal build command.
2. Verify identity/version, InnoDB and constraint enforcement, current tables/ledger/checksums and user grants. Check whether any other application uses the same database/account before permission changes. The plan allows only one user per database; do not create another or reduce grants without a separate reviewed impact decision.
3. Create a fresh consistent SQL export before schema changes, retain privately off-server, verify SHA-256, parse/integrity and restore into a new disposable **local** database. Compare table/row inventory and migration ledger. Existing historic backups or the media archive are not a fresh database backup. Do not restore into the running hosted database.
4. Compare all seven checked-in migrations against `docs/phase4/migration-manifest.json`, in lexical order. `prisma migrate deploy` owns `_prisma_migrations`; do not paste SQL in phpMyAdmin and fabricate ledger rows. If a partially initialized schema, foreign tables, failed ledger or drift exists, stop and reconcile it before approval.
5. Request explicit migration approval naming database, backup checksum, exact migration list/checksums and one execution method. The migration approval guard and production target protection remain mandatory. Do not weaken a guard to make a new hosted runner work.
6. The old `db:migrate:deploy` intentionally blocks Phase 3 promotion and remains unchanged. Use the separate Phase 5.5 preparation command below. After approval only, the new guarded initialization command accepts an **empty** exact staging target; it rejects an already initialized or partially applied schema. Re-run read-only verification of ledger, foreign keys, CHECKs and expected tables/indexes. A second initialization attempt must reject the now-nonempty target without writes; use the read-only preflight to verify no pending migration. Never bypass that check for a retry. Restore the normal `pnpm build` setting immediately if a one-off build boundary was used. No source package build/start applies a migration.

### Exact migration commands (not executed in this phase)

Without database access, print the reviewed plan:

```bash
pnpm db:migrate:phase55 --prepare
```

Inside the separately approved Hostinger execution boundary, with private server environment configuration and `NODE_ENV=production`, first run:

```bash
pnpm db:preflight --confirm-hostinger-phase2-test
```

After fresh backup/restore verification and explicit approval, replace both `BACKUP_SHA256` occurrences with the same verified 64-character digest and `RELEASE_COMMIT` with the final approved source SHA. These are evidence references, not credentials:

```bash
pnpm db:migrate:phase55 --apply --confirm-hostinger-phase2-test --approve-reviewed-staging --expect-empty-database --approve-phase55-initialization --backup-reference=sha256:BACKUP_SHA256 --restore-verified=sha256:BACKUP_SHA256 --approved-source=RELEASE_COMMIT
```

The command checks packaged source identity, migration bytes, exact database/user/endpoint and disabled commerce, then reruns live read-only preflight before Prisma deploy. Backup/restore flags are operator attestations; they do not independently prove a fresh export or restoration. The seven-item lexical manifest is the application order. Prisma owns history. No production or populated-target path is enabled.

## Gate 5: restricted synthetic application acceptance

This is a separate capability/configuration approval after database and private storage readiness.

- Privately configure Better Auth origin/secret and distinct customer/mock secrets only if enabling the corresponding approved synthetic features. No public staff signup or default password. Bootstrap only a separately approved synthetic owner, force first password rotation and provision explicit synthetic staff/customer allowlists. Grant financial permissions explicitly; managers have no blanket financial authority.
- Cloudflare R2 remains two private staging buckets; do not make the display bucket public. `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`, `MEDIA_S3_ORIGINALS_BUCKET`, `MEDIA_S3_DISPLAY_BUCKET`, and protected `MEDIA_PUBLIC_BASE_URL` need private approved configuration and real hosted tests. Evidence access and signed URLs require independent authorization. This phase performed filesystem-backed local S3 tests, not R2 acceptance.
- Set hosted isolation verification flags only after evidence exists. Keep real providers and outbound notifications off. Use the existing protected staging media route for private display objects. Do not copy the Phase 5 local synthetic tax, carrier, fees, prices or permissive fixture grants into merchant policy.
- Run synthetic scenarios A–J: products, COD, deposits/balances, proof/reconciliation, stock, cancellation/refund, shipping restrictions, reports, role boundaries and failure recovery. Separate site auth from customer/staff identity. Verify real database/storage persistence, independent finance actors, audit trails and no outbound delivery.
- Original catalog import needs its own data-write approval: dry-run first; retain all 487 as unpriced drafts; importer is idempotent and now derives MIME from original bytes. Do not publish originals or invent stock. Compare original checksums and image relationships before/after. No physical normalization/rename is required.

## Recovery

Keep maintenance during recovery. Stop the temporary worker/rebuild if its routing is unsafe; restore the exact recorded maintenance file including Passenger directives and verify independent 403s. Use the previously verified recovery ZIP only through the existing app's manual Upload new files flow, normal build/output settings and preserved environment values. Verify build, startup, protected access, old version identity and shared-image hashes. Do not assume redeploying a Git SHA alone restores files or that ZIP publication preserves the password file.

An application rollback does **not** roll back MariaDB. If data/schema recovery is needed, keep writes disabled, review changes since the fresh backup, and obtain separate restore approval. Prefer forward-compatible fixes; no automatic DROP/DOWN/reset, privilege changes or hosted restore is authorized. Restore shared media from its separate verified backup only if actually damaged and separately approved.

## Exact next owner decisions

1. Complete the Arabic local human-acceptance checklist.
2. Review the final source/ZIP and approve at most one controlled hosted code/security acceptance window with the documented residual publication/static-mapping risk and automatic maintenance restoration. No database credential is needed for this step.
3. After security acceptance, approve temporary private read-only connectivity configuration. Backup, migrations, owner creation, imports, runtime privileges and synthetic commerce are later separate gates. Permanent reopening and live payments are excluded.

## Read-only SQL and private backup reference

Execute only after the relevant hosted read-only approval, through the confirmed internal connection:

```sql
SELECT DATABASE() AS database_name, CURRENT_USER() AS authenticated_user,
       VERSION() AS version, @@port AS port,
       @@foreign_key_checks AS foreign_keys,
       @@check_constraint_checks AS checks_enabled;
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME;
SELECT COUNT(*) AS ledger_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_prisma_migrations';
```

Only if the ledger exists:

```sql
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at,
       applied_steps_count
FROM _prisma_migrations ORDER BY migration_name;
SHOW GRANTS FOR CURRENT_USER;
```

`SHOW GRANTS` is not a privilege change. Retain its output privately; it can contain account metadata. Compare seven names/checksums to the reviewed manifest; any failed/unfinished/unknown row stops initialization.

Prefer a fresh phpMyAdmin custom SQL export including structure, data, triggers and constraints, or a supported inside-host database tool. If `mariadb-dump` is available, a permission-0600 private defaults file avoids command-line credentials:

```bash
mariadb-dump --defaults-extra-file=/PRIVATE/PATH/staging-db-client.cnf --single-transaction --routines --triggers --events --hex-blob u858869017_sprtaya_phase2 > /PRIVATE/PATH/staging-before.sql
sha256sum /PRIVATE/PATH/staging-before.sql
```

These are path placeholders, not permission to upload private files or create a new hosted resource. The export must succeed without ignored errors; verify a real restore into a new isolated local schema, preserving the original dump unchanged. Review any database-selector rewrite into that disposable target; never import the dump into an existing persistent schema. Store the original digest and restore comparison privately before giving the two matching backup attestations to the guarded initialization command.
