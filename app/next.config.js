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
  
  // Ensure Prisma and Better Auth are not bundled (moved from experimental in Next.js 15.5+)
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'better-auth'],

  // Force dynamic rendering for all pages to avoid build-time DB connections
  output: 'standalone',

  // Generate static error pages at build time
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://openrouter.ai; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' http://localhost:3001 https://openrouter.ai https://api.openai.com https://api.anthropic.com; frame-ancestors 'self';"
          },
        ],
      },
    ]
  },

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

module.exports = nextConfig