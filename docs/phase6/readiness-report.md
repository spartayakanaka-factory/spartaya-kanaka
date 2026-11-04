# Phase 6 preflight — PARTIAL; hosted deployment NO-GO

Completed 2 November 2026 using authorized local checks and read-only Hostinger inspection. **No hosted configuration, deployment, process, database, storage, DNS or GitHub write occurred.** Maintenance remains active. This report supersedes no prior owner authorization and does not execute any gate.

| Area                            | Result          | Practical meaning                                                                                                                                                        |
| ------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release artifact integrity      | PASS            | Accepted archive verified unchanged; corrected version separately generated and verified.                                                                                |
| Source and dependency integrity | PASS            | Exact committed member hashes, frozen lockfile, unchanged dependency/schema/migration/asset bytes.                                                                       |
| Application authentication      | PASS            | Corrected extracted package: local normal production server, synthetic credentials, independent privileged-route rejection. Hosted candidate acceptance remains pending. |
| Static resource protection      | PARTIAL         | Local JS/CSS/images protected; current hosted maintenance blocks tested static paths. Future direct Hostinger mappings without maintenance are not proven.               |
| Hostinger deployment readiness  | NOT READY       | New corrected artifact needs review; uninterrupted maintenance across ZIP publication is not established.                                                                |
| Hosted security readiness       | NOT READY       | No candidate authentication transition authorized/executed; upstream robots response currently allows wildcard crawlers.                                                 |
| Database migration readiness    | NOT READY       | Seven-file plan/guards verified locally; fresh hosted identity/empty state, export/restore and execution approval still required.                                        |
| R2 persistence readiness        | NOT READY       | Configuration/authorization tests passed locally; no real Hostinger-to-R2 persistence test or configuration this phase.                                                  |
| Rollback readiness              | READY, app-only | Recovery archive and off-server media backup rehashed/available; prior rehearsal reused, no fresh hosted restore attempted. Not a database rollback.                     |

## Release identity and the confirmed local fix

The accepted original source is `bda268c841b28309486b600e2ea90f79a8065745`. Its immutable archive remains:

`/Users/zuriki/Desktop/Desha Kanka/.local/phase55/releases/sprtaya-phase55-bda268c841b2.zip`

SHA-256 `9cd86bd8eb6a2222c792c68b79e52a1820b6e592fbb193ffac61468e3b7164c7`; 1,520,539 bytes; 184 entries. It is intact but **must not be used for the subsequent catalog import** without the correction below.

**Confirmed high-impact import defect:** `scripts/import-legacy-catalog.ts` referenced `source` without defining it when constructing image metadata. The import command could write categories and then fail before importing product media/products. Operational scripts are excluded from the normal TypeScript project, so an application build/typecheck did not detect it. The new command-level mocked-database regression fails against the old exact script and passes after resolving metadata from the original catalog record. No actual database was used or changed by that regression. Actual byte-derived WebP MIME and preservation of original fields remain intact. A separate strict TypeScript check now also passes for this importer.

**Corrected release source:** `b9a757067cf89fc9301a72b8a956467420c634a1`, local branch `codex/phase6-preflight`.

**Corrected archive:**

`/Users/zuriki/Desktop/Desha Kanka/.local/phase6/releases/sprtaya-phase55-b9a757067cf8.zip`

**SHA-256:** `cf68dc75eae8e381ef39c03cf6675d0ad08eea5f339e97ba6f84fc3ae326d1e4`

**Size:** 1,520,566 bytes; 184 entries, below 50 MB. Only `scripts/import-legacy-catalog.ts` and generated `RELEASE-MANIFEST.json` differ from the original ZIP; no added/removed members. All member bytes match their exact new source commit. Dependency versions, lockfile, Prisma schema, seven migrations, application authentication, storefront and Arabic assets are unchanged. Six non-ASCII paths retain UTF-8 metadata; no unsafe extraction path, symlink entry, Unicode normalization collision or duplicate member. No replacement of either original candidate or recovery archive.

The versioned source ZIP excludes credentials/environment files, database dumps, backups, dependency/build trees, investigation documents and browser source maps. Fresh secret-pattern scanning returned no findings. The unchanged source portions also retain the Phase 5.5 scan against 11 known private local values; actual Hostinger credentials were never retrieved. Catalog/brand records are public factory data; no customer/order export is packaged. A scanner is evidence, not a guarantee against every possible unknown secret.

**Documentation correction:** the application uses `MEDIA_ACCESS_KEY_ID` and `MEDIA_SECRET_ACCESS_KEY`, not the previously documented `MEDIA_S3_ACCESS_KEY_ID` and `MEDIA_S3_SECRET_ACCESS_KEY`. The guidance now includes `STAGING_R2_ACCOUNT_ID` and `MEDIA_S3_FORCE_PATH_STYLE`. No runtime variable requirement changed.

## Fresh local validation

