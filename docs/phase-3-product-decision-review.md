# Phase 3 M0 approval-ready review and implementation proposal

**Planning: PARTIALLY APPROVED. Implementation, migrations and database writes: NOT AUTHORIZED.**

This supersedes the earlier preliminary review. The [decision register](phase-3-owner-decisions.md) records exact approved scope, remaining recommendations and unresolved D1–D15 terms. The [architecture](phase-3-architecture-plan.md) incorporates the required design rules. Planning approval is not operating-policy approval or execution permission.

## 1. Approved rules and unresolved operations

Approved for planning: new made-to-order templates default to 50% with overrides; all existing FULL_ADVANCE/other records stay unchanged; ready-to-ship-only COD excludes manufacturing deposits and balances; InstaPay/wallets have manual and future gateway paths with verified reconciliation; specifically authorized managers may receive bounded authority alongside the owner; financial steps are separately authorized/audited; no automatic forfeiture or payable calculation from incomplete rules.

Still unresolved: guest contact/recovery, currency/tax/discount/rounding, COD destinations/carrier/limits/fees, transfer/refund channels, deposit calculation/collection schedule, shipping, mixed checkout, holds/expiry, cancellations/returns, authority limits/self-approval rules, privacy and international terms. D3-T/D12-T/D15-T remain proposed bounded technical approvals.

- A **50% template preference** is not a calculated/collectible deposit. Existing policies are not converted; the outstanding balance is a separate obligation.
- A **method interface** does not enable COD, a destination, manual credit authority or a gateway.
- A **MANAGER role** does not imply financial delegation. Require an active explicit person/operation/currency grant, approved limits and separation of duties.

## 2. Milestone dependency matrix after separate implementation approval

Nothing below starts now. Pack A would authorize constrained coding/preparation. E1 would separately authorize reviewed isolated DB operations. Pack B supplies applicable domestic operating rules; Pack C supplies international terms.

| Milestone                | May begin after Pack A alone?                                                                                                               | Additional gates for integrated/functional work                                                                                                                                                    | Disabled capabilities / evidence limit                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — review              | Current review may continue; approval record not complete                                                                                   | Explicit Pack A and relevant Pack B/C decisions                                                                                                                                                    | No implementation permission inferred from planning status                                                                                   |
| M1 — foundation          | YES: pure contracts, schema/migration drafts, complete synthetic policy fixtures and reject-incomplete-policy tests outside Phase 2 runtime | E1 before any DB creation/grants/migration application/seed/write; policy-dependent behavior stays draft until Pack B                                                                              | No merchant payable calculations, Phase 2 backfills or financial grants. Full M1 acceptance needs real DB/restore/concurrency evidence.      |
| M2 — customer accounts   | YES: isolated realm code, guarded UI and synthetic security scenarios                                                                       | M1/E1 for DB tests; D1/D13 for actual contact/verification/data rules; D12-T for private capture                                                                                                   | Real registration, real guest/customer data and external recovery delivery OFF while pending; staff auth/signup unchanged                    |
| M3 — cart/checkout       | YES: non-reserving cart, eligibility/configuration contracts, disabled checkout UI and synthetic scenarios                                  | M1/E1; applicable D1/D2/D4–D9/D13 before merchant submission/reservations; Pack C for international                                                                                                | Incomplete policies cannot submit orders or hold stock. Mock orders only in isolated tests after E1; no invented prices/fees for 487 drafts. |
| M4 — payments/recovery   | YES: D3-T contracts and mock-only replay/recovery/invariant simulations                                                                     | M1/E1 for persistence; applicable D2/D4–D6/D9–D11 before operating flows; separate external sandbox/provider/callback approval                                                                     | No merchant credit from claims, no refund/adjustment execution without rules/grants and no external payment calls                            |
| M5 — admin/notifications | YES: read-only/synthetic views, missing-rule forms, delegation contracts/denial test specifications and local capture                       | M1/E1; D11 limits/self-approval rules before financial grant/approval/execution/reconciliation workflow implementation; applicable Pack B before fulfillment mutations; D12-T/D13 for capture/data | Financial controls and actual grants OFF; no unrestricted seed grants or external messages                                                   |
| M6 — local acceptance    | YES for test planning; scoped engineering tests follow implemented/approved dependencies                                                    | M1–M5/E1 plus relevant Pack B/C for complete product acceptance                                                                                                                                    | Pending/disabled requirements keep Phase 3 product acceptance PARTIAL. No real-provider/hosted PASS from mocks.                              |

