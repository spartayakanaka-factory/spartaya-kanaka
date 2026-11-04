# Implementation and remaining decisions

## Persistence and relationships

The two accepted Phase 2 migrations remain byte-for-byte unchanged. Two additive migrations implement Phase 3:

1. `20261029143000_phase3_local_commerce`: isolated customer auth, addresses, cart, policy, shipping, order/item snapshots, reservations, payment events, finance grants/requests, shipment and collection states, append-only application audit/stock events, notification outbox, and guest recovery grants. Adds `inventory_balances.reserved` with a database constraint preventing negative or excessive reservation.
2. `20261029144500_phase3_cancellation_review`: persistent cancellation reviews, separate from refunds.

The resulting disposable schema has 45 tables, including Prisma history. Customer user → sessions/accounts/addresses; cart → items → existing product variants; order → items/reservations, payments and audit; finance requests and shipments reference orders. Named SQL foreign keys are mirrored explicitly in Prisma. CHECK constraints remain in SQL because Prisma cannot represent them. A read-only schema comparison is empty. The manifest records exact SQL digests.

Reservations use a separate system-capable stock-event ledger. The accepted inventory-movement table requires an administrator actor, so system checkout must not invent a staff actor. Existing admin stock adjustments also enforce `quantity + delta >= reserved`. No old manufacturing defaults or imported records are backfilled.

## Transactions, money and recovery

- Money is integer minor units using BigInt. Currency, tax mode/rate, line rounding, discount treatment, shipping taxation/collection, deposit rounding/basis, and balance timing must be explicitly configured. Missing policy or delivery rate blocks checkout; zero is accepted only as an explicit configured value.
- Each confirmed order snapshots all lines, taxes, shipping/carrier terms, policy/rate/cart versions, initial amount, balance and locale. Later settings or catalog edits do not rewrite the snapshot.
- Read-committed transactions use row locks on carts, products, sorted variants/balances, shipping/policy and orders. Stock and order changes commit together. Deadlocks and uniqueness races have bounded retries.
- Checkout uses actor-scoped idempotency plus a payload digest and server-generated quote digest. The post-lock idempotency check handles simultaneous retries after cart clearing. The client retains the request key for the same quote.
- Reservation transitions: HELD → COMMITTED → CONSUMED, or HELD/COMMITTED → RELEASED. Expiry applies only to unpaid awaiting-payment orders. COD acceptance commits an allocation without pretending money was collected. Fulfillment consumes stock once; inspected failed-delivery returns restore it once.
- Expiry and outbox draining are available in the protected admin settings screen and through `scripts/phase3 jobs`. The optional local `--watch` worker checks every 15 seconds; it remains disposable-only and installs no operating-system or hosted scheduler. Outbox jobs use leases, retry counts, durable deduplication keys and stable private capture filenames.
- There is no destructive down migration. Restore a verified backup into a separate disposable database, compare every table's row counts and sorted data digests, then review before any replacement. Persistent environments require a separate recovery/promotion procedure.

## Customer and storefront

Separate Better Auth customer realm supports synthetic registration, verification, login/logout, password recovery and session revocation. Password length, database-backed throttling, secure production cookies, HTTP-only cookies and trusted origins apply. Staff signup remains disabled. Customer sessions cannot authorize staff APIs.

Profiles, saved-address creation/edit/deletion, cart persistence/change/removal/merge, guest checkout, quotes, owned order details, registered order history and browser-bound guest history use real database persistence. A guest does not become a registered customer automatically. Knowing an order UUID does not grant access. Guest recovery has hashed, expiring, single-use token exchange and order-bound sessions; issuing real recovery credentials remains disabled pending verified contact policy.

Arabic-first and English customer screens share the copper/cream storefront and existing Arabic fonts. Header account/bag actions route to real local commerce only when enabled. Product pages link to the existing catalog and add actual variant IDs. Genuine archived imagery remains in use. Mixed baskets are permitted, but mixed ready-made/manufacturing checkouts require splitting.

## Payments and manufacturing

Only the local mock adapter can issue automatic payment facts. It makes no network calls. HMAC verification, amount/currency/reference/account correlation, durable event IDs and order locks prevent duplicate credit or spoofed status updates. Failed attempts permit a new deliberate attempt; unknown attempts retain their capacity. Late successes are flagged for review and cannot recreate released stock.

InstaPay/wallet reference claims remain CLAIMED and credit nothing. Explicit financial request → separate approval → simulated execution → separate reconciliation is required. Late/unpayable transfers become REVIEW_REQUIRED rather than being falsely reported reconciled.

