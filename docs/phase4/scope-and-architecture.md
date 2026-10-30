# Phase 4 — approved local owner reports

No numbered Phase 4 contract was found in the roadmap, architecture/phase documents, original blueprint, deferred registers or open GitHub issues. The original Master Product Blueprint section 5 explicitly requires the owner to view basic daily sales and section 7 lists Reports. Those were previously deferred requirements, not a license for new financial policy. In this execution the Product Owner selected **read-only owner reports** as the first Phase 4 slice. This is the confirmed implementation scope; the broader Phase 4 roadmap remains unapproved.

## Authorized slice

Owner-only Arabic `/admin/reports` and an independently authenticated aggregate GET API. Date filters use explicit Cairo calendar days, bounded to 31 days. Show recorded order counts/value, canonical verified receipt movements, reconciled refunds and their arithmetic difference per currency. Clearly distinguish order placement, screenshots/claims, COD collection and verified credit. Display current order-state distribution for orders created in the selected interval; it is not a historical status reconstruction. No customer identity/address/proof is needed in aggregate responses.

Reuse Better Auth staff sessions, fresh owner/ban/rotation checks, staging protection, the commerce service models and immutable audit facts. Managers receive no new reporting/financial authority by default. The API performs no writes, does not expire reservations/drain notifications and does not call a payment provider. There is no export endpoint, new settlement, tax, refund or revenue-recognition policy.

## Financial/data contract before code

`payment.verified` records prepaid credit once, including deposits at their verified amounts. `fulfillment.cod_reconciled` records COD credit; collection alone is excluded. `finance.reconcile` contributes a refund only for a matching canonical REFUND request; VERIFY_TRANSFER is already represented by `payment.verified` and must not be counted twice. Validate source identifiers, amount/currency/order relationships and duplicate origins. Unknown/corrupt financial facts must fail closed with a useful owner message rather than fabricated/truncated totals.

Use exact integer minor-unit strings end to end and render large sums without floating-point conversion. Never sum different currencies. The net movement is receipts less reconciled refunds, **not profit, recognized revenue, bank balance or tax liability**. Missing dates return zeros; empty data is not an error. Payment fact date is the audit event's timestamp, not the order/claim creation time. Inclusive Cairo dates are converted to UTC `[start, next-day-after-end)` boundaries, including daylight-saving 23/25-hour days.

## Compatibility and storage

No new schema or SQL migration is required. Existing six migrations are applied only to fresh Phase 4 disposable schemas; original Phase 2/3/3.5 workspaces/data/images remain untouched. Read queries run under a consistent database snapshot, have bounded date/record limits and return an explicit too-large error instead of partial totals. Review query duration/plan on actual MariaDB; a later index migration requires measured need and separate review. Product media and proof storage implementations are reused in a separate private local service for regression, with no paid resources or hosted configuration.

## Verification

Unit tests: strict dates/range/unknown query keys, Cairo DST boundaries, exact large/negative amount rendering and currency separation. Real DB: verified and pending/manual/COD/refund facts, duplicate callback protection, refund date versus order date, deposits, malformed facts, zero days, transaction consistency, owner-only/fresh-role guards and no writes. Browser: owner session, date presets/empty/error states, manager/customer denial, keyboard filters, two responsive RTL passes at 390/768/1440 and axe audits. Run all available Phase 3.5 DB/storage/security/financial regression, TypeScript/lint/Prisma and production build.

## Deferred/unapproved scope

Live reports over hosted data, external notification transport, exports/customer lists, promotions/discount policy, international checkout, gateways, accounting/revenue recognition, delegated financial limits and retention/deletion are not authorized by this slice. Existing live merchant decisions remain blocked. Phase 4 commits stay local; no push, PR modification, deployment or persistent migration is part of Workstream B.
