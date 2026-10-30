# Phase 3.5 acceptance — local factory commerce

Local-only branch `codex/phase3-5-local`, isolated worktree `.local/phase35/workspace`, based on accepted Phase 3 commit `a9b4a08806a498658695bfe89ca119a4ef86693a`. Implementation commits: `b1c7c0da893f057fe83b0c704ef058ca51f85888` and `6c63f7d83f52305e17ab53d67621cfb730849f15`; the final evidence-only commit is reported at completion. No GitHub push/PR change/merge, hosted rebuild, persistent migration, real payment, DNS or factory-site modification occurred.

## Implementation

- COD-first guest checkout for eligible ready-made variants; server-repriced shipping/fees/caps, reservations, quote/idempotency and last-item transaction protections preserved. Egyptian mobile normalization handles Arabic/Persian digits and national/+20/0020 formats; checkout adds governorate, city, area and delivery notes. Missing destination/fee/tax/policy/stock still blocks. COD labels distinguish payment on delivery from an advance. COD is credited only after collection and a different authorized reconciler.
- Shared wallet/InstaPay manual-transfer architecture. Owner configures optional enabled method, public recipient/identifier and bilingual instructions with policy version checking; no real receiving number is hardcoded. New claims snapshot their instructions and require private evidence. Old claims retain their original semantics. A claim or screenshot never credits money.
- Private immutable JPEG/PNG/WebP evidence: bounded 5 MB streaming reads, decoder/MIME checks, pixel limits, metadata stripping, resize/re-encoding to WebP, opaque keys in the private bucket, content/reference reuse detection, transactional revision/idempotency/audit/outbox, review/verified-state locks and corrected rejected submissions. Views require a fresh owner session or financial grant plus a viewer-bound 60-second signed application URL. No public screenshot MediaAsset or public signed bucket URL. Byte hash/length checks fail closed on missing/corrupt storage. Own losing uploads are cleaned up; automatic historical retention/deletion is deferred.
- Owner/explicit financial-manager receiving-account review uses the accepted separate request/approval/execution/reconciliation state machine and amount/currency/expiry limits. Rejection requires an explanation visible to the customer; replacement retains old revisions and audit. Financial separation, credit-once/refund bounds and outstanding-balance gates remain intact.
- Arabic factory queues use actual canonical states, transfer-review counts, paginated orders, customer phone/address/notes, genuine image/variant snapshots, production estimates only when configured, manufacturing actions, internal notes, accessible private proof viewing and destructive-action confirmations. Latest notifications are compact; older/completed financial history remains accessible. No alternate manufacturing/order state machine or ERP was introduced.
- Owner-configurable governorate/city/area delivery services and explicit fees/lead times/COD fees/caps/availability. No merchant fees, taxes or delivery estimates invented. Whole-governorate empty city/area remains compatible with old rates.
- Owner-only customer-account suspension/restoration with documented reason, immutable audit and session revocation; fresh session/ban checks. No public staff signup/default password, blanket manager financial privilege or guest phone blacklist.
- Bilingual durable local notification capture now has bounded exponential retries, due times, expired-lease recovery, generic error metadata, failure state and owner retry. Order creation, evidence/rejection, payment, manufacturing readiness and delivery events are captured idempotently. **No external email or WhatsApp has been sent or configured.**
- Existing product/category/media/stock/bulk-review/publish functionality is reused. No automatic publication/imported-price/stock adjustment or policy conversion. New-template deposit defaults remain 50%; accepted FULL_ADVANCE records are unchanged. Mixed ready/MTO checkout remains explicitly blocked; international and real gateways remain off.

## Defects found and fixed

1. Concurrent evidence attempts exposed MariaDB update conflict in the old emulated rate-limit upsert; replaced only this counter with atomic parameterized INSERT/ON DUPLICATE KEY UPDATE. Parallel replay retains one revision/event.
2. Saved address nullable optional values could fail checkout schema parsing; normalize optional nulls at the DTO boundary.
3. Rejected evidence could otherwise be revived alongside a new pending claim; require exact remaining target and no competing payment before correction.
4. Payment history ordering was unspecified, confusing initial/balance forms; explicitly order by creation time and target the editable proof form in browser tests.
5. Long English recipient/instruction content and long shipping selector labels overflowed a 390px screen; corrected wrapping/minimum columns, bounded select sizing and item-copy layout. Verified-payment wording and COD advance labels were corrected.
6. Unbounded dashboard detail made routine queues unnecessarily tall; collapse older notifications/completed review history without hiding current work.

Test-development failures were corrected without disabling protections: chunk/rate-limit expected code, distinct synthetic clients for authentication throttles, current accessible form selectors and cart-write completion before navigation. An inventory run during a rebuild was invalid; the cleanly restarted production run passed. Earlier failures are not counted as acceptance passes.

## Schema and migration safety

Six migration SQL files with pinned checksums are in `docs/phase3/migration-manifest.json`. The four historical SQL files are byte-for-byte unchanged. New files add factory proof/notes/address/retry fields and a customer banned flag default false; they replace the old shipping uniqueness index with the more specific destination index. MariaDB DDL is not globally atomic; never treat this as a rollback-safe live transaction. A cosmetic `git diff --check` finding (one trailing blank line in the already-applied customer-access SQL) was retained to preserve its exact recorded checksum; no test/security check was disabled.

