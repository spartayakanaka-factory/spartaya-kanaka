# Phase 3 local commerce

**Integration candidate update:** The following snapshot notes are historical. The reconciled worktree now descends from canonical `cea867a0...`; see [integration acceptance](integration/report.md). Its runner defaults private state to `.local/phase3-runtime` inside the checkout and accepts explicit `P3_STATE_DIR`, `P2_RUNTIME_DIR` and `P3_APP_PORT` (3003/3004). It does not assume the snapshot's parent layout. Put the verified Node 22 binary on PATH. QA scripts accept `P3_BASE_URL`, `P3_PLAYWRIGHT_MODULE`, `P3_CHROME_EXECUTABLE` and `P3_AXE_PATH`; use installed Playwright/axe packages or explicitly supplied local tools. The optional local media launcher accepts `P3_WEED_BINARY`. These are local test inputs, not Hostinger settings.

This is the isolated Phase 3 source snapshot of the existing application. It is not a replacement checkout of the GitHub branch. The accepted Phase 2 workspace, its database, and all factory images remain unchanged. No source was pushed and no hosting operation occurred.

Working source: `/Users/zuriki/Desktop/Desha Kanka/.local/phase3/workspace`.
Private runtime: `/Users/zuriki/Desktop/Desha Kanka/.local/phase3/runtime`.
Application: `http://localhost:3003/ar`; account: `/ar/account`; administrator: `/admin`.

## Run locally

Use `scripts/phase3` from this directory. It selects the bundled Node executable when Node is absent from PATH and injects environment variables only from the private disposable environment.

```sh
scripts/phase3 db status
scripts/phase3 media start
scripts/phase3 start
```

Stop the running server before rebuilding, then run `scripts/phase3 build` and `scripts/phase3 start`. The application binds only to 127.0.0.1. The original local Phase 2 app uses a different port and database.

The old `db:migrate:deploy` and `db:migrate:dev` entry points refuse this Phase 3 snapshot before invoking Prisma. Only the reviewed disposable preflight is authorized. Raw Prisma commands are not a promotion procedure.

For automatic local expiry/outbox processing, run `scripts/phase3 jobs --watch` in a second terminal. `scripts/phase3 jobs` performs one bounded pass. The worker accepts only the isolated disposable target and never sends external notifications. No operating-system or hosted scheduler is installed.

For an entirely new disposable environment, the reviewed sequence is:

```sh
scripts/phase3 db setup
scripts/phase3 db backup --verify
scripts/phase3 generate
scripts/phase3 migrate
scripts/phase3 migrate --test
scripts/phase3 exec scripts/seed-database.ts
scripts/phase3 exec scripts/seed-database.ts --test
scripts/phase3 seed
scripts/phase3 media start
scripts/phase3 test
```

The MariaDB launcher reuses the verified portable Phase 2 binaries, with a separate data directory, socket, credentials, and loopback port 33078. The two databases are `sprtaya_phase3_disposable_local` and `sprtaya_phase3_disposable_test`. The application user has grants only on those databases. The verifier restores the exact saved export into two fixed temporary databases on that same isolated server. Stop the local application/maintenance worker and other writers before `db backup --verify`; comparisons against a moving source fail closed. Earlier verification markers are not accepted by the migration guard.

The image storage service has its own filesystem directory and separate private-original/public-display buckets on port 39010. The accepted Phase 2 service and buckets are not used for writes. Original archive images and node_modules are read-only source symlinks by convention; a fresh machine needs the preserved archive and the existing pinned dependencies.

## Synthetic fixtures and login

Only clearly labeled synthetic products receive test prices and quantities. The 487 imported products are not imported into the disposable Phase 3 environment and are not priced or published. The genuine copper photograph attached to each synthetic fixture is illustrative, not a price offer for the real factory product.

The fixture seed generates random passwords privately in `runtime/staff.json`, outside this Git repository. Staff accounts initially require password rotation. Browser acceptance rotates the synthetic staff passwords and updates that private file. There are no default public credentials. Do not copy the file into documentation, screenshots, Git, or a deployment.

Customer registration is restricted to synthetic `.invalid` addresses. Verification and password-recovery messages are captured in private files under `runtime/notification-capture`, never sent externally. A captured verification URL can be opened locally; reset tokens are single-use. Staff and customer identities use separate Better Auth tables, cookie prefixes, secrets, and privileges.

## Environment gates

All server commerce entry points require the exact disposable loopback target and all of:

- `P3_ENABLED=1`, `P3_SIMULATION=1`, `P3_DISPOSABLE=1`.
- `APP_ENV=local`, `STAGING_SITE=0`, `PAYMENT_MODE=MOCK`.
- Private `DATABASE_URL`, `CUSTOMER_AUTH_SECRET`, `MOCK_PAYMENT_SECRET` and `P3_STATE_DIR`.
- `CUSTOMER_AUTH_URL` and staff auth origin matching the local application.

The local runner explicitly enables independent `P3_CUSTOMER_ACCOUNTS`, `P3_CHECKOUT`, `P3_MOCK_PAYMENTS`, `P3_MANUAL_TRANSFERS`, `P3_REFUNDS`, and `P3_NOTIFICATIONS` simulation gates. Missing gates fail closed. International checkout, external notifications, and live providers cannot be activated by these gates. Configured simulation flags are not merchant policy approvals.

Do not promote this Prisma client/schema to the accepted Phase 2 database by toggling flags. It includes additive columns and tables that require a separate E1 promotion review. Existing merchant settings must never be replaced with the fixture policy.

## Validation

```sh
scripts/phase3 validate
scripts/phase3 typecheck
scripts/phase3 lint
scripts/phase3 test
scripts/phase3 build
scripts/phase3 exec scripts/phase3-browser.mjs
scripts/phase3 db backup --verify
python3 scripts/phase3-preservation.py
```

See `acceptance.md`, `implementation.md`, `migration-manifest.json`, `vitest-evidence.json`, `browser-evidence.json`, and `preservation-and-secrets.json` for scope and actual evidence. Tests intentionally retain synthetic records in the disposable test database for inspection; reruns use unique identifiers. The runner never selects an accepted or hosted database.
