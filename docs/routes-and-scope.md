# Routes and implementation scope

The customer-facing storefront retains its Phase 1 Arabic/English routes. Phase 2 adds the routes below without introducing order, payment, customer-account, or deployment workflows.

## Storefront

| Destination | Route | Scope |
| --- | --- | --- |
| Home | `/ar`, `/en` | Catalog-driven discovery and featured products |
| Products | `/[locale]/products` | Browse-only product catalog |
| Product details | `/[locale]/products/[slug]` | Verified product copy and price only; no checkout |
| Collections | `/[locale]/collections`, `/[locale]/collections/[id]` | Visible categories reviewed for public display |
| Search | `/[locale]/search` | Search the active catalog source |
| About, wholesale, contact, custom orders, policies | `/[locale]/about`, `/[locale]/wholesale`, `/[locale]/contact`, `/[locale]/custom-orders`, `/[locale]/policies` | Informational; custom manufacturing remains phone-only |

## Phase 2 administration

| Area | Route | Scope |
| --- | --- | --- |
| Staff sign-in | `/admin/login` | Better Auth email/password; sign-up disabled |
| First sign-in password update | `/admin/password` | Current-password verification and forced change |
| Dashboard and catalog | `/admin`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]` | Role-guarded product drafts, variants, media ordering, and publication gates |
| Categories | `/admin/categories` | Visibility and explicit review status |
| Inventory | `/admin/inventory` | Variant balances, nonnegative adjustments, thresholds, and movement history |
| Store settings | `/admin/settings` | Audited contact and descriptive values; no payment integration |
| Staff and audit | `/admin/staff`, `/admin/audit` | Owner-managed roles and change records |
| Media API | `/api/admin/media/upload-url`, `/api/admin/media/finalize` | Authenticated direct upload to configured S3-compatible storage |

Administrative pages, server actions, and media handlers enforce server-side session permissions. The console does not expose orders, payments, customer profiles, quotations, or work orders.