Applied only to two newly created, schema-scoped disposable Phase 3.5 databases on verified loopback MariaDB 11.8.9 port 33078, plus temporary independently restored rehearsal/recovery aliases. The dedicated guard rejects unknown identities, unmanaged history and pre-existing business rows. No accepted Phase 2/3 persistent schema or Hostinger database was migrated/reset.

The exact private accepted Phase 2 backup was restored, its original 21 tables/columns fingerprinted, all six migrations deployed and rerun, then original-column fingerprints, historical ledger checksums, stock/reservations and image/auth references compared. The 487 mapped drafts and null prices were preserved on the catalog copy; an empty restored test copy imported 487 drafts with no prices and a second CLI run changed no rows. A separate recovery restore matched the same original artifact. Temporary rehearsal schemas/user were removed. See `promotion-rehearsal.json` for hashes/counts; SQL dumps and user rows stay private.

## Evidence and quality gates

- `full-tests.json`: 209 passed, zero failed/skipped, including **96 real MariaDB/storage tests**. Includes accepted authentication/catalog/stock/checkout/financial adversarial regression plus 32 Phase 3.5 cases.
- `core-browser.json`: 18 checks, 27 axe audits; two responsive passes, Arabic/English cart/checkout/account and Arabic admin, staff/refund/session/guest boundaries.
- `independent/browser-evidence.json`: extended regression includes customer isolation, quantity persistence, XSS escaping, FULL_ADVANCE and deposit manufacturing, with responsive/axe evidence.
- `factory-browser.json`: eight grouped checks, full COD + wallet/private proof + InstaPay/deposit/balance + internal notes/notification workflows; two visual passes at 390/768/1440, including Arabic and English order views and keyboard-expanded advanced settings.
- `inventory-final-review.json`: three sizes, keyboard focus, bounded table scrolling and zero axe violations.
- `media-browser.json`: actual browser signed upload, finalization, product association/replacement/public retrieval, anonymous private-original denial and restored genuine-photo association. Product media and private payment evidence use separate namespaces.
- `storage-restart.json`: actual private storage process restart preserved exact private-proof and public-display hashes and their 403/200 access controls; `runtime-money-check.json` verifies synthetic item/shipping totals and credit bounds. Read-only Prisma schema comparison found no difference.
- `staging-http-local.json`: 27 production-mode local fail-closed staging checks; no hosted acceptance inferred.
- TypeScript, ESLint, Prisma validation and `next build --webpack` executed on Node 22.23.4, pnpm 11.24.0, unchanged frozen dependency graph. Fresh isolated installation used 569 packages; no dependency/framework upgrades. Final runtime serves real HTTP from the production build.
- `final-security-and-preservation.json`: scoped known-private-value/credential-pattern scan of candidate/history/build/archive text and SWC trace verification; original 229 source and 1,753 archived file hashes compared. This is a scoped scan, not a universal guarantee of absence of secrets or vulnerabilities.

Total recorded browser check executions: **53** across the regression suites; **85** accessibility audit executions with zero violations, including repeated page audits. These are executions, not 53 distinct checkout journeys.

## Release assessment

| Area                              | Status                                 | Scope                                                                                                                |
| --------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Local Phase 3.5 implementation    | PASS after final recorded verification | Synthetic contacts, financial terms, DB and real local object persistence; no real funds/carrier/provider            |
| Original data/assets preservation | PASS                                   | Restored baseline fingerprints and original-source/image hashes                                                      |
| GitHub Phase 3.5 integration      | NOT EXECUTED                           | Existing Phase 3 review/canonical history preserved; no Phase 3.5 CI claim                                           |
| Persistent database promotion     | BLOCKED / PARTIAL readiness            | Exact executor, current ledger, independent hosted backup and explicit migration approval still required             |
| Hosted Phase 3.5 acceptance       | NOT TESTED                             | Existing Phase 2 deployment only; no Phase 3.5 application activation                                                |
| Hosted staging safeguards         | PARTIAL                                | Live home/admin/assets reject; host robots wildcard Allow/no header remains; valid private credentials not retrieved |
| Production launch                 | BLOCKED                                | Merchant operational/financial/privacy decisions and approved infrastructure/hosted acceptance outstanding           |

Read `merchant-decisions.md`, `hostinger-readiness.md` and `staging-promotion-runbook.md` for actual read-only hosted evidence and the controlled approval sequence. No hosted PASS is based on local tests.

## Remaining merchant/infrastructure approvals

Real receiving instructions and verified reconciliation operators; explicit manager limits and required separation/single-owner procedure; COD destination/carrier/fees/caps/remittance contract; currency/tax/rounding/shipping/deposit/balance/cancellation/refund policy; reservation/contact/guest recovery/evidence privacy/retention; supported persistent storage/backup and approved notifications channel/worker. No automatic deposit forfeiture, MTO balance COD, international checkout or live refund policy was inferred.

Next approve publication of this local review candidate, then separately approve the supported private Hostinger identity/history/backup preflight. Persistent migrations, owner provisioning/imports and manual compatible deployment each require their own concrete reviewed approval. Keep all hosted commerce gates off until a bounded hosted synthetic mode is reviewed. Production remains out of scope.
