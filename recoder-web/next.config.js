
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
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
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
  
  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
  },
  
  // Output file tracing for better bundle size
  outputFileTracingRoot: '/Users/arhansubasi/recoder.xyz',
};

module.exports = nextConfig;
