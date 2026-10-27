# Sprtaya & Kanaka — Phase 1 redesign report

Date: 27 October 2026, Africa/Cairo. Scope: local frontend redesign only.

Local review preview: http://127.0.0.1:3001/ar. The separate production verification server on port 3002 was stopped after validation.

The existing Next.js 16 / React 19 application, catalog adapter, original identifiers, category relationships and image archive were retained. The homepage, shopping navigation, discovery and product presentation have been substantially rebuilt. No deployment, database rebuild, payment integration or Phase 2 workflow was undertaken.

## Skills discovered and applied

Only **two workspace-installed skills** were present in `.agents/skills` and `skills-lock.json`; four new workspace skills could not be verified. Nothing was reinstalled.

| Skill                 | Source                                                | Applied to                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| design-taste-frontend | `.agents/skills/design-taste-frontend/SKILL.md`       | Direction draw, typography, image selection, responsive composition, source lint, production screenshot inspection and written critiques. References read included copy, layout, type, color, imagery, motion and critique guidance. |
| web-design-guidelines | `.agents/skills/web-design-guidelines/SKILL.md`       | Original and final interface/accessibility audits using its freshly fetched official guidelines.                                                                                                                                     |
| react-best-practices  | Installed Vercel plugin skill                         | Server/client boundaries, narrowly shared image helper, minimal client props, React composition and TSX review. Relevant bundle/serialization references were read.                                                                  |
| playwright-cli        | Bundled Playwright skill                          | Browser automation workflow. The CLI was not on PATH; the available bundled Playwright runtime drove installed Chrome without installing another browser or application dependency.                                                  |
| verification          | Installed Vercel plugin skill                         | Complete user story: navigation/search/filter → server catalog adapter → real results/images → product gallery and direct contact.                                                                                                   |
| Sites                 | Installed Sites plugin skill                          | Its local-only workflow was read and applied: retain the checkout, preview locally and skip hosting/registration/publication. No Sites service was created.                                                                          |

The unrelated `codex` visual skill was discovered but not applied because it specifies an incompatible black-and-white blank-canvas style. No separate composition skill was found in the workspace/global skill folders inspected.

## Original problems and changes

| Area                | Original evidence                                                                                                                                                       | Final behavior                                                                                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hero                | Desktop Arabic headline 86px; English wraps into three lines; photography occupies 20% of the first screen. Decorative seal/frame and large margins weaken the product. | Large real coffee-product photograph occupies 36% of the desktop first screen. Arabic headline is 42px desktop / 36px tablet / 30px mobile; two lines. Selectable views link to their actual products.                                                 |
| Typography          | Several 9–12px labels; about 15 distinct sizes; fallback-only Arabic/Latin stacks.                                                                                      | Self-hosted Noto Sans Arabic and Cormorant Garamond, readable 16px body and 13px minimum secondary text, neutral Arabic letter spacing.                                                                                                                |
| Shopping navigation | Sparse header, separate search route, basic mobile menu and language switch to home.                                                                                    | Desktop shopping links and category discovery; compact mobile search/menu/bag; search dialog, keyboard-safe mobile menu and route/query-preserving header language switch.                                                                             |
| Cards/discovery     | Decorative product ID fragments; no filtering or sorting; uneven imagery and technical preview copy.                                                                    | Real category photographs, curated mapped images, consistent ratios, useful detail links, honest price-on-enquiry labels, labeled filters and alphabetical sorting, query-preserving pagination and recovery states.                                   |
| Product detail      | Gallery alone, source notes and a phone button; no related pieces or preparation guidance.                                                                              | Full-object gallery, thumbnails and previous/next controls, accessible current-image counter, source description, honest price/availability/options/lead-time information, delivery/custom enquiries and related products from verified relationships. |
| Locale              | The root document remained `lang=ar dir=rtl` on English pages.                                                                                                          | The locale layout supplies server-rendered `html lang/dir`. The existing root redirect uses a small entry route group. Paths are unchanged.                                                                                                            |
| Performance         | The client gallery imported the complete server catalog through an image URL helper.                                                                                    | The shared URL helper is separate. Catalog JSON stays out of browser chunks; source data remains on the server.                                                                                                                                        |

## Design direction

“The object, large” (`hero-object`), seed **201231298**, adapted to the brief's compact commerce requirements. The factory's own burner/coffee-pot ritual introduces the range. The live interaction switches among three genuine source products and their destinations.

Charcoal, pale stone, warm stone and restrained copper accompany the real photographs. Arabic display proportions stay controlled. Latin display uses an editorial serif. All photos come from the supplied archive, with source mappings retained; no generated or generic replacement photography was used. No workshop photographs were available, so the craftsmanship section explicitly shows a product detail.

