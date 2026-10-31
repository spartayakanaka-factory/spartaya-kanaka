# Separate Phase 4 evidence review

This is a separate evidence-based review performed by the implementer, not an external audit. `scripts/phase4-evidence-review.py` cross-checks the final artifacts independently of the implementation test harness. It checks the fixed 14-gate list, exact regression and browser counts, financial expected/actual amounts, two distinct concurrency results, outage and recovery evidence, backup and migration hash, advisory metadata, preservation manifests and each workload size and measurement count.

The review distinguishes the separate database server stopped during an in-flight request from report recovery on the allowed local database, and distinguishes Prisma query-event time from MariaDB execution and pure Node CPU. It does not infer production capacity, live-payment correctness, hosted security, a clean future advisory database, or an external human accessibility audit. The full matrix and limits are in `FINAL_ACCEPTANCE.md`.

No unresolved critical or high-severity defect was established in the scoped local checks. The prior synthetic session-cookie diagnostic was revoked and logging was sanitized. Hostinger routing and staging access remain separate blockers to a hosted release. Local acceptance and readiness for a stacked draft review do not authorize push, merge, migration or deployment.

## Integration review — 2026-10-31

The integrated candidate was independently inspected against the newer Phase 3.5 review head. A local full regression passed 241 tests in 34 files with real disposable database and storage suites enabled; lint, schema validation, TypeScript and production build passed. Eight local reporting HTTP/browser checks and six Arabic/English accessibility audits passed. Review covered authoritative payment and refund events, owner authorization, transaction bounds and failure behavior; it does not establish production financial correctness or capacity.

The original workflow did not trigger on a Phase 4 PR whose base was the Phase 3.5 review branch. The integration adds a separate isolated CI mode, checks required database suites actually execute, and preserves the non-deployment workflow. A report integration test's random date could collide with existing synthetic fixtures; it now finds an empty interval before creating its fixture. A pre-publication scan found no known local secrets or credential patterns in the candidate, build or reachable history; 1,753 original assets and 229 accepted-source files matched their preservation manifests.

The complete seven-migration chain was additionally rehearsed using a SHA-256-verified Phase 3 backup restored into two newly created local disposable schemas. Existing row data in 44 tables matched across promotion, all seven migration checksums matched, a second deploy found no pending migrations, and a separate restore matched the backup. The backup contained synthetic products and transactions, not the 487 imported drafts; the earlier draft-preservation evidence is separate. This is not a rehearsal of Hostinger's actual database or persistent media.

Remaining release blockers include hosted commerce's deliberate local-only guard, the lack of a verified staging database backup/restore and persistent upload storage, and the Hostinger `robots.txt` response allowing wildcard crawlers. The deployed site remains a separate, unchanged release.
