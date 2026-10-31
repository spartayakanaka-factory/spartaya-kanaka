# Infrastructure recovery readiness — 2026-10-31

## Outcome

**Controlled Hostinger staging is blocked. Production is not authorized.** The designated database remains associated with a separate website, no staging database connection or verified hosted database backup exists, persistent private media has not been configured, the hosted robots response still allows wildcard crawlers, and hosted commerce intentionally remains disabled. A current dependency audit reports a moderate advisory.

This local branch adds a dynamic staging sitemap defense, tests it and extends the isolated production-mode staging HTTP checks. It does not deploy or enable hosted commerce. For the actual limitations and exact next steps see the separate environment, database backup, media, routing, restricted-runtime, dependency and promotion documents in this directory.

## Verification

- Remote PRs #1, #2 and #3 remain open drafts in the original stack. The starting head is `04f070aaa8897adf7dc185055469a18b1b6ae445`. The local branch is `codex/hostinger-staging-readiness`; obtain the final local SHA from `git rev-parse HEAD` at review time. No push is authorized.
- Hostinger still reports deployed commit `cea867a0df48d0aa145613b0d491b1a779b4ee3d`, Node 22, root `./`, auto-deployment off and no connected repository. Environment names were inspected without revealing values. User-designated `u858869017_sprtaya_phase2` is listed under the magenta site, and phpMyAdmin shows no tables. Staging database reachability, credentials and privileges are unverified.
- Anonymous staging page, admin, sitemap and static-asset checks returned 401 with noindex; `/robots.txt` returned a public wildcard allow rule. Authenticated Hostinger responses were not tested here. Hostinger's current application was not changed.
- Local regression: 244 tests in 35 files passed, including actual isolated MariaDB and object-storage integration tests. Prisma validation, lint, TypeScript and the production build passed. Three tests specifically cover the sitemap boundary. The temporary local production-mode staging server passed 32 access, headers, robots, sitemap and route checks using generated synthetic credentials; commerce was disabled in that simulation. This is not hosted-staging or full synthetic-commerce acceptance.
- Six new local browser and axe checks passed on the protected Arabic and English homepages at 390, 768 and 1440 pixels, with no WCAG 2 A/AA/2.1 AA violations or horizontal overflow. These do not cover the complete commerce journey. Previous Phase 4 browser/accessibility evidence and successful GitHub CI are recorded in `docs/phase4/` and refer to the starting candidate, not this unpushed local change. A fresh dependency audit returned one moderate finding. Hostinger reports two moderate package instances; the deployed version is not patched by this work.
- Earlier local backup and migration rehearsals used verified disposable data, not an export of Hostinger's database. Prior asset-preservation checks covered 1,753 images and 229 source files. No customer data, original assets, hosted database or production infrastructure was modified.

## Migration and recovery

The observed empty staging database has no migration ledger. If it remains the approved target, the following seven checked-in migrations would be pending, in this order, subject to a fresh identity/history check and separate authorization:

1. `20261027000000_phase2_initial`
2. `20261027120000_phase2_2_review_safety`
3. `20261029143000_phase3_local_commerce`
4. `20261029144500_phase3_cancellation_review`
5. `20261030023000_phase35_factory_operations`
6. `20261030024500_phase35_customer_access`
7. `20261031000000_phase4_report_indexes`

Use the reviewed manifest for checksums. Before any migration, verify actual target and privileges, create an authorized backup and demonstrate restore into an isolated database. On failure stop, preserve logs and use the separately reviewed recovery procedure; do not blindly rerun or rewrite migration history. Code rollback does not undo database changes.

## Readiness and approvals

| Area                                    | Decision                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Hostinger environment identity          | VERIFIED for the observed application; server entry and authenticated routes remain unverified |
| Staging database identity               | VERIFIED as user-designated and listed; cross-website use remains unverified                   |
| Database connection / backup / recovery | BLOCKED                                                                                        |
| Persistent media                        | BLOCKED                                                                                        |
| Routing / indexing                      | BLOCKED pending hosted trace and correction                                                    |
| Restricted staging runtime              | PARTIAL; hosted commerce stays disabled                                                        |
| Dependency security                     | PARTIAL; one moderate audit finding                                                            |
| Local staging simulation                | PARTIAL; 32 HTTP checks passed, full hosted-mode commerce unavailable                          |
| Controlled staging deployment           | BLOCKED                                                                                        |
| Production launch                       | NOT AUTHORIZED                                                                                 |

The minimum subsequent approvals are: (1) permission for the specific backup/export and isolated restore method after its scope is reviewed; (2) approval for the selected isolated storage service and any cost; (3) review and approval of a synthetic-only staging-runtime design and its connection configuration; (4) separate approval for the exact database migration target and operations after preflight and verified backup; and (5) separate approval for an exact manual staging deployment after the blockers are resolved. Pushing this local branch and merging any PR each require their own authorization.
