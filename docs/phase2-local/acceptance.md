# Phase 2 local acceptance — 29 October 2026

**Local functional acceptance: PASS. Hosted/release acceptance: PARTIAL.** Development is unblocked on a real isolated MariaDB and persistent local S3 service. No Hostinger operation, deployment, DNS change, payment integration or Phase 3 work was performed in this local completion task.

## Running application and infrastructure

- Production-mode app: <http://localhost:3002/admin> and <http://localhost:3002/ar>.
- MariaDB **11.8.9**, bound only to **127.0.0.1:33077**. InnoDB, foreign keys and CHECK constraints verified enabled.
- Separate databases: `sprtaya_phase2_local` for the app and `sprtaya_phase2_test` for integration tests. The application account has grants only on these databases. Only the password-protected socket root identity remains.
- SeaweedFS **4.51**, S3 endpoint **127.0.0.1:39000**, all components bound to loopback, with private originals and publicly readable display objects. Data is stored outside Next.js output in ignored `.local/phase2/media`.
- Node **24.22.1**, pnpm **11.24.0**, Next.js **16.4.3**, Prisma and MariaDB adapter **7.10.1**, Better Auth **1.7.14**. Application dependency pins and lockfile were not upgraded. This is macOS ARM64 evidence; it is not a Hostinger/Linux/Node 22 compatibility claim.

Use [the local runbook](README.md). Private random synthetic-owner credentials live only in `.local/phase2/owner.json`; they are not printed in this report. The owner completed the mandatory first-password change. This is a local test identity, not a provisioned production factory owner.

## Database and catalog results

Both existing migrations applied successfully to both empty local databases:

1. `20261027000000_phase2_initial`
2. `20261027120000_phase2_2_review_safety`

The migration SQL and schema were not changed. Guarded reruns reported **no pending migrations**. Existing Hostinger exact-target and production protections remain intact. Noninteractive local owner bootstrap requires a confirmed local environment and passes the database safety guard; remote and production attempts are rejected. A second bootstrap was rejected without creating another owner.

The real importer created **487 drafts**, **38 categories**, **1,752 archive-backed media records**, and **2,938 category/gallery relations**. It found **0 missing archived image files**, **0 unmapped category references**, and **0 failed products**. The second apply created **0** products and skipped all **487** existing mappings. A separate real-database test confirmed importer reruns preserve an edited synthetic record's fields and relations.

After removing only synthetic browser product/category fixtures, final app database counts are:

| Item | Actual result |
| --- | --- |
| Factory products / source mappings | 487 / 487 |
| Drafts / published products | 487 / 0 |
| Products with operational prices | 0 |
| Categories / visible categories | 38 / 0 |
| Original archive-backed media | 1,752 |
| Additional persisted local S3 upload records | 4 |
| Applied active migrations | 2 |
| Remaining integration-test users in test DB | 0 |

Synthetic prices and inventory were used only for clearly marked test products. They were never assigned to genuine catalog products. Test products and categories have been removed; audit evidence and uploaded photo assets are retained. The original extraction archive was not rewritten or deleted. The public database catalog therefore remains empty until the owner approves genuine product data. Approved editorial factory photography still renders on the homepage.

Archive format caveat: the tested source photographs contain WebP bytes under `.jpg` filenames. The real browser upload test supplied the genuine WebP MIME type/name without changing those files. Owner uploads still reject mismatched file contents. Any later archive-to-object-storage transfer must inspect actual file signatures rather than infer MIME solely from extensions.

An empty-schema backup was taken before migrations. A later snapshot was restored into a newly created disposable verification database: **all 22 table row counts matched**, the source was unchanged, and the disposable database was removed. Final verified backup: `.local/phase2/backups/20261029-030811.sql`, private mode 600. These dumps contain data/password hashes and must never enter GitHub.

## Changes completed

- Added isolated MariaDB/tool/S3 lifecycle scripts and a local runner that refuses remote database targets. No system package manager, Docker installation, paid resources or production credentials were needed.
- Made the Prisma client reuse its connection pool in production mode.
- Added Arabic/Persian digit and decimal handling for prices with exact integer minor units and rejection of ambiguous/invalid amounts.
- Protected published products against incomplete edits and atomic bulk-review failures. Published media changes require publishing permission as well as media permission.
- Fixed inventory availability synchronization and excluded inactive/archived stock from operational views.
- Fixed per-product manufacturing policy IDs colliding with the global policy, without changing the schema.
- Fixed repeated replacement of empty variants colliding with retired variant positions.
- Added audited empty-category deletion, slug/parent/media validation, complete 50-row catalog pagination, visible audit navigation and clearer save states.
- Kept selected product media available when it is outside the latest 200 library entries; retained successful uploads after partial upload failures.
- Fixed real S3 presigning: explicitly sign the owner metadata header and content type, and avoid calculating an empty-body checksum before a browser supplies the image. The four tested configuration combinations produced signature failure, checksum failure, or success; the implemented combination succeeded.
- Allowed HTTP display URLs only for loopback development storage; HTTPS remains supported for external storage. Preserved the storefront palette, typography, layouts and genuine photography. Unpublished product detail links remain hidden.
- Improved tablet bulk-review fields and kept action controls from covering form content.
- Ignored private local services in Git/TypeScript/ESLint and explicitly excluded `.local` and environment files from Next.js deployment traces.

## Executed validation

