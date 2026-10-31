# Restricted staging runtime — local report

## Decision: PARTIAL

The requested restricted-staging runtime is **not implemented or accepted**. Hosted staging is not accepted and production is not authorized. The application still refuses hosted commerce. The existing local-only runtime has not been relaxed.

## Work completed

- The staging-database attestation helper now reads actual database/user/port and the signed marker in a single SQL statement. This removes the risk that those two pieces of evidence come from different pooled connections within the check. The helper is not integrated into commerce, and later operations are not bound to the checked connection.
- The owner reports API now applies the existing commerce guard before attempting a session lookup. A regression test reproduces the previous behavior and verifies disabled staging returns 503 before calling the session service. Site authentication remains in place.
- `RESTRICTED_STAGING_ENFORCEMENT_INVENTORY.md` maps routes, actions, workers and services to their existing controls and missing staging controls. `RESTRICTED_STAGING_RUNTIME_ACCEPTANCE.md` records R01–R11 individually.

No server-controlled synthetic identity enrollment, synthetic-only hosted order context, verified staging storage identity, or hosted payment and notification isolation has been implemented. Existing local mock payments, private object handling and local notification capture remain unchanged; they do not prove hosted safety. No marker initialization, migration or hosted configuration was performed.

## Verification

- **262 tests passed**, none failed or pending, including **106 tests** across the seven real isolated database-integration suites. These suites include disposable S3 tests; the number of storage-specific cases was not separately recorded.
- The database attestation unit and actual isolated MariaDB temporary-table tests passed after the single-statement change. Invalid target/marker and connection failure are covered. The report-route test confirms that disabled staging does not call the mocked session service.
- **33 local production-mode staging HTTP checks passed**, including a valid synthetic site credential reaching the disabled reports route and receiving 503. This is not an enabled restricted-staging commerce simulation.
- Lint, TypeScript, Prisma validation and the production build passed. No new responsive browser or accessibility audit was run in this workstream. Earlier six responsive/axe checks and prior disposable storage restart/recovery checks apply to the preceding candidate, not to a newly enabled staging mode.
- A fresh preservation and secret scan found no changes to 1,753 original images or 229 accepted source files and no known private values or credential-pattern findings in the scanned files. This work did not modify or publish product drafts, original assets, or financial policies.

## Outstanding engineering and source control

The central technical blocker is binding attestation to the actual database connection used by each operation across pooled Prisma queries, transactions, route handlers, server actions, authentication callbacks and workers. Separately, server-controlled synthetic principal enrollment and complete payment, notification and storage isolation must be implemented before enabling staging. A preliminary marker query or Basic Auth alone is insufficient.

Starting commit: `3134988c183f5a3d5f5aa17310cdf85ce981cce2`; branch: `codex/staging-remediation`. Determine the final commit and clean status with `git rev-parse HEAD` and `git status --short` after committing; a commit cannot include its own hash. No push, merge, deployment, persistent migration, real payment or notification is authorized by this report.
