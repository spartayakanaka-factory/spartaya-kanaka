# Hostinger staging investigation — 2026-10-29 (Africa/Cairo)

Status: unresolved; the infrastructure diagnostic boundary has been identified and a Hostinger escalation prepared. Staging authentication is not demonstrated.

Target: bisque-pheasant-330767.hostingersite.com only. Repository: spartayakanaka-factory/spartaya-kanaka. Current build 01a183f5-aacc-70cc-be8c-bd1ee3a9400f completed at 2026-10-28T19:23:59Z from commit 254ad4c10cfdd18cf0e1aacc10758ae2206ffa15 on codex/hostinger-nextjs-source.

## Settings recorded before changes

- Enabled CloudLinux Node.js website, account u858869017, order 1010247489; public root /home/u858869017/domains/bisque-pheasant-330767.hostingersite.com/public_html.
- Build/runtime configuration: Node major 22, framework next, root null (repository root), output .next, build script build, entry file null (framework-managed), package manager pnpm. The connector reports gitAutoDeployment=null; this setting was not changed.
- SSL active; HTTPS redirect enabled; CDN enabled; server cache disabled; cacheless mode disabled.
- hPanel's CDN page shows Active with Development mode off and Manage disabled; no robots override control is exposed there.
- Four environment keys: APP_ENV, STAGING_SITE, STAGING_ACCESS_USERNAME, STAGING_ACCESS_PASSWORD. Connector values are masked. hPanel confirms the non-secret flags APP_ENV=staging and STAGING_SITE=1. No secrets were recorded or changed. Runtime delivery remains unverified.
- public_html contains only the generated .htaccess (544 bytes). Its complete read-only contents are in connector-baseline.json. PassengerAppRoot points at hbuilds/current/nodejs, Node binary /opt/alt/alt-nodejs22/root/bin/node, startup server.js, base URI /, restart directory nodejs/tmp. NODE_OPTIONS preloads hbuilds/config/preload-timestamp.js; LSNODE_CONSOLE_LOG=console.log; TOKIO_WORKER_THREADS=2.
- Runtime logs contain five startup entries: Next.js 16.4.3, 0.0.0.0:3000, Ready in 0ms, next.config ran. No request errors were returned. This proves startup logging, not that requests reach the correct handler.
- GitHub connector independently confirms the exact commit's next.config.mjs sets X-Robots-Tag for all paths, and robots.txt route enforces staging access then returns Disallow: / for authorized staging requests.

## Initial HTTP evidence

See before-http.json for full response headers, body byte counts/hashes, and CDN request IDs. Curl issued real GET requests with no-cache and unique query parameters.

- /, /ar, /en, a nonexistent path, /admin, /admin/login, /admin/products, /api/auth/get-session, /api/admin/media/upload-url, /sitemap.xml, and /favicon.ico: HTTP 200 and zero-byte bodies.
- Dynamic responses carry platform: hostinger, panel: hpanel, server: hcdn, x-hcdn-cache-status: DYNAMIC, and upstream times around 0.017–0.033 seconds. No X-Robots-Tag, WWW-Authenticate, or route content type appears. The sole CSP value is upgrade-insecure-requests.
- /robots.txt: HTTP 200 and 58 bytes: Googlebot disallowed, wildcard allowed. Its headers differ from the dynamic application responses, suggesting an intercept, but the responsible layer is not proven.

## Working diagnosis before changes

The evidence favors a Hostinger routing/Passenger-to-Node response handoff or managed startup mismatch over an individual application page bug. A globally broken application handler remains possible. The CDN reports upstream dynamic fetches, so a stale CDN object alone is insufficient to explain all zero-byte routes. The robots response may be platform-generated. The application-level staging gate and configured response headers are not reaching the client. Build success alone is not acceptance.

The first proposed reversible action is a restart of this staging Node.js application only, preserving the build and all settings. The user explicitly authorized this recovery action. No build, source change, generated .htaccess edit, database operation, DNS change, or production change is authorized or required for this action.

## Restart and origin isolation

