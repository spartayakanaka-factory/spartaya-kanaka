# Hostinger Phase 2.2 staging acceptance plan

> **Staging security update:** the currently deployed site is not protected. The source fix is now published to `codex/hostinger-nextjs-source`, but auto-deployment is off and the live app still runs the previous commit. See [Phase 2.3 staging security recovery](phase2.3-staging-security-recovery.md) for the current Hostinger audit, layered source fix, and required one-time rebuild gate.

**State: PARTIAL — database schema remains untouched; the current Hostinger staging deployment has a verified access-control failure.** GitHub branch `codex/hostinger-nextjs-source` now points to `af447d9ecdcf9d5eb3de3eb9844953470b52077f`. Hostinger still serves `fe6e7897ee948ce7805ff81ea253d478ef3ac818`, build `01a181ef-eb61-73fa-9d9e-79e47d78e9fc`. The current source recovery and required next steps are in [Phase 2.3 staging security recovery](phase2.3-staging-security-recovery.md). The database verification/export records below are retained for the controlled migration plan and are not deployment or migration authorization.

## Historical database and staging audit — 2026-10-28

- Hostinger reports the latest Node 22 build completed from `codex/hostinger-nextjs-source` at `b76b1a0618180b366e6a81bfff6c284224a4f492`; automatic deployment is off. The live `/` returns `Internal Server Error`, and runtime logs identify the missing module `@swc/helpers/_/_interop_require_default`. The successful build is not a successful runtime.
- I added only the non-secret `APP_ENV=staging` and `STAGING_SITE=1` variables to the temporary Node app, replacing its previously empty environment. Hostinger restarted the process. The deployed Next.js standalone build still returns its prior `/robots.txt` (`Googlebot` disallowed, wildcard `Allow: /`), so these environment values have not been applied to a fresh build. Source commit `5770075f1ccd5afaf7aaeff1dbb7b5405caff275` adds the missing direct SWC-helper dependency, makes the exact staging hostname fail closed, and returns `Disallow: /` for every crawler. The app has not been rebuilt from this commit yet. Do not consider the current site access-protected.
- A read-only phpMyAdmin query reached database `u858869017_sprtaya_phase2` as `u858869017_sprtaya_test@127.0.0.1` on `127.0.0.1:3306`. MariaDB reported `11.8.9-MariaDB-log`. The database has 0 objects, 0 base tables, and no `_prisma_migrations` table. InnoDB is the default engine, foreign-key checks are enabled, and MariaDB check-constraint checks are enabled. This verifies phpMyAdmin access, not a Node.js application connection.
- Hostinger lists this database as assigned to `magenta-magpie-898879.hostingersite.com`, while the current Next.js site is `bisque-pheasant-330767.hostingersite.com`. Confirm or correct that association in hPanel before configuring the app's database URL.
- I created a manual Hostinger database backup for the exact database and downloaded its SQL gzip outside the repository. The selected backup is timestamped `2026-10-28 01:39` in hPanel; `gzip -t` passed. SHA-256: `c767ba2f8f181067ca259c96495e64ac927bd4a13151af9e85f91343b1d8c166`. The downloaded export contains no application tables because the database is empty.
- Static inspection of the preserved import manifest found 487 product rows, 38 categories (36 currently meeting the source's basic verified-category predicate), 1,752 unique importable image paths, 2,823 gallery references, and no missing referenced files. All 487 products are mapped to draft creation; the importer sets operational prices to `null` and has no stock input. This is manifest/file inspection, not an importer database run or persisted media test.

No migration, schema change, import, owner account, deployment, DNS change, or remote-MySQL rule was created. The two staging lock flags and verified backup are the only Hostinger changes made in this audit.

## Compatibility review

| Component          | Checked version / requirement                                                                  | Hostinger fit                                                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js            | 16.4.3; package requires Node `>=20.9.0`                                                       | Hostinger managed Node apps list Next.js and Node 22/24.                                                                                                                                                                                                              |
| Prisma ORM and CLI | 7.10.1; requires Node `^20.19.0`, `^22.12.0`, or `^24.0.0`                                     | The app engine range is narrowed to `^22.12.0` or `^24.0.0`; select Node 24.x if available, otherwise Node 22.12.0 or newer. The Prisma CLI and `tsx` are production dependencies so Hostinger's build runner can use them even if it omits development dependencies. |
| Database           | Owner-confirmed MariaDB `11.8.9-MariaDB-log`; Prisma 7.10.1 lists MariaDB 11.x as supported    | The `mysql` Prisma provider and `@prisma/adapter-mariadb` are the documented Prisma 7 path for MariaDB. This version is above the schema's MariaDB 10.2.1 minimum for enforced `CHECK` constraints.                                                                   |
| Database driver    | `@prisma/adapter-mariadb` 7.10.1 with `mariadb` 3.5.4; Prisma schema uses `provider = "mysql"` | Prisma maintains the MariaDB driver adapter, and MariaDB's Node connector supports active MariaDB server versions. The exact Hostinger authentication and query behavior still require an approved staging preflight and integration run.                             |
| Better Auth        | 1.7.14, using its Prisma adapter with provider `mysql`                                         | The documented Prisma and MySQL adapters match the app configuration. Real Hostinger sign-in/session behavior remains unverified until the guarded integration suite runs.                                                                                            |
| Hosting mode       | Next.js Node server, `next build` / `next start`                                               | Hostinger lists Next.js as supported. Confirm the plan exposes a managed Node.js web app, the selected runtime, and the correct build/start settings in hPanel.                                                                                                       |

Static compatibility review found no incompatible construct in the committed Prisma schema or SQL migrations for MariaDB 11.8.9. The schema uses MySQL-compatible `ENUM`, `JSON`, `DATETIME(3)`, InnoDB foreign keys, a `FULLTEXT` index on character/text fields, and enforced inventory `CHECK` constraints. MariaDB implements `JSON` as a validated `LONGTEXT` alias; this is supported by Prisma's MySQL/MariaDB connector. Prisma's current schema-language documentation marks authored `@@check` constraints as PostgreSQL-only, so the inventory checks live in the committed MySQL migration SQL. Preserve those explicit constraints; do not regenerate or replace the migration SQL from the Prisma schema alone. Database execution has not been tested. Prisma 7 and the MariaDB driver adapter are pinned in `package.json`.

The owner reports that the previous structure check found no tables. Treat that as a prior observation, not migration authorization: the execution-time preflight must repeat the table and migration-history inspection and stop if either differs.

## Database safety gates

`DATABASE_TARGET=hostinger-phase2-test` is a separate allowlist target. Its database/user pair is checked against a fixed SHA-256 identity fingerprint in code; the raw identifiers and password are not stored in this document or `.env.example`. The fingerprint is not overridable through caller options, and the guard tests use the actual designated database and username plus wrong-target cases. The target is accepted only when all of these checks pass:

- `APP_ENV=staging` and `STAGING_SITE=1`.
- `DATABASE_URL` uses Prisma's `mysql://` URL scheme, the Hostinger-local endpoint `127.0.0.1:3306`, a nonempty password, and the exact designated database and user.
- The connected SQL identity matches that exact pair. The preflight accepts MariaDB 10.2.1+ or MySQL 8.0.16+ because those floors support the committed enforced inventory `CHECK` constraints; the reported MariaDB 11.8.9 passes this version gate.
- Existing tables and `_prisma_migrations` history are inspected. An untracked schema, unknown migration, checksum mismatch, incomplete migration, or rolled-back migration stops the preflight.
- Initial migration commands additionally require an empty target with both reviewed initial migrations pending, `--expect-empty-database`, `--confirm-hostinger-phase2-test`, `--approve-reviewed-staging`, and a downloaded database export whose SHA-256 digest is supplied as `--backup-reference=sha256:<64-hex-digest>`. Placeholders and malformed digests are rejected. The script reruns the read-only preflight immediately before Prisma deploy and verifies that exact initial state.

The digest binds the approval to the exported file but does not prove that a restore succeeds. Keep the export encrypted or otherwise access-restricted outside the repository. The migration script never resets the database or drops existing tables. Do not enable Remote MySQL or add an “Any Host” rule; the app-to-database URL must stay on `127.0.0.1`.

The read-only preflight also requires an InnoDB default storage engine, enabled foreign-key enforcement, and (for MariaDB) enabled `CHECK`-constraint enforcement. It reads the settings for its own connection; it does not change them.

The read-only command is:

```sh
pnpm run db:preflight
```

Only after an explicit review and approval, a backup, and a passing preflight may the guarded migration build command below be used. It requires the exact-empty-state flag, two explicit approval flags, and the SHA-256 digest of the actual database export.

**Do not run either command now.** The owner has confirmed the supported one-off execution path is a temporary Node.js deployment build command. This is still a staging deployment, so it requires separate explicit approval after the access lock and environment have been reviewed. Keep automatic deployments off, and restore `pnpm build` after each approved one-off command.

## Approved command execution method

The owner has confirmed Hostinger's temporary Node.js deployment build command as the supported one-off execution boundary. Hostinger's current guidance says custom package scripts and chained build commands are supported. The local workspace cannot reach the app-internal `127.0.0.1:3306` route, and Remote MySQL remains disabled.

The current source provides `pnpm db:preflight`. For a staging build that retains a runnable Next.js app, set the temporary build command to:

```sh
pnpm run db:preflight && pnpm run build
```

Do not use `pnpm db:preflight` alone as the deployment build command: it does not produce the `.next` output needed by `pnpm start`. Confirm the temporary site is protected by hPanel directory password protection and the app's staging Basic Auth/noindex variables before this build. On a passing preflight, the normal Next.js production build then completes; on a failed preflight, `&&` stops before building. This command deploys the staging app if it succeeds, so it requires explicit staging deployment approval. Review the logs, then restore the normal build command to `pnpm build`.

Only after the preflight log has been reviewed, the pending migration SQL has been reviewed, and a fresh database export has been downloaded and hashed, a separate explicit approval is required before the migration build. The current package script is `db:migrate:deploy` (there is no `db:migrate:approved` alias). Set the temporary build command to the following template, replacing `REPLACE_WITH_64_HEX_SHA256` with the lowercase digest of that exact export before saving it:

```sh
pnpm run db:migrate:deploy -- --confirm-hostinger-phase2-test --approve-reviewed-staging --expect-empty-database --backup-reference=sha256:REPLACE_WITH_64_HEX_SHA256 && pnpm run build
```

The migration script checks both approvals, the exact target confirmation, the empty-database expectation, and the digest format. It re-runs the read-only database identity/version/history preflight, then requires zero tables, zero applied migrations, and exactly both reviewed initial migrations pending before Prisma deploy. Any guard failure stops before DDL and before `pnpm run build`. Trigger this only as a separately approved, manually initiated staging deployment with automatic deployments off. Review the migration/build logs and immediately restore the normal build command to `pnpm run build`. Never leave a migration command configured for later deployments. Do not run migration SQL manually in phpMyAdmin.

Prisma 7.10.1's migration command is `prisma migrate deploy`. It reads the checked-in SQL files in `prisma/migrations`, applies only pending entries, and maintains `_prisma_migrations`; it does not seed roles or bootstrap an owner. Do not replace it with `db push`, `migrate dev`, `migrate reset`, or manually pasted migration SQL. After a successful deployment build, run the read-only queries in [the verification SQL file](hostinger-phase2-post-migration-verification.sql) in phpMyAdmin and keep the output with the sanitized deployment log.

## Access restriction and indexing

**Current status is superseded by [Phase 2.3 staging security recovery](phase2.3-staging-security-recovery.md).** The current deployment returns HTTP 200 to anonymous and invalid-Basic-Auth requests, has no `X-Robots-Tag`, and allows wildcard crawlers. Hostinger lists all four staging environment-variable names, but their values are masked and cannot be verified through the connector. Do not treat the live staging site as protected until the layered fix is rebuilt and public requests are rechecked.

In hPanel, use **Websites → Dashboard → Password Protect Directories** on the temporary website's `public_html` root as an additional request-layer gate. Keep the temporary site's HTTPS certificate active. Do not attach the production domain, edit DNS, or turn on automatic deployments. Verify the Basic Auth prompt, 401 for an unauthenticated request, noindex response header, and `Disallow: /` before staff use.

## Server-side environment variables

Enter values in the temporary Node website's **Environment variables** panel only. Keep all credentials out of GitHub, `.env.example`, screenshots, and this runbook. Do not prefix server secrets with `NEXT_PUBLIC_`.

| Variable                  | Staging setting                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `APP_ENV`                 | `staging`                                                                                                          |
| `STAGING_SITE`            | `1`                                                                                                                |
| `STAGING_ACCESS_USERNAME` | A staging-only Basic Auth username, at least 4 characters.                                                         |
| `STAGING_ACCESS_PASSWORD` | A unique random staging-only password, at least 24 characters.                                                     |
| `DATABASE_TARGET`         | `hostinger-phase2-test`                                                                                            |
| `DATABASE_URL`            | `mysql://<designated-user>:<password>@127.0.0.1:3306/<designated-database>`; percent-encode reserved characters.   |
| `BETTER_AUTH_URL`         | Exact HTTPS temporary staging origin.                                                                              |
| `BETTER_AUTH_SECRET`      | Random high-entropy value of at least 32 characters.                                                               |
| `AUTH_TRUSTED_ORIGINS`    | Exact HTTPS staging origin only.                                                                                   |
| `NEXT_PUBLIC_SITE_URL`    | Temporary staging origin; this public build-time URL contains no credentials.                                      |
| `CATALOG_SOURCE`          | Keep `local` until migrations, import, and catalog review are ready; then set to `mysql` for DB-backed acceptance. |

Do not set `NODE_ENV=staging`; let Hostinger's managed runtime set `NODE_ENV=production`. The dedicated guarded target is the only production-mode exception, and it only recognizes the exact test identity plus the staging markers above. `OWNER_BOOTSTRAP_EMAIL`, `PHASE2_DB_INTEGRATION`, and `PHASE2_HOSTINGER_ACCEPTANCE` are one-off command inputs, not persistent app settings.

## Acceptance sequence after approval

1. **Inspect and back up.** In hPanel, confirm the existing database and user are assigned to the temporary site. In phpMyAdmin, select the designated database and run the first identity/table-inventory queries from [the verification SQL file](hostinger-phase2-post-migration-verification.sql). Confirm MariaDB `11.8.9`, the expected user, and zero schema objects and base tables. Then use **Websites → Dashboard → Backups → Database backups** to download a database backup, or in phpMyAdmin use **Export → Quick → SQL → Go** for a fresh export. Keep the file outside the repository, validate `.gz` files with `gzip -t`, and compute its digest with `shasum -a 256 /path/to/downloaded-file`. Record only the timestamp and digest in the approval record. Prefix the digest with `sha256:` when entering the migration command. Do not use Remote MySQL.
2. **Review the plan and access lock.** Confirm the managed plan, Node 24.x (or 22.12+), app root, pnpm lockfile, build/start commands, and staging-only environment variables. Confirm a reviewed non-main GitHub branch contains the exact source and guard changes, and that the build log installs the pinned Prisma CLI and `tsx` dependencies. Apply hPanel directory protection and keep automatic deployment off. The one-time preflight build command is `pnpm run db:preflight && pnpm run build`; it is a staging deployment and needs explicit approval before use.
3. **Deploy only after separate approval.** Connect the temporary website to the reviewed non-main source branch and the root app directory (the directory containing `package.json`). Build/start as a Next.js Node server; do not select static export. Do not select GitHub `main`, change the production website, or change DNS.
4. **Run preflight.** Through the separately approved temporary staging build, run `pnpm run db:preflight && pnpm run build`. Review the build log's preflight output: MariaDB/MySQL engine and version, storage/constraint settings, table count, exact identity result, completed migration list, and pending migration list. For this reported empty database, expect no tables, no migration history, and both migration files pending; stop on any mismatch. Do not apply schema changes yet. Restore `pnpm run build` as the normal build command after log review.
5. **Review and approve migrations.** Compare every pending migration with the checked-in SQL. Confirm the downloaded export corresponds to the selected database and check its recorded SHA-256. Only then may the owner separately authorize the temporary migration build command above. Never use `migrate reset`, `db push`, or manual SQL that bypasses Prisma migration history.
6. **Seed and create an owner.** After successful migrations, the role seed can run through a temporary build command with `--confirm-hostinger-phase2-test`. The published bootstrap change supports Hostinger's non-interactive runner by consuming matching one-time `OWNER_BOOTSTRAP_PASSWORD` and `OWNER_BOOTSTRAP_PASSWORD_CONFIRM` environment secrets, requiring `DATABASE_TARGET=hostinger-phase2-test`, staging markers, and the explicit target flag, and deleting both values from the process environment before hashing. It never accepts a password argument or prints the secret. After separate approval to create the owner, set the authorized `OWNER_BOOTSTRAP_EMAIL` and these two one-time password variables in the Hostinger environment panel, then use the command template `pnpm run admin:bootstrap -- "OWNER_EMAIL" "OWNER_NAME" --confirm-hostinger-phase2-test && pnpm run build`. Remove the one-time password variables immediately afterward and restore the normal build command. This script has not run against Hostinger; it requires the migrations and role seed first.
7. **Run DB acceptance.** After migration and seed, opt into the synthetic, cleanup-tested DB suite with `PHASE2_DB_INTEGRATION=1`, `PHASE2_HOSTINGER_ACCEPTANCE=CONFIRM_SYNTHETIC_TEST_WRITES`, and `DATABASE_TARGET=hostinger-phase2-test`. With automatic deployment off, set the temporary build command to `pnpm test:integration && pnpm build`, trigger it only after separate approval for synthetic database writes, inspect its log, remove the two one-off test variables, and restore `pnpm build`. It checks MySQL identity/schema/history, Better Auth password sign-in and persisted session, persisted role permissions, transaction rollback, concurrent/nonnegative/idempotent inventory, and a synthetic catalog mapping applied twice without overwriting an owner edit. It does not apply migrations.
8. **Run authenticated owner acceptance.** After a secure owner account exists, verify a bad password is rejected, a valid owner can sign in over Basic Auth and Better Auth, the session survives reload and is invalidated by logout, and `/admin` rejects anonymous users. Confirm the owner can create a uniquely prefixed synthetic product as a draft, save edits and audit entries, publish only after required review/media conditions pass, see it on its staging product/category routes, edit it, then unpublish it and confirm public catalog reads no longer return it. Also verify catalog editors cannot publish, inventory staff cannot write catalog records, and inventory staff can only adjust stock through the inventory permission. Delete the synthetic product and related test records after evidence capture. If secure owner bootstrap or persistent media remains unavailable, mark the corresponding acceptance cases blocked; do not use a mock or local-only image as persistence evidence.
9. **Review importer behavior.** The DB suite covers a synthetic mapping rerun. Separately, run the full legacy importer only if the preserved manifest/image archive is packaged into the protected staging build. Apply it twice against the test database, compare created/skipped counts and mapping counts, and verify reviewed edits/category covers remain unchanged. All imported records are drafts; prices and inventory are not inferred.
10. **Stop for review.** Collect build logs, preflight output, test results, and sanitized screenshots. Keep the site behind Basic Auth and noindex. Do not remove staging protection, switch production sources, publish public products, change DNS, or start Phase 3 without a separate approval.

## Separate unresolved blocker: persistent media

No object-storage provider, credentials, private-original bucket, public-display bucket, CORS policy, or public delivery base is configured. Product publication acceptance requires a valid media relation, but a real upload/read-back/redeploy-persistence test requires that supported storage service first. Keep this blocker separate from MySQL acceptance; do not treat mock tests or local archive paths as persistent media evidence.

## References

- [Hostinger managed Node.js apps and supported runtimes](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Hostinger Node.js app environment variables](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/)
- [Hostinger Node.js app to MySQL connection](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)
- [Hostinger Node.js and Prisma build guidance](https://www.hostinger.com/support/how-to-deploy-prisma-apps-on-hostinger-node-js-hosting/)
- [Hostinger database backups](https://www.hostinger.com/support/how-to-download-backups-at-hostinger/)
- [Hostinger remote MySQL access](https://www.hostinger.com/support/1583546-how-to-set-up-remote-mysql-access-in-hostinger/) — this plan explicitly does not enable it.
- [Hostinger password-protected directories](https://www.hostinger.com/support/1583470-how-to-password-protect-a-website-in-hostinger/)
- [Next.js 16 Node.js requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Prisma ORM 7 system requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements)
- [Prisma ORM 7 MySQL and MariaDB driver adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql)
- [Prisma ORM 7 supported database versions](https://docs.prisma.io/docs/orm/v7/reference/supported-databases)
- [Prisma ORM 7 migration deploy and status commands](https://docs.prisma.io/docs/cli/v7/migrate)
- [Prisma ORM 7 production/staging migration workflow](https://docs.prisma.io/docs/orm/v7/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)
- [MariaDB JSON data type](https://mariadb.com/docs/server/reference/data-types/string-data-types/json)
- [MariaDB full-text index support](https://mariadb.com/docs/server/ha-and-performance/optimization-and-tuning/optimization-and-indexes/full-text-indexes/full-text-index-overview)
- [MariaDB enforced constraints](https://mariadb.com/docs/server/reference/sql-statements/data-definition/constraint)
- [MariaDB Connector/Node.js guide](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/mariadb-connector-node-js-guide)
- [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)
