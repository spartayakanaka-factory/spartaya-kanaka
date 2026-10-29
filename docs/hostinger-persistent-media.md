# Persistent catalog media on Hostinger

Product originals are excluded from Git. Upload the allowed product and brand images once to a persistent directory outside `public_html` and `hbuilds/versions`, then set `LEGACY_ASSET_ROOT` to its absolute path in the site's Hostinger environment variables. The directory must contain `المنتجات/` and `الهوية البصرية/` with the original relative filenames. Preserve it across deployments and include it in backups.

The asset route reads this setting at runtime and defaults to the local `sprtaya-kanaka-assets` directory when it is unset. Its path boundary, folder and extension checks still apply. Staging requires the existing Basic Auth credentials and returns private/no-store image responses; production retains immutable caching when staging protection is disabled.

Next.js's image optimizer does not forward source authentication, so the staging configuration uses direct image URLs. Production image optimization remains enabled. Keep `nodeLinker: hoisted` and the full SWC helper tracing rule for Hostinger's managed standalone runtime.

Validate an authenticated image and its anonymous 401 response after deployment. The regression tests in `src/app/assets/[...path]/route.test.ts` cover the configurable root, staging access/cache policy, traversal protection and production caching.
