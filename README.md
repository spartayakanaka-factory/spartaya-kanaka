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
- No database or staff credentials are configured in this workspace; checkout, payment, and customer accounts are not implemented. The Phase 2 admin requires the setup described below.

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

The Next.js application root is this repository root. The original product-photo directory is preserved locally and excluded from Git because it is about 319 MiB; a fresh GitHub checkout therefore needs the approved media package or storage configured before product photography can be served. This source branch is for Hostinger framework detection and review; it has not been deployed.

## Phase 1 visual redesign

The storefront now includes a product-led homepage, selectable hero photographs, a responsive shopping header, accessible search/menu dialogs, honest account/bag notices, category filtering and alphabetical sorting, improved Arabic/English search, product galleries with related pieces, and ordering/policy guidance. The root HTML now uses the correct language and direction for each locale.

The full source catalog remains on the server. Photography is still served from the untouched archive through Next.js image optimization, and Arabic/Latin fonts are self-hosted.

See [the Phase 1 redesign report](docs/phase-1-redesign-report.md) for the skill inventory, before/after audit, screenshot locations, test evidence and remaining limitations. Browser checks are in `scripts/browser-qa.mjs`; they use the available Playwright runtime and installed axe-core without adding an application dependency.

## Phase 2 admin and catalog foundation

Phase 2 adds a MySQL/MariaDB schema and migration, an Arabic role-guarded admin console, Better Auth staff sign-in, products/categories/variants, inventory ledger, settings and audit records, a draft-only legacy importer, and an S3-compatible media upload path. No database, staff credentials, or media bucket is configured in this workspace. The local catalog remains the default until an owner provisions and verifies infrastructure and reviews imported records.

There is still no checkout, payment, customer account, production deployment, or Phase 3 feature. Follow [the Phase 2 setup guide](docs/phase-2-setup.md); see [PHASE_2_REPORT.md](PHASE_2_REPORT.md) for actual validation and remaining blockers.
