import path from "node:path";
import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";
import { createSecureHeaders } from "next-secure-headers";

export const config: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.logo.dev",
      },
      {
        protocol: "https",
        hostname: "www.gravatar.com",
      },

      // Seed data
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },

  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  // Keep Turbopack scoped to the PM workspace even if unrelated lockfiles exist
  // above this repo on the host machine.
  turbopack: {
    root: path.resolve(process.cwd(), "../../.."),
  },

  // biome-ignore lint/suspicious/useAwait: "headers" is an async function
  async headers() {
    // Production PM deploys sit behind nginx, which already injects the
    // canonical security headers for pm.recoder.xyz. Returning them from
    // Next.js as well causes duplicate CSP/XFO/HSTS headers in responses,
    // and browsers enforce all CSP headers together.
    if (process.env.NODE_ENV === "production") {
      return [];
    }

    return [
      {
        source: "/(.*)",
        headers: [
          ...createSecureHeaders({
            // HSTS Preload: https://hstspreload.org/
            forceHTTPSRedirect: [
              true,
              { maxAge: 63_072_000, includeSubDomains: true, preload: true },
            ],
          }),
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com https://api.recoder.xyz https://*.recoder.xyz; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://recoder.xyz https://*.recoder.xyz wss://*.recoder.xyz https://www.google-analytics.com https://region1.google-analytics.com https://*.posthog.com https://*.i.posthog.com https://static.cloudflareinsights.com; frame-ancestors 'none';",
          },
        ],
      },
    ];
  },

  // biome-ignore lint/suspicious/useAwait: "rewrites" is an async function
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,

  // This is required to support Sentry
  transpilePackages: ["@sentry/nextjs"],
};

export const withAnalyzer = (sourceConfig: NextConfig): NextConfig =>
  withBundleAnalyzer()(sourceConfig);
