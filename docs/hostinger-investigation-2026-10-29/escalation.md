# Hostinger engineering escalation: empty dynamic 200 responses and edge robots override

Prepared 2026-10-29, Africa/Cairo. Not sent externally.

## Affected staging target

- Website: bisque-pheasant-330767.hostingersite.com
- Hosting account: u858869017; order: 1010247489
- Origin: 62.72.37.195; server1047, France
- Repository: spartayakanaka-factory/spartaya-kanaka
- Branch: codex/hostinger-nextjs-source
- Required commit to preserve: 254ad4c10cfdd18cf0e1aacc10758ae2206ffa15
- Current successful build: 01a183f5-aacc-70cc-be8c-bd1ee3a9400f, completed 2026-10-28T19:23:59Z
- Settings: framework next; Node 22; pnpm; root ./; output .next; build script build; framework-managed entry (null). Next.js 16.4.3.

## Problem and impact

Every tested application route returns HTTP 200 with a zero-byte body, including a nonexistent URL. There is no Basic Auth challenge or denial for anonymous or invalid credentials and no configured X-Robots-Tag. Staging acceptance fails; do not consider the site access-protected. robots.txt is a separate CDN-generated/intercepted response that allows wildcard crawlers and bypasses the application auth route.

## Reproduce without any secrets

```sh
curl -sS --max-time 30 -D /tmp/staging-home.headers -o /tmp/staging-home.body -w 'status=%{http_code} bytes=%{size_download}\n' 'https://bisque-pheasant-330767.hostingersite.com/?hostinger-escalation=1'
curl -sS --max-time 30 -D /tmp/staging-missing.headers -o /tmp/staging-missing.body -w 'status=%{http_code} bytes=%{size_download}\n' 'https://bisque-pheasant-330767.hostingersite.com/nonexistent-hostinger-audit-20261029?hostinger-escalation=1'
curl -sS --max-time 30 -u 'audit-invalid:deliberately-wrong-password' -D /tmp/staging-admin.headers -o /tmp/staging-admin.body -w 'status=%{http_code} bytes=%{size_download}\n' 'https://bisque-pheasant-330767.hostingersite.com/admin?hostinger-escalation=1'
curl -sS --max-time 30 -i 'http://bisque-pheasant-330767.hostingersite.com/robots.txt?hostinger-escalation=1'
curl -sS --max-time 30 --resolve 'bisque-pheasant-330767.hostingersite.com:80:62.72.37.195' -i 'http://bisque-pheasant-330767.hostingersite.com/robots.txt?hostinger-escalation=1'
```

Observed: first three requests return 200/0 bytes. Public HTTP robots returns 200/58 bytes; direct origin HTTP robots returns a LiteSpeed 301 to HTTPS. Public robots body:

```text
User-agent: Googlebot
Disallow: /

User-agent: *
Allow: /
```

This difference proves that the public robots request is intercepted before the origin's HTTP response. It is not simply the source route returning old content.

## Evidence collected

1. Real public GET tests cover /, /ar, /en, a nonexistent route, /admin, /admin/login, /admin/products, /api/auth/get-session, /api/admin/media/upload-url, /sitemap.xml and /robots.txt. Anonymous and synthetic invalid-Basic requests give the same failure. HTTP/1.1 and HTTP/2 both reproduce it. Googlebot gets the same contradictory robots body. final-http.json contains 24 responses, headers, sizes, hashes and request IDs.
2. Dynamic responses carry server=hcdn, platform=hostinger, panel=hpanel, x-hcdn-cache-status=DYNAMIC and nonzero upstream timing. One final homepage request ID is 0d61cef82c35f7b1477a0853468154d0-fra-edge8 at 2026-10-28T22:22:54Z (2026-10-29 00:22:54 Africa/Cairo). This is an upstream dynamic response, not proof of a healthy app.
3. Current symlink points to versions/01a183f5-aacc-70cc-be8c-bd1ee3a9400f. The active .next/routes-manifest.json contains pages404=true and the all-routes X-Robots-Tag rule. .next/server/functions-config-manifest.json registers /_middleware, runtime=nodejs, matcher=/:path*, plus robots/auth/media handlers. middleware.js exists. GitHub's exact-commit source agrees.
4. public_html contains only the generated 544-byte .htaccess, with PassengerAppRoot=/home/u858869017/domains/bisque-pheasant-330767.hostingersite.com/hbuilds/current/nodejs, PassengerNodejs=/opt/alt/alt-nodejs22/root/bin/node, PassengerStartupFile=server.js, PassengerBaseURI=/, and restart directory nodejs/tmp. NODE_OPTIONS requires hbuilds/config/preload-timestamp.js. Full baseline is attached. No competing public_html/robots.txt exists.
5. Generated server.js is the standalone entry: NODE_ENV=production; chdir(__dirname); PORT fallback 3000; HOSTNAME fallback 0.0.0.0; __NEXT_PRIVATE_STANDALONE_CONFIG; next/dist/server/lib/start-server.startServer(). No startup-file edit was made. hbuilds/config/preload-timestamp.js includes the LSNODE_SOCKET/listenDone watchdog and log formatting.
6. Four env keys exist: APP_ENV, STAGING_SITE, STAGING_ACCESS_USERNAME, STAGING_ACCESS_PASSWORD. hPanel confirms non-secret flags APP_ENV=staging and STAGING_SITE=1. hbuilds/config/.env exists (0600). No .env appears in nodejs. Secrets were never opened or replaced. Whether the active worker actually receives the variables is unverified.
7. One staging-only restart was accepted; new startup logs appeared at 2026-10-28T22:18:41Z. A staging-only server/CDN cache purge was accepted. Symptoms persist. Later logs show another startup sequence at 22:22:54Z. stderr.log is zero bytes; runtime logs contain startup messages and no request errors.
8. SSL is reported active and HTTPS redirect on; CDN on; server cache off; development/cacheless mode off. hPanel CDN Manage is disabled for this platform subdomain. Direct origin TLS with the original hostname/SNI receives a TLS internal-error alert; direct HTTP reaches LiteSpeed and redirects. No certificate validation was bypassed and no DNS changed.
9. Build succeeds but logs warn that @next/swc-linux-x64-gnu needs GLIBC_2.29 and fall back to SWC WASM. This is a compatibility clue, not an established cause of the empty responses. build.log is attached.

