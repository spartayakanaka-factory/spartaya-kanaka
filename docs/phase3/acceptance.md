> Superseded by the [independent acceptance audit](independent-audit/report.md). This report records the original implementation run; the later audit reproduced defects that its 139-test suite did not cover and corrected the backup verification method.

# Phase 3 local acceptance — 2026-10-29

**Overall local Phase 3 status: PARTIAL. The implemented, authorized local simulation passes its recorded tests. Merchant activation and the intentionally disabled capabilities below are not accepted. Hosted acceptance remains PARTIAL and was not exercised in this run.**

The work proceeded through M1–M6 in a separate source snapshot and disposable MariaDB environment, preserving the accepted Phase 2 application and database. No deployment, Hostinger operation, DNS change, live payment, real notification, production write, or GitHub push occurred.

## Milestone results

| Milestone | Result and evidence | Boundary |
|---|---|---|
| M1 schema, money, inventory | PASS locally: two additive migrations, 45-table schema, explicit BigInt money rules, named FKs/CHECKs, row locks, reservations, immutable order snapshots, ledger/audit and recovery structures. Read-only Prisma schema diff is empty. | Applied only to the two disposable databases on port 33078; E1 promotion not approved. |
| M2 customer accounts | PASS for synthetic users: separate Better Auth realm, verification, throttled login, logout, profile/address persistence, reset-token replay rejection and session revocation. | Real guest contact/recovery issuance and account retention/erasure policies remain disabled/pending. |
| M3 cart and checkout | PASS locally: browse/add/change/remove/merge, persistence, quotes, stock/pricing/tax/shipping checks, guest and registered ownership, checkout retries, splitting incompatible schedules, cancellation review. | Complete synthetic policy required. No real catalog prices or international checkout. |
| M4 payments and recovery | PASS for implemented mock/manual simulations: signed events, replay/amount/currency checks, duplicate protection, unknown/failure handling, initial/balance accounting, four-stage transfer/refund review, separate COD collection/remittance. | Live providers, real payment instructions, financial adjustments, and policy-dependent post-production refund/cancellation paths are OFF. |
| M5 admin | PASS for implemented local workflows: Arabic order list/filter/detail, recipient/shipping data, manufacturing/fulfillment actions, finance/cancellation queues, explicit delegated grants, audit and captured notifications. Three separate authenticated staff sessions completed a synthetic refund. | Real authority limits, entitlements, carriers and operational policies remain unapproved. |
| M6 acceptance | PASS for executed checks listed below, including real database/storage tests, concurrency, production server, responsive UI and backup restoration. | This is not production or Hostinger acceptance. |

## Executed checks

| Check | Actual result |
|---|---|
| Accepted Phase 2 baseline before structural changes | 101/101 passed, including 20 real database/storage tests, on separate disposable services. Only hardcoded test target/storage isolation checks were adapted; assertions remained unchanged. |
| Final complete suite | **139 passed, 0 failed, 0 skipped**. This includes **51 real MariaDB/storage integration tests** and 88 unit/static/entry-point checks. |
| Financial/concurrency tests | Two shoppers competing for one unit; simultaneous same-key checkout; signed event replay and distinct success replay; concurrent refund-capacity requests; duplicate refund reconciliation; expiry/late success; COD dispatch/return idempotency; forbidden/self-approved/expired-or-limited authorization paths. |
| Prisma | Schema validation passed; client generation passed; actual disposable schema comparison produces `-- This is an empty migration.` |
| TypeScript / ESLint | Both passed. |
| Production build | `next build --webpack` passed with Next.js 16.4.3 and bundled Node 24.22.1. Prisma 7.10.1, Better Auth 1.7.14 and pnpm pin 11.24.0 preserved; no dependency upgrades or lockfile changes. |
| Production runtime | Real `next start` on loopback port 3003. Final independent smoke: Arabic/English storefront, account and cart 200; anonymous admin 307 to login; robots 200 with `Disallow: /`; noindex headers present. |
| Browser end-to-end | **18 checks passed**, no captured page exceptions. Real guest checkout/mock payment; customer registration/private verification/login/profile/address persistence; owner password rotation/order workflow; three-staff refund with self-approval and same-person reconciliation rejected. |
| Responsive review | Two passes at **390, 768 and 1440px**, Arabic RTL and English LTR. Actual screenshots inspected. Fixed select accessible names and mobile audit-identifier overflow. |
| Accessibility | **27 WCAG 2 A/AA and 2.1 AA automated axe audits**, zero reported violations, covering customer account/cart/checkout and Arabic admin orders/detail/settings. This is automated evidence, not a complete manual accessibility certification. |
| Local maintenance | One real disposable-only CLI pass succeeded; 7 pending notifications captured, zero expired orders in that pass. Optional watch mode is available; no long-running/hosted scheduler acceptance is claimed. |
| Backup/recovery | Both disposable databases restored separately; **45 tables per database** matched row counts and sorted-data SHA-256 digests. Private dumps remain outside Git. |
| Phase 2 preservation | All **229** recorded original files and **1,753** archive files match their pre-run hashes. The archive includes **1,752 actual product images** and one metadata file. No accepted database write target was used. |
| Secret and artifact scan | No known private values or credential-pattern findings in publishable source/evidence. 47 output-file traces contained no private runtime, accepted local-runtime, environment or credential files. |
| Migration safety | Exact disposable host/port/database/current-user/version verification; migration-history digests; no imported catalog; manifest digests; recent verified backup digest required. Old migration entry points now refuse the Phase 3 snapshot before invoking Prisma. |

