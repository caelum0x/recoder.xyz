// next.config.js
module.exports = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // Enable proper error checking for production builds
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};
