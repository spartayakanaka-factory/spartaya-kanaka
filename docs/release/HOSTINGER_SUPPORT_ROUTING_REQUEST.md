# Prepared support request — do not send without authorization

Please investigate `bisque-pheasant-330767.hostingersite.com`, a password-protected Next.js staging application. On 2026-10-31, unauthenticated and deliberately invalid-credential requests to `/`, `/admin`, `/sitemap.xml` and `/icon.svg` returned HTTP 401 with `X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: private, no-store`.

However, `GET https://bisque-pheasant-330767.hostingersite.com/robots.txt` returned HTTP 200, `Content-Type: text/plain`, `Content-Length: 58`, `Server: hcdn`, no `X-Robots-Tag`, and this body:

```text
User-agent: Googlebot
Disallow: /

User-agent: *
Allow: /
```

The application's checked-in staging route instead requires staging authentication and returns a disallow-all policy after authorization. Please identify which component handles `/robots.txt` (CDN, hosting/static override, alternate application, or Next.js), why it differs from other paths, and whether it can be configured to reject unauthorized requests or serve `User-agent: *` / `Disallow: /` with `X-Robots-Tag: noindex, nofollow, noarchive` and appropriate private/no-store caching. Please ensure `/sitemap.xml`, application routes, static files, and invalid paths reach the intended protected app. Provide the exact setting and any cache propagation behavior; do not change settings until approved. We have not tested valid staging credentials in this investigation and cannot attribute the override to a specific component from headers alone. A robots rule is not a substitute for access control.
