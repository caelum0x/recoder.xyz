import type { NextConfig } from "next";
import path from "node:path";

// When deployed behind a reverse proxy that already serves another Next app on
// the same domain (recoder.xyz also serves the app's /_next/*), set
// SITE_ASSET_PREFIX (e.g. "/__site") so this site's assets load from an isolated
// path and don't collide with the app's /_next/. Unset = normal root serving.
const assetPrefix = process.env.SITE_ASSET_PREFIX || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // Pin output file tracing to site/ so traced paths stay within this package,
  // not the parent monorepo root. Consistent with site/ having its own node_modules.
  outputFileTracingRoot: path.resolve(__dirname),
  // ESLint config in site/ is not set up for next-lint; skip during build.
  eslint: { ignoreDuringBuilds: true },
  assetPrefix,
  // Retired alternatives/directory pages. `/compare` was in this list too
  // (owner rule 2026-09-25, "no competitor pages") but app/compare/* is real,
  // actively maintained content now (fact-checked vs named competitors,
  // dated verification comments, its own test suite) — leaving the redirect
  // active would 308 every comparison page straight to "/", silently
  // nullifying it. Removed 2026-10-19 so /compare and /compare/:slug* serve
  // their real pages; /alternatives and /tools remain retired.
  // `permanent: true` emits a 308 so link equity lands on the product.
  async redirects() {
    return [
      "/alternatives",
      "/alternatives/:slug*",
      "/tools",
      "/tools/:path*",
      "/api/badge/:slug*",
    ].map((source) => ({ source, destination: "/", permanent: true }));
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
