const createNextIntlPlugin = require('next-intl/plugin');
const { withSentryConfig } = require('@sentry/nextjs');

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION,
  },
  outputFileTracingRoot: __dirname,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
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
    return config;
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
const baseConfig = withNextIntl(nextConfig);

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
