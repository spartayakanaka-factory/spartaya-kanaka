# Independent Phase 3 acceptance audit

Audited implementation: `6e07948b7b4f47888335b19136813bd610293faf`.
Workspace: `/Users/zuriki/Desktop/Desha Kanka/.local/phase3/workspace`.

**Updated status: PARTIAL. The repaired local simulation passes the executed checks below. Integration and hosted/merchant activation are NOT approved or ready.** No GitHub write, integration, deployment, live payment, accepted-database write or production operation occurred.

## Findings and resolution

Severity is relative to promotion readiness; this audit exercised isolated synthetic data, not real customers or payments.

| ID | Severity | Independently observed problem | Resolution/evidence |
|---|---|---|---|
| A1 | High | Customer order reads returned internal audit notes, staff IDs, owner keys and request digests. A synthetic private finance note was visible to its shopper. | Added explicit customer DTOs on reads/checkout/cancellation/payment responses. Internal events and provider references remain staff-only. Reproduced before fix; denial assertions now pass. |
| A2 | High | A manager with PAYMENT_VERIFY but no RECONCILE grant could reconcile a transfer. | Reconciliation now requires its own RECONCILE grant; current staff/grant rows are checked inside transactions. Reproduced with a revoked reconciliation grant. |
| A3 | High | Banning a staff member did not invalidate their existing session at the shared Phase 2 guard. | Every staff request reads the authoritative current user row and rejects bans/unknown roles/forced rotation. Real-cookie reproduction and positive/negative role regressions pass. Existing staff functionality remains available to permitted users. |
| A4 | High | A valid success arriving after a failed attempt was rejected and rolled back out of the event inbox. Same-key mock retries could also synthesize a fresh success for a failed attempt. | Contradictory facts are durably retained for REVIEW_REQUIRED, without credit. New attempts, replacement credit and fulfillment pause during unresolved receipt review. Failed/unknown terminal retries no longer manufacture success. |
| A5 | High | Backup verification restored a second, fresh dump rather than the saved artifact it certified. That did not prove the published backup's recoverability. | Verifier now restores the exact saved export into fixed temporary databases. Migration approval requires an `exact-artifact-v1` certificate and matching digest. Both 45-table databases restored with matching counts/data hashes. Old certificates are not sufficient. |
| A6 | Medium | Expired awaiting-payment orders could create new attempts before the sweeper ran. | Initiation rejects expired orders without creating a payment row. Late facts remain review-only; an expiry/callback race cannot reclaim released stock. |
| A7 | Medium | Order mutations differentiated foreign IDs (404) from nonexistent IDs (500). Malformed JSON also produced 500s; body limits were applied after allocation. | Uniform missing/foreign 404; malformed input 400; byte-bounded streaming reads reject oversized/chunked/UTF-8 bodies. No internal error details returned. |
| A8 | Medium | Immutable snapshots omitted product-specific manufacturing rules and separate shipping/COD components. | Snapshots now include the actual manufacturing terms, review timestamp, fee components and collection timing. Existing records were not rewritten. |
| A9 | Medium | Cart display depended on the newest 100 public products; older cart items could appear unavailable. Variant prices could be displayed as base prices. | Cart resolves its own product IDs with narrow public data, independently of catalog paging; selected variant price is displayed. Private S3 original keys are excluded from public DTOs. |
| A10 | Medium | Rejected transfer reviews left the claim CLAIMED and blocked a corrected claim indefinitely. | Authorized rejection marks the unmatched attempt failed, retaining its reference/audit. A new corrected reference can be claimed; neither proof alone credits funds. |
| A11 | Medium | New APIs relied on the Proxy for staging Basic Auth even though that execution path is the known hosting uncertainty. | Every new commerce/customer-auth/mock callback handler checks the existing staging gate directly before runtime/database work. Anonymous and invalid requests are tested against handlers without a Proxy. This does not claim Hostinger routing works. |
| A12 | Medium | The keyboard audit found a non-focusable scroll region in inventory. | Named, keyboard-focusable regions added; 30 final axe audits pass after this fix. |
| A13 | Medium | Integration test modules initialized clients even when database tests were disabled; a fresh setup guide omitted test-database role seeding. | Lazy test initialization, explicit role-seeding instruction for both disposable databases, and guarded test collection. No-service run now passes its unit checks and honestly skips database tests. Shared singleton-policy test files run serially; explicit database race tests remain concurrent. |
| A14 | Medium | Finance queues exposed irrelevant steps; inventory called physical quantity “available” and hid order reservation movements. | Queue steps follow state and grants/self-approval rules, transfer references/reasons are visible to staff, refunds/balances/review holds are explicit, and physical/reserved/sellable quantities plus order movements are shown. Arabic design retained. |
| A15 | Low | Expired outbox workers could overwrite another lease's final state. | Completion/retry writes require the current lease. Local capture uses a stable deduplicated filename; no external delivery is enabled. |

