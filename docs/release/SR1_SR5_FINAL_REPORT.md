# SR-1 to SR-5 local report

## Outcome: PARTIAL

The restricted-staging runtime is not implemented or accepted. Existing hosted commerce denial remains in place. This branch adds a reproducible local infrastructure isolation probe; it does not add a staging activation path, server-provisioned synthetic identities or orders, staging-only payment/notification providers, or staging storage identity enforcement. See `SR1_SR5_FINAL_ACCEPTANCE.md` and `RESTRICTED_STAGING_ENFORCEMENT_INVENTORY.md`.

## Database architecture comparison and actual probe

The candidate architecture is a dedicated synthetic database with a schema-scoped runtime user, separate migration credentials and independently verified identity. This is simpler than relying on a preliminary marker check followed by potentially different pooled connections. The test does not prove that hosting has configured these controls and does not make claims about access to any production system.

The explicitly opted-in local probe creates two fresh randomly named synthetic schemas and two scoped users on the checked loopback MariaDB 11.8.9 instance. Three pooled connections and a Prisma 7 MariaDB adapter were exercised. The staging user could operate on its own schema but could not read or write the decoy schema, perform DDL, read system user records, or grant additional permissions. A separate decoy user could not connect to the staging schema. Transaction rollback, revoked permissions, and a replacement connection were checked. Only objects created by the probe were deleted afterward. This is an infrastructure experiment, not an application staging runtime or proof of production credential isolation.

## Validation

- Full local regression: **262 passed**, zero failed or pending; **106 cases** belong to enabled database-integration suites. These include real disposable object-storage cases; a storage-specific count was not recorded separately.
- The independent least-privilege probe passed with actual MariaDB, pooled connections and the Prisma adapter. It does not exercise the app's restricted-staging entry points because that mode is not implemented.
- **33 local protected HTTP checks passed** with hosted commerce disabled. Six local protected-storefront checks passed for Arabic and English at 390, 768 and 1440 pixels with axe accessibility checks. These are not synthetic checkout or admin acceptance.
- TypeScript, lint, Prisma validation and a local production build passed. A preservation/secret scan found no changes among the 1,753 original images and 229 accepted source files and no known-secret or credential-pattern findings in its scanned scope. No hosted migration, production payment, external notification or production storage access was performed.
- Earlier local backup/restore and disposable object-store restart evidence remain in `STAGING_REMEDIATION_FINAL_REPORT.md`; no new hosted backup or storage service was verified.

## Remaining engineering and hosting requirements

Implementation remains necessary for an explicit staging runtime; attestation/least-privilege enforcement at actual database, API, server-action, Better Auth and worker boundaries; server-provisioned synthetic identities and orders; mock-only payments and test-only notifications; and staging-only private storage. Only after those controls exist can the required full synthetic ecommerce and bypass tests run. The existing environment flags, a name substring or a marker alone must not be treated as sufficient.

Before any hosted promotion, independently verify the approved staging database and its permissions, create and restore-test its backup, configure and verify durable private storage, resolve the hosting-level robots/routing issue, and obtain separate approval for the exact hosted migration and deployment. Production remains not authorized.

## Source control

Starting commit: `6b8fa2553c9cb54cdc1d0c8a408c830697da36f4`; branch: `codex/staging-remediation`. Determine the final SHA and worktree status with `git rev-parse HEAD` and `git status --short` after the report is committed. No push or merge is authorized.