| Check                                                                                               | Actual result                                                                             |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| New ZIP integrity, source/member hashes, Unicode/path and exclusion checks                          | PASS                                                                                      |
| Fresh extraction and frozen offline pnpm install                                                    | PASS; 569 packages, no dependency downloads/upgrades                                      |
| Production `pnpm build` / webpack                                                                   | PASS; Node 22.23.4, pnpm 11.24.0, Next 16.4.3                                             |
| TypeScript, ESLint, Prisma schema validation                                                        | PASS                                                                                      |
| Strict standalone importer TypeScript check                                                         | PASS                                                                                      |
| Targeted authentication, asset, API, database guard, migration, importer and R2 configuration tests | **101 passed, 0 failed, 0 skipped**, 13 files                                             |
| Exact extracted package: real production-mode Next server                                           | **46 HTTP checks passed**, synthetic credentials only; no DB/provider/storage credentials |
| Manual migration command `--prepare`                                                                | PASS; local SQL/manifest reads only, seven ordered/checksummed migrations                 |
| Original importer regression challenge                                                              | Old script fails as expected; fixed script passes with mocked persistence                 |
| Build tracing/private files/browser source maps                                                     | Both CJS/ESM SWC helpers traced; no private file traces or public browser source maps     |

The first preparation-only invocation was blocked by local tsx socket permissions; rerunning with permitted local socket access and the validated CI environment passed. One non-CI retry was rejected by pnpm's noninteractive modules check; no database operation occurred. These are retained in evidence rather than reported as passed first attempts.

The generated build traces contain one local ancestor `package.json` because the validation directory is nested inside the original project. No outside runtime dependency is imported into this source ZIP. Only generated `next-env.d.ts` changed during build. **Deploy source, never this local `.next` directory**; inspect Hostinger's generated traces and launcher after the separately approved build. macOS validation does not establish Hostinger Linux/GLIBC compatibility.

The prior Phase 5.5 338-test/110-real-DB-storage suite, 23 product/factory browser checks and responsive/accessibility results are reused, not claimed as rerun. Phase 6 ran **zero real database or hosted R2 tests**. No financial/UI/schema change required repeating the large acceptance suite; the importer CLI regression uses a mocked DB and does not establish a new real import acceptance.

## Fresh Hostinger observations

Connector deployment data and read-only SSH agree:

- Target is the enabled existing Node.js website `bisque-pheasant-330767.hostingersite.com`, user `u858869017`, order `1010247489`. No other website was modified or audited.
- Current successful build remains **`01a198ba-dc6f-725b-a9c2-4d5b254e552a`**, completed 1 November 2026 at 20:11:24 UTC. Source is the older `sprtaya-candidate-aa593e5-minimal.zip`; the API records no Git SHA for this archive deployment. This is not the Phase 5.5/new candidate.
- `hbuilds/current` resolves to `hbuilds/versions/01a198ba-dc6f-725b-a9c2-4d5b254e552a`. Actual Passenger startup is `server.js`, Node `/opt/alt/alt-nodejs22/root/bin/node`. The generated launcher contains `startServer` and `__NEXT_PRIVATE_STANDALONE_CONFIG`: Hostinger performs packaging beyond a normal local `next start`.
- Stored settings: Node 22, Next, pnpm, root default, build script `build`, output `.next`. No Git auto-deployment configuration is returned (`null`). No attempt to reconnect GitHub or start a build.
- Recent runtime log snapshot: Next 16.4.3, Ready, no errors among five returned entries. This shows startup, not complete application health under maintenance.
- Document root contains only `.htaccess` in the observed top-level inventory. Application/deployment files are under `hbuilds`, persistent originals under `shared`; no public source/archive was observed in that root. Global LiteSpeed mappings are not enumerable from these observations. No claim that Next.js guards files served directly by the host.
- Maintenance file is 563 bytes with `Require all denied` and existing Passenger/Node directives. SHA-256 **`ba9d141db2a481f9e7f11f90dfe555bd29d1a228f7313d2f3427fd95e98d63ac`**, matching the prior checkpoint. Read-only snapshot retained in evidence; no restoration was necessary.
- Existing names are exactly `APP_ENV`, `STAGING_SITE`, `STAGING_ACCESS_USERNAME`, `STAGING_ACCESS_PASSWORD`, `LEGACY_ASSET_ROOT`. API values stayed masked. Their actual runtime values and owner-held secure backup were not independently retrieved/verified in this phase. No `DATABASE_URL`, R2 credentials or payment/provider credentials appear in this configured-name inventory.
- Shared directory resolves outside `public_html` and `hbuilds`; fresh count is **1,753 files**. Off-server backup exists and matches SHA-256 **`ada01123c5aa75c3f40de6fed22f402e5d866c5ba43dce8f878d27a903704d17`**. Prior all-file byte comparison remains Phase 5.5 evidence; this phase did not rehash every hosted original.

