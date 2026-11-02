# Owner usability readiness — READY FOR HUMAN REVIEW

This is an engineering walkthrough, not acceptance by the actual factory owner. No human completion times or satisfaction scores are claimed. The approved Phase 5 visual direction is preserved.

## Task review

The counts below describe the tested path's navigation/submit clicks from a signed-in dashboard; typing, scrolling, multi-image selections and permission changes are counted separately and can vary. They are task walkthrough counts, not human analytics.

| Task                         | Typical tested navigation/actions                                                                                     | Finding and acceptance evidence                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find/edit a draft            | Products → enter search → submit → Edit (3 navigation/submit clicks)                                                  | Product browser explicitly finds a synthetic draft, edits and saves; original imported drafts are unchanged                                                                                  |
| Price/category/stock         | Enter verified fields; save draft (1 submit); inventory adjustment is a separate reasoned submit                      | Arabic price parsing works; categories are checkboxes; stock never falls below reservations                                                                                                  |
| Choose/upload images         | Search and select; main-image button or unlink; save product                                                          | Search now covers the whole library with bounded pages. Selected order survives search/paging. Uploads persist; unlink does not delete originals                                             |
| Recover library failure      | Retry (1 click after a failed request)                                                                                | Browser aborts the media request, gets a clear Arabic error, retries and recovers                                                                                                            |
| Publish                      | Review → select eligible row → save/publish                                                                           | Existing publication blockers remain. Product appears in Arabic and English storefront without code changes                                                                                  |
| Find a new order             | Dashboard queue → order (2 navigation clicks)                                                                         | Canonical states remain. COD may already be confirmed under established rules; no invented confirmation state/button                                                                         |
| Production/payment           | Open order; review initial/received/balance; one allowed action per stage                                             | Production before deposit and dispatch before balance are rejected; proof is not credited automatically                                                                                      |
| Stock/history                | Inventory → search/submit → reasoned adjustment                                                                       | Search used to miss records after the first 300. New database pagination/search finds a tested row beyond that limit; available is quantity minus reserved                                   |
| Customer/history             | Customers → search → history                                                                                          | Owner-only; managers rejected. Suspension revokes old sessions; restoration requires fresh sign-in. No phone-based guest linking                                                             |
| Today/reports                | Reports → date preset/range → show (1–3 navigation/submit clicks)                                                     | Authoritative collection/refund/outstanding data; Cairo time; English toggle retained. Collection is not profit                                                                              |
| Shipping/staff/notifications | Labelled navigation → relevant section                                                                                | Existing shipping/payment/staff controls reused. Local-only notification capture clearly labelled; routine history collapsed, failures visible                                               |
| Cancellation/refund          | Customer request → owner cancellation review → financial request → different approver/executor → different reconciler | Extra steps are deliberate authority controls. Browser verifies Arabic refund input, released reservation, no automatic refund, self-approval denial and duplicate reconciliation protection |

## Fixes made in this phase

- Full inventory search and stable 50-row pagination replace first-300-only filtering.
- Complete media-library search/36-row pagination replace the loaded-200 limitation; first-render payload is reduced to 36 assets plus current selections.
- Arabic media-network errors and retry; stale request cancellation; safe previews and existing order/selection preserved.
- Removed an ASCII-only HTML pattern that prevented Arabic financial input even though the existing server parser supports Arabic digits. The browser refund test uses Arabic digits and separator; financial calculations are unchanged.
- Byte-derived legacy-image headers prevent valid WebP content being mislabeled as JPEG. Original URLs and bytes remain unchanged.
- No new business state, financial policy, payment integration, blanket manager grant or production scheduling system was added.

## Screens and design validation

Dashboard, products, product editor, bulk review, categories, inventory/history, orders/detail, customers/history, shipping/payments, staff, store settings, audit and owner reports. Two completed passes each covered 45 screen/width combinations at 390/768/1440 px, with zero axe violations, no horizontal page overflow and no browser exceptions. Native scrolling tables remain available by keyboard. English storefront/checkout and the report language switch are tested; the complete admin shell remains Arabic-first rather than being represented as fully translated.

Representative screenshots are in `screenshots/`; complete review evidence is in `visual-pass-1/review.json` and `visual-pass-2/review.json`. Existing forms for specialist variant dimensions and finance delegation remain advanced tasks; the human session should confirm their wording and discoverability rather than claiming every staff member already understands them.

Use [the short Arabic checklist](owner-checklist-ar.md) for the actual owner session. The next usability decision is local human acceptance, acceptance with specific changes, or another session. No hosted reopening or real financial policy is implied.