Initial targeted run: **7 failures / 2 passes**. The banned-session reproduction added a separate real-auth failure. A temporary test-fixture email collision and a later test-collection/import mistake were corrected as test-harness issues, not counted as product vulnerabilities. Before/after JSON remains available. The audit did not infer acceptance merely from the original 139 passing tests.

## Final validation

- Full local regression: **164 passed, zero failed/skipped**, including **71 real database/storage tests**. Original Phase 2 assertions remain; new coverage challenges bans, distinct finance grants, private DTOs, stale/duplicate payment facts, corrected claims, expiry, five shoppers/one item, twenty duplicate callbacks, eight competing refunds, and rollback after stock/cart/payment mutation.
- The transaction-failure probes deliberately replace only the final notification insertion with an exception while real Prisma/MariaDB work occurs. Both stock/order/cart and payment/inbox/audit changes roll back, then the original request/event can be retried. These are real rollback tests with injected faults, not mocked persistence.
- A separate no-service run passes the unit/static checks and skips the integration tests. See `unconfigured-unit-tests.json` for exact counts; skipped tests are not claimed as database acceptance.
- TypeScript, ESLint, Prisma validation and `next build --webpack` pass. Dependency versions/lockfile remain unchanged. Tested Node is 24.22.1; Node 22/Hostinger is not independently accepted here.
- Real production-mode browser: **19 checks pass**, including two real registered customer sessions and a role-field spoofing attempt, cross-customer reads/mutations denied, customer-to-staff denial, and three distinct staff sessions completing a synthetic refund with self-approval/same-executor reconciliation denied.
- Two responsive passes at 390/768/1440px in Arabic RTL and English LTR. **30 automated WCAG audits, zero reported violations**, including Arabic orders/details/settings/inventory. Screenshots were inspected. Automated checks are not a full manual accessibility certification.
- The final inventory readability refinement was rebuilt and reviewed separately at all three widths: keyboard focus works, the page has no horizontal overflow, and three further axe checks report no violations (`inventory-final-review.json`). Wide inventory columns scroll inside the named focusable region.
- Read-only actual schema comparison is empty. Engine/version, enabled FK/CHECK enforcement, constraints and indexes are recorded in `database-engineering.json`. An actual non-repeatable-read test verifies the commerce transaction helper's READ COMMITTED behavior; server session default is separately recorded as REPEATABLE READ.
- Exact saved backup artifact restored into two temporary databases on the isolated server; 45 tables each match row counts and sorted-data digests. Writers must be stopped for comparison. An attempted comparison while browser writes were active correctly failed and produced no certificate.
- Original 229 recorded Phase 2 files and all 1,753 archive files remain unchanged; 1,752 are product images. Publishing/trace scans contain no known private credential findings. No original archive was added to Git.

## Integration readiness

**Canonical/default branch:** `spartayakanaka-factory/spartaya-kanaka`, `codex/hostinger-nextjs-source`, observed head `254ad4c10cfdd18cf0e1aacc10758ae2206ffa15`. Read through the connected GitHub account. Its complete, non-truncated tree contains 205 blobs. The branch was not changed.

The local snapshot has independent history. Its provenance commit `a544885...` is not a descendant of the canonical commit. **30 canonical paths already differed in the Phase 2 snapshot before Phase 3**; the original Phase 3 head differed in 40 canonical paths. There are additional local-only source/tests/docs. Exact blob comparisons and file lists are in `integration-comparison.json`; the reviewed Phase 2 deltas are in `phase2-drift-review.txt`.

