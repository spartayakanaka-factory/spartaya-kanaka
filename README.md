> Current isolated Phase 3 work is documented in [the local guide](docs/phase3/README.md) and [independent audit](docs/phase3/independent-audit/report.md). Historical Phase 1/2 descriptions below are not current feature-status claims. Production and hosted commerce remain disabled.

# spartaya-kanaka

Factory website

## Sprtaya & Kanaka storefront foundation

An Arabic-first Next.js storefront for the Sprtaya & Kanaka copper factory. The default preview reads the local extraction manifests and original product photos; it does not accept orders or payments.

## Run locally

Use Node.js 22 or 24 and pnpm. Install dependencies with **pnpm install**, then start the development server with **pnpm dev**. Visit **http://localhost:3000**; the root redirects to **/ar**. Set **NEXT_PUBLIC_SITE_URL=http://localhost:3000** in **.env.local** while reviewing locally.

Useful commands:

- **pnpm dev** — local development
- **pnpm typecheck** — TypeScript validation
- **pnpm lint** — ESLint
- **pnpm test** — catalog adapter tests
- **pnpm build** — production build
- **pnpm start** — serve the production build

## What is implemented

- Arabic and English routes, with right-to-left and left-to-right layouts.
- Product and verified category browsing, local Arabic search, product detail galleries, About, wholesale, custom manufacturing, and contact pages.
- Source product prices are retained in the catalog adapter but are never rendered. Every imported product is explicitly browse-only.
- Original images are streamed from the preserved **sprtaya-kanaka-assets** folder through an allow-listed image route.
- The isolated local Phase 2 environment now uses MariaDB and private synthetic staff credentials. Checkout, payment, and customer accounts are not implemented. See [local setup and acceptance](docs/phase2-local/README.md).

## Project notes

- [Architecture](docs/architecture.md)
- [Route plan and scope](docs/routes-and-scope.md)
- [Catalog inventory and gaps](docs/catalog-inventory.md)
- [Future data model](docs/future-data-model.md)
- [Owner dashboard proposal](docs/owner-dashboard.md)
- [Hostinger readiness](docs/hostinger-deployment.md)
- [Phase 2 roadmap](docs/phase-2-roadmap.md)
- [Phase 2 setup](docs/phase-2-setup.md)
- [Phase 2 implementation report](PHASE_2_REPORT.md)
- [Old-to-new URL manifest](src/data/migration-manifest.json)

The asset extraction report and original manifests remain in **sprtaya-kanaka-assets**. The app does not edit that archive.

The Next.js application root is this repository root. The original product-photo directory is preserved locally and excluded from Git because it is about 319 MiB; a fresh GitHub checkout therefore needs the approved media package or storage configured before product photography can be served. Staging deployment history is documented separately; the local Phase 2 procedure does not deploy or alter a hosted app.

## Phase 1 visual redesign

The storefront now includes a product-led homepage, selectable hero photographs, a responsive shopping header, accessible search/menu dialogs, honest account/bag notices, category filtering and alphabetical sorting, improved Arabic/English search, product galleries with related pieces, and ordering/policy guidance. The root HTML now uses the correct language and direction for each locale.

The full source catalog remains on the server. Photography is still served from the untouched archive through Next.js image optimization, and Arabic/Latin fonts are self-hosted.

See [the Phase 1 redesign report](docs/phase-1-redesign-report.md) for the skill inventory, before/after audit, screenshot locations, test evidence and remaining limitations. Browser checks are in `scripts/browser-qa.mjs`; they use the available Playwright runtime and installed axe-core without adding an application dependency.

## Phase 2 admin and catalog foundation

Phase 2 adds the MySQL/MariaDB schema and two migrations, an Arabic role-guarded admin console, Better Auth staff sign-in, products/categories/variants, inventory ledger, settings and audit records, a draft-only legacy importer, and an S3-compatible media upload path. The isolated local runner selects MariaDB; the standard preview still defaults to the archive catalog. See [the local development guide](docs/phase2-local/README.md) for private local services and [the latest acceptance report](docs/phase2-local/acceptance.md) for executed evidence. Earlier reports retain their historical test results.

There is still no checkout, payment, customer account, production deployment, or Phase 3 feature. Follow [the Phase 2 setup guide](docs/phase-2-setup.md); see [PHASE_2_REPORT.md](PHASE_2_REPORT.md) for actual validation and remaining blockers.

## Phase 3 local implementation

Phase 3 now implements customer identity, carts, checkout, reservations, local mock/manual payments, refunds and order operations in an isolated disposable environment. See the [local guide](docs/phase3/README.md), [implementation acceptance](docs/phase3/acceptance.md), and [independent audit](docs/phase3/independent-audit/report.md). Merchant policy, persistent database promotion, live providers and deployment remain gated. The architecture and owner-decision documents retain earlier planning recommendations, not new financial-policy approvals.

## Reconciled Phase 3 integration candidate

This isolated local candidate descends from canonical staging commit `cea867a0df48d0aa145613b0d491b1a779b4ee3d`, retaining its hosting repairs. See the [integration report](docs/phase3/integration/report.md), [30-file ledger](docs/phase3/integration/reconciliation-ledger.md), [merchant decisions](docs/phase3/integration/merchant-decisions.md), and [staging checklist](docs/phase3/integration/staging-checklist.md). It is not pushed or deployed; persistent migrations and hosted commerce remain blocked. Earlier local/audit reports describe their original source snapshots.
