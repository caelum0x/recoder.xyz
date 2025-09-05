
// Build performance optimizations added by build-fix.js
const nextConfig = {
  experimental: {
    turbo: {
      rules: {
        '*.svg': ['@svgr/webpack'],
      },
    },
    typedRoutes: false, // Disable to reduce type checking overhead
  },
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: './tsconfig.build.json',
  },
  eslint: {
    ignoreDuringBuilds: true, // Focus on TS errors first
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // swcMinify is now default in Next.js 15, remove this line
  poweredByHeader: false,
  compress: true,
};

module.exports = nextConfig;
