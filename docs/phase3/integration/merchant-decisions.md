# Merchant decisions and disabled capabilities

This register is current for the integration candidate. Synthetic local configuration is test data, never an approved merchant price, tax, fee, deadline or refund policy.

| ID | Approved scope | Unresolved choice | Enforced boundary |
|---|---|---|---|
| D1 | Guest and optional customer-account architecture | Required email/phone, verification channel, guest recovery proof and lifetimes | Hosted customer registration/checkout off; local registration restricted to `.invalid`; real recovery issuance off |
| D2 | No invented financial terms | EGP settlement, actual tax/invoice treatment, discounts, allocations and rounding | Missing policy fails checkout; synthetic tax values never become merchant defaults |
| D3 | Local mock/provider-independent design | Real or sandbox gateway selection, accounts, callbacks and reconciliation | Only signed in-process mock facts; no live adapter or credentials |
| D4 | COD eligible only for ready-to-ship | Destinations, carriers, limits, fees, acceptance/failed-delivery/remittance rules | Explicit configured destination/carrier required; manufacturing deposits/balances rejected |
| D5 | Manual and future automated InstaPay/wallet architecture | Receiving instructions, proof/SLA, partial/over/duplicate receipts, rejection and refund channels | No live instructions; claim alone never credits an order; separate verified reconciliation required |
| D6 | New made-to-order templates: 50% deposit, overrides allowed; preserve existing FULL_ADVANCE | Deposit base/rounding, fixed amount PER_UNIT versus PER_LINE, shipping/tax timing, balance schedule, production start | New-template-only code; no migration/backfill; outstanding tracked separately; no automatic forfeiture. Local PER_LINE/ceiling fixture is not approval |
| D7 | Owner-configured shipping | Real zones, rate/weight/dimension rules, carriers, return charges, collection/refund timing | No inferred/free delivery rate; absent terms block checkout |
| D8 | Mixed baskets only with enforceable schedules | Approve split checkout and charges, or specify compatible combined schedules | Current local checkout requires ready-made/manufacturing split |
| D9 | Transactional reservations and expiry architecture | Holds/deadlines/extensions, late/unknown receipt resolution, abuse limits, worker ownership | Local-only bounded expiry/outbox runner; no hosted worker installed |
| D10 | Audited refund workflow architecture | Entitlements/cutoffs, returns/restocking, tax/shipping credits, fees/channels/timing/disputes | Mock refunds only; unsupported adjustments and ambiguous post-production cancellation stay blocked |
| D11 | Owner or specifically granted manager financial authority | Named operations and per-order/daily/cumulative/currency limits, expiry/revocation/escalation | No default manager grants; current grant checked per action; request/approval/execution/reconciliation separated; no self-approval or same-executor reconciliation |
| D12 | Local bilingual notification capture | Channels, sender/consent, recipients, retries and delivery evidence | Private files only, no email/SMS transport |
| D13 | Preserve financial history | Privacy text, consent, retention/erasure/export/anonymization and token/evidence lifetimes | No automatic financial-history erasure or real-customer import |
| D14 | International checkout disabled | Countries, shipping, payment, FX/customs, cancellation terms and confirmation authority | Country preparation does not enable international acceptance |
| D15/E1 | Local integration/testing/commits | Publishing, exact persistent schema target, execution method, backup/recovery and separate staging deployment | No push/deploy; all persistent migration entry points refuse this Phase 3 candidate |

Wholesale and custom manufacturing enquiries remain telephone-only. No quotation platform is introduced.

## Smallest approval groups

1. **Order contract:** D1/D2/D6/D7/D8/D9 — contact and recovery, totals/deposit components and rounding, actual delivery terms, split checkout and holds. Until then checkout remains a synthetic local simulation.
2. **Money and exceptions:** D4/D5/D10/D11 — COD and transfer reconciliation, returns/refunds and explicit staff limits/separation. No live collection or refund can be inferred from local mock acceptance.
3. **Customer operations:** D12/D13; D14 can remain disabled — notifications/privacy/retention. International terms need their own later approval if requested.
4. **Infrastructure/publishing:** D15/E1 — separately authorize source publication with auto-deployment disabled, then exact staging database preflight/export, a reviewed migration runner, and a later manual application deployment. None includes production or live payments.

## Default configuration

The `.env.example` declares every Phase 3 gate as `0` and `PAYMENT_MODE=DISABLED`. Existing local test runners opt into mock/disposable behavior explicitly. `commerceEnabled()` additionally requires local environment, exact loopback port 33078 and one of two disposable database names; staging cannot be enabled just by copying flags. Do not loosen that target guard as a deployment workaround. A separately reviewed staging simulation mode is required before hosted Phase 3 activation, even after a schema promotion. Ordinary Phase 2 staff authentication remains separate from customer authentication.
