import type { NextConfig } from 'next';
import path from 'node:path';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

// Dynamically determine backend URL based on environment
const getBackendUrl = (): string => {
  const explicitUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  // In production builds, never allow localhost URLs to leak into the bundle.
  // .env.local can accidentally override .env.production — this guard prevents that.
  if (isProduction) {
    if (explicitUrl && explicitUrl.trim() !== '' && !explicitUrl.includes('localhost')) {
      return explicitUrl;
    }
    // Hard production default — ignores any localhost value from .env.local
    return 'https://api.recoder.xyz/v1';
  }

  // Development: honour the explicit URL (typically http://localhost:8000/v1)
  if (explicitUrl && explicitUrl.trim() !== '') {
    return explicitUrl;
  }

  // Vercel environment detection (preview/staging deployments)
  const vercelEnv = process.env.VERCEL_ENV; // 'production', 'preview', or 'development'
  const gitRef = process.env.VERCEL_GIT_COMMIT_REF || ''; // Branch name

  if (vercelEnv === 'production') {
    return 'https://api.recoder.xyz/v1';
  }

  if (vercelEnv === 'preview' && gitRef && gitRef !== 'main') {
    const sanitizedBranch = gitRef
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `https://${sanitizedBranch}.staging-api.recoder.xyz/v1`;
  }

  // Fallback for non-Vercel local dev without explicit URL
  return 'https://staging-api.recoder.xyz/v1';
};

const buildCsp = () => {
  const directives = [
    "default-src 'self'",
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://tagmanager.google.com',
      'https://js.stripe.com',
      'https://static.cloudflareinsights.com',
      'https://api.recoder.xyz',
      'https://*.recoder.xyz',
    ].join(' '),
    [
      "script-src-elem",
      "'self'",
      "'unsafe-inline'",
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://tagmanager.google.com',
      'https://js.stripe.com',
      'https://static.cloudflareinsights.com',
      'https://api.recoder.xyz',
      'https://*.recoder.xyz',
    ].join(' '),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: https://logos.composio.dev",
    "font-src 'self' data: https://fonts.gstatic.com",
    [
      'connect-src',
      "'self'",
      'https:',
      'wss:',
      'ws:',
      'https://*.ingest.sentry.io',
    ].join(' '),
    "frame-src 'self' blob: https://*.recoder.xyz https://*.sandbox.recoder.xyz https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
    "object-src 'self' https://api.recoder.xyz https://*.recoder.xyz",
    "frame-ancestors 'none'",
    "worker-src 'self'",
  ];

  return directives.join('; ');
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  output: (process.env.NEXT_OUTPUT as 'standalone') || undefined,

  // Source-only workspace packages must be transpiled in production/Docker builds.
  transpilePackages: [
    '@recoder/shared',
    '@recoder/auth',
    '@recoder/ui',
    '@recoder/ecosystem-config',
  ],

  // Keep Node.js-only packages out of client bundles
  serverExternalPackages: ['redis', '@redis/client'],
  
  // Set environment variables
  env: {
    NEXT_PUBLIC_BACKEND_URL: getBackendUrl(),
  },
  
  // Webpack configuration to make Konva work with Next.js
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@recoder/ecosystem-config': path.resolve(
        process.cwd(),
        '../packages/ecosystem-config/src/index.ts',
      ),
    };
    config.externals = [...config.externals, { canvas: 'canvas' }]; // required to make Konva & react-konva work
    return config;
  },
  
  // Turbopack configuration
  turbopack: {
    // Handle Node.js modules that shouldn't be bundled for browser builds
    // Canvas is a Node.js native module that needs to be externalized (required for Konva & react-konva)
    resolveAlias: {
      canvas: {
        browser: './src/lib/empty-module.ts', // Exclude canvas from browser builds
      },
    },
  },
  
  // Performance optimizations
  experimental: {
    // Optimize package imports for faster builds and smaller bundles
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-icons',
      'recharts',
      'date-fns',
      '@tanstack/react-query',
      'react-icons',
    ],
  },
  
  // Enable compression
  compress: true,

  // Build reliability in CI/container: lint runs separately.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    qualities: [75, 100],
  },
  
  async rewrites() {
    const backendUrl = getBackendUrl().replace(/\/v1\/?$/, '');
    return [
      // Proxy /v1/* to the Python backend so browser fetches stay same-origin
      {
        source: '/v1/:path*',
        destination: `${backendUrl}/v1/:path*`,
      },
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
      {
        source: '/ingest/flags',
        destination: 'https://eu.i.posthog.com/flags',
      },
    ];
  },
  
  // HTTP headers for caching, performance, and security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: buildCsp(),
          },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*.woff2',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  
  skipTrailingSlashRedirect: true,
};

// Wrap with Sentry only if DSN is configured (no-op otherwise)
const configWithAnalyzer = withBundleAnalyzer(nextConfig as any);

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(configWithAnalyzer, {
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
      // Using /monitoring-sentry to avoid conflict with the /monitoring dashboard route
      tunnelRoute: '/monitoring-sentry',

    })
  : configWithAnalyzer;
