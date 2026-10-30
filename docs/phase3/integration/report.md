# Phase 3 final integration readiness

**Overall: PARTIAL for staging promotion. PASS for the completed local reconciliation and executed local validation.** This candidate is ready for source review; it is not permission to activate hosted commerce or live financial operations.

## Source and reconciliation

- Canonical base: `cea867a0df48d0aa145613b0d491b1a779b4ee3d`, branch `codex/hostinger-nextjs-source`, repository `spartayakanaka-factory/spartaya-kanaka`.
- Separate local Git worktree: `/Users/zuriki/Desktop/Desha Kanka/.local/phase3/integration`, branch `codex/phase3-integration`. Its implementation commit descends directly from the canonical commit. No unrelated histories were merged.
- Audited source preserved: `/Users/zuriki/Desktop/Desha Kanka/.local/phase3/workspace` at `1b0bb030a723949b84a96ffbfd644e1e25ac085c` remains clean and unchanged.
- **30/30 original differences resolved**, individually documented with origin, authoritative choice, old/current canonical/snapshot/audited blob identities, final digests and supporting evidence in [the ledger](reconciliation-ledger.md) and JSON companion. The absence of fine-grained history before snapshot `a544885...` is explicitly disclosed.
- The newer hosting repairs are retained: real hoisted dependencies, complete SWC helpers, staging direct images, persistent external archive delivery, private image cache, staging protection and noindex. Canonical-only asset tests/media documentation are retained. The old missing migration wrapper is a safe blocker, not a restored bypass.
- Existing staff actions, price parsing, product/category CRUD, bulk review, publication safeguards, inventory idempotency, media signing and review UI are preserved together with audited commerce fixes. No migration SQL, Prisma schema, dependency version or lockfile was changed relative to the appropriate audited/canonical source.

Additional integration fixes: the actual importer now honors the same `LEGACY_ASSET_ROOT` as the repaired asset route; local runner/QA tools accept explicit environment paths instead of relying on snapshot-specific symlinks/layout. All Phase 3 capabilities are explicitly disabled in `.env.example`.

## Executed validation

| Check | Result / evidence |
|---|---|
| Fresh dependency installation | PASS — pnpm 11.24.0 frozen lockfile, own real hoisted node_modules; reused verified existing pnpm content-addressed cache. Initial empty-cache network attempt hit large-download errors; complete cached install succeeded. No arbitrary node_modules copying or source symlink |
| Runtime | Official checksum-verified Node **22.23.4**, macOS ARM64; `runtime-dependencies.json`. CJS and ESM SWC helpers and Prisma runtime utilities load |
| TypeScript / ESLint / Prisma | PASS; `static-validation.json` |
| Production Webpack build and start | PASS under Node 22, real HTTP on loopback port 3004, no reported page/runtime exceptions. Hostinger Linux/LSNode not newly tested |
| Complete automated suite | **168 passed**, zero failed/skipped, including **71 real database/storage tests** and the canonical asset/staging regressions; `regression-tests.json` |
| Production browser | **19 checks passed**: guest checkout/payment, real customer registration/profile/addresses, cross-customer isolation, staff boundaries, distinct staff refund workflow and bilingual views; `browser-evidence.json` |
| Responsive/accessibility | Two passes at **390/768/1440px**, Arabic RTL/English LTR; **30 axe audits plus 3 final inventory audits**, zero reported violations; screenshots inspected. Not a complete manual accessibility certification |
| Local staging simulation | **23 real HTTP checks passed** on a separate local production process: missing config 503, anonymous/invalid 401, valid storefront/admin-login/robots viewing, noindex, Disallow `/`, and denial of admin/customer operations. Secrets generated in memory; `staging-http-local.json`. This is not hosted acceptance |
| Actual schema comparison | Empty read-only Prisma diff; `schema-drift.sql`. Constraint/index/engine metadata in `database-engineering.json` |
| Promotion and recovery | PASS — restored existing Phase 2 artifact into new schemas on **33078 only**, preserved all original columns in **21 Phase 2 data tables** per schema, including **487 existing product drafts** in the local copy, unchanged prices/stock/policies/media/auth/settings; retained old history/checksums, added two Phase 3 history rows, second deploy idempotent, reserved starts zero |
| Real draft importer | PASS — actual CLI imports **487 drafts with no invented prices** into an empty disposable copy using external image root; rerun leaves all rows unchanged. `promotion-rehearsal.json` |
| Backup recovery | PASS — exact saved pre-change artifact restored again into separate fixed disposable recovery schemas; all original table fingerprints match. Temporary schemas/account removed; no persistent down migration |
| Preservation/security | Original **1,753 archive files unchanged**, audited workspace clean, no known private values/credential patterns in candidate source. Private state excluded from output traces; full SWC metadata/CJS/ESM/exports retained |

