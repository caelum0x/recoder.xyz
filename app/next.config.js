const createNextIntlPlugin = require('next-intl/plugin');
const { withSentryConfig } = require('@sentry/nextjs');
const withPayload = require('@payloadcms/next/withPayload').default;
const path = require('path');

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION,
  },
  // Must match turbopack.root below. Rooted at the monorepo so the repo-root
  // .pnpm store (where next/prisma/etc. physically live) is inside the traced
  // root now that app/ is a pnpm member (see docs/STATUS.md #22).
  outputFileTracingRoot: path.resolve(__dirname, '..'),
  // The monorepo root pnpm store contains lockfile-referenced optional esbuild
  // platform packages for many OS/CPU combinations. They are build-time only
  // and are not actually installed in this checkout, so standalone tracing can
  // try to copy missing paths like @esbuild/aix-ppc64 or @esbuild/win32-x64 and
  // stall/fail the product build. Exclude those optional platform packages from
  // every server trace; the runtime app does not execute them.
  outputFileTracingExcludes: {
    '/*': ['../node_modules/.pnpm/@esbuild+*/node_modules/@esbuild/*'],
  },
  typescript: {
    ignoreBuildErrors: true, // Pre-existing TS errors in doc pages (template literals in JSX)
  },

  // Skip static page generation errors
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },

  
  // Webpack configuration for Prisma
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle Prisma Client - use the node_modules version
      config.externals.push('_http_common');
    }

    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['react/compiler-runtime'] = path.resolve(
      __dirname,
      'lib/payload/react-compiler-runtime-shim.ts',
    );

    return config;
  },

  turbopack: {
    // Pin the Turbopack project root to the monorepo root. Now that app/ is a
    // pnpm workspace member, `next` resolves via a symlink into the repo-root
    // .pnpm store (outside app/), so a root of app/ makes Turbopack treat next
    // as "outside the project" and refuse. Rooting at the repo covers both the
    // app/ sources and the .pnpm store (see docs/STATUS.md #22).
    root: path.resolve(__dirname, '..'),
    resolveAlias: {
      'react/compiler-runtime': './lib/payload/react-compiler-runtime-shim.ts',
    },
  },

  experimental: {},

  // Ensure Prisma and Better Auth are not bundled (moved from experimental in Next.js 15.5+)
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'better-auth'],

  // Force dynamic rendering for all pages to avoid build-time DB connections
  output: 'standalone',

  // Security headers are handled by nginx globally (X-Frame-Options, HSTS, CSP, etc.)
  // Do NOT duplicate them here — dual CSP headers cause browsers to enforce the intersection, breaking requests.

  // CORS configuration
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ]
  },
}

// Wrap with Sentry only if DSN is configured (no-op otherwise)
const baseConfig = withPayload(withNextIntl(nextConfig), {
  devBundleServerPackages: true,
});

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(baseConfig, {
      // Suppresses source map uploading logs during build
      silent: true,

      // For all available options, see:
      // https://github.com/getsentry/sentry-webpack-plugin#options
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      // Upload source maps for better stack traces
      // Requires SENTRY_AUTH_TOKEN env var
      sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
      },

      // Automatically tree-shake Sentry logger statements to reduce bundle size
      disableLogger: true,

      // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
      tunnelRoute: '/monitoring-sentry',

      // Hides source maps from generated client bundles
      hideSourceMaps: true,

      // Prevents Sentry webpack plugin from widening the build target
      transpileClientSDK: false,
    })
  : baseConfig;
