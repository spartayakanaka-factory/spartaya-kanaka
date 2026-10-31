# Staging remediation — final local report

## Engineering and limitations

The local `codex/staging-remediation` branch starts at `d54c84f372ac70c9931a7609528c68eaa17b545b` and preserves the Phase 3, 3.5 and 4 review stack. The final local SHA is `git rev-parse HEAD` after the report commit; a commit cannot contain its own hash. The starting staging-sitemap protection remains intact. No branch was pushed, no PR merged, and no hosted settings or persistent data were changed.

A read-only staging-database attestation helper now checks an explicitly configured staging target against connected database/user/port and an HMAC-authenticated marker. Fifteen unit cases and one real isolated MariaDB session test cover valid, wrong target, tampered marker and outage paths. The helper is **not wired into commerce**, does not create or provision the marker and is not sufficient to distinguish a copied staging database from real data. See `STAGING_DATABASE_IDENTITY.md`.

Hosted commerce and reporting remain fail-closed under the existing local-only guard. There is no completed hosted staging identity enrollment, order isolation, payment-provider credential rejection, storage identity enforcement or outbound notification-provider guard. Existing local operations use mock payment flows, local notification capture and separate object-storage buckets, but those facts do not establish hosted isolation. A support request for the hosting robots override is prepared in `HOSTINGER_SUPPORT_ROUTING_REQUEST.md` and has not been sent.

The current advisory is unresolved: `pnpm audit` returned one moderate minimatch advisory. In a separate temporary install, the recommended v11 patch exported an object where an existing v3 consumer receives a callable function, so a blanket cross-major override was not applied. See `HOSTINGER_DEPENDENCY_SECURITY.md`.

## Actual validation

- Full local regression: **260 passed, zero failed or pending**, including **106 cases** in the seven enabled database-integration suites. Some of these also exercise the disposable S3-compatible store; a separate total of storage-specific cases was not recorded.
- The new attestation received **15 unit cases and one real MariaDB integration case**. Its test uses a connection-scoped temporary table, not a hosted or persistent database.
- Prisma validation, ESLint, TypeScript and the Next.js production build passed. No new migration was created for the attestation.
- A local protected-server run from the starting candidate passed **32 HTTP checks** and six Arabic/English responsive and accessibility audits at 390, 768 and 1440 pixels. Those browser checks predate the new helper, which is not wired to the runtime. A full synthetic-only hosted-mode commerce browser journey was not run because that runtime does not exist.
- A verified local Phase 3 backup was restored into two fresh disposable schemas. Three later migrations were applied; all seven migration-history checksums and 44-table preservation were verified, a second deploy found no pending work, and restoring the exact backup reproduced the baseline. This did not freshly apply all seven from an empty schema or validate a Hostinger export.
- A separate disposable local object store passed synthetic public/private uploads, anonymous private read/list denial, object-store restart and byte comparison, and object-level backup/delete/restore. This is not a hosted service, an independent durable backup or an app redeployment test.

## Infrastructure and required approvals

The user-designated Hostinger database `u858869017_sprtaya_phase2` was previously observed under a different website with no tables, but it is not an approved connected staging target. Backup and restore, staging media, authenticated hosting routes and the robots override remain unverified or unresolved. Hostinger's real database was not contacted during this remediation workstream and must be checked again before any operation.

Separate approvals are required for: pushing the local branch; selecting or creating an isolated staging database; creating and verifying a hosted backup; initializing any database identity marker; configuring database/storage environment variables; applying each approved migration procedure; selecting or purchasing a storage service; changing hosted routing; and deploying an exact reviewed candidate. None of those actions is authorized by this report. A complete synthetic-only runtime must first be implemented and independently reviewed.

## Decisions

- Local staging simulation: **PARTIAL**.
- Hosted infrastructure: **BLOCKED**.
- Controlled staging deployment: **BLOCKED**.
- Production launch: **NOT AUTHORIZED**.

The fixed S01–S16 matrix is `STAGING_REMEDIATION_ACCEPTANCE.md`; only the explicitly scoped local checks are marked passing.