- The connector accepted one restart request. Subsequent GETs triggered five fresh startup entries at 2026-10-28T22:18:41Z. The application still returns empty 200 responses. The active build UUID and generated .htaccess read back unchanged.
- hPanel Plan Details identifies origin 62.72.37.195, server1047 in France. HTTPS directly to this origin with the correct Host/SNI fails during TLS negotiation with an internal-error alert; this can be expected for CDN-only platform subdomains and does not alone establish a certificate fault. No TLS validation was disabled.
- Direct-origin HTTP responds with a LiteSpeed 301 to HTTPS, including for /robots.txt. Public CDN HTTP /robots.txt responds with the contradictory 58-byte body instead of that origin redirect. This independently demonstrates that the CDN intercepts this path before the origin response. CDN HTTPS application requests remain DYNAMIC and empty after restart.
- hPanel SSH Access is INACTIVE. No SSH access, credentials, or keys were enabled or changed. The available connector has no process-list, process-environment, listener/socket, LiteSpeed vhost, or internal loopback request operation.
- The staging-only file browser can read hbuilds outside public_html. hbuilds/current points to versions/01a183f5-aacc-70cc-be8c-bd1ee3a9400f. nodejs contains server.js, package.json, .next, node_modules, assets, tmp, console.log, and a zero-byte stderr.log. No .env appears in nodejs; hbuilds/config/.env exists with mode 0600. Its contents were not opened or exposed.
- Generated server.js is 7.8 KiB and starts the Next.js standalone server with process.chdir(__dirname), NODE_ENV=production, PORT fallback 3000, HOSTNAME fallback 0.0.0.0, serialized standalone config, and next/dist/server/lib/start-server.startServer(). Its rejection handler logs the error and exits. The config has output=standalone, distDir=./.next and poweredByHeader=false. hbuilds/config/preload-timestamp.js formats logs and monitors the LSNODE_SOCKET/listen handshake. These generated files were read only.

Next diagnostic action: purge only this staging site's server/CDN cache, with all settings and the selected build preserved. The dynamic response evidence makes this unlikely to fix the primary problem, but it tests whether the robots mismatch is a stale edge object.

## Final artifact and HTTP verification

- In the active artifact, .next/routes-manifest.json contains pages404=true and the /:path* header rule X-Robots-Tag: noindex, nofollow, noarchive. .next/server/functions-config-manifest.json registers /_middleware with runtime=nodejs and originalSource=/:path*, plus the robots/auth/media handlers. middleware.js exists (271.64 KiB). These observations rule out simply missing build-time matcher/header metadata; they do not prove that the live request executes it.
- The cache-clear operation returned accepted, scope=all. Afterward, every tested application path still returns HTTP 200 with zero bytes for both anonymous and deliberately invalid Basic credentials. HTTP/1.1 reproduces the same failure as HTTP/2. robots.txt remains the identical 58-byte body for anonymous, invalid credentials, and Googlebot. See final-http.json (24 GETs, observed 2026-10-28T22:22:56Z, 2026-10-29 in Africa/Cairo).
- WWW-Authenticate, X-Robots-Tag, Cache-Control, HSTS, X-Content-Type-Options, X-Frame-Options, and Referrer-Policy are absent on the checked homepage response. CSP only contains upgrade-insecure-requests. These are observations, not claims that the source configures every listed header. The explicitly configured noindex header is absent.
- Subsequent logs show another startup sequence at 2026-10-28T22:22:54Z but no request errors. The connector's started_at remains the original value despite newer startup entries, so its timestamp is not a reliable process-restart indicator.
- Read-back confirms the same build/commit, generated .htaccess, four environment keys, SSL/redirect/CDN/cache settings. No environment replacement was attempted: masked values cannot safely be written back, and no evidence established incorrect secret values.
- Valid staging credentials were not available through the masked connector. No successful authorized page or owner-session flow was reached. Negative authentication checks fail acceptance because they receive empty 200 rather than the expected denial. A blank body is not proof of protection, and a nonexistent route's empty 200 is not correct 404 behavior.
- No deployment/rebuild, source code change, generated routing/startup file save, database operation, DNS change, SSH activation, credential change, or production action occurred. Only one staging restart and one staging cache purge were performed. File-editor inspection buffers were closed/discarded without saving.

## Outcome

No clearly identified configuration correction was safe to apply. The primary failure is isolated to Hostinger's dynamic request path, but available access cannot distinguish LiteSpeed/LSNode handoff from the running Next request listener or prove whether headers/body are lost before the CDN. The independent robots mismatch is isolated to CDN interception because public HTTP returns content where direct-origin HTTP returns a redirect.

See escalation.md for the evidence-backed support request and decision tree. It is prepared locally and has not been sent externally.

## Vendor reference

[Hostinger's current Node.js documentation](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) identifies hbuilds/current/nodejs as the runtime directory and public_html/.htaccess as generated routing. Its documented restart does not require a rebuild. The observed deployment layout matches that documented architecture.
