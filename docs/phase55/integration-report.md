# Phase 2–5 integration — locally accepted

The candidate descends from the accepted Phase 3, Phase 3.5, Phase 4, restricted-staging and Phase 5 commits. No rebase, history discard, force push, remote write or hosted operation occurred. Exact ancestry is recorded in `integration-provenance.json`; remote comparison uses cached local refs and is not a claim that GitHub's current branch head was freshly verified.

| Area                   | Existing implementation reused                                                       | Phase 5.5 verification                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Products/categories    | Prisma catalog, admin actions, publication blockers, bulk review                     | Synthetic create/find/edit/price/image/stock/publish/unpublish in real browser; 487 original drafts preserved                               |
| Inventory              | Reservations, atomic stock events, adjustments and ledger                            | New complete paginated read view; 301-row regression; oversell/expiry/cancel/dispatch invariants; actual interrupted-connection rollback    |
| Customer/cart/checkout | Better Auth customer realm, guest/session ownership, cart snapshots and quote rules  | Registered customer verification and guest flows; COD and made-order checkout; missing configuration and international restrictions tested  |
| Orders/factory         | Canonical order/item states, production/fulfillment services                         | Deposit → permitted production → paid balance → shipment; invalid transitions rejected                                                      |
| Payments/refunds       | Manual evidence, explicit finance grants, separate approval/execution/reconciliation | Wallet/InstaPay proofs, COD collection/remittance, paid cancellation and refund through Arabic forms; self-approval and duplicates rejected |
| Shipping               | Existing zone/carrier/destination policy and fees                                    | Owner form persistence and eligible Egyptian checkout; unconfigured international ordering remains denied                                   |
| Notifications          | Transactional outbox and local private captures                                      | Bilingual capture, failures/retry/duplicate checks; no external delivery                                                                    |
| Reports                | Phase 4 event-based collection, refund, credit and outstanding calculations          | Real order/payment/shipment reconciliation, cancellation/refund visibility, date filters and Arabic/English views                           |
| Staff/audit            | Existing Better Auth admin sessions, roles and database authorization                | Staff/customer/anonymous boundaries, revocation, financial limits, audit history and site-auth separation                                   |
| Media                  | Preserved originals, S3 signing/finalization, private evidence                       | All 1,753 actual files decode as WebP; correct byte-derived delivery headers; protected whole-library search and local persistence          |
| Hosted safety          | Existing Proxy, route/action gates, noindex and exact database fingerprint           | No change to staging auth architecture; extracted local production package tests. Hosted direct-file routing is not proven                  |

## Confirmed integration defects fixed

1. Inventory and media lookup caps could hide an existing item. Queries now search the complete relevant dataset with bounded pages.
2. The image route inferred MIME from `.jpg` despite actual WebP content. Response headers now follow supported bytes, without changing originals. Realpath containment also rejects links escaping the media root.
3. An HTML-only numeric restriction blocked valid Arabic refund input; existing authoritative server parsing/limits remain intact.
4. The generic hosted migration script intentionally blocks Phase 3 and only accepts the two original Phase 2 migrations. It was **not weakened**. A separate manual seven-migration initialization command was prepared with an exact packaged-source check, unchanged production target guard, matching backup/restore attestations, strict empty-state checks and disabled-commerce requirements. Its default mode reads local migration files only; no hosted execution occurred.

## Functional boundaries

No new schema/migration files, provider dependencies, state machines, financial calculations or wholesale platform. Existing imported prices remain unapproved; existing FULL_ADVANCE records are not converted. Manual proof remains untrusted until authorized reconciliation. International ordering remains restricted by the existing policy; no carrier integration, live gateway, live refund or external notification acceptance is claimed.

Owner personal acceptance and hosted security/database/storage acceptance remain independent gates. The release runbook contains an explicit bounded path; no present hosted table state, backup freshness, credentials or routing guarantee is inferred from old records.
