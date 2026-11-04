# Routing and indexing — 2026-10-31

Anonymous HTTPS GETs to `/`, `/ar`, `/en`, `/admin`, `/sitemap.xml`, `/icon.svg` and an invalid route returned 401 with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow, noarchive`. This is consistent with intentional password protection, not evidence of broken routing. Authorized response behavior has not been tested in this workstream.

With deliberately invalid Basic credentials, `/`, `/admin`, `/sitemap.xml` and `/icon.svg` also returned 401 without redirects. `/robots.txt` still returned 200, content length 58, text/plain and no noindex header. These probes used no real credentials.

`/robots.txt` returned 200 with `User-agent: Googlebot / Disallow: /` followed by `User-agent: * / Allow: /`, without noindex/cache headers. Responses reported `server: hcdn`. This differs from the checked-in staging robots route, but does not by itself prove whether CDN, an override, or another server generated the response. Hostinger must trace and correct this path without bypassing the protected app, then verify all crawlers are disallowed and caching cannot restore the old response.

The local candidate additionally returns an empty generated sitemap for protected or misconfigured staging and for local commerce simulation, before accessing catalog data. This is defense in depth only; it is not deployed and cannot override a hosting/CDN route. Test valid and invalid staging authentication, all routes and static files, headers, routing and robots independently after any approved deployment. Keep staging private.