## Exact blocked layer and requested engineering checks

The primary blocked boundary is the managed dynamic HTTP path: Hostinger CDN upstream selection → LiteSpeed vhost/context → Passenger/LSNode socket adapter → active Next.js request listener. Startup and artifact registration are visible; incoming request execution and outgoing status/header/body are not. The secondary proven boundary is the CDN temporary-domain robots interception.

Please perform these checks without rebuilding or changing the commit:

1. Trace one of the recorded x-hcdn-request-id values to the actual backend, scheme, port and vhost. Confirm it targets this domain and account. Record upstream status and bytes before edge processing and compare to the public response. Check the default robots override for hostingersite.com and explain how it can preserve staging denial and Disallow: /.
2. Inspect the effective LiteSpeed SSL/non-SSL vhost/context mappings, Passenger/LSNode startup command, socket ownership, active PID/CWD, resolved current build path and request listener. Confirm that requests are delivered to this build's server.js rather than an empty/default handler. Check whether the LSNode adapter completes responses before the asynchronous Next.js handler sends headers/body.
3. From the host, request the active worker through its actual listener/socket with the staging Host and forwarded headers, testing homepage, missing route, robots, and invalid Basic credentials. Do not assume TCP port 3000 if LSNode replaces listen() with a Unix socket. Compare status/header/body at worker, LiteSpeed, and edge. If the worker is correct but LiteSpeed is empty, fix the adapter/vhost boundary; if LiteSpeed is correct but edge is empty, fix upstream/response processing; if the worker itself is empty, instrument the managed adapter and Next handler entry to locate premature completion.
4. Verify environment delivery inside the actual serving process, reporting only booleans: APP_ENV equals staging; STAGING_SITE equals 1; username meets minimum length; password meets minimum length; all four keys present. Verify Host, x-forwarded-host, x-original-host and Authorization reach the handler. Do not print credentials, authorization values, full /proc environ, or .env content. Starting a different shell and reading its environment does not prove what the serving worker received.
5. Check the managed Node 22 / LSNode adapter's compatibility with Next.js 16.4.3 and the host's glibc. Check runtime fatal/adapter/server logs beyond the customer-visible console log, preserving the original logs.

The customer connector provides settings, masked env names, logs, files under public_html and restart/cache controls. It provides no effective vhost, active process/environment, internal request or socket tracing operation. The authorized file browser permits artifact inspection, but SSH is inactive. Root-level diagnostics cannot be completed with the available access.

## Constraints and acceptance

Work on this staging hostname only. Preserve commit 254ad4c10cfdd18cf0e1aacc10758ae2206ffa15. Do not rebuild from another commit, hand-edit generated .htaccess, change DNS, modify databases, expose secrets, or touch production. Record settings before any correction and explain the identified cause. Apply only reversible staging configuration corrections and a staging app restart as needed.

Acceptance requires real public responses: anonymous/invalid requests denied; valid staging credentials reach the homepage and login UI; authorized nonexistent URLs return a true 404; admin routes still require a real admin session/role; authorized robots disallows all crawlers; configured noindex/no-store headers survive. A build marked completed, startup Ready line, blank 200, or cache purge acknowledgement is insufficient. Valid-credential and admin-role tests remain outstanding until the underlying response path works.

Attachments: investigation.md, connector-baseline.json, connector-final.json, build.log, before-http.json, after-restart-origin-http.json, protocol-http.json, origin-forwarded-http.json and final-http.json. They contain no credential values.
