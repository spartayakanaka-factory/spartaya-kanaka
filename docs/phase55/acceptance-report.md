# Phase 5.5 — PASS for local release acceptance

Date: 2 November 2026. Human owner acceptance and hosted acceptance remain separate, uncompleted gates.

## Decision

| Gate                         | Actual status                                                       |
| ---------------------------- | ------------------------------------------------------------------- |
| Local application acceptance | **PASS**                                                            |
| Phase 2–5 integration        | **PASS**; accepted commits remain ancestors                         |
| Owner usability readiness    | **READY FOR HUMAN REVIEW**, not personally accepted                 |
| Release candidate            | **READY**, exact ZIP/source independently built and started locally |
| Hosted security readiness    | **RUNBOOK PREPARED; NOT VERIFIED / NO PERMANENT REOPENING**         |
| Hosted database readiness    | **GUARDED PLAN PREPARED; NOT CONNECTED OR MIGRATED**                |
| Hosted storage acceptance    | **NOT EXECUTED**; local S3 results do not prove R2                  |

No hosted tools, database connections, HTTP diagnostics, `.htaccess`, environment changes, deployment, DNS/Cloudflare operation, remote push or paid resource was used. Current hosted state is not inferred from old checkpoints. The original staging maintenance protection was not touched.

## Concrete fixes

- Full database inventory search and stable 50-row pagination; searches no longer stop at 300 balances. Real regression fixtures verify the 301st matching item, SKU/slug search, reserved availability, pagination and literal wildcard handling.
- Authenticated complete media-library search with 36-row pages, smaller initial payload, safe display-only responses, Arabic network errors and retry. Selected images/order survive library navigation. Anonymous/unauthorized readers are rejected before database access.
- Legacy image `Content-Type` follows supported file bytes rather than `.jpg` names. Realpath checks reject links outside the preserved asset root. No original was renamed, re-encoded or overwritten.
- Removed the financial form's ASCII-only HTML constraint, while preserving the existing authoritative Arabic amount parser, limits and permissions. The real refund browser flow submits Arabic digits.
- Preserved the original Phase 2 migration/promotion block and added a separate manually approved seven-migration initialization path. It defaults to **prepare only**, rejects unknown source/checksums/nonempty targets, requires the exact staging fingerprint and matching backup/restore attestations, and cannot be called by normal build/start. No migration was run.

## Actual validation

- **338 tests passed, 0 failed, 0 skipped**, including **110 real MariaDB/storage integration tests**.
- TypeScript, ESLint and Prisma validation: PASS. Existing schema and all seven migration files/checksums are unchanged.
- **13 product browser checks**: staff login/rotation, category creation, real S3 upload/private-original denial/persistence, image search/order/unlink, draft find/edit, network interruption/retry, Arabic price, stock, bulk publication, bilingual immediate storefront visibility, unpublish and logout.
- **10 factory browser checks**: customer verification, COD fulfillment/collection/reconciliation, wallet evidence and replay boundaries, InstaPay deposit → production → balance → shipment, private notes/notification capture, shipping/customer controls, **paid cancellation → reservation release → independently authorized mock refund → duplicate rejection/audit**, and two factory visual passes.
- Additional real owner form check: invalid made-to-order lead times rejected without data change; current synthetic policy saved; global policy unchanged.
- Two complete major-screen review passes: **45 screen/width checks and 45 zero-violation axe audits per pass**, 390/768/1440 px. Additional product/factory accessibility audits passed. No page overflow/browser exception; mobile menu and keyboard/focus behavior passed. Arabic and English storefront/checkout/report behavior preserved; the admin shell is Arabic-first rather than falsely described as wholly translated.
- Failure tests include overselling/concurrency, duplicate submissions/callbacks/refunds, spoofed/invalid evidence, expired reservations, invalid transitions, missing tax/shipping/media, account revocation, grant limits, notification failure/transaction rollback, browser network interruption and a genuine loss of **only the test transaction's own MariaDB connection**. The latter rolled back stock, reconnected and prevented a duplicate event. The shared database instance was not stopped.
- Full source package independently extracted into a fresh directory: exact **pnpm 11.24.0**, offline **frozen-lockfile installation**, production `next build --webpack`, standalone typecheck and migration-plan preparation all passed. The earlier preview cache miss was resolved by downloading exact locked dependencies; no upgrade or lockfile change was used.
- Exact final package production server: **46 HTTP checks** with no database/provider/storage credentials. Anonymous/invalid Basic Auth rejected; valid site credentials reached Arabic/English/admin login/assets/robots; privileged APIs stayed denied; source/environment/archive probes returned 404; noindex/robots and original Arabic-image bytes/type passed. This proves local Next.js routing, **not Hostinger's direct mappings**.

## Scenarios A–J