**Independent fresh HTTP results, 18 requests:** anonymous and invalid site credentials each returned **403** for Arabic/English pages, admin login, admin media API, disabled DB preflight, icon, an actual emitted JS chunk and CSS file. `/robots.txt` returned **200**, no `X-Robots-Tag`, body `Googlebot Disallow: /; * Allow: /`. This response is nonsensitive, so 200 itself is not an access-control failure. Its effective wildcard allow is an indexing issue for later reopening. It bypasses the observed maintenance behavior; the exact upstream origin cannot be established from this read-only observation. The candidate's local metadata route disallows all and returns noindex, but that does not prove it replaces this upstream response.

## Security decision and resource classification

Use the existing Next.js Basic gate as the primary application restriction, plus independent staff/customer/session/financial authorization. Do not revisit Apache credential negotiation or spoofable forwarding-header IP restrictions. Keep source, env, logs, archives, evidence and database exports outside web-served roots; both staging R2 buckets remain private.

1. **Next.js routes/APIs/actions:** locally protected; independent privileged authorization remains required. The disabled preflight needs site auth and its own temporary token after future approval.
2. **Hostinger-served static files:** currently denied by maintenance. Without maintenance, behavior is unverified for the new release. Only owner-approved compiled client assets and already-public factory imagery could be intentionally public; no sensitive static file exception.
3. **Persistent originals/uploads:** originals remain external/shared and are served by the guarded asset route with realpath containment and byte-derived MIME. New private R2 display objects use registered derivative keys through the protected application route; private evidence retains order/staff authorization. No bucket was inspected or changed this phase.
4. **Deployment artifacts:** source-only ZIP/last-source/build folders must not become download paths. Build output and upload staging can differ; verify actual mapped paths at Gate 2.
5. **Private files:** no anonymous or site-viewer access permitted. A guarded Node 404 does not prove another Hostinger direct mapping is safe.

With only the five named variables and no packaged credentials, the candidate has no database connection configuration. The local production check starts with local catalog and unavailable DB-dependent administration; no build/start migration, seed, import or provisioning hook exists. Commerce requires explicit isolated-host configuration and allowlists and remains disabled. Real payment and external notification providers are not activated. No draft publication occurs at startup.

## Recovery and remaining blockers

Recovery ZIP remains available:

`/Users/zuriki/Desktop/Desha Kanka/.local/staging-readiness/releases/sprtaya-recovery-cea867a.zip`

37,716,671 bytes; SHA-256 `f7ef1fc42ad070b0fe424a00882ec873f97cb15c19dfac99905dd321eb3b28d8`.

Off-server media archive:

`/Users/zuriki/Downloads/Sprtaya-Backups/sprtaya-media-2026-11-01.tar.gz`

332,109,106 bytes; checksum above. Both remain unchanged. The old recovery ZIP was previously rehearsed successfully; this phase verified its current bytes/availability, not another hosted recovery. The rollback procedure preserves maintenance, Passenger, private env values and shared media. It is app-only; after database initialization, schema/client compatibility and any data restore need separate approval.

Remaining decisions/evidence:

1. Review the corrected source/artifact and either establish a supported publication block outside replaced directories or **explicitly approve a bounded monitored publication with residual exposure risk**. The current phase does not grant that approval. Monitoring is mitigation, not guaranteed uninterrupted protection.
2. Obtain new-release hosted auth/static/source/cache/image/robots evidence under the bounded rollback gate. Current maintenance responses do not establish candidate acceptance or readiness for permanent reopening.
3. After security passes, separately approve exact-target read-only DB connectivity. Fresh empty state/ledger/grants/other-app use, consistent export, off-server backup and disposable restore verification precede any migration approval. No hosted DB access occurred here.
4. Configure actual-name private R2 variables only after approval and perform real app-level authorization/persistence tests. No local mock result substitutes for hosted R2 acceptance.
5. Complete hosted synthetic business acceptance and dated human Arabic owner signoff. Merchant tax/shipping/COD/reconciliation/deposit/refund/retention policies remain governed by the existing decision register; do not turn fixture values into approved merchant policies.

## Exact next approval

**Not a migration or reopening request.** Review source `b9a757067cf89fc9301a72b8a956467420c634a1` and SHA-256 `cf68dc75eae8e381ef39c03cf6675d0ad08eea5f339e97ba6f84fc3ae326d1e4`. Then approve or decline **one code-only Hostinger publication to the existing bisque-pheasant app plus a separately bounded security diagnostic**, explicitly choosing how to handle the known publication gap. Preserve the five private values/shared media, keep database/storage/provider credentials absent and commerce/notifications off, and restore maintenance at the diagnostic deadline. No GitHub push, database write, R2 upload, permanent reopening or production operation is included.

If uninterrupted protection remains required and no supported independent gate is established, the decision remains **NO-GO**. Do not deploy based on this report alone.

All six gates with preconditions, authorizations, exact actions, expected evidence, fail conditions and recovery: [hosted-gates.md](hosted-gates.md). Machine-readable read-only and local results are in [evidence](evidence/test-summary.json).