| Validation | Actual result |
| --- | --- |
| Prisma schema validation | PASS |
| Existing migrations: fresh apply and guarded rerun, both DBs | PASS |
| TypeScript | PASS |
| ESLint | PASS |
| Vitest | **101 passed, 18 files, 0 skipped/failing** |
| Real DB/storage subset | **20 passed**: 5 schema/auth/import/inventory tests and 15 admin/auth/storage tests |
| Production build | PASS, `next build --webpack` with `.next-local` |
| Production-mode server startup | PASS, final startup 135ms |
| Real Chrome browser flow | **11/11 checks passed** |
| Admin axe audits | **3 audits, 0 violations** in tested WCAG tags |
| Responsive review | PASS at **390 / 768 / 1440px**, Arabic admin and Arabic/English storefront; no horizontal overflow or broken images in the completed run |
| Final runtime smoke | **12 routes returned 200**, secure owner session, no browser exceptions |
| Product list pagination | 487 records, 10 pages; 50 on page 1 and 37 on page 10 |
| Backup restore | PASS, matching counts across 22 tables |
| S3 restart persistence | PASS, original SHA-256 hashes matched DB records and display reads remained 200; anonymous original reads remained 403 |
| Source/build secret checks | PASS: 163 source text files, no detected private-value/token-pattern matches, no private local files in build traces, no private values in client bundles |
| Ignore rules | PASS in a disposable Git repository; private state/environment/archive ignored and `.env.example` allowed |

Database tests execute real Better Auth, Prisma and MariaDB. The server-action integration suite adapts only Next.js request context, cache invalidation and redirect handling. Existing unit suites also use mocks and do not establish persistence. The browser flow uses the real production server, cookies, server actions and S3 HTTP uploads.

Real checks cover role permissions and forbidden writes; first-password-change enforcement; password verification, hashing and other-session revocation; expired/revoked sessions; owner-only staff provisioning; public signup rejection; a database-backed limiter returning **401 for five failed attempts then 429**; product/category creation and editing; publication and archive gates; atomic bulk rollback; concurrent and nonnegative inventory; duplicate request keys; manufacturing policies; media ownership, malformed-image rejection and finalization idempotency.

The browser independently verified creation → Arabic bulk-price review → publication → public product reads in both locales → inventory adjustment → unpublication → absence of product details, **without a code change or rebuild between those operations**. Logout removed admin access. All final smoke responses included `X-Robots-Tag: noindex, nofollow, noarchive`; the session cookie was Secure, HttpOnly and SameSite=Lax. Anonymous `/admin` redirected to login; unauthenticated media writes returned 403.

Next.js can return a streamed **HTTP 200 with not-found content** after unpublication. The test verified the unavailable page, noindex and absence of draft product details rather than treating status 200 alone as product exposure. This behavior is described in the installed Next.js not-found guide.

Two complete responsive browser passes were reviewed. The first revealed missing editorial photos/local display URL handling; those were fixed. The second loaded all images before screenshots. A final tablet review confirmed the action-control layout fix against an actual imported draft.

## Evidence

- [Browser checks and accessibility results](evidence/browser-report.json)
- [Final production HTTP/cookie/pagination checks](evidence/runtime-smoke.json)
- [Source/build security scan](evidence/security-scan.json)
- [Clean final dashboard](evidence/final-dashboard-1440.png)
- Actual factory draft review: [390px](evidence/factory-review-390.png), [768px](evidence/factory-review-768.png), [1440px](evidence/factory-review-1440.png)
- Arabic storefront during synthetic publication: [390px](evidence/store-ar-390.png), [768px](evidence/store-ar-768.png), [1440px](evidence/store-ar-1440.png)
- English storefront during synthetic publication: [390px](evidence/store-en-390.png), [768px](evidence/store-en-768.png), [1440px](evidence/store-en-1440.png)

Storefront publication screenshots contain explicitly synthetic test records/prices, now removed. They prove the flow and do not represent approved factory prices.

## Remaining release blockers and limits

1. **Owner data review:** genuine prices, variants, quantities, product types, descriptions and category visibility still require human approval. No bulk approval of the 487 products was inferred.
2. **External persistent media:** local filesystem persistence is proven. A supported externally durable service, credentials/CORS/retention configuration, and a verified transfer of the legacy archive are still needed before a hosted package can omit the archive. No cloud durability or deployment persistence is claimed.
3. **Hostinger:** routing/security recovery and hosted database/runtime acceptance remain with the separate Hostinger investigation. No Hostinger DB, environment, DNS, website or deployment was touched in this task.
4. **Owner identity:** production owner provisioning requires a separately authorized real owner identity and private credentials. The local account is synthetic.
5. The secret scan checks known private values and common token patterns; it is not a comprehensive third-party security audit. Accessibility findings apply to the tested routes and rules, not every possible workflow/device.

The source changes and evidence remain **local and unpublished**. There is no local `.git` metadata, no new commit SHA, and no GitHub branch mutation from this task. Existing GitHub code/history were preserved. No checkout, live payments, customer-account activation, factory-site change or Phase 3 implementation was introduced.

## Tool references

Portable MariaDB bottles are obtained from [Homebrew's formula API](https://formulae.brew.sh/api/formula/mariadb@11.8.json) with checksum verification. Local object storage follows [SeaweedFS's mini service](https://github.com/seaweedfs/seaweedfs/blob/4.51/README.md) and [bucket-scoped S3 identities](https://github.com/seaweedfs/seaweedfs/blob/4.51/weed/command/s3.go). Explicitly signed upload headers follow [AWS SDK presigner guidance](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/).
