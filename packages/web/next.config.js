/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['localhost', 'recoder.xyz', 'github.com'],
    formats: ['image/webp', 'image/avif'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  async redirects() {
    return [
      {
        source: '/github',
        destination: 'https://github.com/recoder-team/recoder',
        permanent: true,
      },
      {
        source: '/discord',
        destination: 'https://discord.gg/recoder',
        permanent: true,
      },
      {
        source: '/docs',
        destination: 'https://github.com/recoder-team/recoder/blob/main/README.md',
        permanent: false,
      },
    ]
  },
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
        ],
      },
    ]
  },
}

module.exports = nextConfig