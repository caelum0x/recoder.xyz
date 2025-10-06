
// Enhanced performance optimizations for Next.js 15.5.3
const nextConfig = {
  // Modern turbopack configuration (fixes deprecation warning)
  turbopack: {
    rules: {
      '*.svg': ['@svgr/webpack'],
    },
  },
  
  // Moved from experimental (fixes deprecation warning)
  typedRoutes: false,
  
  // Performance optimizations
  experimental: {
    // Enable modern optimizations
    optimizePackageImports: [
      'lucide-react', 
      '@radix-ui/react-icons',
      'react-icons',
      'date-fns',
      '@codesandbox/sandpack-react'
    ],
    webpackBuildWorker: true,
  },
  
  // Server Components enhancements (moved from experimental)
  serverExternalPackages: ['mongodb', 'prisma'],
  
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: './tsconfig.build.json',
  },
  
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Production optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Performance settings
  poweredByHeader: false,
  compress: true,

  // WebContainer support - Cross-Origin-Isolation headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
  
  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
  },
  
  // Output file tracing for better bundle size
  outputFileTracingRoot: '/Users/arhansubasi/recoder.xyz',
  
  // Webpack optimizations for bundle size
  webpack: (config, { isServer, dev }) => {
    // Bundle splitting for better code splitting
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Monaco Editor - lazy load (98MB)
            monaco: {
              test: /[\\/]node_modules[\\/](@monaco-editor|monaco-editor)[\\/]/,
              name: 'monaco-editor',
              priority: 30,
              chunks: 'async',
            },
            // Blockchain packages - lazy load (400MB+)
            blockchain: {
              test: /[\\/]node_modules[\\/](@reown|@walletconnect|@solana|viem|@keystonehq)[\\/]/,
              name: 'blockchain',
              priority: 25,
              chunks: 'async',
            },
            // Google APIs - lazy load (270MB)
            google: {
              test: /[\\/]node_modules[\\/](googleapis|@google-cloud)[\\/]/,
              name: 'google-apis',
              priority: 20,
              chunks: 'async',
            },
            // Azure SDK - lazy load (134MB)
            azure: {
              test: /[\\/]node_modules[\\/]@azure[\\/]/,
              name: 'azure-sdk',
              priority: 20,
              chunks: 'async',
            },
            // CodeSandbox - lazy load (77MB)
            codesandbox: {
              test: /[\\/]node_modules[\\/]@codesandbox[\\/]/,
              name: 'codesandbox',
              priority: 15,
              chunks: 'async',
            },
          },
        },
      };
    }

    // Don't bundle server-only packages on client
    if (!isServer) {
      config.externals = {
        ...config.externals,
        'googleapis': 'googleapis',
        '@google-cloud/storage': '@google-cloud/storage',
        '@azure/identity': '@azure/identity',
        'prisma': 'prisma',
      };
    }

    return config;
  },
};

module.exports = nextConfig;
