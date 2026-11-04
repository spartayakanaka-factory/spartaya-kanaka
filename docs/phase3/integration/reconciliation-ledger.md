# Reconciliation ledger — 30/30

The authoritative starting point is canonical `cea867a0df48d0aa145613b0d491b1a779b4ee3d`. The 30 differences were measured against its earlier ancestor `254ad4c...`. Accepted local Phase 2 work was captured in snapshot `a544885...`; its earlier per-file commit history is unavailable, so this ledger does not invent finer provenance. Phase 3 and audit deltas follow the recorded local commits.

Every row was reviewed against canonical and snapshot implementations. Existing Phase 2 assertions were retained. No accepted branch was replaced and no unrelated Git history was merged. The integration commit descends directly from the current canonical commit.

| ID | Path | Resolution and rationale | Evidence |
|---|---|---|---|
| R01 | `.gitignore` | **Union** — Exclude private local runtime, build output and original products; keep canonical ignore rules. | `secret-and-preservation.json` |
| R02 | `README.md` | **Merge** — Retain Phase 2 local acceptance and Phase 3 links while preserving canonical staging repair/media guidance. | `report.md` |
| R03 | `docs/owner-dashboard.md` | **Local** — Replace obsolete future-only Phase 2 description with accepted operational scope; retain proposal context. | `regression-tests.json` |
| R04 | `docs/phase-2-setup.md` | **Local** — Link accepted local runbook; do not equate local acceptance with hosted database acceptance. | `promotion-rehearsal.json` |
| R05 | `eslint.config.mjs` | **Union** — Exclude isolated runtime/build directories without disabling source checks. | `static-validation.json` |
| R06 | `next-env.d.ts` | **Canonical generated template** — Use standard .next generated references; the build regenerates references for the selected distDir. | `static-validation.json` |
| R07 | `next.config.mjs` | **Merge** — Preserve full SWC package tracing, staging-only unoptimized images and noindex; add private-runtime tracing exclusions. | `staging-http-local.json` |
| R08 | `scripts/deploy-migrations.mjs` | **Blocking shim** — Original entry point is absent from the Phase 2 snapshot; retain the path but block Phase 3 promotion instead of restoring a bypass. | `regression-tests.json` |
| R09 | `scripts/owner-bootstrap-secret.test.ts` | **Local additive tests** — Retain Hostinger fingerprint tests and add explicit isolated-local confirmation/remote rejection coverage. | `regression-tests.json` |
| R10 | `scripts/owner-bootstrap-secret.ts` | **Local additive guard** — Allow only explicitly confirmed safe local bootstrap in addition to unchanged designated Hostinger checks. No owner is created by integration. | `regression-tests.json` |
| R11 | `src/app/[locale]/page.tsx` | **Local** — Preserve authentic editorial images when DB products are drafts; avoid dead draft/category links and use visible category fallback. | `browser-evidence.json` |
| R12 | `src/app/admin/actions.ts` | **Local plus audited Phase 3** — Keep Arabic price parser, publish validation, atomic category audit/deletion safeguards, variant retirement uniqueness, inventory idempotency; retain reservation safety and new-template-only deposit policy. | `regression-tests.json` |
| R13 | `src/app/admin/admin-frame.tsx` | **Local plus Phase 3** — Retain permission-filtered audit link and add gated order links without removing canonical staff navigation. | `browser-evidence.json` |
| R14 | `src/app/admin/admin.css` | **Local plus audited usability** — Retain tablet review layout and Phase 3 styles; named inventory scroll regions remain focusable. | `inventory-final-review.json` |
| R15 | `src/app/admin/categories/page.tsx` | **Local** — Expose actionable hierarchy/slug/missing errors and delete only empty unreferenced categories. | `regression-tests.json` |
| R16 | `src/app/admin/inventory/page.tsx` | **Local plus audited Phase 3** — Filter archived/inactive variants; show physical/reserved/sellable quantities and order movement ledger. | `inventory-final-review.json` |
| R17 | `src/app/admin/page.tsx` | **Local** — Compute low/out-of-stock counts from active ready-made variants using each threshold. | `regression-tests.json` |
| R18 | `src/app/admin/products/media-picker.tsx` | **Local** — Keep newly uploaded images in selectable library, preserve partial successes, enforce 30-image cap and clearer Arabic errors. | `regression-tests.json` |
| R19 | `src/app/admin/products/page.tsx` | **Local** — Paginate all products instead of truncating at 200; retain filters/search and permission checks. | `regression-tests.json` |
| R20 | `src/app/admin/products/product-form.tsx` | **Local** — Preserve selected images outside newest library slice, support Arabic decimal input, correct published save label. Existing manufacturing policies remain unchanged. | `regression-tests.json` |
| R21 | `src/app/admin/products/review/page.tsx` | **Local** — Use text decimal inputs so Arabic numerals reach the shared verified-price parser. | `regression-tests.json` |
| R22 | `src/app/admin/products/variant-editor.tsx` | **Local** — Use shared Arabic-aware price parsing without browser number-input rejection. | `regression-tests.json` |
| R23 | `src/app/api/admin/media/upload-url/route.ts` | **Local** — Sign owner metadata and content type explicitly; retain direct staging and independent staff authorization. | `regression-tests.json` |
| R24 | `src/components/product-gallery.tsx` | **Local** — Use public URL as key when an S3 image has no legacy path. | `browser-evidence.json` |
| R25 | `src/lib/asset-url.ts` | **Local** — Allow HTTPS and loopback-only HTTP for local S3; reject arbitrary insecure HTTP and preserve archive fallback. | `regression-tests.json` |
| R26 | `src/lib/server/database.ts` | **Local** — Reuse a production-process Prisma instance rather than allocating a new pool per call. | `regression-tests.json` |
| R27 | `src/lib/server/media-storage.ts` | **Local** — Avoid empty-body checksum generation during presigned uploads; keep existing scoped S3 interface. | `regression-tests.json` |
| R28 | `src/lib/server/mysql.integration.test.ts` | **Local additive correction** — Assign explicit manufacturing-policy primary IDs to avoid global-default collision; preserve all original assertions. | `regression-tests.json` |
| R29 | `tsconfig.json` | **Union** — Include current generated route types and exclude private runtime directories while preserving strictness. | `static-validation.json` |
| R30 | `vitest.config.mts` | **Local plus audit** — Collect script safety tests and serialize shared-policy suites; explicit concurrency tests remain genuinely concurrent. | `regression-tests.json` |

The JSON companion records old/current canonical blobs, snapshot/audited blobs and final content digests. `next-env.d.ts` is regenerated by Next during builds and restored to the canonical template before recording the final inventory. Machine-specific tracked node_modules/archive symlinks from the local snapshot were deliberately excluded. The clean install has its own real node_modules directory.

The four newer hosting commits (`e6f7860`, `ac022ca`, `fbc7007`, `cea867a`) remain in the parent history. Their pnpm hoisting, full SWC helpers, staging image delivery, persistent archive root, route tests and documentation are retained. See `canonical-repair-preservation.json`.
