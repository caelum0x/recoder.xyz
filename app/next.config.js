/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION,
  },
  outputFileTracingRoot: __dirname,
}

module.exports = nextConfig