The draw's cutouts, giant overlapping lettering, empty museum-plinth composition, founder portrait, decorative postcard and unverified premises/hours were not suitable to the available assets or the explicit user brief. The section redraws and reasons are recorded in the local-only `.taste-skill/notes/design-direction.md` review output.

## Main files and reusable components

- `src/app/globals.css`: visual tokens, responsive frame, commerce layouts, galleries, dialogs, focus and reduced motion.
- `src/app/[locale]/page.tsx`: homepage composition, real category/product merchandising, craftsmanship, collections and direct trade contact.
- `src/app/[locale]/layout.tsx` and `src/app/(entry)/`: correct document locale, local fonts, shared layout and preserved root redirect.
- `src/components/site-header.tsx`, `header-controls.tsx`, `site-footer.tsx`: shared navigation, native dialogs, language switching and honest account/bag states.
- `src/components/hero-showcase.tsx`, `storefront-ui.tsx`, `catalog-browser.tsx`, `product-gallery.tsx`, `icon.tsx`: reusable hero, category/product cards, grids, search, breadcrumbs, pagination, filters and gallery controls.
- `src/app/[locale]/products/`, `collections/`, `search/`, `policies/`, and `not-found.tsx`: consistent discovery/detail/recovery and ordering guidance.
- `src/lib/catalog.ts`, `asset-url.ts`, `merchandising.ts`, `i18n.ts`, `site-config.ts`: server catalog search/sorting/related pieces, client-safe asset URLs and centralized selections referencing real IDs.
- `src/app/fonts/`, `src/app/icon.svg`, `src/app/sitemap.ts`: local licensed fonts, store icon and route metadata.
- `src/lib/catalog.test.ts`, `scripts/browser-qa.mjs`, `scripts/validate_assets.py`: catalog regression coverage, production browser evidence and correct handling of preserved Finder metadata.
- `eslint.config.mjs`: excludes installed skill/vendor and generated review artifacts from application linting.

## Visual review and screenshot evidence

The original Arabic and English pages were inspected at 390×844, 768×1024 and 1440×900. The implementation was then reviewed in multiple actual screenshot passes. The first working-app pass exposed overflow and weak imagery; the second production pass exposed spacing and a long mobile English collection title. Those were fixed before the final gates. An interrupted dev-server capture is not counted as a successful visual pass.

Before screenshots are retained in local-only `.taste-skill` review output and are not part of the source repository.

Final Arabic homepage captures are included in `phase-2-screenshots/ar-390.png`, `phase-2-screenshots/ar-768.png` and `phase-2-screenshots/ar-1440.png`. The English captures are included in `phase-2-screenshots/en-390.png`, `phase-2-screenshots/en-768.png` and `phase-2-screenshots/en-1440.png`.

Additional full-page production captures and route checks:

- `phase-2-screenshots/browser-qa/ar-home-390.png`
- `phase-2-screenshots/browser-qa/ar-home-768.png`
- `phase-2-screenshots/browser-qa/ar-home-1440.png`
- `phase-2-screenshots/browser-qa/en-home-390.png`
- `phase-2-screenshots/browser-qa/ar-products-filtered-1440.png`
- `phase-2-screenshots/browser-qa/ar-collections-atkm-kho-390.png`
- `phase-2-screenshots/browser-qa/ar-product-1440.png`
- `phase-2-screenshots/browser-qa/ar-products-tkm-kho-4ktaa-copy-390.png`
- `phase-2-screenshots/browser-qa/ar-menu-390.png`

The browser capture routine uses instant test scrolling and waits for photographs to decode; earlier smooth-scroll captures could race lazy loading. The application retains normal lazy loading. Written critiques are in `.taste-skill/notes/visual-critiques.md`; final design/usability/creativity/content scores are 7.8/8.0/7.0/8.0, weighted **7.7/10**. Original shop-photography quality remains the main visual limit.

## Responsive and accessibility findings

Both document directions were checked at all three requested widths. Desktop uses a four-column shopping grid; mobile and tablet use two columns. Mobile has its own compact header/category navigation, stacked hero, accessible menu and touch-friendly controls. No tested page has horizontal document overflow. The product gallery contains the whole source photograph rather than cropping the item.

Keyboard verification covers modal focus containment, Escape dismissal and focus restoration. Controls have names, fields have visible labels, navigation uses real links, the skip target is focusable, headings are hierarchical, active images are announced, and reduced motion leaves content visible without animation.