| Scenario              | Evidence/result                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Product lifecycle   | Actual create/find/edit/image/price/stock/publish/storefront browser path, PASS                                                                                                                                                           |
| B Ready-made COD      | Customer checkout, confirmed state, reservation, dispatch, delivery, distinct remittance, PASS                                                                                                                                            |
| C Made-to-order       | Configured synthetic product and owner options, deposit gates, production, balance before dispatch, PASS                                                                                                                                  |
| D Wallet/InstaPay     | Private evidence, explicit separate authority/reconciliation, replay denial, PASS                                                                                                                                                         |
| E Inventory           | Adjustment reason/history, reservations, dispatch/cancel events and authoritative final balances, PASS                                                                                                                                    |
| F Cancellation/refund | Paid cancellation releases unshipped reservation without automatic refund; Arabic request, separate approver/executor/reconciler, audit and duplicate prevention, PASS. Physical return inspection remains covered by real database tests |
| G Shipping            | Synthetic Egyptian service configuration/fee and checkout, PASS; unsupported international ordering correctly rejected                                                                                                                    |
| H Reports             | Real order/payment/shipment rows reconciled to authoritative Cairo-day reports, including cancellation/refund effects and outstanding balances, PASS                                                                                      |
| I Permissions         | Owner/manager/editor/customer/anonymous and independent finance grants/self-approval/session boundaries, PASS                                                                                                                             |
| J Failure recovery    | Real transaction/connection failure and security regressions plus actual browser network abort/retry, PASS within the stated scope                                                                                                        |

## Data/media preservation

All **487 imported records remain present, unpriced and DRAFT**, with original inventory state and mappings preserved. Import rerun behavior is already idempotent; no original was published for these tests. Existing FULL_ADVANCE policies were not converted. Only synthetic local workflow data and a synthetic policy save were written.

All **1,753 actual original image files decode as WebP**, despite retained historical `.jpg`/other names. Catalog MIME metadata was already WebP: **0 metadata corrections needed**, so no data migration was applied. This is consistent with the extraction retaining URL filenames while preserving downloaded WebP bodies, not damaged image content. No intent to encode JPEG is inferred from a filename.

All **1,753 file hashes match the verified off-server media backup**, with 0 missing/different members. The older local checksum manifest also remains unchanged. The verified 37,716,671-byte recovery ZIP and off-server media archive remain available locally. These are not a fresh hosted database backup or a new hosted file inspection.

The safe normalization plan is **no original normalization**: keep keys/URLs/bytes, correct route headers and importer metadata derivation. If a host bypasses the route and infers MIME from extensions, require a reviewed routing correction or separately approved derivative/key migration with a reversible mapping. Do not rename the preserved archive. No R2 writes were performed.

## Release candidate

- Source commit: `bda268c841b28309486b600e2ea90f79a8065745`.
- Local branch: `codex/phase55-release`. Runtime members still match that source commit; later report/test-evidence checkpoints do not change the deployed payload.
- ZIP: `/Users/zuriki/Desktop/Desha Kanka/.local/phase55/releases/sprtaya-phase55-bda268c841b2.zip`.
- Size: **1,520,539 bytes**; **184 entries**.
- SHA-256: `9cd86bd8eb6a2222c792c68b79e52a1820b6e592fbb193ffac61468e3b7164c7`.
- Integrity, member hashes, root structure, Arabic UTF-8 metadata, Unicode normalization collisions and unsafe paths: PASS. Source/build/ZIP scans found no known private credentials or credential patterns. All required runtime source, lockfile, Prisma files and operational script dependencies are included; original product media stays external and preserved.
- No dependencies or framework versions were upgraded. Normal Node 22 / Next 16.4.3 / pnpm 11.24.0 / `.next` configuration is preserved; no new infrastructure/authentication system was introduced.

## Limits and next owner decision

Actual factory-owner acceptance, current Hostinger routing/security, fresh hosted database state/backup/restore/grants, real R2 application persistence and a supported approved migration runner remain external gates. International terms, real merchant prices/stock/fees/tax, provider activation and external notifications remain subject to their existing separate decisions; no live payment/refund is claimed.

**Next:** conduct the short Arabic local owner review. Then, if accepted, separately approve one bounded hosted code/security acceptance window using this exact ZIP and the runbook's publication/static-mapping residual risk, automatic maintenance restoration and no database credentials. Only after that security result should temporary read-only database configuration be approved. Backup/migrations, owner creation/imports and hosted synthetic commerce are later explicit gates. Permanent reopening and live commerce remain NO-GO.

## Deliverables/evidence

- [Owner usability report](owner-usability-report.md) and [Arabic human checklist](owner-checklist-ar.md).
- [Integration report](integration-report.md) and [commit provenance](integration-provenance.json).
- [Release requirements](release-requirements.md), [immutable release record](release.json), [fresh clean validation](clean-validation.json), [exact-package runtime evidence](package-runtime.json).
- [Hosted approval-gated runbook](hosted-acceptance-runbook.md), [reviewed migration preparation](migration-preparation.json).
- [Regression summary](test-summary.json), [full tests](regression.json), [product browser](product-browser/browser-report.json), [factory browser](factory-browser/factory-browser.json), [owner manufacturing form](owner-manufacturing-browser.json).
- [Responsive pass 1](visual-pass-1/review.json), [pass 2](visual-pass-2/review.json), final [desktop dashboard](screenshots/dashboard-1440.png), [mobile product form](screenshots/product-form-390.png), [inventory](screenshots/inventory-768.png), [order detail](screenshots/order-detail-1440.png).
- [Data reconciliation](data-acceptance.json), [image inspection](media-readiness.json), [full off-server backup comparison](full-media-backup-comparison.json), [security/preservation scan](security-and-preservation.json), [local recovery availability](local-recovery-availability.json).
