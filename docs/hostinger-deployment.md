# Hostinger deployment readiness

No deployment, domain change, DNS change, account linking, or upload to Hostinger was performed.

## Current application commands

- Install: **pnpm install --frozen-lockfile**
- Build: **pnpm build** (Webpack)
- Start: **pnpm start**
- Required Node engine: 22 or 24 (package range is **>=22 <25**)
- Public environment: **NEXT_PUBLIC_SITE_URL**
- Database or payment environment variables: none in Phase 1

The Next.js production build is a Node server application. Do not select static export. The original asset archive is read by the media route at runtime, so the deployment package must include the **sprtaya-kanaka-assets** tree. The archive is about 316 MiB; create and review compressed delivery derivatives in a separate directory before a production package to reduce transfer and mobile costs.

## Readiness checklist

- [ ] Confirm the exact Hostinger plan exposes managed Node.js web apps for this domain.
- [ ] Select Node 22 or 24 and confirm its availability in the account.
- [ ] Deploy first to a non-production preview/subdomain after the owner authorizes it.
- [ ] Package the Next.js source, lockfile, and required media; exclude **.git**, caches, extractor page cache, and unrelated files.
- [ ] Set **NEXT_PUBLIC_SITE_URL** to the preview URL, then to the approved public domain at launch.
- [ ] Configure build and start commands shown above.
- [ ] Smoke-check Arabic/English pages, image route, **robots.txt**, **sitemap.xml**, and logs on the selected Node plan.
- [ ] Confirm the contact number and source-published About copy with the owner.
- [ ] Review every product’s price, stock/made-to-order state, and category before enabling any transaction path.
- [ ] Plan the domain cutover, existing URL redirects, rollback, and mail/DNS checks before replacing the live website.

Hostinger's current help center lists Next.js and Node 18/20/22/24 for eligible Business/Unlimited and Cloud Node.js web apps. The app requires Node 22 or 24. Current managed web limits do not support inbound WebSockets, Docker, Redis, or always-running background workers. Use cron or an approved external durable scheduler for future notifications.

References: [Hostinger Node.js web apps](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/), [Hostinger Node.js limits](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/), [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation).
