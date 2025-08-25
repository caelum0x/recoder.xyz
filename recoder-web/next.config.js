// next.config.js
module.exports = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Disable ESLint during builds for Netlify
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript checking during builds for Netlify
  typescript: {
    ignoreBuildErrors: true,
  },
};