Open international terms need not block parameterized domestic engineering. Missing actual shipping fees need not block building an approved rate editor. Neither permits using zero/default rates. Merchant calculations need a complete approved policy; simulations need a complete explicit fixture policy labeled as a simulation.

## 3. Capability controls — design proposal only

These are proposed controls, not implemented variables/settings. Every toggle is subordinate to server authorization, environment/target verification, policy readiness and approved product/method eligibility. A toggle never supplies policy approval.

| Proposed control                                           | Default / hard restriction       | Readiness before use                                                                                                                                            |
| ---------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3_LOCAL_FOUNDATION                                        | OFF                              | Pack A; isolated app/build/configuration/target; E1 for every DB operation                                                                                      |
| P3_CUSTOMER_ACCOUNTS / P3_GUEST_CHECKOUT                   | OFF for actual users             | D1/D13 plus realm isolation; synthetic harness activation only after E1                                                                                         |
| P3_ORDER_SUBMISSION                                        | OFF                              | Approved versioned currency, tax, discount, shipping and rounding rules; reviewed product/price/stock; compatible payment/fulfillment and identity terms        |
| P3_COD                                                     | OFF                              | D4/D7/D9/D11 complete; explicit destination/carrier/limits/fees/reconciliation; each relevant line ready-to-ship                                                |
| Made-to-order COD                                          | HARD DENY under current approval | No product override, stored legacy flag, interface or toggle can enable manufacturing deposit OR balance COD. Changing this needs a new Product Owner decision. |
| P3_MANUAL_TRANSFER_CREDIT                                  | OFF                              | D5/D11, active bounded authority, verified receiving evidence and amount/currency/reference match, replay-safe allocation                                       |
| P3_REFUND_EXECUTION / P3_FINANCIAL_ADJUSTMENTS             | OFF                              | D10/D11, approved request, separation of duties, remaining capacity/limits and audit/reconciliation                                                             |
| P3_MIXED_CHECKOUT                                          | OFF                              | D8 plus per-line obligations, compatible methods, shipment/fee allocation and stock policy                                                                      |
| P3_INTERNATIONAL_CHECKOUT                                  | OFF                              | Pack C and confirmed exact terms before acceptance/charge                                                                                                       |
| P3_NOTIFICATION_CAPTURE                                    | OFF until D12-T                  | Private local bilingual capture, synthetic recipients, protected tokens and no outbound transport                                                               |
| PAYMENT_MODE                                               | MOCK only within Pack A          | D3-T and isolated local/test environment; complete synthetic rules for simulated amounts; no real receiving instructions                                        |
| P3_EXTERNAL_SANDBOX                                        | OFF / outside Pack A             | Separate provider/account/secrets/callback-exposure review                                                                                                      |
| Live payments / external notifications / hosted enablement | DENIED in this proposal          | Separate future approval; a configured secret or flag is insufficient                                                                                           |

Unknown, missing or conflicting rules produce an explicit Arabic/English unavailable/not-configured response, never silent free shipping, zero tax, an unlimited grant or automatic acceptance.

D11 is not merely a hidden-UI gate: manager financial grant/request/approval/execution/reconciliation workflows must not be implemented on invented limits or separation rules. Pack A permits contracts/denial test specifications until those rules are approved, not a guessed workflow with its button hidden.

## 4. Smallest practical approval groups

Use **two near-term Product Owner approvals plus one deferrable international pack**. Recommendations and missing inputs remain in the register.

### Pack A — bounded local engineering, identity and data

