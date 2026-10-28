# Phase 2.3 staging security recovery

**Status: PARTIAL — source fix locally validated; staging remains unprotected until it is published, rebuilt once with separate approval, and the Hostinger HTTP checks pass.** Do not treat the currently deployed site as protected. This update supersedes earlier staging-security statements in `hostinger-phase2-staging-acceptance.md`.

## Hostinger evidence — 2026-10-28

- The configured Node app is `bisque-pheasant-330767.hostingersite.com`, Node 22, branch `codex/hostinger-nextjs-source`, deployed commit `fe6e7897ee948ce7805ff81ea253d478ef3ac818`, build `01a181ca-d4d9-735a-88fa-6aacccae6daa` (completed).
- Hostinger reports the environment-variable names `APP_ENV`, `STAGING_SITE`, `STAGING_ACCESS_USERNAME`, and `STAGING_ACCESS_PASSWORD`. Their values are masked. The connector cannot verify the values read by the running Node process.
- Runtime logs show Next.js 16.4.3 starts successfully. The current deployment still has the reported access-control failure: anonymous and invalid-Basic-Auth requests returned HTTP 200; `X-Robots-Tag` was absent; robots.txt allowed wildcard crawlers. The Hostinger CDN setting is enabled, but responses were reported as `DYNAMIC` with upstream timing, not cache hits.
- Hostinger's website file API shows `public_html` contains only the generated `.htaccess`, not a competing static `robots.txt`. Its current rules route requests through Passenger to `/hbuilds/current/nodejs/server.js`. Hostinger's API cannot inspect that startup file because it is outside the document-root file API.
- Therefore the evidence proves the compiled deployment is not enforcing the staging gate on live requests, but it does not distinguish a skipped Proxy from a wrong runtime host/environment context. The process environment values and Proxy invocation cannot be inspected through the available Hostinger connector. The source fix adds enforcement inside the server-rendered app and sensitive server entry points as well as keeping Proxy as an early gate.
- No migration, database access, database write, owner creation, catalog import, deployment, DNS change, or production change occurred during this recovery.

## Source protections

- The shared Basic Auth verifier accepts the request host and considers both `Host` and proxy-forwarded host values. A conflicting internal forwarded hostname cannot disable protection for the exact temporary domain.
- Next.js Proxy remains the earliest gate. Server-rendered entry, locale, and admin root layouts enforce the same gate before rendering and fail closed with a noindex 404 when Basic Auth is missing, wrong, or misconfigured.
- Admin server actions and media API handlers continue to require their database-backed role permission. The shared admin session lookup now rejects requests without staging Basic Auth before reading the session. Better Auth endpoints and the local asset route also enforce the staging gate directly.
- `/robots.txt` is an explicit route handler so it can return a real 401/503 to unauthenticated or misconfigured requests. An authorized staging request gets `Disallow: /`; production mode retains the public allow rule and sitemap.
- Next response headers apply `X-Robots-Tag: noindex, nofollow, noarchive` to every route on this staging branch, independent of Proxy execution.

## Local verification

- A clean Next.js 16.4.3 production build passed using Node 24.22.1 and an isolated output directory. The generated `functions-config-manifest.json` registers `/_middleware` for `/:path*`; the compiled `server/middleware.js` contains the staging gate. The legacy `middleware-manifest.json` is empty in this build and is not sufficient by itself to judge Proxy registration.
- Production-mode HTTP smoke checks passed with synthetic local-only credentials against both builds: the normal build with Proxy and a second build with `src/proxy.ts` removed. The Proxy-disabled build returned 404 for unauthenticated/invalid `/`, `/admin`, and `/admin/products`; 401 for unauthenticated/invalid `/robots.txt`, Better Auth, and media API requests; and 200 for valid-auth `/ar`, `/admin/login`, and `/robots.txt` (whose body disallows `/`). Valid-auth media upload was 403 because no owner session or database configuration was provided. All checked responses carried the staging noindex header; blocked responses were no-store. Googlebot requests received the same block as other anonymous clients.
- Targeted unit tests: 18 passed, including staging credentials, environment failures, and owner-role permission checks. TypeScript, ESLint, and Prisma schema validation passed. Prettier passes for the newly formatted files; it still flags five pre-existing compact-style files touched for small guards, which I left in the branch's existing style to avoid formatting-only churn. Prisma generation used a dummy local URL and did not connect to any database. No Hostinger rebuild was run.

## Hostinger's additional directory protection

Hostinger documents **Password Protect Directories** for protecting a selected website directory. Its Node.js documentation identifies `public_html/.htaccess` as the generated request-routing layer for the Node app, and the current file uses Passenger there. This makes hPanel root-directory protection a supported additional layer to evaluate before the next rebuild. The current `.htaccess` contains no password-protection block.

Before rebuilding, use **Websites → Dashboard → Password Protect Directories** for the staging website root (`public_html`) with a staging-only credential. Do not hand-edit or replace the generated Passenger `.htaccess`. Confirm the protection survives the deployment/build process and test it at the public URL: missing and wrong credentials must receive 401; the correct hPanel credentials must reach the Next.js app. This Hostinger layer uses its own hPanel-managed credentials; it does not reveal or replace the app's environment secrets.

## Safe deployment and acceptance sequence

1. Keep the current website in staging and keep Git automatic deployment disabled.
2. Configure or verify the Hostinger directory password protection above. Confirm the four app environment-variable names remain present without exposing their values.
3. Review the source branch and local verification results. Ask for a separate one-time manual staging rebuild approval before starting any Hostinger build. No rebuild is authorized by this recovery request.
4. After approval and rebuild, verify the deployed branch/commit and startup logs. Test `/`, `/ar`, `/admin`, `/admin/login`, `/api/auth/*`, `/api/admin/media/*`, `/assets/*`, and `/robots.txt` with no credentials, invalid credentials, and valid app credentials. Pages should be rejected before Basic Auth; app-authorized requests should carry `X-Robots-Tag: noindex, nofollow, noarchive`; authenticated `robots.txt` must contain `Disallow: /`.
5. Separately verify admin-role authorization with a real owner session. Staging Basic Auth is only an outer gate and does not replace owner/session/permission checks. Keep database and media configuration unchanged during this security recovery.

## References

- [Hostinger: password-protect a website or directory](https://www.hostinger.com/support/1583470-how-to-password-protect-a-website-in-hostinger/)
- [Hostinger: Node.js app files, Passenger routing, and `.htaccess`](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Hostinger: `.htaccess` support](https://www.hostinger.com/support/1583307-how-to-create-an-htaccess-file-at-hostinger/)