## Evidence and screenshots

- `vitest-evidence.json`: test results and individual assertions.
- `browser-evidence.json`: all browser checks, viewports, audit targets and violations.
- `production-http-evidence.json`: final independent HTTP status/header checks.
- `migration-manifest.json`, `schema-drift.sql`: reviewed migration digests and schema parity.
- `backup-recovery-evidence.json`: sanitized verified-backup metadata; no database export contents.
- `preservation-and-secrets.json`, `artifact-trace-scan.json`: preservation and publishing scans.
- `changed-files.json`: exact changed-file inventory and hashes (excluding its own recursive hash).
- `screenshots/pass2-ar-checkout-390.png`, `screenshots/pass2-en-cart-390.png`, `screenshots/pass2-ar-admin-detail-390.png`, and desktop/tablet equivalents. `review-mobile-overflow.png` is explicitly a before-fix diagnostic, not an accepted layout.

## Remaining limitations and next decisions

The application intentionally fails closed outside its exact local disposable environment. Do not point this generated Prisma client or source snapshot at the accepted Phase 2 database: E1 promotion requires separate review and approval.

Before merchant activation, finalize actual tax/shipping/deposit/balance rules, guest verification/recovery, COD destinations/carriers/fees/limits/remittance, cancellation/return/refund entitlements, real delegated and cumulative financial limits, privacy/retention, and notification channels. No synthetic figure is an approved business default. Existing FULL_ADVANCE policies, imported drafts, prices and stock were not converted.

Financial adjustments and automatic cancellation after production/dispatch remain unavailable. Refunds stop further fulfillment pending an explicit reviewed operational path. International ordering and real payment collection remain disabled. No live gateway or hosted persistent media service was provisioned. Local S3 persistence passing does not prove hosted storage persistence.

Hostinger's unresolved routing issue is separate and unchanged. Node 22/Hostinger runtime acceptance was not performed for Phase 3. The local snapshot's build warns that the parent workspace's pnpm-workspace.yaml is outside its independent Git root; build and runtime succeeded, and tracing was checked without broadening the root to private data.

## Source and Git references

Source: `/Users/zuriki/Desktop/Desha Kanka/.local/phase3/workspace`.
Local branch: `codex/phase3-local`. No remote is configured in this independent snapshot; existing GitHub branches/history remain untouched.

- Baseline provenance: `a54488513fdbc505367fd35d8db09d42d87eb25d`.
- Core implementation: `f348a827529eeb8b6f78e122ec80dbc691f4feb3`.
- Reproducible local build / source cleanup: `c24944512f58f7bab950cf92f0b09b6fdea8c460`.
- Final implementation including guarded local maintenance: `001e1b25f61e6cd979c572093286a0a7b1b358c8`.

The final evidence is recorded in a subsequent local documentation commit. These are local snapshot commits, not claims of publication to the existing GitHub branch.