Approve D3-T/D12-T/D15-T and the six architecture principles. Confirm D1 email+phone/guest-recovery and D13 data choices, or explicitly defer them while real customers/data remain disabled. Permit guarded local code, mock scenarios, bilingual capture and UI outside the accepted Phase 2 runtime. This does not authorize DB execution or external services.

### Pack B — domestic money, delivery and authority

Review D2/D4/D5/D6/D7/D8/D9/D10/D11 together so their rules cannot contradict. Recommended starting choices: domestic EGP; discounts explicitly disabled; owner/accountant-defined tax treatment; per-line ceiling deposit rounding on an approved tax/discount basis; initial shipping collection for prepaid orders if approved; balance before dispatch; separate ready-made/manufacturing checkouts initially; candidate holds of 15 minutes/24 hours; no self-approval; named bounded delegations.

These recommendations are not settings. Supply actual carrier/rate/limit/receiving/refund/cancellation inputs or explicitly defer the capability/OFF. Do not infer a retention period, fee, tax rate, conversion, financial limit or payment instruction.

### Pack C — international

Approve D14 and international portions of D2/D3/D7/D10 only once countries, exact terms, settlement/FX treatment, duties payer and returns are confirmed. This may remain deferred; no quotation portal substitutes for missing terms.

### E1 — separate operational DB gate

After Pack A, review exact Phase 3 database names/loopback endpoint, least-privilege grants, migration SQL/hashes, backup/restore checks and synthetic seed/test writes. E1 must explicitly authorize creation/application/writes for those targets. It excludes sprtaya_phase2_local/test, Hostinger, production and every existing product/user/stock record.

Pack A/B/C approval is not E1. M1 coding approval cannot trigger DB execution. If E1 is approved later, tests write only synthetic Phase 3 data; no shared Phase 2 runtime/data changes are allowed.

## 5. Proposed M1–M6 authorization — NOT APPROVED

> I authorize bounded local Phase 3 M1–M6 code implementation under Pack A: provider-neutral localhost mocks, private Arabic/English capture, guarded UI, schema/migration drafts and security/test work. Preserve accepted Phase 2 code behavior, databases, 487 drafts, FULL_ADVANCE policies, unapproved prices, stock, users and assets. Use a separate source checkout/reviewed snapshot and separate Phase 3 generated client, app/config/build target and port. Do not copy private Phase 2 credentials, alter the original image archive, or start/reconfigure the Phase 2 app.
>
> Apply the approved planning rules: 50% only for NEW made-to-order templates with overrides; no policy conversion; ready-to-ship-only COD with manufacturing deposits/balances denied; dual manual/future gateway InstaPay/wallet paths with no credit from an unverified claim; named bounded manager authority with audit and separated steps; no automatic forfeiture.
>
> Keep unresolved merchant capabilities OFF. Do not calculate merchant payable amounts until approved currency, tax, discount, shipping, rounding, product and payment/fulfillment rules are complete. Simulations use explicit complete synthetic policies only, never merchant defaults or invented catalog data. Do not seed unrestricted financial grants.
>
> This permits drafting but not DB creation, grants, migration application, seeds or DB test writes. Obtain E1 for exact reviewed isolated targets/operations first. Do not touch existing Phase 2 records. No external provider/sandbox account, callback tunnel, real payment instructions, external messages, paid services, Hostinger/production deployment, Hostinger DB, DNS or live payment activity is authorized.
>
> Report actual results and disabled capabilities per milestone. Pending requirements keep full product acceptance PARTIAL; mocks do not establish real-provider/hosted acceptance. Stop at an unmet approval/execution gate.

This text is a proposal until explicitly approved or amended. The word “implementation” never overrides its database/financial/environment exclusions.

## 6. Documentation validation

Only the three Phase 3 documents are updated. Validate formatting, references, D1–D15 coverage and cross-document consistency; compare other implementation/Phase 2 evidence with the pre-edit snapshot. No build/database acceptance is run for this documentation-only update. The accepted 101-test baseline remains historical evidence.