The initial audit found and fixed contrast loss during entry animation, skipped card heading levels, a logo accessible-name mismatch, a label on a generic container, and an RTL gallery counter/navigation overlap. The source-language product headings and image descriptions retain Arabic language information. The final audit follows the installed Web Interface Guidelines; `.taste-skill/notes/interface-audit.md` records the review.

## Performance and data preservation

- Server-rendered catalog/discovery pages; only header dialogs, hero selection and gallery interaction are client components.
- No new application dependency or animation library.
- Next.js responsive image sizes, explicit dimensions, lazy below-fold images and eager/preloaded hero/gallery images.
- Two self-hosted WOFF2 font files total **117,192 bytes**, with SIL Open Font Licenses included.
- Production browser chunks were checked for source-catalog markers; none were found.
- All **1,753 original image files**, **2,823 gallery references**, **487 products**, IDs and source relationships remain intact. **36 verified categories** remain available.
- Every file in the full supplied archive was compared byte-for-byte through SHA-256: **1,764 before and after, identical**. Finder `.DS_Store` metadata is preserved and correctly excluded from image-corruption checks.

Preservation evidence: `.taste-skill/archive-preservation.json`, `.taste-skill/asset-validation.json`, `.taste-skill/catalog-validation.json`.

## Validation results

The package scripts' underlying CLIs were run using the available bundled Node 24 runtime, without reinstalling dependencies. The environment's pnpm wrapper attempted an automatic dependency check; direct local CLIs avoided changing the existing installation.

| Check                    | Evidence                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript               | **PASS (exit 0)** — `tsc --noEmit`; `.taste-skill/typecheck.log`.                                                                                                                   |
| Lint                     | **PASS (exit 0)** — `eslint .`; `.taste-skill/lint.log`.                                                                                                                            |
| Unit tests               | **PASS** — `vitest run`; six catalog tests, `.taste-skill/unit-tests.log`.                                                                                                          |
| Production build         | **PASS (exit 0)** — `next build --webpack`; `.taste-skill/build.log`.                                                                                                               |
| Source design lint       | 0 failures / 0 warnings.                                                                                                                                                            |
| Arabic visual gate       | 0 failures; `.taste-skill/final-ar/report.json`.                                                                                                                                    |
| English visual gate      | 0 failures; `.taste-skill/final-en/report.json`.                                                                                                                                    |
| Production browser suite | **PASS** — `.taste-skill/final-qa/report.json`: **39/39 checks, 30 axe audits, zero violations and zero incomplete checks**. All non-modal screenshots contain fully loaded images. |

The remaining visual-inspector warnings are intentional: the warm pale-stone palette follows the brief; authentic footage is unavailable; the Arabic card grid naturally has multiple right-aligned anchors while that meter counts left-aligned editorial text edges. None is a functional or contrast failure.

The browser suite checks both locales and requested viewport widths; hero selection; search and empty recovery; filters/sorting/pagination; language path/query preservation; gallery navigation and counter positioning; honest commerce states; mobile navigation; all shared information routes; reduced motion; no-JavaScript catalog links; not-found recovery; and browser exceptions/failed image or script responses.

## Known limitations and acceptance

- Phase 1 remains browse-only. No online payment, checkout, customer account or inventory workflow is presented as operational.
- Prices/currency, stock, variants and lead times still need owner approval. Archived values remain preserved but are not presented as current purchasing information.
- 282 source products still lack a verified category association. They remain discoverable in All Pieces rather than receiving invented categories.
- UI text is bilingual; original product names/descriptions remain Arabic. English search also matches translated verified collection names.
- The archive contains real shop photography, not a consistent studio shoot or workshop footage.
- Next.js can return HTTP 200 after streaming begins for an unknown product while rendering its not-found recovery and `robots=noindex`; invalid locales return HTTP 404. This is documented framework behavior, not a claim of hard-404 handling for every streamed route.
- Browser verification used installed Chromium at the stated viewport sizes. Physical devices, Safari/Firefox, a complete assistive-technology certification and field/Lighthouse performance scores were not claimed.
- No Hostinger deployment or hosting compatibility change was performed. Production infrastructure and the public site were untouched.

Phase 1's requested frontend, responsive, data-preservation, interaction and local-build acceptance checks are covered by the recorded evidence. Visual quality remains a design judgment; the implementation is ready for local review. Work stops at Phase 1.

## Sources checked

The existing [factory contact page](https://www.sprtaya-kanaka.net/pages/contact-us) publishes `wa.me/201142800111`; this matches the retained phone destination. Evidence is saved in `.taste-skill/source-contact-evidence.json`. The [factory About page](https://www.sprtaya-kanaka.net/pages/about-us) was read for brand/craft context; no new historical dates were invented. Interface review used the [official Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).