No exported canonical staff action was removed. Product/category CRUD, bulk review, inventory, publication, importer reruns, staff auth, password rotation and real S3 checks remain covered by the regression suite. The initially missing `scripts/deploy-migrations.mjs` was an obsolete migration entry point: restoring it unchanged would bypass Phase 3 safeguards. A compatibility blocker now retains the path and refuses migration execution, like the other old entry points.

### Areas requiring explicit reconciliation

1. **Phase 2 baseline improvements:** Arabic price parsing, published-edit validation, category deletion safeguards, retired-variant positioning/filtering, inventory idempotency, manufacturing policy IDs, media-preview/S3 signing fixes, local tools/tests and documentation. Do not lose these by applying only Phase 3 commits onto the older canonical files.
2. **Staging security:** Proxy, staging decision helper, page fallback and staff-auth configuration matched canonical baseline blobs. Preserve them. Keep the canonical SWC ESM tracing/noindex settings and local private-file tracing exclusions. The audit strengthens staff validation/new handler gates; it does not remove Basic Auth. Live Hostinger protection/response delivery remains unverified and separate.
3. **Schema:** Canonical two historical migrations and baseline schema match the snapshot; the two additive Phase 3 migrations remain byte-for-byte unchanged in this audit. New Prisma generated fields are not backward compatible with the accepted Phase 2 schema merely because feature flags are off. A separately approved E1 rollout is required before pointing this client at persistent databases.
4. **Media:** Existing S3-compatible interface is retained. Local changes correctly sign content type/owner metadata, avoid empty upload checksums, and permit loopback preview URLs. Hosted use requires approved HTTPS endpoints, private originals/public display, CORS/lifecycle/retention, and real persistence verification. The ignored original archive is not in a fresh GitHub checkout.
5. **Configuration:** Exact new variable names are in `environment-names.json`. Never copy private runtime files. `APP_ENV=local`, loopback port 33078, `P3_DISPOSABLE`, `P3_SIMULATION`, MOCK mode and independent gates are local simulation settings. They are not a staging configuration. Customer auth uses its own URL/secret; mock signing uses a separate secret. Existing staging/staff/media variables remain necessary.
6. **Tooling portability:** Local scripts currently assume this nested snapshot, existing verified Phase 2 database binaries, linked dependencies/archive and a locally available Playwright/Chrome runtime. A fresh-clone CI/dev setup must supply these or adapt the local-only tooling under review; do not transfer symlinks/private state or assume this layout exists on Hostinger. No package install or clean Node 22 build is claimed.
7. **Production follow-ups:** Review an expiry query index on `(state, expiresAt)` and pending-payment aggregate workload before scale; no index migration was added/applied here. Provision abuse controls using a verified request-identity/proxy configuration before exposing commerce publicly. The current per-operation grant ceiling is not an approved daily/cumulative merchant limit.

### Safe proposed GitHub procedure — not executed

1. Review this audit and the 30 pre-existing Phase 2 deltas. Confirm which local Phase 2 improvements are the accepted canonical baseline.
2. Verify GitHub auto-deployment/build hooks are disabled before any future publishing. This account setting was not rechecked or changed in this local audit.
3. After separate integration authorization, make a fresh checkout of the canonical branch and re-fetch/re-pin its actual head. Create a new review branch from that head. Do not merge unrelated histories, replace the default branch, reset it to this snapshot, or force-push.
4. Reconcile Phase 2 drift in a dedicated reviewed commit/PR first, preserving all canonical security/working-build fixes. Retain safe migration blockers; do not resurrect the obsolete bypass wrapper.
5. Apply the reviewed Phase 3 source delta as new commits with the canonical lineage as parent. Exclude `.env*` except templates, runtime databases, credentials, original archive, linked node_modules, build output and private captures. Review generated-file paths, local-runner assumptions and environment documentation.
6. In that fresh tree, install the unchanged lockfile with verified pnpm 11.24.0, generate Prisma, run unit tests, recreate approved disposable services/fixtures, run the complete database suite, a Node 22 production build/start, HTTP security checks and responsive acceptance. Compare canonical-vs-result file inventory and migration digests again.
7. Review a PR with deployments disabled. Publishing/PR creation/merge requires separate authorization; none occurred here. Schema promotion, staging runtime configuration, real media service and staging deployment are separate reviewed operations after E1 approval, backup and runtime security verification.

