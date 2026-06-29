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
  outputFileTracingRoot: path.join(__dirname),
  eslint: { ignoreDuringBuilds: true },
  assetPrefix,
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
