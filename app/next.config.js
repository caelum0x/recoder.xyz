const createNextIntlPlugin = require('next-intl/plugin');

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

module.exports = withNextIntl(nextConfig)