New manufacturing templates alone use 50% deposits, with product overrides. Existing FULL_ADVANCE policies stay full advance. The explicit synthetic policy uses ceiling rounding per order line, a PER_LINE fixed-deposit basis, and separately tracked shipping and outstanding balance. Manufacturing cannot start before verified initial funds, and dispatch cannot precede verified balance. Manufacturing COD is rejected.

Refund requests reserve available receipt capacity under an order lock. Requesters cannot self-approve; executors cannot reconcile their own execution. The local workflow records requested, approved, executed, rejected and reconciled states and appends audit entries. Duplicate and concurrent requests cannot over-refund. Reconciled refunds record commercial credit separately so they do not automatically reopen a customer debt. Any refund, pending refund review or pending cancellation review blocks further manufacturing/dispatch until an approved operational path exists.

COD is domestic/ready-made only and requires an enabled destination/carrier, explicit fee and maximum. Collection and carrier remittance are separate states; selection and delivery alone do not credit money. A separate reconciler is required for remittance.

## Staff and settings

Arabic admin screens provide order search by ID prefix, status filters, recipient/delivery details, line/manufacturing status, payments, shipment actions, cancellation reviews, finance queues, audit history and captured notification status.

Owner/manager operational access is checked server-side against actual staff role, ban and password-rotation state. Every sensitive finance operation additionally requires a named, unrevoked, unexpired grant with a currency and amount ceiling. Grant rows are locked during financial transactions. Owner-only local configuration manages explicit synthetic delegation and records reasons/audit; there are no default manager financial permissions. Fixture grants expire and have bounded per-operation ceilings.

The owner can configure synthetic tax treatment, stock-hold duration and delivery services. Forms use pounds and percentages, then parse them to integer representations. This does not approve real merchant rates.

## Feature/permission matrix

| Capability | Local behavior | Merchant/hosted behavior |
|---|---|---|
| Customer identity, addresses, carts | Synthetic disposable persistence | Off unless separate reviewed promotion |
| Guest checkout | Explicit synthetic contact policy and browser secret | Real verification/recovery terms pending |
| Domestic checkout | Complete synthetic policy and configured rates | Off; tax/shipping terms unapproved |
| Mock card facts | Local signature-verified adapter | No live gateway or credentials |
| InstaPay/wallet claims | Pending until granted reconciliation | No live instructions or providers |
| COD | Configured ready-made fixture destination/carrier only | Carrier/limits/fees/remittance policy pending |
| Manufacturing | New 50% template; preserved old full advance | No existing product conversion |
| Refunds | Bounded mock request/approval/execution/reconciliation | Live refunds and entitlement policies off |
| Financial adjustments | Explicitly rejected | Pending policy; no unrestricted adjustments |
| Manager finance | Named per-operation/currency/amount/time grant | No automatic privilege |
| Cancellation after production/dispatch | Recorded review; automatic approval blocked | Operational/return rules pending |
| International checkout | Country/address preparation and rejection tests | Always disabled |
| Notifications | Private bilingual local capture | No email/SMS delivery |
| Wholesale/custom quotations | Existing verified telephone contact | No quotation platform |

## Business and deployment blockers

- D1: approved real contact verification, guest recovery and notification destinations.
- D2/D6: actual tax/currency/discount rules, deposit component basis and collection schedule. Synthetic examples are not real defaults.
- D4/D7/D9: carrier/destination COD eligibility, ceilings, charges, shipping rates/tax, delivery promises, reservation/payment deadlines and operational scheduler.
- D5/D10: statement verification, refund channels, cancellation/return entitlements, production-stage exceptions, fees and recovery from ambiguous real provider outcomes.
- D8/D14: any future combined-checkout or international payment/shipping/customs terms. Current mixed-cart splitting and international blocking are deliberate.
- D11: real delegated ceilings, period/cumulative limits and financial staffing. Local grants currently enforce per-operation ceilings; no real merchant limits are assumed.
- D13: privacy, retention, consent and account erasure/export rules. No automatic deletion of financial audit history.
- Persistent hosted media, external notification transport, live gateways and production execution remain unconfigured/unapproved. Local filesystem S3 persistence is verified, not a claim of hosted persistence.
- Hostinger routing remains a separate unchanged blocker. No Hostinger, DNS, database reassignment, remote migration or deployment occurred.
- E1 promotion is required before this schema/client can be used with any accepted database. Feature flags alone are not a schema rollout strategy.
