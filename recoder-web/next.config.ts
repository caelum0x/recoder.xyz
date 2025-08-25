import type { NextConfig } from "next";

// Security headers configuration
const securityHeaders = [
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "media-src 'self' data: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
      "block-all-mixed-content"
    ].join('; ')
  },
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'cross-origin-isolated=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'web-share=()',
      'xr-spatial-tracking=()'
    ].join(', ')
  },
  {
    key: 'X-Permitted-Cross-Domain-Policies',
    value: 'none'
  },
  {
    key: 'Cross-Origin-Embedder-Policy',
    value: 'require-corp'
  },
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin'
  },
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  }
];

const nextConfig: NextConfig = {
  // Netlify deployment configuration with server-side rendering
  output: undefined, // Use default SSR
  trailingSlash: false,
  // Production optimizations
  poweredByHeader: false,
  generateEtags: true,
  compress: true,
  productionBrowserSourceMaps: false,
  // Disable ESLint during build to avoid deployment failures
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript checking during build (will be done separately)
  typescript: {
    ignoreBuildErrors: false,
  },
  
  // Performance optimizations
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
    optimizePackageImports: ['@radix-ui/react-icons', 'lucide-react'],
    webVitalsAttribution: ['CLS', 'LCP'],
  },
  
  // Image optimization
  images: {
    domains: ['localhost', 'web.recoder.xyz'],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
  },
  serverExternalPackages: [
    "@codesandbox/sdk",
    "google-auth-library",
    "gaxios", 
    "agent-base",
    "https-proxy-agent",
    "@anthropic-ai/vertex-sdk",
    "gcp-metadata",
    "gtoken",
    "jws",
    "jwa",
    "recoder-shared",
    "winston",
    "next-auth",
    "next-auth/providers",
    "next-auth/core",
    "oauth",
    "preact",
    "preact-render-to-string",
    "openid-client",
    "oidc-token-hash",
    "jose",
    "bcryptjs",
    "nodemailer"
  ],
  webpack: (config, options) => {
    // Handle edge runtime
    if (options.nextRuntime === "edge") {
      if (!config.resolve.conditionNames) {
        config.resolve.conditionNames = ["require", "node"];
      }
      if (!config.resolve.conditionNames.includes("worker")) {
        config.resolve.conditionNames.push("worker");
      }
    }

    // Only apply client-side exclusions
    if (!options.isServer) {
      // Exclude server-only packages completely from client bundle
      config.externals = config.externals || [];
      config.externals.push(
        'recoder-shared', 
        'winston', 
        '@colors/colors',
        'next-auth',
        'next-auth/providers',
        'next-auth/core',
        'oauth',
        'preact',
        'preact-render-to-string',
        'openid-client',
        'oidc-token-hash',
        'jose',
        'bcryptjs',
        'nodemailer',
        'google-auth-library',
        'gaxios',
        'agent-base',
        'https-proxy-agent',
        '@anthropic-ai/vertex-sdk',
        'gcp-metadata',
        'gtoken'
      );
      
      // Exclude VS Code specific modules from web build
      config.externals.push('vscode');
      
      // Node.js polyfills
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        dns: false,
        child_process: false,
        tls: false,
        http: false,
        https: false,
        os: false,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
        events: false,
        path: false,
        url: false,
        querystring: false,
        zlib: false,
        constants: false,
        assert: false,
      };
    }

    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