Database tests retain real transactions and explicit parallel races for checkout, callbacks and refunds. Framework request context and final-write fault injection are identified in the audit report; persistence is genuine MariaDB/S3. Browser testing uses synthetic identities/orders. No existing persistent database was connected for this integration: the accepted Phase 2 export was read as a private file and restored only to newly created disposable schemas.

The original root has five documented differences from the historical Phase 2 snapshot due to intervening hosting repair/docs; this task does not claim those older hashes still match. It did not modify those original source files. `preservation.json` and the final private manifest comparison distinguish these from this integration's work.

## Hosted evidence review and remaining gates

Reviewed the 29 October repair report and its sanitized local evidence. It records build `01a188e1-e80f-714d-8e7b-56c7588e9d91`, commit `cea867a0...`, 13 focused regressions, verified response/auth/image repair and **1,753 persistent image hashes matching**. No Hostinger connector mutation or hosted deployment was made during this integration. Those prior hosted results are not new Phase 3 acceptance.

1. **Auto-deployment is reported enabled.** It must be disabled and verified before any later publishing. This task did not change the setting.
2. **Robots platform override remains explicit.** Hostinger's temporary domain still replaces application robots with a wildcard-Allow response in the reviewed evidence. Local app Disallow/noindex is proven; platform correction or an explicitly reviewed private-staging exception is still required. Never treat this as public-release acceptance.
3. **Persistent schema promotion is unapproved.** Actual current hosted database/history is unknown here; do not assume historical empty state or successful Phase 2 migrations. A verified export, exact target preflight, reviewed execution method/runner, exact migration approval and separate application deployment are required. Flags alone cannot make the new Prisma client compatible with the old schema.
4. **Hosted Phase 3 activation remains intentionally blocked.** The current runtime guard only permits the exact local disposable target. A separately reviewed restricted staging simulation mode is required before hosted acceptance; copying local flags must not bypass it.
5. **Image delivery and new uploads differ.** The repaired persistent archive is retained. Real new-admin-upload S3 endpoint/buckets/scoped credentials/CORS/durability acceptance remains separate; local storage acceptance is not hosted upload acceptance.
6. **Merchant operations remain disabled where unresolved.** Actual contact/recovery, tax/rounding/deposit components, shipping/COD terms/holds, transfer/refund rules, named cumulative financial limits, privacy/retention and notification channels remain pending. International/live gateways/real notifications stay off. See [the exact register](merchant-decisions.md).

## Approval-ready procedures and next step

- [Database migration and recovery plan](database-promotion-and-recovery.md): identity/history/export gates, tested additive SQL digests, no destructive rollback, explicit stop on failed DDL/history.
- [Staging checklist](staging-checklist.md): environment names only, runtime/media/auth checks, robots exception, deployment/rollback evidence and no automatic deploy.
- [Merchant register](merchant-decisions.md): approved scopes, safe disabled states and four bounded approval groups.

**Next approval:** authorize disabling/verifying staging auto-deployment and publishing this exact reviewed candidate to a separate GitHub review branch, with no merge, migration or deployment. Re-fetch the canonical head first; if it changed, reconcile and rerun affected checks. A later E1 approval must name the actual database/history, verified backup, exact pending migration digests and approved execution method. Hosted simulation activation, new media uploads and manual deployment require their own bounded approval. No live collection/refund or production approval is implied.

Exact local implementation/evidence commit hashes are recorded in `git-references.json` and the completion response. GitHub was read only; no push/merge/force-push occurred. Hostinger, databases, DNS and the original factory website were not modified.

## Technical references

Local installed Next.js 16.4.3 output/data-security guides were reviewed before integration. [Prisma 7 requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements) include Node 22.12+; actual Node 22 local execution is the evidence above. [pnpm configuration](https://pnpm.io/settings) locates nodeLinker in pnpm-workspace.yaml. These references do not certify Hostinger's response routing or database state.
