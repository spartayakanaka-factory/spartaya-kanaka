/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  images: {
    // The optimizer does not forward Basic Auth to protected staging assets.
    unoptimized: process.env.STAGING_SITE === "1" || process.env.APP_ENV === "staging",
  },
  outputFileTracingIncludes: {
    // Hostinger's LSNode loader also resolves helpers through the root package.
    // Include exports metadata and CommonJS helpers as well as ESM files.
    "/*": ["./node_modules/@swc/helpers/**/*"],
  },
  // Development databases, local credentials and downloaded tools must never
  // be included in a deployable server artifact.
  outputFileTracingExcludes: {
    "/*": ["./.local/**/*", "./.env", "./.env.*"],
  },
  // This branch is the private Hostinger staging branch. Keep every response
  // out of search results even if the request Proxy is skipped by the host.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