## Exact merchant decisions still needed

Approved planning preferences remain: new manufacturing templates default to 50% with overrides; existing FULL_ADVANCE/drafts/prices/stock unchanged; COD ready-made only; manual and future automated InstaPay/wallet paths; named manager authority without unrestricted privileges. Local mock/capture/disposable implementation was subsequently authorized; earlier planning documents do not approve real operating rules.

| Decision | Required merchant choice; current safe boundary |
|---|---|
| D1 | Required email/phone, verification channel, guest recovery proof and token/session lifetimes. Real guest recovery issuance remains off. |
| D2 | EGP settlement approval, tax/invoice treatment, discounts, component allocations and rounding. The synthetic rate is not an Egyptian tax recommendation. Missing configuration blocks payment. |
| D3 | Select a real/sandbox provider only after separate review; localhost mock interface is already authorized. No gateway credentials/callbacks activated. |
| D4 | COD destinations, carriers, per-order and aggregate ceilings, fees, acceptance deadline, failed delivery and remittance evidence. No manufacturing COD. |
| D5 | Receiving account/instructions, evidence requirements/SLA, partial/over/duplicate payment resolution, rejected/corrected claims and refund channels. Claims alone never credit orders. |
| D6 | Deposit base/rounding, shipping/tax timing, fixed deposit PER_UNIT versus PER_LINE, balance schedule/reminders and production start/cancellation. Earlier plan recommends per-unit fixed deposits; local fixture explicitly uses per-line. Neither is a new merchant approval. No automatic forfeiture. |
| D7 | Actual zones/rate basis, dimensions/weight/carrier/product restrictions, free shipping if intended, surcharges/return fees and collection/refund timing. |
| D8 | Approve split checkout/shipping and disclosed fees, or separately approve compatible combined schedules. Current implementation splits ready-made/manufacturing checkout. |
| D9 | Actual holds/deadlines, extensions, expiry, late/unknown receipt resolution, abuse limits and operational worker ownership. Fixture timeouts are not defaults. |
| D10 | Cancellation/return entitlements and cutoffs by production/fulfillment state, inspection/restock, tax/shipping credits, refund timing/fees/channels/disputes. Live refunds/unsupported adjustments stay off. |
| D11 | Named owner/manager operations, per-order/daily/cumulative/currency limits, delegation/expiry/revocation, approval separation and escalation. Self-approval and same-executor reconciliation remain denied. |
| D12 | Actual bilingual channels/recipients, sender/consent, retries and delivery evidence. Only private local capture is authorized now. |
| D13 | Retention, erasure/export/anonymization, evidence/log/token lifetimes, consent and public privacy wording. No automatic financial-history deletion. |
| D14 | Countries, approved shipping/payment/FX/customs responsibilities, timing/refund terms and manual confirmation authority. International checkout remains off. |
| D15/E1 | Separately approve integration, exact persistent target/schema promotion, backup/recovery, staging security/media/runtime and any later deployment. Current execution remains local only. |

Wholesale/custom manufacturing enquiries remain telephone-only. No quotation platform, customer PII import, paid resource, live provider, real notification, Hostinger database operation or production change was introduced.

## Evidence / local commits

`before-fixes-tests.json`, `before-ban-fix-tests.json`, `after-fixes-tests.json`, `regression-tests.json`, `unconfigured-unit-tests.json`, `browser-before-a11y-fix.json`, `browser-evidence.json`, `database-engineering.json`, `schema-drift.sql`, `compatibility-checks.json`, `integration-comparison.json`, and the screenshot folder support this report. `backup-evidence.json` records the exact-artifact certificate without export contents. Source-file inventory is `changed-source-files.json`.

Fixes and audit evidence are committed only on local `codex/phase3-local`, descending from the audited implementation. Exact final hashes are in `git-references.json` and the completion response. No canonical or remote branch was updated.
