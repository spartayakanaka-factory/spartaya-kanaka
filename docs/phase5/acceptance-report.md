# Phase 5 local acceptance — PASS

Date: 2 November 2026. Local engineering acceptance only; no hosted or production acceptance is claimed.

## Scope and workspace

- Branch: `codex/phase5-arabic-admin`.
- Base: `aa593e5370bf77986e8c4f6aeae48fe2cfce3c3d`.
- Workspace: `/Users/zuriki/Desktop/Desha Kanka/.local/phase5/workspace`.
- Local production-mode preview: [admin](http://localhost:3008/admin), [Arabic storefront](http://localhost:3008/ar), [English storefront](http://localhost:3008/en).
- This work uses the integrated Phase 2–4 source and services. The original workspace, canonical source branch and hosted application were not replaced.

## Delivered

- Arabic RTL admin shell with copper/off-white styling, grouped role-filtered navigation, active-page indicators, a mobile menu, an account/logout area, skip link and visible keyboard focus.
- Daily dashboard with actual Cairo-day order counts, published/draft counts, low-stock availability, actionable order queues, authoritative collection/balance summaries, recent registered customers and recent orders. Missing financial data gets an unavailable state rather than a fabricated zero.
- Product list with actual photographs, price and publication status, active-variant availability, type/status/search filters and existing pagination.
- Product form with simple category checkboxes, Arabic price entry, searchable photo thumbnails, ordered image previews, main-image selection and safe unlinking. Uploading preserves a private original and creates the existing display derivative. Removing a selection does not delete an image.
- Order details with canonical Arabic statuses, required upfront amount, verified initial payments, total verified receipts, refunds and the actual remaining balance. Unverified transfer claims are never credited.
- Corrected in-production labels. Routine notification history and the order audit trail are disclosures; failed notifications remain expanded. The order list is now reachable sooner.
- Inventory search and low-stock filtering, actual available/reserved balances and existing adjustment and reservation/dispatch history.
- Owner-only customer search and account history. Exact registered-account ownership is used; guest orders are not automatically matched by phone.
- Shared styling and keyboard table access across staff, categories, customer, shipping/payment settings, audit and Phase 4 reports. Existing Arabic/English report toggle and storefront/checkout routes remain functional.
- Accessible loading/error/empty feedback. Exact integer-string money display avoids precision loss and uses Egyptian Arabic number/currency formatting.

## Existing functionality reused

Better Auth sessions and forced password rotation; role permissions and finance grants; product publication blockers and bulk review; existing image signing/finalization; inventory transactions and stock reservations; canonical order/production/fulfillment transitions; transfer evidence and separate approval/execution/reconciliation; customer suspension/session revocation; shipping settings; notification capture and the Phase 4 reporting calculations. No parallel financial or manufacturing model was added. The report aggregation change is a TypeScript return-type annotation only.

## Confirmed issues fixed

1. In-production items could be labeled complete because the UI checked the wrong canonical state.
2. Tablet filter controls could expand beyond the page.
3. Staff/category/audit tables needed keyboard-scrollable regions.
4. Narrow financial cells inherited horizontal detail-row styling, compressing their labels and amounts.
5. The new customer-history route initially assumed UUIDs; actual Better Auth customer IDs can use another bounded identifier format. The corrected route was retested with real customer accounts and manager rejection.
6. Native filename-only photo selection and category multi-select were difficult to operate. Photo controls and category checkboxes now show clear choices.
7. Long routine notification history pushed the order list too far down the page.

## Validation actually executed

| Check                               | Result                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full regression                     | **325 passed; 0 failed; 0 skipped**, including **106 MariaDB/storage integration tests**                                                                                                                           |
| TypeScript                          | PASS, explicit `tsc --noEmit` and production compiler                                                                                                                                                              |
| ESLint                              | PASS                                                                                                                                                                                                               |
| Prisma schema validation            | PASS                                                                                                                                                                                                               |
| Production build                    | PASS, Next.js 16.4.3 `next build --webpack` on Node 22.23.4                                                                                                                                                        |
| Product browser acceptance          | **12 checks passed**, including real image upload/persistence, photo ordering/unlinking, Arabic price, bulk publish, storefront visibility, stock adjustment and unpublish/logout                                  |
| Factory browser acceptance          | **9 checks passed**, including COD completion/collection, wallet evidence/reconciliation, InstaPay deposit/production/balance, separate finance actors, owner settings and customer account controls               |
| Outstanding-balance follow-up       | PASS: one additional unpaid customer order; exact displayed balance, report inclusion and dashboard queue filtering                                                                                                |
| Final responsive/accessibility pass | **45 screen/width combinations and 45 axe audits**, no page overflow, no violations, no browser exceptions; 390/768/1440 px                                                                                        |
| Additional browser axe audits       | Product 3; factory/customer/checkout/settings 23; all without violations                                                                                                                                           |
| Keyboard                            | Active navigation, mobile menu, Escape/refocus, table scroll regions and native disclosures tested                                                                                                                 |
| Original catalog import             | 487 unpriced drafts; importer rerun skipped all 487 with 0 failures/duplicates                                                                                                                                     |
| Independent local reconciliation    | 10 actual synthetic workflow orders compared against order/payment/shipment rows and Cairo-day reports; positive outstanding balance verified; inventory invariants and final dispatch/reservation balance checked |
| Schema/migrations                   | All 7 existing migration checksums verified; **no schema or migration source changes**                                                                                                                             |
| Secret/preservation scan            | Source/build/trace scan PASS; no known private values or credential patterns; all **1,753 entries** in the original local media manifest unchanged                                                                 |

The media manifest has 1,752 image files plus one pre-existing `.DS_Store` entry. This is the exact local checksum inventory, not a new verification of Hostinger's separately reported 1,753 hosted images.

The initial visual review found the keyboard/table and tablet issues above; subsequent complete passes 2, 3 and 4 passed. Final app-screen measurements have no FAIL findings; one cosmetic warning remains for naturally unequal dashboard panel heights (79 px with this data), without stretching a short panel into empty space.

## Local isolation and data

Only fresh local schemas `sprtaya_phase5_disposable_local` and `sprtaya_phase5_disposable_test` were initialized using the seven existing migrations. A dedicated local user is scoped to these schemas. The existing MariaDB 11.8.9 loopback service was reused; accepted persistent schemas were not migrated or reset.

A separate filesystem-backed loopback S3-compatible service uses port 39410 and separate state. These are real local upload/storage tests, **not Cloudflare R2 or hosted persistence acceptance**. Product photos were read from preserved original assets without modifying them.

Random synthetic owner/manager/customer credentials, signing secrets and storage keys remain in the ignored private sibling runtime directory, with no credentials in this report or Git. Financial grants used by browser fixtures are explicit synthetic grants; they do not alter merchant permissions. Real payments and external notifications remain disabled. Captures stay local.

No Hostinger tools, hosted HTTP diagnostics, database access, `.htaccess`, environment changes, deployments, Cloudflare operations, DNS operations, GitHub pushes or paid resources were used for Phase 5.

## Evidence and changed files

- [Test summary](test-summary.json), [full regression](regression.json).
- [Product browser](product-browser/browser-report.json), [factory browser](factory-browser/factory-browser.json).
- [Final 45-screen review](visual-pass-4/review.json), [previous clean review](visual-pass-3/review.json).
- [Actual data reconciliation](data-acceptance.json), [pending balance](pending-balance-browser.json).
- [Secret/media preservation scan](security-and-preservation.json), [design measurements](design-review.json).
- [Changed file inventory](changed-files.txt).
- [Desktop dashboard](screenshots/dashboard-1440.png), [mobile dashboard](screenshots/dashboard-390.png), [tablet products](screenshots/products-768.png), [tablet product form](screenshots/product-form-768.png).
- [Mobile order detail](screenshots/order-detail-390.png), [customer history](screenshots/customer-history-390.png), [reports](screenshots/reports-1440.png), [inventory](screenshots/inventory-768.png), [unpaid order](screenshots/pending-balance-1280.png).

Full-resolution intermediate screenshots remain local in the visual-pass/product/factory directories. Representative final screenshots are preserved with this report; generated build output, dependencies, private runtime state and redundant screenshots are excluded from Git.

## Re-running locally

Use the reviewed Node 22 executable and this worktree. `scripts/phase5-local.mjs` wraps validation, build, start, tests, storage, seed and script execution with exact schema/port/user checks. `scripts/phase5-migrate.ts` refuses populated data and verifies the reviewed SQL manifest before initialization; it is not a general migration or reset tool.

For a fresh local workstream: initialize the new schemas through the harness, apply the existing reviewed migrations to both empty targets, run `seed-database.ts` for both targets, then run the Phase 5 fixture seed and Phase 3.5 browser fixture preparation before importing original drafts. The fixture seed deliberately refuses imported data on first initialization and preserves existing private fixture credentials on reruns. Do not run generic seeds against accepted or hosted databases.

Use the Phase 5 product/factory/UI-review scripts against the running local production server. Real staff and customer passwords are never shared/default values; retrieve only the local synthetic account details privately from the sibling runtime if conducting owner UAT.

## Remaining limits and next action

- This is local engineering acceptance. The factory owner has not yet completed personal usability acceptance. Recommended next step: owner-led local UAT using these workflows and the private synthetic account.
- Inventory retains the existing 300-balance display bound, and the photo picker searches the library loaded by the existing product page (up to 200 library records plus the product's selected images). Product list, bulk review, customers and customer history use pagination. Complete media-library search or broader inventory pagination is a separate improvement.
- Existing production tracking supports order-level manufacturing states and internal notes; no per-machine scheduling or new production subsystem is claimed.
- Refund/security behavior was exercised by real database regression tests; browser financial flows tested transfer verification, independent authorization and COD reconciliation. No live refund or external settlement was performed.
- International delivery, live payment providers, real customer notifications, hosted storage and hosted acceptance still require their established separate configuration/approval. No merchant prices, tax rates, fees or financial policies were invented for real records.
- Keep the hosted staging maintenance protection unchanged. Any future source integration, push or hosted acceptance needs separate authorization; this phase did not grant it.
